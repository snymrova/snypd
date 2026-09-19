/**
 * The camera (docs/29 TF2): every candidate theme × every route × every width × both schemes, photographed
 * whole, laid out on one contact sheet, and the sheet photographed in turn.
 *
 * The gallery answers "what does each look ship?" at two widths, on one route. This answers the question
 * a theme review actually asks: *does it hold up everywhere?* On the specimen (`corpora/specimen`) that
 * means the home bands, every primitive, a long read, a full index, a term, an author, the not-found page,
 * and the two titles that break mastheads. studio and console passed every gate and failed on sight; the
 * gates are blind to looks, and this is the eyes.
 *
 * What an agent reads is not the 216 shots but the sheets: `contact-<route>-<scheme>.png`, one per route
 * and scheme, every candidate side by side. A handful of pictures fits in context.
 *
 * Zero JavaScript in the sheet, like everything else snypd emits: `contact.html` is a table of links.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig, installedThemes } from "@snypd/core";
import { launch, findChrome, type Browser, type Page } from "./cdp";
import { buildAndServe } from "./gallery";
import { pickRoutes } from "./page";

/** The specimen's nine routes; on another site, the ones it has (docs/29 §3.1). */
export const SPECIMEN_ROUTES = [
  "/", "/posts/every-primitive-once/", "/posts/long-read/", "/posts/", "/tag/field-notes/", "/authors/ada/", "/404",
  "/posts/four-words-only/", "/posts/a-sixty-character-title-that-wraps-at-phone-width-badly/",
] as const;
export const SHOOT_WIDTHS = [390, 768, 1280, 1440] as const;
/** A page taller than this is cut here and marked `truncated`, rather than written as a giant PNG. */
export const MAX_SHOT_HEIGHT = 8000;

export type Scheme = "light" | "dark";

export interface ShootOptions {
  /** The site to build; the specimen by default. */
  root?: string;
  /** Themes to shoot, `theme` or `theme/variation`; the site's active theme by default. */
  themes?: string[];
  routes?: string[];
  widths?: number[];
  scheme?: Scheme | "both";
  out?: string;
  /** Pages photographed at once. */
  concurrency?: number;
  onCandidate?: (c: Candidate, i: number, n: number) => void;
}

export interface Candidate {
  theme: string;
  variation?: string;
  /** `folio`, `editorial-ink` — the directory and the column. */
  slug: string;
  /** The direction line: DESIGN.md's first paragraph, or the theme's personality. */
  line: string;
  fontKb: number;
}

export interface ShootShot {
  candidate: string;
  route: string;
  width: number;
  scheme: Scheme;
  /** Relative to `out`. */
  file: string;
  height: number;
  truncated: boolean;
  /** Cumulative layout shift while the page settled. */
  cls: number;
  status: number;
}

export interface ShootResult {
  out: string;
  candidates: Candidate[];
  shots: ShootShot[];
  /** `contact.html`, relative to `out`. */
  contact: string;
  /** The photographed sheets, one per route and scheme, absolute. */
  sheets: string[];
  ms: number;
  skipped?: string;
}

export const routeSlug = (route: string): string => route.replace(/^\/|\/$/g, "").replace(/[^a-zA-Z0-9-]+/g, "-") || "home";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The direction line a column is headed with (docs/29 §6.3): DESIGN.md's first paragraph, else the personality. */
function directionLine(dir: string | undefined, fallback: string): string {
  const f = dir && join(dir, "DESIGN.md");
  if (f && existsSync(f)) {
    const para = readFileSync(f, "utf8").split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !p.startsWith("#"));
    if (para) return para.replace(/\s+/g, " ");
  }
  return fallback;
}

function candidates(root: string, names: string[]): Omit<Candidate, "fontKb">[] {
  const shelf = installedThemes(root);
  return names.map((n) => {
    const [theme, variation] = n.split("/") as [string, string | undefined];
    const t = shelf.find((x) => x.name === theme);
    if (!t) throw Object.assign(new Error(`shoot: no theme "${theme}" on this site`), { hint: `installed: ${shelf.map((x) => x.name).join(", ")}` });
    return { theme, variation, slug: variation ? `${theme}-${variation}` : theme, line: directionLine(t.dir, t.description ?? "") };
  });
}

