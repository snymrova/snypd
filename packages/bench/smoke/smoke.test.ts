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
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
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
    // Decision 60: this output is addressed to the agent that ran the command, and the one thing it
    // cannot do is phrased to be relayed verbatim — so the assertion is the sentence, not a keyword.
    expect(r.out).toContain("Restart your harness (Claude Code, Cursor or Codex) so the snypd tools load.");
    // …and it names where the far side picks up, because the restart destroys the context this printed into.
    expect(r.out).toContain("get-started");
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

  /**
   * S18d — the empty-directory first run, which is the one state no other suite can enter.
   *
   * `dir` above is `git init`ed in `beforeAll`, because every test after it needs a repo; that makes it a
   * fine proxy for a checkout and a useless one for the state docs/08 §2 actually starts in. So this gets
   * its own directory with nothing in it at all, and asserts the three things that only happen there: the
   * repo is created (on `main`, not on whatever `init.defaultBranch` says), the scaffold is *committed*
   * into it, and neither a name nor a URL was required to get any of that.
   *
   * The commit is the assertion that matters. Until S18d `init` wrote seven files, reported `git: false`
   * and printed "next: git init here" — so the scaffold sat uncommitted and the agent's very first
   * `content.create` refused on a dirty tree it had never been told about. Every empty-directory first
   * run hit it, and no test could: `bun test` starts in a repo, by construction.
   */
  test("`init` with no arguments at all, in a directory with nothing in it", () => {
    const empty = mkdtempSync(join(tmpdir(), "snypd-empty-"));
    try {
      const r = run(["init", "."], empty);
      expect(r.code, r.err).toBe(0);
      // The repo is init's own job here, and it lands on the branch a publish lands on.
      const head = Bun.spawnSync(["git", "symbolic-ref", "--short", "HEAD"], { cwd: empty }).stdout.toString().trim();
      expect(head).toBe("main");
      const log = Bun.spawnSync(["git", "log", "--oneline"], { cwd: empty }).stdout.toString();
      expect(log).toContain("site: init");
      const status = Bun.spawnSync(["git", "status", "--porcelain"], { cwd: empty }).stdout.toString();
      expect(status).toBe("");                                    // nothing left uncommitted for the first write to trip on
      // Named after the directory, on a placeholder origin, and the config says so in the file itself.
      const yaml = readFileSync(join(empty, "snypd.yaml"), "utf8");
      expect(yaml).toContain(`name: "${basename(empty)}"`);
      expect(yaml).toContain("# placeholder");
      expect(r.out).toContain("git init — new repository on main");
      expect(r.out).toContain("Do not ask for it yet.");          // the URL is due at publish, and only there
    } finally { rmSync(empty, { recursive: true, force: true }); }
  }, 30_000);

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
   * S18d — the health report the binary gives is the one the checkout gives.
   *
   * `site` › doctor is what an agent has instead of a page (docs/08 decision 64), so a fact it invents is
   * onboarding damage: the first health check a new site ever runs. In the binary it reported **38 token
   * overrides the theme does not declare** on a scaffold `init` had just written, because `themeTokens`
   * read `theme.yaml` with `readFileSync` on a `snypd:theme/…` name rather than through the `themefs`
   * seam, and swallowed the failure — undeclared tokens are counted as stranded overrides, so a read that
   * returned nothing became 38 problems rather than an error.
   *
   * This is S18a's bug again (one path on disk, another in `$bunfs`) and it survived S18a for the same
   * reason: `bun test` runs from a checkout where `themes/editorial` is a real directory. Asserting on the
   * *count* rather than the wording is deliberate — the defect was a number that should have been zero.
   */
  test("`doctor` reports the site's problems and none of the binary's own", async () => {
    const p = Bun.spawn([BIN, "serve", dir], { cwd: dir, stdin: "pipe", stdout: "pipe", stderr: "ignore" });
    const send = (id: number, method: string, params?: object) =>
      p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }) + "\n");
    send(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "0" } });
    send(2, "tools/call", { name: "site", arguments: { action: "doctor" } });
    await p.stdin.flush();
    const reader = p.stdout.getReader();
    let buf = "";
    const deadline = Date.now() + 20_000;
    while (buf.split("\n").filter(Boolean).length < 2 && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += new TextDecoder().decode(value);
    }
    p.kill();
    const doc = JSON.parse(buf.split("\n").filter(Boolean)[1]!) as { result: { content: { text: string }[] } };
    const report = doc.result.content.map((c) => c.text).join("\n");

    expect(report).toContain("config loads");
    expect(report).toContain("theme `editorial` resolves");
    // The whole assertion: the themes are inside the binary, and doctor knows what they declare.
    expect(report).not.toContain("the theme does not declare");
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

  /**
   * S18e's exit criterion, and docs/08 F6 in its testable half: **two commands from an empty directory
   * to a painted Desk, no flags required.** The number that goes with it (`onboard.ttfv`) is S18g's;
   * what is asserted here is that the path exists at all, against the artefact, from a directory the
   * binary has never seen — which is the only configuration where it is visible (decision 55).
   *
   * Three things this can only find here. The Desk is rendered by a theme that lives inside the binary,
   * so `$bunfs` is on this path exactly as it was in S18a. `.snypd/dev.json` is written by a process
   * whose working directory is not ours. And the browser stays shut: stdout is a pipe, so `isTTY` is
   * false and decision 57's check holds — a window opening in CI would be the failure this asserts against.
   */
  test("`init` then `dev`: two commands from an empty directory to a painted Desk", async () => {
    const empty = mkdtempSync(join(tmpdir(), "snypd-empty-"));
    // Named so the pipes are in the type: `dev.stdout` has to be a stream for the banner read below,
    // and `ReturnType<typeof Bun.spawn>` widens it back to `number | ReadableStream`.
    const spawnDev = () => Bun.spawn([BIN, "dev", "."], { cwd: empty, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
    let dev: ReturnType<typeof spawnDev> | undefined;
    try {
      expect(run(["init", "."], empty).code).toBe(0);
      dev = spawnDev();

      // The record is the handshake: it appears when the server has bound and knows its real port, so
      // waiting for it is waiting for the thing under test rather than for a fixed number of seconds.
      const rec = join(empty, ".snypd", "dev.json");
      const deadline = Date.now() + 30_000;
      while (!existsSync(rec) && Date.now() < deadline) await Bun.sleep(50);
      expect(existsSync(rec)).toBe(true);
      const j = JSON.parse(readFileSync(rec, "utf8")) as { url: string; port: number; pid: number; root: string };
      expect(j.pid).toBe(dev.pid);
      expect(j.port).toBeGreaterThan(0);

      const desk = await fetch(`${j.url}/_snypd`);
      expect(desk.status).toBe(200);
      const page = await desk.text();
      expect(page).toContain("Snypd Desk");
      expect(page).toContain("<style");                 // the theme's stylesheet, read out of $bunfs
      expect(page).not.toContain("<script");            // decision 26: 0 KB JS, on the empty state too

      // Nothing has been written yet, so this is the state every new site is in for its first minutes,
      // and the page has to be legible in it rather than only once there is a draft to list.
      expect((await fetch(`${j.url}/_snypd/alive`)).status).toBe(200);

      // S18f — the checklist, from the artefact and from a directory that was empty a second ago
      // (decision 55: anything asserting about first run from inside the workspace asserts about a state
      // no user is ever in). Four rows are unfinished here, and each one names the surface it lives on.
      expect(page).toContain("First run");
      expect(page).toContain("do this in your harness");     // the restart, which is neither a shell nor a sentence
      expect(page).toContain("mcpServers");                  // the registration, verbatim (docs/08 §9.4)
      expect(page).toContain("What is snypd?");
      expect(page).not.toContain("<pre>");                   // every scroll region is keyboard-reachable

      // And the index: rendered by this server, present in no file, gone on the first real post.
      const index = await fetch(`${j.url}/`);
      expect(index.status).toBe(200);
      const home = await index.text();
      expect(home).toContain("data-snypd-empty-state");
      expect(home).toContain("Only you can see this");
      expect(home).not.toContain("<script");
      expect(existsSync(join(empty, "content", "posts"))).toBe(true);
      // A `.gitkeep` and nothing else: no welcome post, so there is no file a new site has to delete
      // and none that ships to production when somebody forgets to (decision 52).
      expect(readdirSync(join(empty, "content", "posts"))).toEqual([".gitkeep"]);

      // The banner names the Desk. Three sessions of `serve --preview` printed the S11 review path with
      // `<type>/<slug>` placeholders in it and never once said `/_snypd` (decision 51). Read chunk by
      // chunk against a deadline, never `new Response(stdout).text()` — this process does not exit, so
      // waiting for its stdout to close is waiting forever.
      const reader = dev.stdout.getReader();
      let banner = "";
      while (!banner.includes("/_snypd") && Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        banner += new TextDecoder().decode(value);
      }
      reader.releaseLock();
      expect(banner).toContain("snypd dev → http://");
      expect(banner).toContain("/_snypd");
      expect(banner).toContain("Ctrl-C to stop.");
    } finally {
      if (dev) { dev.kill("SIGTERM"); await dev.exited.catch(() => {}) }
      rmSync(empty, { recursive: true, force: true });
    }
  }, 120_000);

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
