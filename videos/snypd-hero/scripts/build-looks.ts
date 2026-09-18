// F3 (docs/26 §5): build one site under every bundled look, out of band — no file in the site is edited.
// bun videos/snypd-hero/scripts/build-looks.ts <siteRoot> <outDir>
import { join, resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { build } from "@snypd/render";
import { loadConfig, installedThemes, themeVariations, SiteIndex, INDEX_DIR } from "@snypd/core";

const root = resolve(process.argv[2]!), out = resolve(process.argv[3]!);
mkdirSync(out, { recursive: true });
const looks: { slug: string; theme: string; variation?: string }[] = [];
for (const t of installedThemes(root)) {
  const vs = themeVariations(loadConfig(root, { theme: t.name }));
  if (!vs.length) looks.push({ slug: t.name, theme: t.name });
  else for (const v of vs) looks.push({ slug: `${t.name}-${v.name}`, theme: t.name, variation: v.name });
}
for (const l of looks) {
  const cfg = loadConfig(root, { theme: l.theme, variation: l.variation });
  const index = await SiteIndex.open(root, join(root, INDEX_DIR, `index.film-${l.slug}.sqlite`));
  try { await build(root, { out: join(out, l.slug), cfg, index }); } finally { index.close(); }
  console.log("built", l.slug);
}
writeFileSync(join(out, "looks.json"), JSON.stringify(looks, null, 2));
