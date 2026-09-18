// F3: build a site as it is configured, into a directory of the film's. bun …/build-site.ts <siteRoot> <outDir>
import { join, resolve } from "node:path";
import { build } from "@snypd/render";
import { loadConfig, SiteIndex, INDEX_DIR } from "@snypd/core";
const root = resolve(process.argv[2]!), out = resolve(process.argv[3]!);
const cfg = loadConfig(root);
const index = await SiteIndex.open(root, join(root, INDEX_DIR, "index.film.sqlite"));
try { await build(root, { out, cfg, index }); } finally { index.close(); }
console.log("built", root, "→", out);
