/**
 * The registry demo (docs/20 §2.4, S29 · R4): twelve steps over Ferrule, each answered as the table says.
 *
 * One slow test, like the kill test's: it spawns the server, drafts and publishes through it, builds the
 * specimen twice and runs an explain. The fast invariants under it are in core and mcp (the `explain`
 * override line, the write's diagnostics, the history's approval, the build's lists); this is the claim
 * whole — *a fifteen-line type, and every tool knows it* — held to the sentence each step should see.
 */
import { test, expect, describe } from "bun:test";
import { runRegistry, judge, stepsFor, REGISTRY_CALLS, STEPS } from "./registry";
import type { Turn } from "./session";

describe("the registry demo", () => {
  test("docs/20 §2.4: every step is answered as the table says, and the site is left right", async () => {
    const r = await runRegistry();

    const missed = r.steps.filter((s) => !s.ok).map((s) => `${s.n}: ${s.saw}`);
    expect(missed).toEqual([]);
    const failed = r.checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.detail}`);
    expect(failed).toEqual([]);
    expect(r.lint.errors).toBe(0);

    // The scripted route's cost, exactly, in both directions (run.ts on why not 80 % of a call): a
    // surface that needs one more call to be answered is less smooth, and one that needs fewer has a
    // reference route that no longer describes it.
    expect(r.calls).toBe(REGISTRY_CALLS);
    expect(r.steps.length).toBe(STEPS.length);
  }, 240_000);
});

describe("which step a turn belongs to", () => {
  const turn = (over: Partial<Turn>): Turn => ({ n: 0, kind: "call", method: "tools/call", ok: true, ms: 0, tokensIn: 0, tokensOut: 0, text: "", ...over });
  test("a build is step 11 before the theme swap and step 12 after it; the unclassified ride with the next", () => {
    const turns = [
      turn({ kind: "read", method: "tools/list" }),
      turn({ kind: "read", method: "resources/read", name: "snypd://types" }),
      turn({ name: "find_tools", args: { query: "config" } }),
      turn({ name: "site", args: { action: "explain_config", path: "types.work.layout" } }),
      turn({ name: "site", args: { action: "build" } }),
      turn({ name: "theme", args: { action: "set", name: "editorial" } }),
      turn({ name: "site", args: { action: "build" } }),
    ];
    expect(stepsFor(turns)).toEqual([1, 1, 2, 2, 11, 12, 12]);
  });
  test("a create of a work that names the missing field is step 3; the one that lints clean is step 4; a refused publish is 6 and a landed one 7", () => {
    const turns = [
      turn({ name: "content.create", args: { type: "work" }, text: "lint: 1 error\n  2 error [frontmatter] Frontmatter is missing required field `client`" }),
      turn({ name: "content.update", args: { type: "work", slug: "x" }, text: "lint: 0 errors" }),
      turn({ name: "content.publish", args: { type: "work", slug: "x" }, ok: false, text: "needs a human" }),
      turn({ name: "content.publish", args: { type: "work", slug: "x" }, text: "landed on main" }),
      turn({ name: "content.create", args: { type: "post" }, text: "lint: 0 errors" }),
    ];
    expect(stepsFor(turns)).toEqual([3, 4, 6, 7, 7]);
    // The judge over an empty transcript names what it did not see, once per step.
    const j = judge([]);
    expect(j.length).toBe(12);
    expect(j.every((s) => !s.ok && /never called/.test(s.saw))).toBe(true);
  });
});
