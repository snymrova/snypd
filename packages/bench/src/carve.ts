/**
 * The carve's proof (docs/36 §6, P3): a theme rewritten as pieces must render the page it rendered before.
 *
 * Not by pixels. P3's first proof was `shoot --diff`, and two shoots of an *unchanged* theme differed on up
 * to 83 of 216 shots: `captureBeyondViewport` resizes the page to shoot it, and under any concurrency — or
 * load — the resized page laid out against another page's width (a contents list in one column at 768,
 * `vw` type at the phone's size), and a scroll-driven progress bar drew wherever the resize left it. One
 * page at a time, hidden scrollbars and a second shot brought that down and never to zero.
 *
 * So the claim is checked where it is made. A carve moves rules between cascade layers and changes no
 * markup, so it holds exactly when, on every route × width × scheme, **the HTML is the same and every
 * element computes the same style and sits in the same box**. That is read with `getComputedStyle` and
 * `getBoundingClientRect` in a page that is never resized — deterministic, and a fraction of a shoot's
 * time. What it cannot see is named, not hidden: a `:hover` or `:focus` state, a popover open, a view
 * transition and a keyframe (§6(e)) — those are read in the expanded CSS, or with `theme › look`.
 *
 * Custom properties are left out: a carve adds tokens (`--measure-breakout`, a piece's `needs:`), and what
 * they do shows up in the real properties that read them.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { launch, findChrome, type Page } from "./cdp";
import { buildAndServe } from "./gallery";
import { SPECIMEN_ROUTES, SHOOT_WIDTHS, type Scheme } from "./shoot";

export interface CarveOptions {
  root?: string;
  /** `theme` or `theme/variation`; one or more. */
  themes: string[];
  routes?: string[];
  widths?: number[];
  scheme?: Scheme | "both";
  /** Where `carve.json` is written. */
  out: string;
  /** An earlier `carve.json` (or its directory) to compare with. */
  diff?: string;
  concurrency?: number;
  onTheme?: (theme: string, i: number, n: number) => void;
}

/** One page, read: every element's style and box by path, the style strings deduplicated file-wide. */
interface Print { html: string; height: number; els: [path: string, style: string, box: string][] }

export interface CarveFile {
  version: 1;
  root: string;
  themes: string[];
  /** `<theme>|<route>|<width>|<scheme>` → the page. */
  pages: Record<string, Print>;
  /** Style hash → `prop:value;` string. */
  styles: Record<string, string>;
}

export interface CarveChange {
  key: string;
  what: "html" | "height" | "style" | "box" | "missing" | "elements";
  where?: string;
  detail: string;
}

export interface CarveResult {
  out: string;
  pages: number;
  elements: number;
  ms: number;
  skipped?: string;
  diff?: { against: string; changed: CarveChange[]; pagesChanged: number };
}

/** The page's reading, in the page: paths, computed styles (no custom properties), boxes to 1/100 px. */
const READ = `(() => {
  const esc = (s) => s.replace(/[^\\w-]/g, "");
  const path = (el) => { const p = []; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const i = e.parentElement ? [...e.parentElement.children].indexOf(e) + 1 : 1; p.unshift(e.tagName.toLowerCase() + (e.id ? "#" + esc(e.id) : "") + ":" + i); } return p.join(">"); };
  const style = (cs) => { let s = ""; for (let i = 0; i < cs.length; i++) { const n = cs[i]; if (!n.startsWith("--")) s += n + ":" + cs.getPropertyValue(n) + ";"; } return s; };
  const r2 = (n) => Math.round(n * 100) / 100;
  const out = [];
  for (const el of [document.documentElement, ...document.documentElement.querySelectorAll("*")]) {
    if (el.closest("script, style, template, head")) continue;
    const b = el.getBoundingClientRect();
    const p = path(el);
    out.push([p, style(getComputedStyle(el)), [r2(b.x), r2(b.y + scrollY), r2(b.width), r2(b.height)].join(",")]);
    for (const pseudo of ["::before", "::after", "::marker"]) {
      const cs = getComputedStyle(el, pseudo);
      const c = cs.getPropertyValue("content");
      if (pseudo === "::marker" ? cs.getPropertyValue("display") === "none" || !getComputedStyle(el).display.includes("list-item") : c === "none" || c === "normal") continue;
      out.push([p + pseudo, style(cs), ""]);
    }
  }
  return { height: Math.ceil(document.documentElement.scrollHeight), els: out };
})()`;

