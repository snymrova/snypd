/**
 * E7 as a property (H4, docs/11 §7 gate E7): *an incremental build equals a cold build* — for every site
 * this generator can write, every sequence of edits it can make, with a build killed part-way, and with
 * builds running at once. H3 closed the three ways it was false with three examples; these are the tests
 * that say there is no fourth, to the extent a seeded search can say so.
 *
 * The oracle is the build itself, run cold: the same tree, a fresh index in a temp directory, a fresh
 * `dist/`. Two trees of bytes, compared file by file. Nothing here knows what a page should contain —
 * only that the route cache must never be the reason two builds of one tree differ.
 */
import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SiteIndex } from "@snypd/core";
import { build, type BuildResult } from "@snypd/render";
import { announce, apply, differences, edit, fc, params, site, writeSite, routeOf, type Edit, type Site } from "./arbitrary";
import { EDITS } from "./corpus";

// A property is many builds; the timeout is a hang detector, not a budget (mcp.test.ts says why).
setDefaultTimeout(600_000);
announce();

const ROOT = "corpora/_test/props";
const CHILD = resolve(import.meta.dir, "child.ts");
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

type Outcome = { ok: true; result: BuildResult } | { ok: false; error: string };
const refused = (e: unknown) => /more JavaScript than this site afforded/.test(String((e as Error).message));
async function incremental(root: string): Promise<Outcome> {
  try { return { ok: true, result: await build(root) }; }
  catch (e) { if (refused(e)) return { ok: false, error: (e as Error).message }; throw e; }
}
/** The oracle: the same tree through a fresh index into a fresh directory. `done()` removes both. */
async function cold(root: string): Promise<Outcome & { dist: string; done: () => void }> {
  const tmp = mkdtempSync(join(tmpdir(), "snypd-cold-"));
  const dist = join(tmp, "dist");
  const done = () => rmSync(tmp, { recursive: true, force: true });
  const index = await SiteIndex.open(root, join(tmp, "index.sqlite"));
  try { const result = await build(root, { out: dist, index }); return { ok: true, result, dist, done }; }
  catch (e) { if (refused(e)) return { ok: false, error: (e as Error).message, dist, done }; done(); throw e; }
  finally { index.close(); }
}

/**
 * One step: build incrementally, build cold, and the two must agree — on whether the tree builds at all
 * (a `<script>` refuses both or neither), and when it does, on every byte in `dist/`. `log` is the
 * account of the edits so far, printed with the counterexample.
 */
async function step(root: string, log: string[]): Promise<BuildResult | undefined> {
  const inc = await incremental(root);
  const c = await cold(root);
  try {
    if (inc.ok !== c.ok) throw new Error(`after: ${log.join(" · ")}\nincremental ${inc.ok ? "built" : `refused: ${inc.error}`}; cold ${c.ok ? "built" : `refused: ${c.error}`}`);
    if (inc.ok && c.ok) {
      const diff = differences(join(root, "dist"), c.dist);
      if (diff.length) throw new Error(`after: ${log.join(" · ")}\n${diff.join("\n")}`);
    }
    return inc.ok ? inc.result : undefined;
  } finally { c.done(); }
}

