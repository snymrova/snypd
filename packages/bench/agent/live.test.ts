/**
 * The live-model harness (S21), tested without a model: the stream a headless Claude Code session
 * writes is replayed from a file by a stand-in executable, and what comes out is checked against what
 * `session.ts` would have recorded for the same calls. The real runs are records under `bench/`, made at
 * a desk with a login — claude.ts's header says why they are not here.
 */
import { test, expect, describe } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claude, mcpName } from "./claude";
import { phaseOf, phasesFor, KILL_PROMPT } from "./live";
import { readLint, TOPICS, FIRST_ATTEMPT_RULE } from "./writes";
import { recordPaths } from "./run";
import type { Turn } from "./session";

const call = (name: string, args: Record<string, unknown> = {}): Turn => ({ n: 0, kind: "call", method: "tools/call", name, args, ok: true, ms: 1, tokensIn: 1, tokensOut: 1, text: "" });
const read = (uri: string): Turn => ({ n: 0, kind: "read", method: "resources/read", name: uri, ok: true, ms: 1, tokensIn: 1, tokensOut: 1, text: "" });

describe("a live model at the surface (S21)", () => {
  test("tool names come back in the server's spelling", async () => {
    const known = ["content.create", "content.suggest_blocks", "find_tools", "theme", "site"];
    expect(mcpName("mcp__snypd__content_suggest_blocks", known)).toBe("content.suggest_blocks");
    expect(mcpName("mcp__snypd__find_tools", known)).toBe("find_tools");
    expect(mcpName("mcp__snypd__indexnow", known)).toBe("indexnow");   // a plugin tool the catalogue does not list
  });

  test("phases are read off the calls, and a call that says nothing is charged to the next one that does", () => {
    const turns = [
      read("snypd://config"),
      call("find_tools", { query: "suggest" }),
      call("content.suggest_blocks", { type: "post", slug: "cold-start" }),
      call("content.suggest_blocks", { type: "post", slug: "cold-start", apply: ["1"] }),
      call("find_tools", { query: "theme" }),
      call("theme", { action: "set", name: "editorial" }),
      call("content.query", {}),
      call("content.create", { type: "post", slug: "the-kill-test" }),
      call("content.lint", { type: "post", slug: "the-kill-test" }),
      call("content.update", { type: "post", slug: "the-kill-test", body: "fixed" }),
      call("content.publish", { type: "post", slug: "cold-start" }),
      call("content.lint", { type: "post", slug: "cold-start" }),   // back to an upgraded post: upgrade, not write
      call("site", { action: "build" }),
      call("site", { action: "doctor" }),   // after the last classified call: stays in build
    ];
    expect(phaseOf(turns[7]!)).toBe("write");
    expect(phaseOf(turns[11]!)).toBe("upgrade");
    expect(phaseOf(turns[1]!)).toBeUndefined();
    expect(phasesFor(turns)).toEqual(["upgrade", "upgrade", "upgrade", "upgrade", "theme", "theme", "write", "write", "write", "write", "publish", "upgrade", "build", "build"]);
  });

  test("the task is a person's words, not the route", () => {
    expect(KILL_PROMPT).toContain("content.suggest_blocks");   // D1's own sentence names it
    expect(KILL_PROMPT).not.toMatch(/find_tools|set_tokens|render_preview/);
    expect(FIRST_ATTEMPT_RULE).toContain("exactly once");
    expect(TOPICS).toHaveLength(20);
    expect(new Set(TOPICS).size).toBe(20);
  });

  test("a first attempt is read off the structured result Claude Code shows the model, or the text line", () => {
    expect(readLint(JSON.stringify({ ok: true, lint: { errors: 2, warnings: 1, diagnostics: [{ rule: "orphan-term", severity: "error", message: "tag x is used once" }, { rule: "slop-phrase", severity: "warning", message: "…" }, { rule: "chart-source", severity: "error", message: "chart needs source" }] } })))
      .toEqual({ errors: 2, warnings: 1, rules: ["orphan-term", "chart-source"], messages: ["tag x is used once", "chart needs source"] });
    expect(readLint("created post/x → /posts/x (draft)\ncommitted\nlint: 0 errors, 3 warnings")).toEqual({ errors: 0, warnings: 3, rules: [], messages: [] });
    expect(readLint("refused")).toBeUndefined();
  });

  test("a model's record is named for it; the scripted route keeps CI's file names", () => {
    expect(recordPaths("scripted")).toEqual({ report: "bench/agent.md", json: "bench/agent.json", transcript: "bench/agent-transcript.md" });
    expect(recordPaths("claude:haiku")).toEqual({ report: "bench/agent.claude-haiku.md", json: "bench/agent.claude-haiku.json", transcript: "bench/agent-transcript.claude-haiku.md" });
  });

  test("the stream a session writes becomes the turns a session records", async () => {
    const dir = mkdtempSync(join(tmpdir(), "snypd-claude-t-"));
    try {
      const lines = [
        { type: "system", subtype: "init", model: "claude-haiku-4-5-20251001", tools: [] },
        { type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "ReadMcpResourceTool", input: { server: "snypd", uri: "snypd://config" } }] } },
        { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "snypd: 1\nsite: {}" }] } },
        { type: "assistant", message: { content: [{ type: "tool_use", id: "t2", name: "mcp__snypd__content_create", input: { type: "post", slug: "x", body: "words" } }] } },
        { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t2", content: [{ type: "text", text: JSON.stringify({ ok: true, lint: { errors: 0, warnings: 0 } }) }] }] } },
        { type: "assistant", message: { content: [{ type: "tool_use", id: "t3", name: "mcp__snypd__content_publish", input: { type: "post", slug: "x" } }] } },
        { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t3", content: "needs a human", is_error: true }] } },
        { type: "assistant", message: { content: [{ type: "text", text: "Done." }] } },
        { type: "result", subtype: "success", is_error: false, result: "Done.", num_turns: 4, duration_ms: 1234, total_cost_usd: 0.0123, usage: { input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 50 } },
      ];
      writeFileSync(join(dir, "stream.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
      // The stand-in ignores its arguments, which is the point: only the stream is under test here.
      const bin = join(dir, "claude");
      writeFileSync(bin, `#!/bin/sh\ncat "${join(dir, "stream.jsonl")}"\n`);
      chmodSync(bin, 0o755);
      const seen: string[] = [];
      const r = await claude({ model: "haiku", root: dir, prompt: "do a thing", bin, onLine: (l) => seen.push(l) });
      expect(r.ended).toBe("success");
      expect(r.text).toBe("Done.");
      expect(r.usage).toEqual({ model: "claude-haiku-4-5-20251001", tokensIn: 1110, tokensOut: 50, costUsd: 0.0123, turns: 4, ms: 1234 });
      expect(r.turns.map((t) => [t.n, t.kind, t.method, t.name, t.ok])).toEqual([
        [1, "read", "resources/read", "snypd://config", true],
        [2, "call", "tools/call", "content.create", true],
        [3, "call", "tools/call", "content.publish", false],
      ]);
      expect(r.turns[1]!.args).toEqual({ type: "post", slug: "x", body: "words" });
      expect(r.turns[1]!.text).toContain('"errors":0');
      expect(r.turns[1]!.tokensIn).toBeGreaterThan(0);
      expect(r.turns[2]!.text).toBe("needs a human");
      expect(seen).toHaveLength(lines.length);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test("a session that never ran is an error, not a score", async () => {
    const dir = mkdtempSync(join(tmpdir(), "snypd-claude-t-"));
    try {
      const bin = join(dir, "claude");
      writeFileSync(bin, `#!/bin/sh\necho 'Not logged in' >&2\nexit 1\n`);
      chmodSync(bin, 0o755);
      await expect(claude({ model: "haiku", root: dir, prompt: "x", bin })).rejects.toThrow(/did not start .*Not logged in/);
      // Started, made no call, and the closing words say why: the same refusal, one line later.
      writeFileSync(bin, `#!/bin/sh\necho '${JSON.stringify({ type: "system", subtype: "init", model: "m" })}'\necho '${JSON.stringify({ type: "result", subtype: "success", result: "Not logged in · Please run /login", usage: {} })}'\n`);
      await expect(claude({ model: "haiku", root: dir, prompt: "x", bin })).rejects.toThrow(/made no MCP call/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
