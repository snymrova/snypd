#!/usr/bin/env bun
/** `snypd serve | build | bench | init` — the four verbs (docs/00 §principles 1). */
const [cmd, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith("--")));
const args = rest.filter((a) => !a.startsWith("--"));

switch (cmd) {
  case "build": {
    const { build } = await import("@snypd/render");
    const r = await build(args[0] ?? ".");
    console.log(`built ${r.routes} routes in ${r.ms.toFixed(1)} ms`);
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
  case "init":
    console.error(`snypd ${cmd}: not yet implemented (see docs/07 schedule)`); process.exit(2);
  default:
    console.log("usage: snypd <serve|build|bench|init> | snypd config [root] [path]"); process.exit(cmd ? 1 : 0);
}
export {};