const SETTLE = `(async () => {
  await Promise.all([...document.querySelectorAll('link[rel="stylesheet"]')].map(l => l.sheet ? 0 : new Promise(r => { l.onload = l.onerror = r; })));
  for (const i of document.images) i.loading = "eager";
  await document.fonts.ready; await Promise.all([...document.fonts].map(f => f.load().catch(() => {}))); await document.fonts.ready;
  await Promise.all([...document.images].map(i => Promise.race([i.decode().catch(() => {}), new Promise(r => setTimeout(r, 8000))])));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  // A beat more, then two frames: studio's masthead is a scroll-state container, and a read two frames
  // after load once caught its links in the colour they have before \`stuck\` is first evaluated.
  await new Promise(r => setTimeout(r, 150));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
})()`;

/** The built page's HTML with the asset stamps taken out: `?v=<hash>` changes with any byte of the sheet. */
export const normalHtml = (html: string) => html.replace(/\?v=[0-9a-f]+/g, "?v=");

const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);

async function read(page: Page, url: string, width: number, scheme: Scheme): Promise<{ height: number; els: [string, string, string][] }> {
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: width < 600 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 600 });
  await page.send("Emulation.setScrollbarsHidden", { hidden: true });
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }, { name: "prefers-reduced-motion", value: "reduce" }] });
  await page.send("Page.enable");
  const loaded = page.once("Page.loadEventFired", 20_000);
  await page.send("Page.navigate", { url });
  await loaded;
  await page.send("Runtime.evaluate", { expression: SETTLE, awaitPromise: true });
  const r = await page.send<{ result: { value?: { height: number; els: [string, string, string][] } }; exceptionDetails?: { text?: string } }>("Runtime.evaluate", { expression: READ, returnByValue: true });
  if (!r.result.value) throw new Error(`carve: could not read ${url}: ${r.exceptionDetails?.text ?? "no result"}`);
  return r.result.value;
}

export async function carve(opts: CarveOptions): Promise<CarveResult> {
  const t0 = performance.now();
  const root = resolve(opts.root ?? "corpora/specimen");
  const out = resolve(opts.out);
  if (!findChrome()) return { out, pages: 0, elements: 0, ms: 0, skipped: "no Chrome on this machine — `snypd bench carve` reads the pages in a real browser" };
  const against = opts.diff ? resolve(opts.diff.endsWith(".json") ? opts.diff : join(opts.diff, "carve.json")) : undefined;
  if (against && !existsSync(against)) throw Object.assign(new Error(`carve: no ${relative(process.cwd(), against)}`), { hint: "read the baseline first: snypd bench carve --theme=<t> --out=<dir>" });
  const schemes: Scheme[] = (opts.scheme ?? "both") === "both" ? ["light", "dark"] : [opts.scheme as Scheme];
  const widths = opts.widths?.length ? opts.widths : [...SHOOT_WIDTHS];
  const file: CarveFile = { version: 1, root: relative(process.cwd(), root) || ".", themes: opts.themes, pages: {}, styles: {} };
  const browser = await launch();
  let elements = 0;
  try {
    let i = 0;
    for (const t of opts.themes) {
      opts.onTheme?.(t, ++i, opts.themes.length);
      const [theme, variation] = t.split("/") as [string, string | undefined];
      const s = await buildAndServe(root, { theme, variation, slug: t.replace("/", "-") }, "carve");
      try {
        const routes = (opts.routes?.length ? opts.routes : [...SPECIMEN_ROUTES]).filter((r) => r === "/404" || existsSync(join(s.dist, r, "index.html")));
        const jobs = routes.flatMap((route) => widths.flatMap((width) => schemes.map((scheme) => ({ route, width, scheme }))));
        let next = 0;
        await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 4, jobs.length) }, async () => {
          while (next < jobs.length) {
            const j = jobs[next++]!;
            const page = await browser.page({ isolated: true });
            try {
              const r = await read(page, `${s.url}${j.route}`, j.width, j.scheme);
              const htmlFile = j.route === "/404" ? join(s.dist, "404.html") : join(s.dist, j.route, "index.html");
              const html = existsSync(htmlFile) ? normalHtml(readFileSync(htmlFile, "utf8")) : "";
              const els = r.els.map(([p, st, box]) => { const h = hash(st); file.styles[h] ??= st; return [p, h, box] as [string, string, string]; });
              elements += els.length;
              file.pages[`${t}|${j.route}|${j.width}|${j.scheme}`] = { html, height: r.height, els };
            } finally { await page.close(); }
          }
        }));
      } finally { s.stop(); }
    }
  } finally { browser.close(); }
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "carve.json"), JSON.stringify(file));
  const result: CarveResult = { out, pages: Object.keys(file.pages).length, elements, ms: Math.round(performance.now() - t0) };
  if (against) {
    const before = JSON.parse(readFileSync(against, "utf8")) as CarveFile;
    const changed = compareCarves(before, file);
    result.diff = { against, changed, pagesChanged: new Set(changed.map((c) => c.key)).size };
  }
  return result;
}