/** Settle, then photograph the whole page: styles, fonts, every image (lazy ones made eager), two frames. */
async function photograph(page: Page, url: string, width: number, scheme: Scheme): Promise<{ png: Buffer; height: number; truncated: boolean; cls: number; status: number }> {
  const height = width < 600 ? 844 : 900;
  await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }, { name: "prefers-reduced-motion", value: "reduce" }] });
  await page.send("Page.enable");
  await page.send("Network.enable");
  let status = 0;
  const got = page.once("Network.responseReceived", 15_000).then((e) => { status = ((e as { response?: { status?: number } }).response?.status) ?? 0; }).catch(() => {});
  const loaded = page.once("Page.loadEventFired", 20_000);
  await page.send("Page.navigate", { url });
  await loaded; await got;
  const { result } = await page.send<{ result: { value: { h: number; cls: number } } }>("Runtime.evaluate", { awaitPromise: true, returnByValue: true, expression: `(async () => {
    let cls = 0;
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) cls += e.value; }).observe({ type: "layout-shift", buffered: true }); } catch {}
    await Promise.all([...document.querySelectorAll('link[rel="stylesheet"]')].map(l => l.sheet ? 0 : new Promise(r => { l.onload = l.onerror = r; })));
    for (const i of document.images) i.loading = "eager";
    // decode(), not complete/onload: under six pages at once a loaded cover was photographed unpainted.
    await Promise.all([document.fonts.ready, ...[...document.images].map(i => Promise.race([i.decode().catch(() => {}), new Promise(r => setTimeout(r, 8000))]))]);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { h: Math.ceil(document.documentElement.scrollHeight), cls: +cls.toFixed(4) };
  })()` });
  const full = Math.max(height, result.value.h);
  const h = Math.min(full, MAX_SHOT_HEIGHT);
  const { data } = await page.send<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: h, scale: 1 } });
  return { png: Buffer.from(data, "base64"), height: h, truncated: full > MAX_SHOT_HEIGHT, cls: result.value.cls, status };
}

/** A small pool: `n` pages at once over one browser, each job on a fresh page. */
async function pool<T>(browser: Browser, jobs: T[], n: number, run: (page: Page, job: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++]!;
      const page = await browser.page();
      try { await run(page, job); } finally { await page.close(); }
    }
  }));
}

