#!/usr/bin/env bun
/** `snypd serve | build | bench | init` — the four verbs (docs/00 §principles 1). */
const [cmd, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith("--")));
const args = rest.filter((a) => !a.startsWith("--"));

switch (cmd) {
  case "build": {
    const { build } = await import("@snypd/render");
    const r = await build(args[0] ?? ".");
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
    const { initSite, isRepoRoot } = await import("@snypd/core");
    const flag = (n: string) => [...flags].find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
    const root = args[0] ?? ".";
    const name = flag("name"), url = flag("url");
    if (!name || !url) { console.error("usage: snypd init [root] --name=\"My Site\" --url=https://example.com [--description=…] [--theme=editorial]"); process.exit(2); }
    try {
      const r = initSite(root, { name, url, description: flag("description"), theme: flag("theme") });
      console.log(`initialised ${r.created.join(", ")}`);
      console.log(isRepoRoot(root) ? "next: snypd serve  (then write through the MCP — that is the only interface)" : "next: git init here, then snypd serve");
    } catch (e) {
      const err = e as Error & { hint?: string };
      console.error(err.message); if (err.hint) console.error(`↳ ${err.hint}`);
      process.exit(1);
    }
    break;
  }
  default:
    console.log("usage: snypd <serve|build|bench|init> | snypd init [root] --name=… --url=… | snypd serve [root] --preview|--static [--port=N] | snypd bench [page|visual|suggest [--facts [--shape=X]]|compare] | snypd config [root] [path] | snypd lint [root|file.md]"); process.exit(cmd ? 1 : 0);
}
export {};
