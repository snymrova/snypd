#!/usr/bin/env bun
/**
 * `snypd serve | build | bench | init` — the four verbs (docs/00 §principles 1).
 *
 * The body is a function rather than top-level code for one reason: `bun build --compile --bytecode`
 * cannot compile a module with top-level `await`, and every verb here begins with one — the lazy
 * `import()` that keeps `snypd serve` answering `initialize` without loading a renderer it will not use
 * (S4, D2's 50 ms). Bytecode and lazy imports are both worth keeping, and `async function main()` is the
 * whole price of having both.
 */
const [cmd, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith("--")));
const args = rest.filter((a) => !a.startsWith("--"));

async function main(): Promise<void> {
switch (cmd) {
  case "build": {
    const { build } = await import("@snypd/render");
    let r;
    try { r = await build(args[0] ?? "."); }
    catch (e) {
      const err = e as Error & { hint?: string };
      console.error(err.message); if (err.hint) console.error(err.hint);
      process.exit(1);
    }
    // A primitive is covered when something renders it: the theme's own file, an ancestor's, or a
    // declared fallback. Only `missing` (the generic wrapper) is a hole, so only it is subtracted.
    const covered = r.theme.coverage.filter((c) => c.status !== "missing").length;
    const inherited = r.theme.coverage.filter((c) => c.status === "inherited").length;
    console.log(`built ${r.routes} routes + ${r.artefacts} artefacts${r.media ? ` + ${r.media} media` : ""} (${r.rendered} rendered, ${r.cached} cached, ${r.removed} removed) in ${r.ms.toFixed(0)} ms · theme ${r.theme.name} (${covered}/${r.theme.coverage.length} primitives${inherited ? `, ${inherited} inherited` : ""})`);
    if (flags.has("--verbose")) console.log(Object.entries(r.phases).map(([k, v]) => `${k} ${v.toFixed(1)} ms`).join(" · "));
    break;
  }
  case "bench": {
    const bench = await import("@snypd/bench");
    if (args[0] === "compare") {
      const rows = bench.compare(bench.load(args[1]!), bench.load(args[2]!));
      for (const r of rows) console.log(`${r.regressed ? "❌" : "✅"} ${r.name}: ${r.a} → ${r.b} (${(r.delta * 100).toFixed(1)} %)`);
      if (rows.some((r) => r.regressed)) process.exit(1);
      break;
    }
    if (args[0] === "page") {    // S13: the built site in a real browser — 0 KB JS, 0 axe violations
      const r = await bench.page({ root: args[1] });
      console.log(bench.toMarkdown(r));
      const over = bench.breaches(r);
      if (over.length && flags.has("--ci")) { console.error(`budget breach: ${over.join(", ")}`); process.exit(1); }
      break;
    }
    if (args[0] === "suggest") {   // S15: suggest_blocks precision over the hand-labelled corpus
      if (flags.has("--facts")) {   // the keys a detector YAML may name — how one is written without reading the code
        console.log(bench.factsReport(args[1], { shape: args.find((a) => a.startsWith("--shape="))?.slice(8) }));
        break;
      }
      const r = await bench.suggest({ root: args[1] });
      console.log(bench.toMarkdown(r));
      console.log(`\n${bench.formatSuggestScore(bench.scoreSuggest(args[1]))}`);
      const over = bench.breaches(r);
      if (over.length) { console.error(`\n${over.length} breach(es)`); process.exit(1); }
      break;
    }
    if (args[0] === "agent") {   // S17: the kill test — the one lane that scores the product, not a number
      const { report, run } = await bench.agent({ keep: flags.has("--keep") });
      console.log(bench.toMarkdown(report));
      console.log(`\n${run.checks.map((c) => `${c.ok ? "✅" : "❌"} ${c.what} — ${c.detail}`).join("\n")}`);
      const over = bench.breaches(report);
      if (over.length) { console.error(`\nbudget breach: ${over.join(", ")}`); process.exit(1); }
      break;
    }
    if (args[0] === "visual") {   // D3 only: every visual primitive at its worst shape, no build (S10)
      const r = await bench.visual({ quick: flags.has("--quick") });
      console.log(bench.toMarkdown(r));
      const over = bench.breaches(r);
      if (over.length && flags.has("--ci")) { console.error(`budget breach: ${over.join(", ")}`); process.exit(1); }
      break;
    }
    const report = await bench.run({ quick: flags.has("--quick") });
    console.log(bench.toMarkdown(report));
    const bad = bench.breaches(report);
    if (bad.length && flags.has("--ci")) { console.error(`budget breach: ${bad.join(", ")}`); process.exit(1); }
    break;
  }
  case "serve": {
    const port = Number(rest.find((a) => a.startsWith("--port="))?.slice(7) ?? 4321);
    if (flags.has("--preview")) {   // S11: drafts rendered, review pages served, rebuild on change
      const { preview } = await import("@snypd/render/preview");
      const s = await preview(args[0] ?? ".", { port });
      console.log(`snypd serve --preview → ${s.url}  (drafts included; approve at ${s.url}/_snypd/review/<type>/<slug>)`);
      break;
    }
    if (flags.has("--static")) {   // the S2 static stub: dist/ exactly as built, no drafts
      const { serve } = await import("@snypd/runtime");
      const s = serve(args[0] ?? ".", { port });
      console.log(`snypd serve --static → ${s.url}`);
      break;
    }
    const { createServer } = await import("@snypd/mcp");   // MCP on stdio (docs/03); stdout is the protocol
    createServer(args[0] ?? process.env.SNYPD_ROOT ?? process.cwd()).listen();
    break;
  }
  case "config": {   // debugging aid: `snypd config [root] [path]` prints snypd://config or explains one path
    const { loadConfig, formatDiagnostics } = await import("@snypd/core");
    const c = loadConfig(args[0] ?? ".");
    if (args[1]) console.log(c.explain(args[1])); else console.log(c.render());
    if (!c.ok) { console.error(formatDiagnostics(c.diagnostics)); process.exit(1); }
    break;
  }
  case "lint": {     // debugging aid: `snypd lint [root|file.md]` — rules 0–11 (docs/01); exit 1 on errors
    const { lintSite, formatSiteLint, lintMarkdown, formatLint, SiteIndex, loadConfig } = await import("@snypd/core");
    const target = args[0] ?? ".";
    if (target.endsWith(".md")) {
      const r = lintMarkdown(await Bun.file(target).text(), { file: target });
      console.log(formatLint(r) || `${target}: clean (${r.words} words)`);
      process.exit(r.errors ? 1 : 0);
    }
    const cfg = loadConfig(target);
    const index = await SiteIndex.open(target); index.sync(cfg);   // rule 10 reads the move log
    const s = lintSite(target, { cfg, moves: index.moves(), cache: new (await import("@snypd/core")).MdastCache(index.mdastStore()) });
    index.close();
    console.log(formatSiteLint(s));
    process.exit(s.errors ? 1 : 0);
  }
  case "init": {   // S16: the same `initSite` the `site` tool calls, for someone who reached for a terminal first
    const { initSite, Repo, MCP_FILE, DEFAULT_BASE, PLACEHOLDER_URL, buildCommand, VERSION } = await import("@snypd/core");
    const flag = (n: string) => [...flags].find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
    const root = args[0] ?? ".";
    try {
      // No required flags (S18d, docs/08 decision 63): name falls back to the directory, url to a
      // placeholder that comes due at publish. The person running this has not seen a pixel yet.
      const r = initSite(root, { name: flag("name"), url: flag("url"), description: flag("description"), theme: flag("theme"), deploy: flag("deploy") as "cloudflare" | "vercel" | undefined });
      const say: string[] = [`initialised ${r.created.join(", ")}`];
      // An empty directory gets its repo here rather than as homework (S18d): without one the scaffold
      // cannot be committed, and the first `content.create` refuses on a tree it was never told about.
      if (r.gitInit) say.push(`git init — new repository on ${DEFAULT_BASE}`);
      // The one line a host runs is now an installed command rather than a shell script piped from a
      // URL (S18d′) — worth printing, because it is the whole of what the host has to be told.
      if (r.deploy) say.push(`${r.deploy}: build with \`${buildCommand(VERSION)}\`, serve dist/ — snypd never talks to a host`);
      // Commit the scaffold on the branch the site deploys from. Leaving it uncommitted would make the
      // agent's first write refuse — `useDrafts` will not carry work it did not do onto the drafts branch
      // — and would leave `main` without a `snypd.yaml` for the host to build after the first publish.
      const repo = Repo.open(root);
      const committed = repo?.commit(r.paths, `site: init ${r.name}`);
      if (committed?.committed) say.push(`committed ${committed.sha!.slice(0, 8)} on ${committed.branch}`);
      else if (!repo) say.push(`not a git repo, and this directory already has files in it — \`git init\` here, then re-run; nothing can be versioned or published without one`);
      // The third case, which said nothing at all until S18d′ and is the one a fresh machine is in: the
      // repo exists and the commit did not happen. Silence here surfaces two steps later as a refused
      // `content.create`, which is the cause hidden behind a symptom.
      else say.push(`the scaffold could not be committed: ${committed?.reason ?? "unknown"}${committed?.hint ? `\n${committed.hint}` : ""}`);
      console.log(say.join("\n"));

      // ── Everything below is addressed to an agent (S18d, docs/08 decision 60) ────────────────────
      // Under docs/08 §2 the reader of this output is the agent that just ran the command, not a person
      // at a screen: it pastes one sentence, this runs, and what it prints is the only briefing that
      // reader gets. Until this session these were three human-facing lines ending in an instruction the
      // agent cannot execute — so the one step that needs a human was written as though the human were
      // already reading it. It says four things, in the order they are acted on: what exists, what is
      // still unknown and when it comes due, the one thing only a person can do (phrased to be relayed
      // verbatim), and where the far side picks up — because there is no far side to hand anything to.
      const out: string[] = ["", `\`${r.name}\` is a snypd site. There is no admin UI: content is written over MCP, by you.`];
      if (r.placeholderUrl)
        out.push(`Its URL is ${PLACEHOLDER_URL}, a placeholder. The feed, sitemap and JSON-LD are absolute, so the real origin is needed before anything publishes — and not before. Do not ask for it yet.`);
      const registered = r.created.includes(MCP_FILE);
      out.push("",
        registered
          ? `One thing here needs a person, and it is not something you can do: a harness reads ${MCP_FILE} when it starts, so the snypd tools are not loaded in this session. Ask for it in these words:`
          : `${MCP_FILE} already existed and was left alone. If it does not name a \`snypd\` server, the tools will not load — check it, then ask for this in these words:`,
        "", "    Restart your harness (Claude Code, Cursor or Codex) so the snypd tools load.", "",
        `That restart ends this conversation, and nothing needs to be carried across it. The next session's \`initialize\` names the \`get-started\` prompt, and everything else is on disk — run it and it will read the site, learn the vocabulary and write the first post.`);
      console.log(out.join("\n"));
    } catch (e) {
      const err = e as Error & { hint?: string };
      console.error(err.message); if (err.hint) console.error(`↳ ${err.hint}`);
      process.exit(1);
    }
    break;
  }
  // S18d′: a distributed binary is asked "which one is this?" by bug reports, package managers and
  // agents alike, and until now nothing answered. The import is lazy for the same reason every other one
  // here is (decision 49): `--version` must not put a module on the path `initialize` pays for.
  case "--version": case "-v": case "version": {
    const { version } = await import("../package.json");
    console.log(version);
    break;
  }
  default:
    console.log("usage: snypd <serve|build|bench|init> [--version] | snypd init [root] [--name=…] [--url=…] [--deploy=cloudflare|vercel] | snypd serve [root] --preview|--static [--port=N] | snypd bench [agent|page|visual|suggest [--facts [--shape=X]]|compare] | snypd config [root] [path] | snypd lint [root|file.md]"); process.exit(cmd ? 1 : 0);
}
}
main();
export {};
