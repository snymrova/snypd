#!/usr/bin/env bun
/** `snypd serve | build | bench | init` — the four verbs (docs/00 §principles 1). */
const [cmd, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith("--")));
const args = rest.filter((a) => !a.startsWith("--"));

switch (cmd) {
  case "build": {
    const { build } = await import("@snypd/render");
    const r = await build(args[0] ?? ".");
    const own = r.theme.coverage.filter((c) => c.status === "own").length;
    console.log(`built ${r.routes} routes + ${r.artefacts} artefacts (${r.rendered} rendered, ${r.cached} cached, ${r.removed} removed) in ${r.ms.toFixed(0)} ms · theme ${r.theme.name} (${own}/${r.theme.coverage.length} primitives)`);
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
    if (flags.has("--static")) {   // the S2 static stub; S11 replaces it with --preview
      const { serve } = await import("@snypd/runtime");
      const s = serve(args[0] ?? ".", { port: Number(rest.find((a) => a.startsWith("--port="))?.slice(7) ?? 4321) });
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
  case "init":
    console.error(`snypd ${cmd}: not yet implemented (see docs/07 schedule)`); process.exit(2);
  default:
    console.log("usage: snypd <serve|build|bench|init> | snypd config [root] [path] | snypd lint [root|file.md]"); process.exit(cmd ? 1 : 0);
}
export {};
