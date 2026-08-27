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
  case "serve":
  case "init":
    console.error(`snypd ${cmd}: not yet implemented (see docs/07 schedule)`); process.exit(2);
  default:
    console.log("usage: snypd <serve|build|bench|init>"); process.exit(cmd ? 1 : 0);
}
export {};
