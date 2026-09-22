/**
 * The gallery (S22 · L1, docs/10 §6, docs/11 E9): every look every installed theme ships, photographed.
 *
 * A "look" is a theme and one of its variations — `editorial › ink`, `technical › phosphor` — or a theme
 * with no variations, which is one look under its own name. Each is built from the theme fixture
 * (`corpora/theme`, every primitive once) with `loadConfig(root, { theme, variation })`, the same out-of-
 * band switch `snypd check theme` uses, so no file in the fixture is edited and no second copy of the
 * content exists. The screenshots are what `/themes` on snypd.rocks shows, one `figure` per look.
 *
 * It is a lane and not only a script because E9 asks for numbers beside the pictures — "`page.font.kb`
 * declared and met, `page.a11y.violations` 0 on every one" — and a gallery that was only looked at is a
 * gallery whose defects are found by visitors. Each look is measured with the page suite's own `measure`
 * before it is photographed, on the same loaded page, so the picture and the number are of one render.
 * The record is `bench/gallery.md`; the PNGs go to `bench/gallery/` (ignored) or wherever `out` says —
 * a site's `content/media/` when the shelf is being written.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build, loadTheme } from "@snypd/render";
import { serve } from "@snypd/runtime";
import { loadConfig, installedThemes, themeVariations, SiteIndex, INDEX_DIR } from "@snypd/core";
import { launch, findChrome } from "./cdp";
import { measure, VIEWPORTS, type PageResult, type Viewport } from "./page";
import { TOKENIZER } from "./tokens";
import type { Metric, Report } from "./index";

export interface Look {
  theme: string;
  /** Absent for a theme that ships no variations — its one look is its defaults. */
  variation?: string;
  /** `editorial-ink`, `base` — the file stem and the metric segment. */
  slug: string;
  /** The variation's own line, or the theme's `personality` when it has no variations. */
  description: string;
  personality: string;
  /** `true` when the look sets `color.scheme: dark` — it renders dark whatever the viewer prefers. */
  dark: boolean;
}

export interface Shot extends PageResult {
  look: Look;
  /** Where the PNG was written. */
  file: string;
  /** What the viewer was taken to prefer for this shot. */
  scheme: "light" | "dark";
}

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/**
 * Every look this root can resolve, active theme first, variations in declaration order. Read through
 * `loadConfig` per theme rather than off the YAML, so a variation that does not parse is not a look.
 */
export function looks(root: string): Look[] {
  const out: Look[] = [];
  for (const t of installedThemes(root)) {
    const cfg = loadConfig(root, { theme: t.name });
    const personality = clean(t.description);
    const vs = themeVariations(cfg);
    if (!vs.length) { out.push({ theme: t.name, slug: t.name, description: personality, personality, dark: false }); continue; }
    for (const v of vs) {
      out.push({
        theme: t.name, variation: v.name, slug: `${t.name}-${v.name}`,
        description: clean(v.description) || personality, personality,
        dark: (v.tokens as Record<string, unknown> | undefined)?.["color.scheme"] === "dark",
      });
    }
  }
  return out;
}

export interface GalleryOptions {
  /** The fixture; `corpora/theme` by default. */
  root?: string;
  /** Where the PNGs go; `bench/gallery` by default. */
  out?: string;
  /** The route photographed; the every-primitive post by default. */
  route?: string;
  /** Only these looks (slugs); all of them by default. */
  only?: string[];
  /** A selector scrolled to the top of the viewport before the shot — `.snypd-chart` photographs the theme at its first chart rather than at its masthead. Top of the page by default. */
  focus?: string;
  /** What the viewer is taken to prefer; `light` by default, so a look that follows the reader is photographed as written. A dark-only look is dark either way. */
  scheme?: "light" | "dark" | "both";
  onLook?: (look: Look, i: number, n: number) => void;
  write?: boolean;
}

/**
 * One look, built into its own `dist-<purpose>-<slug>-<pid>` with its own index and served on a free port — the
 * loop `gallery` and `shoot` (docs/29 TF2) share, so the out-of-band theme switch lives in one place.
 */
