/**
 * S1 STUB renderer: copies markdown to dist/ as .md twins and wraps it in minimal HTML.
 * This exists so the benchmark has a floor before the real renderer lands (S5–S7).
 * Real pipeline: parse → validate → transform → render → emit (docs/02 §9).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";

export interface BuildResult { routes: number; ms: number }

export async function build(root: string, out = join(root, "dist")): Promise<BuildResult> {
  const t0 = performance.now();
  const src = join(root, "content", "posts");
  mkdirSync(out, { recursive: true });
  let routes = 0;
  for (const f of readdirSync(src)) {
    if (!f.endsWith(".md")) continue;
    const slug = f.slice(0, -3);
    const md = readFileSync(join(src, f), "utf8");
    const dir = join(out, "posts", slug);
    mkdirSync(dir, { recursive: true });
    copyFileSync(join(src, f), join(dir, "index.md"));
    writeFileSync(join(dir, "index.html"), `<!doctype html><meta charset="utf-8"><link rel="alternate" type="text/markdown" href="index.md"><pre>${md.replace(/</g, "&lt;")}</pre>`);
    routes++;
  }
  return { routes, ms: performance.now() - t0 };
}
