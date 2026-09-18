/**
 * Build one site in one look, into its own dist (docs/15 §3.3, V2's browser half):
 *   bun packages/bench/readme/build-look.ts --root=<site> --theme=editorial --variation=ink --out=<dist>
 * The same `loadConfig(root, { theme, variation })` the gallery lane and shots.ts use, so what V2 shows
 * is what `theme › set` would have built — nothing in the site's own config is touched.
 */
import { join } from "node:path";
import { loadConfig, SiteIndex, INDEX_DIR } from "@snypd/core";
import { build } from "@snypd/render";

const args = new Map(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.slice(2).split("="); return [k!, v ?? ""]; }));
const need = (k: string) => { const v = args.get(k); if (!v) throw new Error(`--${k}=… is required`); return v; };
const root = need("root"), theme = need("theme"), out = need("out"), variation = args.get("variation") || undefined;

const cfg = loadConfig(root, { theme, variation });
const index = await SiteIndex.open(root, join(root, INDEX_DIR, `index.look-${theme}-${variation ?? "default"}.sqlite`));
try { const r = await build(root, { out, cfg, index }); console.log(`${theme}${variation ? ` › ${variation}` : ""}  ${r.routes} routes in ${r.ms.toFixed(0)} ms → ${out}`); }
finally { index.close(); }