export async function buildAndServe(root: string, look: Pick<Look, "theme" | "variation" | "slug">, purpose: string):
  Promise<{ url: string; dist: string; fontKb: number; stop: () => void }> {
  const cfg = loadConfig(root, { theme: look.theme, variation: look.variation });
  const fontKb = (await loadTheme(cfg)).font?.kb ?? 0;
  // Per process: the sandbox's preview shoots the specimen continuously, and a second shoot of the same
  // look into the same directory had its pages deleted under it when the first one finished (TF5 found
  // it as 160 HTTP 404s). The index goes with the build, and `stop` removes both.
  const tag = `${purpose}-${look.slug}-${process.pid}`;
  const dist = join(root, `dist-${tag}`);
  const indexFile = join(root, INDEX_DIR, `index.${tag}.sqlite`);
  const index = await SiteIndex.open(root, indexFile);
  try { await build(root, { out: dist, cfg, index }); } finally { index.close(); }
  const s = serve(root, { dist });
  return { url: s.url, dist, fontKb, stop: () => { s.stop(); for (const f of [dist, indexFile, `${indexFile}-wal`, `${indexFile}-shm`]) rmSync(f, { recursive: true, force: true }); } };
}

export const GALLERY_ROUTE = "/posts/every-primitive-once/";

/**
 * Build, measure and photograph every look. One Chrome for the run, one build and one server per look.
 * Without Chrome it returns the one report-only row the page suite returns, for the same reason.
 */
export async function gallery(opts: GalleryOptions = {}): Promise<{ report: Report; shots: Shot[] }> {
  const { VERSION, toMarkdown, themeFixture } = await import("./index");
  const root = opts.root ?? themeFixture();
  const out = opts.out ?? join("bench", "gallery");
  const route = opts.route ?? GALLERY_ROUTE;
  const scheme = opts.scheme ?? "light";
  const schemes: ("light" | "dark")[] = scheme === "both" ? ["light", "dark"] : [scheme];
  const all = looks(root);
  const chosen = opts.only?.length ? all.filter((l) => opts.only!.includes(l.slug)) : all;
  const metrics: Metric[] = [];
  const shots: Shot[] = [];

  if (!findChrome()) {
    metrics.push({ name: "gallery.looks", value: -1, unit: "looks", note: "no Chrome on this machine — install one or set SNYPD_CHROME; `snypd bench gallery` needs a browser to photograph anything" });
    return { report: report(VERSION, TOKENIZER, metrics), shots };
  }
  mkdirSync(out, { recursive: true });
  const browser = await launch();
  try {
    let i = 0;
    for (const look of chosen) {
      opts.onLook?.(look, ++i, chosen.length);
      const s = await buildAndServe(root, look, "gallery");
      const { fontKb, dist } = s;
      if (!existsSync(join(dist, route, "index.html"))) { s.stop(); throw new Error(`gallery: ${look.slug} built no ${route} — pass \`route\` for a fixture that has no every-primitive post`); }
      try {
        const mine: Shot[] = [];
        for (const sc of schemes) for (const view of VIEWPORTS as readonly Viewport[]) {
          const page = await browser.page();
          try {
            // Headless Chrome inherits the machine's preference, and this box's is dark — so the first
            // run photographed `paper`, "warm cream", as near-black. A gallery says which scheme it is
            // of; the page suite does not need to, because nothing it measures is a colour.
            await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: sc }] });
            const r = await measure(page, `${s.url}${route}`, route, view);
            if (opts.focus) await page.send("Runtime.evaluate", { awaitPromise: true, expression: `new Promise(r => { document.querySelector(${JSON.stringify(opts.focus)})?.scrollIntoView({ block: "start" }); requestAnimationFrame(() => requestAnimationFrame(r)); })` });
            const { data } = await page.send<{ data: string }>("Page.captureScreenshot", { format: "png" });
            // One scheme keeps the names every earlier gallery wrote; both puts the scheme in the name.
            const file = join(out, `${look.slug}-${view.width}${schemes.length > 1 ? `-${sc}` : ""}.png`);
            writeFileSync(file, Buffer.from(data, "base64"));
            mine.push({ ...r, look, file, scheme: sc });
          } finally { await page.close(); }
        }
        shots.push(...mine);
        // Weight, axe and shift do not change with the scheme; one set of rows per look, from the first.
        metrics.push(...lookMetrics(look, mine.filter((m) => m.scheme === schemes[0]), fontKb));
      } finally { s.stop(); }
    }
  } finally { browser.close(); }

  metrics.unshift({ name: "gallery.looks", value: chosen.length, unit: "looks",
    note: `${chosen.map((l) => l.slug).join(", ")} — ${route} at ${VIEWPORTS.map((v) => v.width).join("/")} px, viewer prefers ${schemes.join(" and ")}; PNGs in ${out}/` });
  const r = report(VERSION, TOKENIZER, metrics);
  if (opts.write !== false) {
    mkdirSync("bench", { recursive: true });
    writeFileSync("bench/gallery.json", JSON.stringify({ ...r, browser: browser.version, shots: shots.map(({ look, ...s }) => ({ look: look.slug, ...s })) }, null, 2));
    writeFileSync("bench/gallery.md", `${toMarkdown(r)}\n\n${formatShots(shots)}\n`);
  }
  return { report: r, shots };
}

