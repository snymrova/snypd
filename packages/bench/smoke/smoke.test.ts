/**
 * S18a, decision 47 — the artefact users install, run where they install it.
 *
 * `bun test` runs from a checkout, where `themes/`, `packages/spec/primitives/` and every
 * `import.meta.dir` resolve. The binary has none of that, and for fifteen sessions no test could tell:
 * the pre-S18a binary wrote `snypd.yaml` and then died on `ENOENT: scandir '/$bunfs/defaults'` with 210
 * tests green. So this file compiles the CLI and drives it in a temp directory with no `node_modules`
 * and no workspace above it — the only place these failures are visible.
 *
 * Exit codes are asserted as hard as output: an installer, a CI job and a `&&` chain act on the code and
 * nothing else, so a command that prints a stack trace and exits 0 is the worse defect of the two.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compile } from "./build";

let BIN = "", dir = "";
const run = (args: string[], cwd = dir) => {
  const p = Bun.spawnSync([BIN, ...args], { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
};

beforeAll(async () => {
  BIN = await compile(join(mkdtempSync(join(tmpdir(), "snypd-bin-")), "snypd"));
  dir = mkdtempSync(join(tmpdir(), "snypd-smoke-"));
  Bun.spawnSync(["git", "init", "-q", "."], { cwd: dir });
  Bun.spawnSync(["git", "config", "user.email", "smoke@snypd.test"], { cwd: dir });
  Bun.spawnSync(["git", "config", "user.name", "smoke"], { cwd: dir });
}, 120_000);
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

describe("the compiled binary, in a directory it has never seen", () => {
  test("has no workspace to fall back on", () => {
    // If any of this leaks in, the rest of the file proves nothing.
    expect(existsSync(join(dir, "node_modules"))).toBe(false);
    expect(existsSync(join(dir, "..", "packages"))).toBe(false);
    expect(BIN.startsWith(tmpdir())).toBe(true);
  });

  test("`init` scaffolds a site and registers the MCP server", () => {
    const r = run(["init", ".", "--name=Smoke", "--url=https://smoke.example"]);
    expect(r.code, r.err).toBe(0);
    expect(existsSync(join(dir, "snypd.yaml"))).toBe(true);
    expect(existsSync(join(dir, "content/posts"))).toBe(true);

    // The step that is the whole of onboarding, and the reason `get-started` cannot own it.
    const reg = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8")) as { mcpServers: { snypd: { command: string; args: string[] } } };
    expect(reg.mcpServers.snypd.command).toBe(BIN);   // the binary that ran, not the string "snypd"
    expect(reg.mcpServers.snypd.args).toEqual(["serve"]);
    expect(r.out).toContain("restart your harness");
  });

  test("`build` renders the site from themes that exist only inside the binary", () => {
    const r = run(["build", "."]);
    expect(r.code, r.err).toBe(0);
    // The default theme is `editorial`, which `extends: base` — so this is the whole chain resolving,
    // 20 `.tsx` importing and a stylesheet loading with no `themes/` directory anywhere on the disk.
    expect(r.out).toContain("theme editorial");
    expect(r.out).toContain("13/13 primitives");
    expect(existsSync(join(dir, "dist", "index.html"))).toBe(true);
  });

  test("a post written by hand renders, with its primitives and its agent-read twin", () => {
    writeFileSync(join(dir, "content/posts/hello.md"), [
      "---", "title: Hello", "status: published", "date: 2026-08-28", "---", "",
      "A first post.", "",
      '::stat{value="92%" label="less to parse" source="https://snypd.rocks/bench"}', "",
      ':::callout{kind="note"}', "Rendered from a theme inside the binary.", ":::", "",
    ].join("\n"));
    const r = run(["build", "."]);
    expect(r.code, r.err).toBe(0);
    const html = readFileSync(join(dir, "dist", "posts", "hello", "index.html"), "utf8");
    expect(html).toContain("snypd-stat");       // the bundled primitive ran
    expect(html).toContain("92%");
    expect(html).toContain("snypd-callout");
    // Editorial declares `css:` and ships no `.tsx` at all, so its stylesheet is the one thing that is
    // purely its own — and it came out of the barrel, minified into an asset (decision 31, not inlined).
    expect(html).toContain('href="/assets/theme.css"');
    expect(readFileSync(join(dir, "dist", "assets", "theme.css"), "utf8").length).toBeGreaterThan(500);
    expect(readFileSync(join(dir, "dist", "posts", "hello", "index.md"), "utf8")).toContain("A first post.");
    expect(readFileSync(join(dir, "dist", "llms.txt"), "utf8")).toContain("Hello");
  });

  test("`lint` reads the spec that ships in the binary — the read that used to ENOENT", () => {
    writeFileSync(join(dir, "content/posts/bad.md"), [
      "---", "title: Bad", "status: draft", "date: 2026-08-28", "---", "",
      '::nonsense{a="b"}', "",
    ].join("\n"));
    const r = run(["lint", "."]);
    expect(r.code).toBe(1);                     // errors exit non-zero, or CI cannot use it
    expect(r.out + r.err).toContain("nonsense");
    rmSync(join(dir, "content/posts/bad.md"));
  });

  test("`serve` answers MCP `initialize` on stdio", async () => {
    const p = Bun.spawn([BIN, "serve", dir], { cwd: dir, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    const req = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "0" } } };
    p.stdin.write(JSON.stringify(req) + "\n"); await p.stdin.flush();
    const reader = p.stdout.getReader();
    let buf = "";
    const deadline = Date.now() + 15_000;
    while (!buf.includes("\n") && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += new TextDecoder().decode(value);
    }
    p.kill();
    const res = JSON.parse(buf.split("\n")[0]!) as { result?: { serverInfo?: { name: string } }; error?: unknown };
    expect(res.error).toBeUndefined();
    expect(res.result?.serverInfo?.name).toBeString();
  }, 30_000);

  /**
   * The gate lives in `snypd bench` (`mcp.coldStart.binary`, S18c), where a median of seven interleaved
   * rounds can be compared against the source lane. What this file asserts instead is the *structural*
   * property that made the number wrong, because that one is not sensitive to how loaded the box is:
   *
   *   printing the usage line must cost less than starting a server.
   *
   * A command that does no work costing more than one that opens a transport is the exact signature of a
   * flat bundle — before `--splitting`, `snypd` with no arguments took 277 ms and `initialize` took 224 ms,
   * because both paid for parsing all 5.5 MB before `main()` ran. With chunks the two separate again
   * (≈ 20 ms and ≈ 60 ms on the same loaded box). A wall-clock budget here would be flaky on a shared
   * runner; this comparison is two measurements on one box, seconds apart, and it fails the moment the
   * compile recipe loses `--splitting`.
   */
  test("a command that does nothing costs less than one that starts a server", async () => {
    const sample = async (fn: () => Promise<void> | void) => { const t0 = performance.now(); await fn(); return performance.now() - t0; };
    const usage: number[] = [], serve: number[] = [];
    for (let i = 0; i < 5; i++) {
      usage.push(await sample(() => { Bun.spawnSync([BIN], { cwd: dir, stdout: "pipe", stderr: "pipe" }); }));
      serve.push(await sample(async () => {
        const p = Bun.spawn([BIN, "serve", dir], { cwd: dir, stdin: "pipe", stdout: "pipe", stderr: "ignore" });
        p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "0" } } }) + "\n");
        await p.stdin.flush();
        const reader = p.stdout.getReader();
        let buf = "";
        while (!buf.includes("\n")) { const { value, done } = await reader.read(); if (done) break; buf += new TextDecoder().decode(value); }
        p.kill();
        expect(buf).toContain('"result"');
      }));
    }
    const med = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
    const [u, s] = [med(usage), med(serve)];
    console.log(`  binary: usage ${u.toFixed(1)} ms · initialize ${s.toFixed(1)} ms (gated as mcp.coldStart.binary in \`snypd bench\`)`);
    expect(u).toBeLessThan(s);          // loses --splitting → usage overtakes initialize, as it did before S18c
    expect(s).toBeLessThan(2_000);      // a floor, not the budget: this catches a hang, not slowness
  }, 60_000);

  test("failure is a non-zero exit, not a stack trace and a 0", () => {
    const empty = mkdtempSync(join(tmpdir(), "snypd-empty-"));
    // Before S18a this built a site from spec defaults and reported success: `snypd build` in the wrong
    // directory was indistinguishable from `snypd build` in the right one.
    const r = run(["build", "."], empty);
    expect(r.code).not.toBe(0);                 // no snypd.yaml here — an installer must be able to tell
    expect(r.err).toContain("does not load");
    rmSync(empty, { recursive: true, force: true });
    expect(run(["nonsense-verb"]).code).not.toBe(0);
  });
});
