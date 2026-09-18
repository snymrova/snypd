/**
 * A live model at the surface (docs/07 S21, docs/05 "3 models").
 *
 * D1's sentence begins "from a fresh Claude Code session with only the MCP", and this is that sentence
 * run literally: `claude -p` in the site's directory, every built-in tool off, one MCP server — the one
 * the scripted driver talks to, spawned the same way — and a task in the words a person would use. The
 * harness that sits around it never touches the site; it reads the session's stream, and every tool call
 * the model makes becomes a `Turn` counted the way `session.ts` counts the scripted driver's, so the
 * three numbers in `run.ts` mean the same thing for both.
 *
 * What is measured is the surface, not the model — the same scenario scored off the same finished site
 * (`scenario.ts`) — so a model that finds a shorter route than the scripted one is a finding about the
 * surface, and a model that cannot find a route at all is a bigger one. The cost the model's own context
 * paid (`usage`) is kept beside the o200k count of the MCP traffic because they answer different
 * questions: what the surface returned, and what a harness re-sent to the model to hold it.
 *
 * Runs on whoever is logged in to Claude Code on this machine and is therefore *not* a CI lane: CI has no
 * login, and a test that needs one is a test that only passes at Sunny's desk. The record of a run is the
 * transcript it writes under `bench/`, checked in the way D1 asks for.
 */
import { encode } from "gpt-tokenizer/encoding/o200k_base";
import type { Turn } from "./session";

const count = (v: unknown): number => (v === undefined ? 0 : encode(typeof v === "string" ? v : JSON.stringify(v)).length);

/** The three, as `claude --model` spells them. Aliases, so a run is on whatever each alias points at today — the model id it resolved to is on every transcript. */
export const MODELS = ["haiku", "sonnet", "opus"] as const;
export type Model = (typeof MODELS)[number] | (string & {});

/** The two tool names Claude Code uses for a resource read and a resource list — reads, by decision 38, not calls. */
const READ_TOOLS = new Set(["ReadMcpResourceTool", "ListMcpResourcesTool"]);
const SERVER = "snypd";
const PREFIX = `mcp__${SERVER}__`;

export interface ClaudeUsage {
  /** What the model resolved to, from the session's `init` line. */
  model: string;
  /** Prompt tokens the model's context paid, cache hits and writes included. */
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  /** Assistant turns, as Claude Code counts them. */
  turns: number;
  ms: number;
}

export interface ClaudeRun {
  /** Every MCP interaction, in order, as the scripted driver's session would have recorded it. */
  turns: Turn[];
  usage: ClaudeUsage;
  /** `success`, or how it stopped — `error_max_turns`, `error_max_budget_usd`, … A stop is a finding, not a harness failure. */
  ended: string;
  /** The model's closing words. */
  text: string;
}

export interface ClaudeOptions {
  model: Model;
  /** The site the session is opened in — also the root the MCP server is given. */
  root: string;
  /** The task, in a person's words. */
  prompt: string;
  /** Harness rules the task should not have to carry — appended to the system prompt, never to the task. */
  system?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  /** The MCP server's entry — the checkout's, by default, which is what the kill test measures. */
  server?: string;
  /** Called with each line of the stream as it arrives, for a progress line. */
  onLine?: (line: string) => void;
  /** The executable; `claude` on PATH. A test points this at a script that replays a stream. */
  bin?: string;
}

/** `ReadMcpResourceTool` hands the model the `resources/read` envelope as one JSON string; the transcript keeps the resource it carried, as session.ts records the scripted driver's reads (R4). */
function unwrapRead(out: string): string {
  try {
    const j = JSON.parse(out) as { contents?: { text?: string }[] };
    if (Array.isArray(j.contents)) return j.contents.map((c) => c.text ?? "").join("\n");
  } catch { /* not the envelope — a list, or a refusal */ }
  return out;
}

/** `mcp__snypd__content_suggest_blocks` → `content.suggest_blocks`, so a transcript reads in the server's own names. */
export function mcpName(tool: string, known: readonly string[]): string {
  const bare = tool.slice(PREFIX.length);
  return known.find((k) => k.replaceAll(".", "_") === bare) ?? bare;
}

interface Block { type: string; id?: string; name?: string; input?: unknown; tool_use_id?: string; content?: unknown; is_error?: boolean; text?: string }
interface Line {
  type: string; subtype?: string; model?: string; is_error?: boolean; result?: string; num_turns?: number; duration_ms?: number; total_cost_usd?: number;
  usage?: { input_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number; output_tokens?: number };
  message?: { content?: Block[] | string };
}

const resultText = (c: unknown): string =>
  typeof c === "string" ? c
  : Array.isArray(c) ? c.map((b: Block) => (typeof b === "string" ? b : b.text ?? "")).join("\n")
  : c === undefined ? "" : JSON.stringify(c);

/**
 * Open a headless session on `root` and run `prompt` in it. Resolves when the session ends, however it
 * ends; throws only when it could not start or did not run at all (no login, a rate limit before the
 * first call) — a run that stopped on its turn limit with the site half-done is a result to score.
 */
