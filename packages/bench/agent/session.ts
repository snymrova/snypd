/**
 * An MCP client, for measuring what an agent has to do (docs/07 D1).
 *
 * The kill test is a claim about *the surface*, not about the code behind it, so this talks to `snypd
 * serve` the way a harness does — a spawned process, JSON-RPC over stdio, one line per message — and
 * never imports a handler. If a tool is only callable because the driver reached into the package, the
 * measurement is worthless.
 *
 * Everything the drivers are scored on is counted here, in one place:
 *  - `calls` — `tools/call` only. Reads (`resources/read`, `tools/list`, `prompts/get`) are *not* tool
 *    calls and are counted separately: docs/07 decision 38 moved reads to resources precisely so they
 *    would be cheap, and charging them at the same rate would erase the thing that decision bought.
 *  - `tokens` — o200k over every byte in both directions, which is what an agent's context actually
 *    pays. It is the honest denominator for "≤ 8 calls": eight calls that each return 4,000 tokens is
 *    not a win, and without this the budget could be gamed by batching.
 */
import { encode } from "gpt-tokenizer/encoding/o200k_base";
import type { InitializeResult, Resource, Tool, ToolResult } from "@snypd/mcp/protocol";

export const PROTOCOL_VERSION = "2025-11-25";

/** One line of the transcript. `kind` is what it costs: `call` counts against D1's budget, `read` does not. */
export interface Turn {
  n: number;
  kind: "call" | "read" | "meta";
  method: string;
  name?: string;
  args?: unknown;
  ok: boolean;
  ms: number;
  tokensIn: number;
  tokensOut: number;
  /** The result as the agent saw it, trimmed for the transcript; the assertions never read this. */
  text: string;
}

const count = (v: unknown): number => (v === undefined ? 0 : encode(typeof v === "string" ? v : JSON.stringify(v)).length);

export class Session {
  readonly turns: Turn[] = [];
  private proc: Bun.Subprocess<"pipe", "pipe", "ignore"> | undefined;
  private buf = "";
  private reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  private id = 0;
  private readonly decoder = new TextDecoder();

  /**
   * `server` is either an entry this checkout can run (the default, and what the kill test uses) or a
   * full argv. S18g needs the second form: `onboard.*` measures the **compiled binary** (decision 55),
   * and `[BIN, "serve"]` is not `[process.execPath, <entry>]` with a different string in it.
   */
  constructor(readonly root: string, readonly server: string | string[] = "packages/mcp/src/server.ts") {}

  /** `tools/call` count — the number D1 is written about. */
  get calls() { return this.turns.filter((t) => t.kind === "call").length; }
  get reads() { return this.turns.filter((t) => t.kind === "read").length; }
  get tokensIn() { return this.turns.reduce((a, t) => a + t.tokensIn, 0); }
  get tokensOut() { return this.turns.reduce((a, t) => a + t.tokensOut, 0); }

  async start(): Promise<InitializeResult> {
    const argv = typeof this.server === "string" ? [process.execPath, this.server] : this.server;
    this.proc = Bun.spawn(argv, {
      stdin: "pipe", stdout: "pipe", stderr: "ignore",
      env: { ...process.env, SNYPD_ROOT: this.root },
    });
    this.reader = this.proc.stdout.getReader() as ReadableStreamDefaultReader<Uint8Array>;
    return (await this.rpc("meta", "initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "snypd-bench-agent", version: "0" },
    })) as InitializeResult;
  }

  stop() { this.proc?.kill(); this.proc = undefined; }

  /** The three read methods, counted as reads. A driver uses these as freely as a real agent would. */
  async listTools(): Promise<Tool[]> { return ((await this.rpc("read", "tools/list")) as { tools: Tool[] }).tools; }
  async listResources(): Promise<Resource[]> { return ((await this.rpc("read", "resources/list")) as { resources: Resource[] }).resources; }
  async read(uri: string): Promise<string> {
    const r = (await this.rpc("read", "resources/read", { uri })) as { contents: { text: string }[] };
    return r.contents.map((c: { text: string }) => c.text).join("\n");
  }

  /** The one method that costs. `name` is recorded so the transcript reads like a session, not a log. */
  async call(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
    return (await this.rpc("call", "tools/call", { name, arguments: args }, name, args)) as ToolResult;
  }

  private async rpc(kind: Turn["kind"], method: string, params?: Record<string, unknown>, name?: string, args?: unknown): Promise<unknown> {
    if (!this.proc?.stdin || !this.reader) throw new Error("session not started");
    const id = ++this.id;
    const line = JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });
    const t0 = performance.now();
    this.proc.stdin.write(line + "\n");
    this.proc.stdin.flush();
    const res = await this.awaitResponse(id);
    const ms = performance.now() - t0;
    const result = "result" in res ? res.result : undefined;
    const text = "error" in res
      ? `error ${res.error.code}: ${res.error.message}`
      : ((result as ToolResult | undefined)?.content?.map((c) => c.text).join("\n") ?? JSON.stringify(result));
    // `isError` is a *tool* failure the agent can read and fix, so it is a completed turn that did not
    // work — not a protocol error. Both are `ok: false`; only the protocol one ends the run.
    const ok = !("error" in res) && !(result as ToolResult | undefined)?.isError;
    this.turns.push({
      n: this.turns.length + 1, kind, method, name, args, ok, ms: +ms.toFixed(1),
      tokensIn: count(params), tokensOut: count(text), text,
    });
    if ("error" in res) throw new Error(`${method}${name ? ` ${name}` : ""}: ${res.error.message}`);
    return result;
  }

  /** Read lines until the one carrying `id`. Notifications have no id and are skipped, as a client does. */
  private async awaitResponse(id: number): Promise<{ result: unknown } | { error: { code: number; message: string } }> {
    for (;;) {
      const nl = this.buf.indexOf("\n");
      if (nl < 0) {
        const { value, done } = await this.reader!.read();
        if (done) throw new Error("server closed the stream");
        this.buf += this.decoder.decode(value, { stream: true });
        continue;
      }
      const line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      if (!line.trim()) continue;
      let msg: { id?: number; result?: unknown; error?: { code: number; message: string } };
      try { msg = JSON.parse(line); } catch { continue; }   // a stray banner on stdout is not our message
      if (msg.id !== id) continue;
      return (msg.error ? { error: msg.error } : { result: msg.result }) as never;
    }
  }
}