describe("E7 as a property: incremental ≡ cold", () => {
  test("1. for every site and every edit sequence, the incremental build is byte for byte the cold build", async () => {
    const root = join(ROOT, "edits");
    await fc.assert(fc.asyncProperty(site, fc.array(edit, { minLength: 1, maxLength: 8 }), async (s, edits) => {
      writeSite(root, s);
      const log = ["written"];
      await step(root, log);
      for (const e of edits) { log.push(apply(root, s, e)); await step(root, log); }
    }), params(12, { examples: EDITS }));
  });

  /**
   * An interruption is an edit like any other: a build that dies with its rows open. Two kinds — a
   * SIGKILL from a plugin slot while a named route renders (so pages before it in the plan are on disk
   * and the rest are not), and the client-budget refusal, which is in the ordinary alphabet already.
   * The kill retitles an item first, so the item's page *and* every list it is in are in the plan; dying
   * at the index leaves the content written and the lists stale, which is the shape H3 finding 8 was.
   */
  type Step = Edit | { kind: "kill"; i: number; at: "item" | "index" };
  const interruption: fc.Arbitrary<Step> = fc.oneof({ weight: 4, arbitrary: edit }, { weight: 2, arbitrary: fc.record({ kind: fc.constant("kill" as const), i: fc.nat({ max: 20 }), at: fc.constantFrom("item" as const, "index" as const) }, { noNullPrototype: true }) });
  const killer = (root: string) => {
    mkdirSync(join(root, "plugins/killer"), { recursive: true });
    const kill = resolve(root, "KILL");
    writeFileSync(join(root, "plugins/killer/end.ts"), `import { existsSync, readFileSync } from "node:fs";\nexport default ({ route }: { route: string }) => { if (existsSync(${JSON.stringify(kill)}) && readFileSync(${JSON.stringify(kill)}, "utf8") === route) process.kill(process.pid, "SIGKILL"); return null; };\n`);
    writeFileSync(join(root, "plugins/killer/snypd.yaml"), "plugin: { name: killer, version: 0.0.1, api: 1, slots: { body-end: ./end.ts } }\n");
    return kill;
  };
  test("2. a build killed anywhere leaves a tree the next build brings back to what a cold build says", async () => {
    const root = join(ROOT, "kills");
    await fc.assert(fc.asyncProperty(site, fc.array(interruption, { minLength: 1, maxLength: 5 }), async (s, steps) => {
      s.plugins = ["killer"];
      writeSite(root, s);
      const kill = killer(root);
      const log = ["written"];
      let open = false;   // a build died after opening its generation, so the next one must report recovering it
      await step(root, log);
      for (const e of steps) {
        if (e.kind !== "kill") {
          log.push(apply(root, s, e));
          const r = await step(root, log);
          if (r && open && r.recovered === 0) throw new Error(`after: ${log.join(" · ")}\na build was killed with its rows open and the next one recovered nothing`);
          if (r) open = false;
          continue;
        }
        // every item deleted by an earlier step: nothing to retitle, so nothing to kill
        if (!s.items.length) { log.push("kill: nothing"); continue; }
        const item = s.items[e.i % s.items.length]!;
        log.push(apply(root, s, { kind: "retitle", i: e.i, title: `${item.fm.title ?? item.fm.name ?? ""} again` }));
        writeFileSync(kill, e.at === "item" ? routeOf(item) : "/");
        const child = Bun.spawn([process.execPath, CHILD, root], { stdout: "pipe", stderr: "pipe" });
        await child.exited;
        rmSync(kill);
        if (child.signalCode === "SIGKILL") { open = true; log.push(`killed at ${e.at === "item" ? routeOf(item) : "/"}`); }
        else if (child.exitCode === 0) { open = false; log.push(`kill at ${e.at === "item" ? routeOf(item) : "/"} never fired (not in the plan) — a whole build`); }
        else if (child.exitCode === 2) { open = true; log.push("child refused"); }
        else throw new Error(`after: ${log.join(" · ")}\nchild exited ${child.exitCode}: ${await new Response(child.stderr).text()}`);
      }
      // Whatever the last step left, one quiet build is the cold build.
      const r = await step(root, [...log, "one more build"]);
      if (r && open && r.recovered === 0) throw new Error(`after: ${log.join(" · ")}\nthe closing build recovered nothing after a kill`);
    }), params(4));
  });

  /**
   * Concurrency: two or three builds of one tree at once, sometimes with an edit landing while they
   * run. What is claimed (decision 152): none of them fails — no `SQLITE_BUSY`, no throw — and one
   * quiet build afterwards is the cold build. What is claimed on top when nothing raced them: the
   * tree they leave is *already* the cold build, because each wrote the same bytes and closed with
   * the same keys.
   */
  test("3. builds that run at once all finish, and a quiet build after them is the cold build", async () => {
    const root = join(ROOT, "concurrent");
    const race: fc.Arbitrary<{ n: number; during?: Edit }> = fc.record({ n: fc.constantFrom(2, 3), during: fc.option(edit, { nil: undefined }) }, { noNullPrototype: true });
    await fc.assert(fc.asyncProperty(site, fc.array(fc.tuple(edit, race), { minLength: 1, maxLength: 3 }), async (s, rounds) => {
      writeSite(root, s);
      const log = ["written"];
      await step(root, log);
      for (const [e, { n, during }] of rounds) {
        log.push(apply(root, s, e));
        const children = Array.from({ length: n }, () => Bun.spawn([process.execPath, CHILD, root], { stdout: "pipe", stderr: "pipe" }));
        if (during) log.push(`while ${n} build: ${apply(root, s, during)}`); else log.push(`${n} builds at once`);
        const outs = await Promise.all(children.map(async (c) => ({ code: await c.exited, out: await new Response(c.stdout).text(), err: await new Response(c.stderr).text() })));
        for (const o of outs) if (o.code !== 0 && o.code !== 2) throw new Error(`after: ${log.join(" · ")}\na concurrent build exited ${o.code}: ${o.err || o.out}`);
        const anyRefused = outs.some((o) => o.code === 2);
        if (!during && !anyRefused) {
          // Nothing moved under them: the tree they left is the cold build before anyone builds again.
          const c = await cold(root);
          try { if (c.ok) { const diff = differences(join(root, "dist"), c.dist); if (diff.length) throw new Error(`after: ${log.join(" · ")}\n${diff.join("\n")}`); } } finally { c.done(); }
        }
        await step(root, [...log, "one quiet build"]);
      }
    }), params(4));
  });

  test("the generator's sites build at all (a property over an empty alphabet finds nothing)", async () => {
    const root = join(ROOT, "smoke");
    const s = fc.sample(site, { seed: 1, numRuns: 1 })[0]!;
    writeSite(root, s);
    const r = await incremental(root);
    expect(r.ok || refused(new Error(r.ok ? "" : r.error))).toBe(true);
  });
});

export type { Site };