export async function shoot(opts: ShootOptions = {}): Promise<ShootResult> {
  const t0 = performance.now();
  const root = resolve(opts.root ?? "corpora/specimen");
  const out = resolve(opts.out ?? "shots");
  const schemes: Scheme[] = (opts.scheme ?? "both") === "both" ? ["light", "dark"] : [opts.scheme as Scheme];
  const widths = opts.widths?.length ? opts.widths : [...SHOOT_WIDTHS];
  const names = opts.themes?.length ? opts.themes : [loadConfig(root).config.theme.use];
  const chosen = candidates(root, names);
  const empty: ShootResult = { out, candidates: [], shots: [], contact: "", sheets: [], ms: 0 };
  if (!findChrome()) return { ...empty, skipped: "no Chrome on this machine — install Chrome or Chromium, or set SNYPD_CHROME to one; `snypd shoot` photographs the theme in a real browser" };

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const browser = await launch();
  const cands: Candidate[] = [];
  const shots: ShootShot[] = [];
  let routes: string[] = [];
  try {
    let i = 0;
    for (const c of chosen) {
      opts.onCandidate?.({ ...c, fontKb: 0 }, ++i, chosen.length);
      const s = await buildAndServe(root, c, "shoot");
      try {
        cands.push({ ...c, fontKb: s.fontKb });
        // The routes are fixed by the first candidate's build, so every column has the same rows.
        if (!routes.length) {
          const want = opts.routes?.length ? opts.routes : [...SPECIMEN_ROUTES];
          routes = want.filter((r) => r === "/404" || existsSync(join(s.dist, r, "index.html")));
          // A real site has few of the specimen's routes; the page suite's picker fills the rest, one per layout.
          if (!opts.routes?.length && routes.length < SPECIMEN_ROUTES.length)
            for (const r of pickRoutes(s.dist, SPECIMEN_ROUTES.length)) if (routes.length < SPECIMEN_ROUTES.length && !routes.includes(r)) routes.push(r);
          if (!routes.length) throw new Error(`shoot: none of ${want.join(", ")} was built — pass --route for this site`);
        }
        mkdirSync(join(out, c.slug), { recursive: true });
        const jobs = routes.flatMap((route) => widths.flatMap((width) => schemes.map((scheme) => ({ route, width, scheme }))));
        await pool(browser, jobs, opts.concurrency ?? 6, async (page, j) => {
          const shot = await photograph(page, `${s.url}${j.route}`, j.width, j.scheme);
          const file = join(c.slug, `${routeSlug(j.route)}-${j.width}-${j.scheme}.png`);
          writeFileSync(join(out, file), shot.png);
          shots.push({ candidate: c.slug, route: j.route, width: j.width, scheme: j.scheme, file, height: shot.height, truncated: shot.truncated, cls: shot.cls, status: shot.status });
        });
      } finally {
        s.stop();
        rmSync(s.dist, { recursive: true, force: true });
      }
    }
    const order = (a: ShootShot, b: ShootShot) => a.candidate.localeCompare(b.candidate) || routes.indexOf(a.route) - routes.indexOf(b.route) || a.width - b.width || a.scheme.localeCompare(b.scheme);
    shots.sort(order);

    // The sheets: one page per route and scheme, then the camera photographs each at 1440.
    const sheets: string[] = [];
    const sheetJobs = routes.flatMap((route) => schemes.map((scheme) => ({ route, scheme })));
    for (const j of sheetJobs) writeFileSync(join(out, `contact-${routeSlug(j.route)}-${j.scheme}.html`), sheetHtml(cands, shots, j.route, j.scheme, widths));
    await pool(browser, sheetJobs, opts.concurrency ?? 6, async (page, j) => {
      const base = join(out, `contact-${routeSlug(j.route)}-${j.scheme}`);
      const shot = await photograph(page, pathToFileURL(`${base}.html`).href, 1440, "light");
      writeFileSync(`${base}.png`, shot.png);
      sheets.push(`${base}.png`);
    });
    sheets.sort();
    writeFileSync(join(out, "contact.html"), contactHtml(cands, shots, routes, schemes, widths));
    const result: ShootResult = { out, candidates: cands, shots, contact: "contact.html", sheets, ms: Math.round(performance.now() - t0) };
    writeFileSync(join(out, "shoot.json"), JSON.stringify({ ...result, root: relative(process.cwd(), root) || ".", browser: browser.version, sheets: sheets.map((p) => relative(out, p)) }, null, 2));
    return result;
  } finally { browser.close(); }
}

const SHEET_CSS = `
:root { color-scheme: light; --ink: #16181d; --muted: #5b6068; --rule: #dfe2e7; --paper: #f4f5f7; }
* { box-sizing: border-box; }
body { margin: 0; padding: 24px; font: 14px/1.4 ui-sans-serif, system-ui, sans-serif; color: var(--ink); background: var(--paper); }
h1 { font-size: 18px; margin: 0 0 4px; } h2 { font-size: 16px; margin: 32px 0 8px; }
p.meta { color: var(--muted); margin: 0 0 16px; }
.cols { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 16px; align-items: start; }
.col header { margin-bottom: 8px; } .col header b { font-size: 15px; } .col header p { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
.pair { display: grid; grid-template-columns: 1fr 3fr; gap: 8px; align-items: start; }
figure { margin: 0; } figcaption { font-size: 11px; color: var(--muted); margin-top: 2px; }
img { display: block; width: 100%; height: auto; border: 1px solid var(--rule); background: #fff; }
/* The sheet shows the top of each page: full width always, cut below 1800 page-pixels. */
.crop figure { container-type: inline-size; } .crop figure a { display: block; overflow: hidden; max-height: calc(100cqw * var(--k)); }
details { margin-top: 8px; } summary { cursor: pointer; color: var(--muted); font-size: 12px; }
table { border-collapse: collapse; width: 100%; } td, th { vertical-align: top; padding: 8px; border-top: 1px solid var(--rule); text-align: left; }
th[scope=row] { width: 10rem; font-weight: 600; } a { color: inherit; }
`;

const pick = (shots: ShootShot[], c: string, route: string, scheme: Scheme, width: number) =>
  shots.find((s) => s.candidate === c && s.route === route && s.scheme === scheme && s.width === width);