/** Split `a:b;c:d;` into a map; values may hold `:` (urls, times) but never a `;` outside one. */
const props = (s: string) => new Map(s.split(";").filter(Boolean).map((d) => { const i = d.indexOf(":"); return [d.slice(0, i), d.slice(i + 1)] as [string, string]; }));

/** Every page of `a` against the same key in `b`: the HTML, the height, and each element's style and box. */
export function compareCarves(a: CarveFile, b: CarveFile): CarveChange[] {
  const out: CarveChange[] = [];
  const read = new Set(b.themes);
  for (const [key, pa] of Object.entries(a.pages)) {
    // A baseline of several themes compares with a run of some of them: only the themes read twice.
    if (!read.has(key.split("|")[0]!)) continue;
    const pb = b.pages[key];
    if (!pb) { out.push({ key, what: "missing", detail: "not read in the second run" }); continue; }
    if (pa.html !== pb.html) {
      const la = pa.html.split("\n"), lb = pb.html.split("\n");
      const at = la.findIndex((l, i) => l !== lb[i]);
      out.push({ key, what: "html", detail: `first difference on line ${at + 1}: ${JSON.stringify((la[at] ?? "").slice(0, 120))} → ${JSON.stringify((lb[at] ?? "").slice(0, 120))}` });
    }
    if (pa.height !== pb.height) out.push({ key, what: "height", detail: `${pa.height} → ${pb.height} px` });
    const mb = new Map(pb.els.map((e) => [e[0], e]));
    if (pa.els.length !== pb.els.length) out.push({ key, what: "elements", detail: `${pa.els.length} → ${pb.els.length} elements and pseudo-elements` });
    for (const [path, sa, boxa] of pa.els) {
      const eb = mb.get(path);
      if (!eb) { out.push({ key, what: "elements", where: path, detail: "gone" }); continue; }
      if (sa !== eb[1]) {
        const x = props(a.styles[sa] ?? ""), y = props(b.styles[eb[1]] ?? "");
        const diffs = [...new Set([...x.keys(), ...y.keys()])].filter((k) => x.get(k) !== y.get(k));
        out.push({ key, what: "style", where: path, detail: diffs.slice(0, 6).map((k) => `${k}: ${x.get(k) ?? "∅"} → ${y.get(k) ?? "∅"}`).join("; ") + (diffs.length > 6 ? `; +${diffs.length - 6}` : "") });
      } else if (boxa !== eb[2]) out.push({ key, what: "box", where: path, detail: `${boxa} → ${eb[2]}` });
    }
  }
  return out;
}

/** The CLI's lines: the count, then the changes grouped by what moved, most common first. */
export function formatCarve(r: CarveResult, max = 40): string {
  if (r.skipped) return r.skipped;
  const lines = [`read ${r.pages} pages, ${r.elements} elements, in ${(r.ms / 1000).toFixed(1)} s → ${relative(process.cwd(), join(r.out, "carve.json"))}`];
  if (!r.diff) return lines.join("\n");
  const d = r.diff;
  if (!d.changed.length) return [...lines, `against ${relative(process.cwd(), d.against)}: every page the same — HTML, height, and every element's computed style and box`].join("\n");
  lines.push(`against ${relative(process.cwd(), d.against)}: ${d.pagesChanged} page${d.pagesChanged === 1 ? "" : "s"} differ, ${d.changed.length} change${d.changed.length === 1 ? "" : "s"}`);
  // The same element and the same properties on many pages is one finding: group by where + detail.
  const groups = new Map<string, { c: CarveChange; keys: string[] }>();
  for (const c of d.changed) { const g = `${c.what}|${c.where ?? ""}|${c.detail}`; const e = groups.get(g); if (e) e.keys.push(c.key); else groups.set(g, { c, keys: [c.key] }); }
  const sorted = [...groups.values()].sort((a, b) => b.keys.length - a.keys.length);
  for (const { c, keys } of sorted.slice(0, max)) lines.push(`  ${c.what}${c.where ? `  ${c.where.replace(/:\d+/g, "").split(">").slice(-3).join(">")}` : ""}  ${c.detail}  (${keys.length} page${keys.length === 1 ? "" : "s"}: ${keys.slice(0, 2).map((k) => k.split("|").slice(1).join(" ")).join(", ")}${keys.length > 2 ? "…" : ""})`);
  if (sorted.length > max) lines.push(`  … ${sorted.length - max} more distinct changes`);
  return lines.join("\n");
}