const KB = (n: number) => +(n / 1024).toFixed(2);
const report = (version: string, tokenizer: string, metrics: Metric[]): Report =>
  ({ version, bun: Bun.version, date: new Date().toISOString(), tokenizer, suite: "gallery", metrics });

/** E9's three numbers per look — the page suite's gates, applied to each look rather than to the worst of one theme. */
export function lookMetrics(look: Look, shots: PageResult[], fontKb: number): Metric[] {
  const worst = <T,>(pick: (p: PageResult) => number) => shots.reduce((a, b) => (pick(b) > pick(a) ? b : a));
  const js = worst((p) => p.bytes.js + p.inlineJsBytes);
  const font = worst((p) => p.bytes.font);
  const violations = shots.flatMap((p) => p.violations.map((v) => ({ ...v, width: p.width })));
  const scrolled = shots.flatMap((p) => p.violationsScrolled.map((v) => ({ ...v, width: p.width })));
  const wide = shots.reduce((a, b) => (b.width > a.width ? b : a));
  const at = (p: PageResult) => `@ ${p.width}`;
  const who = look.variation ? `${look.theme} › ${look.variation}` : look.theme;
  return [
    { name: `gallery.${look.slug}.js.kb`, value: KB(js.bytes.js + js.inlineJsBytes), unit: "KB", budget: 0, note: `${who}; worst ${at(js)}` },
    { name: `gallery.${look.slug}.font.kb`, value: KB(font.bytes.font), unit: "KB", budget: fontKb, exact: true,
      note: fontKb ? `${who}; worst ${at(font)}; budget ${fontKb} KB is the theme's own font.kb` : `${who}; the theme declares no font, so the budget is 0` },
    { name: `gallery.${look.slug}.a11y.violations`, value: violations.length, unit: "violations", budget: 0,
      note: violations.length ? violations.map((v) => `${at({ width: v.width } as PageResult)} ${v.id} (${v.impact}, ${v.nodes} nodes)`).join(" · ") : `${who}; axe-core, 0 at both widths` },
    // docs/18 U9e: axe once more, one viewport down — the pass that sees a sticky masthead over the second
    // band. Report-only for a session (docs/07), then gated like the row above it.
    { name: `gallery.${look.slug}.a11y.scrolled`, value: scrolled.length, unit: "violations",
      note: scrolled.length ? scrolled.map((v) => `${at({ width: v.width } as PageResult)} ${v.id} (${v.impact}, ${v.nodes} nodes)`).join(" · ") : `${who}; axe-core one viewport down, 0 at both widths; report-only` },
    // S29 (docs/17 §5): pictures and clips fetched before any scroll at the widest viewport; report-only.
    { name: `gallery.${look.slug}.media.kb`, value: KB(wide.bytes.image + wide.bytes.media), unit: "KB",
      note: `${who}; ${KB(wide.bytes.image)} KB img + ${KB(wide.bytes.media)} KB video ${at(wide)}, before any scroll` },
  ];
}

/** One row per PNG, so the record says what each picture is of and what it weighed. */
export function formatShots(shots: Shot[]): string {
  const rows = shots.map((s) => `| ${s.look.variation ? `${s.look.theme} › ${s.look.variation}` : s.look.theme} | ${s.width}${shots.some((x) => x.scheme !== shots[0]!.scheme) ? ` ${s.scheme}` : ""} | ${s.file} | ${KB(s.bytes.total)} KB | ${s.violations.length} | ${s.look.description} |`);
  return ["| Look | Width | File | Page weight | axe | Reads as |", "|---|---|---|---|---|---|", ...rows].join("\n");
}