const fig = (s: ShootShot | undefined, label: string) =>
  s ? `<figure><a href="${esc(s.file)}"><img src="${esc(s.file)}" alt="${esc(`${s.candidate} ${s.route} at ${s.width} px, ${s.scheme}`)}" loading="lazy"></a><figcaption>${label}${s.truncated ? " · truncated" : ""}${s.cls > 0.05 ? ` · CLS ${s.cls}` : ""}${s.status >= 400 && s.route !== "/404" ? ` · HTTP ${s.status}` : ""}</figcaption></figure>` : "";
const [NARROW, WIDE] = [390, 1280];

/** One route, one scheme, every candidate: the page the camera photographs for an agent to read. */
export function sheetHtml(cands: Candidate[], shots: ShootShot[], route: string, scheme: Scheme, widths: number[]): string {
  const narrow = widths.includes(NARROW) ? NARROW : Math.min(...widths), wide = widths.includes(WIDE) ? WIDE : Math.max(...widths);
  const cols = cands.map((c) => `<section class="col"><header><b>${esc(c.slug)}</b><p>${esc(c.line)}</p></header>
<div class="pair crop"><div style="--k: ${(1800 / narrow).toFixed(3)}">${fig(pick(shots, c.slug, route, scheme, narrow), `${narrow}`)}</div><div style="--k: ${(1800 / wide).toFixed(3)}">${fig(pick(shots, c.slug, route, scheme, wide), `${wide}`)}</div></div></section>`).join("\n");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${esc(route)} · ${scheme}</title><style>${SHEET_CSS}</style>
<body><h1>${esc(route)} · ${scheme}</h1><p class="meta">${cands.length} candidate${cands.length === 1 ? "" : "s"}, top of the page at ${narrow} and ${wide} px</p>
<div class="cols" style="--n: ${cands.length}">${cols}</div></body></html>\n`;
}

/** Every route, both schemes, every candidate: the page a person opens. 390 and 1280 shown; the rest behind `<details>`. */
export function contactHtml(cands: Candidate[], shots: ShootShot[], routes: string[], schemes: Scheme[], widths: number[]): string {
  const shown = widths.filter((w) => w === NARROW || w === WIDE), hidden = widths.filter((w) => !shown.includes(w));
  const head = `<tr><th></th>${cands.map((c) => `<th><b>${esc(c.slug)}</b><br><small>${esc(c.line)}</small></th>`).join("")}</tr>`;
  const sections = schemes.map((scheme) => `<h2>${scheme}</h2><table>${head}${routes.map((route) => `<tr><th scope="row">${esc(route)}<br><small><a href="contact-${routeSlug(route)}-${scheme}.png">sheet</a></small></th>${cands.map((c) => `<td><div class="pair">${shown.map((w) => fig(pick(shots, c.slug, route, scheme, w), `${w}`)).join("")}</div>${hidden.length ? `<details><summary>${hidden.join(" · ")}</summary><div class="pair">${hidden.map((w) => fig(pick(shots, c.slug, route, scheme, w), `${w}`)).join("")}</div></details>` : ""}</td>`).join("")}</tr>`).join("\n")}</table>`).join("\n");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Contact sheet</title><style>${SHEET_CSS}</style>
<body><h1>Contact sheet</h1><p class="meta">${cands.map((c) => c.slug).join(", ")} · ${routes.length} routes × ${widths.join("/")} px × ${schemes.join(" and ")} · ${shots.length} shots</p>
${sections}</body></html>\n`;
}

/** The CLI's summary: the sheets an agent should open, and anything that needs a look. */
export function formatShoot(r: ShootResult): string {
  if (r.skipped) return r.skipped;
  const flagged = r.shots.filter((s) => s.truncated || s.cls > 0.05 || (s.status >= 400 && s.route !== "/404"));
  return [
    `${r.shots.length} shots of ${r.candidates.map((c) => c.slug).join(", ")} in ${(r.ms / 1000).toFixed(1)} s → ${relative(process.cwd(), r.out) || "."}/`,
    `contact sheet: ${relative(process.cwd(), join(r.out, r.contact))}`,
    `sheets to read (${r.sheets.length}):`,
    ...r.sheets.map((s) => `  ${relative(process.cwd(), s)}`),
    ...(flagged.length ? [`to look at (${flagged.length}):`, ...flagged.map((s) => `  ${s.file}${s.truncated ? " truncated" : ""}${s.cls > 0.05 ? ` CLS ${s.cls}` : ""}${s.status >= 400 && s.route !== "/404" ? ` HTTP ${s.status}` : ""}`)] : []),
  ].join("\n");
}