export async function claude(opts: ClaudeOptions): Promise<ClaudeRun> {
  const { CORE_TOOLS } = await import("@snypd/mcp/tools");
  const { CATALOG } = await import("@snypd/mcp/catalog");
  const known = [...CORE_TOOLS, ...CATALOG].map((t) => t.name);
  const entry = opts.server ?? new URL("../../mcp/src/server.ts", import.meta.url).pathname;
  const mcp = JSON.stringify({ mcpServers: { [SERVER]: { command: process.execPath, args: [entry], env: { SNYPD_ROOT: opts.root } } } });
  const argv = [
    opts.bin ?? "claude", "-p", "--model", String(opts.model),
    "--strict-mcp-config", "--mcp-config", mcp,
    // Built-ins off, except the two that are how a session reads a resource. `--setting-sources ""` keeps
    // this machine's own settings, hooks and memory out of a session that is meant to be fresh.
    "--tools", [...READ_TOOLS].join(","),
    "--allowedTools", [`mcp__${SERVER}`, ...READ_TOOLS].join(","),
    "--setting-sources", "",
    "--output-format", "stream-json", "--verbose",
    "--max-turns", String(opts.maxTurns ?? 60),
    ...(opts.maxBudgetUsd ? ["--max-budget-usd", String(opts.maxBudgetUsd)] : []),
    ...(opts.system ? ["--append-system-prompt", opts.system] : []),
    opts.prompt,
  ];
  const t0 = performance.now();
  // The session's cwd is the checkout, not the site, and the site reaches the server as `SNYPD_ROOT`
  // the way it does from `session.ts`. Not for the model's sake — with every built-in off the cwd is a
  // line in its system prompt and nothing more — but for the server's: a theme's `.tsx` is transpiled
  // with the JSX import source in the *cwd's* tsconfig, and from any other directory the first `site ›
  // build` says `Cannot find module 'react/jsx-dev-runtime'`, which the first live run did. A release
  // binary carries its themes pre-bundled and never meets this; only the checkout run from elsewhere does.
  const cwd = new URL("../../..", import.meta.url).pathname;
  const proc = Bun.spawn(argv, { cwd, stdout: "pipe", stderr: "pipe", stdin: "ignore", env: { ...process.env } });

  const turns: Turn[] = [];
  const pending = new Map<string, { name: string; input: unknown; at: number }>();
  let model = String(opts.model), ended = "did not end", text = "", usage: Line["usage"], cost = 0, nTurns = 0, ms = 0;
  let sawInit = false;

  const handle = (raw: string) => {
    if (!raw.trim()) return;
    opts.onLine?.(raw);
    let m: Line;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.type === "system" && m.subtype === "init") { sawInit = true; if (m.model) model = m.model; return; }
    const blocks = typeof m.message?.content === "string" ? [] : m.message?.content ?? [];
    if (m.type === "assistant") {
      for (const b of blocks) if (b.type === "tool_use" && b.id && b.name) pending.set(b.id, { name: b.name, input: b.input, at: performance.now() });
      return;
    }
    if (m.type === "user") {
      for (const b of blocks) {
        if (b.type !== "tool_result" || !b.tool_use_id) continue;
        const p = pending.get(b.tool_use_id);
        if (!p) continue;
        pending.delete(b.tool_use_id);
        const isRead = READ_TOOLS.has(p.name);
        const out = isRead ? unwrapRead(resultText(b.content)) : resultText(b.content);
        const isCall = p.name.startsWith(PREFIX);
        if (!isRead && !isCall) continue;   // a built-in that slipped through is not the surface
        const input = (p.input ?? {}) as Record<string, unknown>;
        const name = isCall ? mcpName(p.name, known) : undefined;
        turns.push({
          n: turns.length + 1,
          kind: isRead ? "read" : "call",
          method: isRead ? (p.name === "ReadMcpResourceTool" ? "resources/read" : "resources/list") : "tools/call",
          name: isRead ? (typeof input.uri === "string" ? input.uri : undefined) : name,
          args: isRead ? undefined : input,
          ok: !b.is_error,
          ms: +(performance.now() - p.at).toFixed(1),
          tokensIn: count(isRead ? (input.uri ?? "") : { name, arguments: input }),
          tokensOut: count(out),
          text: out,
        });
      }
      return;
    }
    if (m.type === "result") {
      ended = m.subtype ?? (m.is_error ? "error" : "success");
      text = m.result ?? "";
      usage = m.usage; cost = m.total_cost_usd ?? 0; nTurns = m.num_turns ?? 0; ms = m.duration_ms ?? 0;
    }
  };

  let buf = "";
  const decoder = new TextDecoder();
  const reader = proc.stdout.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) { handle(buf.slice(0, nl)); buf = buf.slice(nl + 1); }
  }
  if (buf.trim()) handle(buf);
  const code = await proc.exited;
  const err = await new Response(proc.stderr).text();

  // Nothing ran: not a result about the surface, so say why rather than score an untouched site.
  if (!sawInit) throw new Error(`claude did not start (exit ${code}): ${err.trim().split("\n").slice(-3).join(" · ") || "no output"}`);
  if (!turns.length && (ended !== "success" || /not logged in|rate limit|log ?in/i.test(text)))
    throw new Error(`claude made no MCP call — ${ended}: ${text.slice(0, 200) || err.trim().slice(-200) || `exit ${code}`}`);

  const wall = ms || +(performance.now() - t0).toFixed(0);
  return {
    turns, ended, text,
    usage: {
      model,
      tokensIn: (usage?.input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0),
      tokensOut: usage?.output_tokens ?? 0,
      costUsd: +cost.toFixed(4), turns: nTurns, ms: wall,
    },
  };
}
