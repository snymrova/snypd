/**
 * The tour (W5, docs/37 §6 step 4): a whole theme seen at once, on this site's content.
 *
 * `look` is one crop and `look { board }` is one slot. A tour is the theme a visitor would meet: the three
 * kinds of route a site has, each at a laptop's width and a phone's, as one picture. The three routes are
 * **the front page**, **a list** (the archive of the type with the most entries, or a term page on a site
 * whose front page is the archive), and **a feature page** (the entry with the most to draw: its type's
 * fields an entry plus its own length, so the facts strip, the cover and the prose all have work). Each
 * crop is the first screen, the screen a visitor judges. The facts come first, as text, and they are about each
 * whole page, below the fold included: the gates (`check theme`), the pairs the theme has not looked at, and
 * each page's detectors and taste rules.
 *
 * The theme is always built out of band (`buildAndServe`, the switch `look { name }` makes), the live
 * one included: the routes are picked from the build, and a tour of the live theme is a tour of exactly
 * the theme a `look { name }` of it would show.
 */
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { listContent, loadConfig, readFrontmatter, termRoutes, themeVariations, typeArchives, type LoadedConfig } from "@snypd/core";
import { buildAndServe } from "./gallery";
import { eyesPage, look, MAX_EDGE, type LookFact, type LookScheme } from "./look";
import { photograph } from "./board";

// ── the three routes ────────────────────────────────────────────────────────────────────────────────

export type StopKind = "front" | "list" | "feature";
export interface TourRoute { kind: StopKind; route: string; why: string }

const ENTRY = /class="[^"]*\bsnypd-(?:entries|home-entries|entry)\b/g;
const built = (dist: string, route: string) => join(dist, route.replace(/^\/+/, ""), "index.html");
const has = (dist: string, route: string) => existsSync(built(dist, route));
const entriesOn = (dist: string, route: string) => (readFileSync(built(dist, route), "utf8").match(ENTRY) ?? []).length;
const slash = (r: string) => (r === "/" ? "/" : `${r.replace(/\/+$/, "")}/`);
const filled = (v: unknown) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length);

/**
 * Which route of a built site stands for each kind. Pure over the content and the build, so it is tested
 * without a browser. A kind the site does not have is left out, and the tour says so.
 */
export function tourRoutes(root: string, cfg: LoadedConfig, dist: string): { routes: TourRoute[]; missing: string[] } {
  const content = listContent(root, cfg);
  const routes: TourRoute[] = [{ kind: "front", route: "/", why: content.some((c) => c.route === "/") ? "the front page, a page" : "the front page" }];
  const missing: string[] = [];
  const counts = new Map<string, number>();
  for (const c of content) counts.set(c.type, (counts.get(c.type) ?? 0) + 1);

  // A list: the archive of the type with the most entries. A blog's archive *is* `/`, and then the list
  // is the term page with the most entries on it.
  const archives = typeArchives(cfg.config, content.some((c) => c.route === "/")).map((a) => ({ ...a, route: slash(a.route) })).filter((a) => has(dist, a.route));
  const archive = archives.sort((a, b) => (counts.get(b.type) ?? 0) - (counts.get(a.type) ?? 0))[0];
  if (archive) routes.push({ kind: "list", route: archive.route, why: `${archive.type}'s archive, ${counts.get(archive.type) ?? 0} entries` });
  else {
    const fm = content.map((c) => ({ type: c.type, frontmatter: readFrontmatter(readFileSync(c.file, "utf8")) }));
    const terms = termRoutes(cfg, fm).map(slash).filter((r) => has(dist, r)).map((route) => ({ route, n: entriesOn(dist, route) })).sort((a, b) => b.n - a.n || a.route.localeCompare(b.route));
    if (terms[0]) routes.push({ kind: "list", route: terms[0].route, why: `a term page, ${terms[0].n} entries — the front page is the archive` });
    else missing.push("list — no archive and no term page");
  }

  // A feature page: every entry with a page of its own, with the fields it sets and its length.
  const byType = new Map<string, { file: string; route: string; fields: number; bytes: number }[]>();
  for (const c of content) {
    if (c.route === "/" || !cfg.config.types[c.type]?.layout || !has(dist, slash(c.route))) continue;
    const src = readFileSync(c.file, "utf8");
    const fields = Object.entries(readFrontmatter(src)).filter(([k, v]) => k !== "title" && k !== "status" && filled(v)).length;
    byType.set(c.type, [...(byType.get(c.type) ?? []), { file: c.file, route: slash(c.route), fields, bytes: statSync(c.file).size }]);
  }
  // The page with the most to draw: its type's fields set an entry, plus its own kilobytes. Fields alone
  // pick a changelog (five fields, a paragraph each) over the specimen's long posts; length alone picks an
  // about page over Ferrule's case studies. The sum picks the longest post and the longest case study.
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const best = [...byType.entries()].flatMap(([type, items]) => {
    const fields = mean(items.map((i) => i.fields));
    return items.map((i) => ({ ...i, type, typeFields: fields, score: fields + i.bytes / 1024 }));
  }).sort((a, b) => b.score - a.score || a.route.localeCompare(b.route))[0];
  if (best) {
    routes.push({ kind: "feature", route: best.route, why: `a ${best.type}, ${(best.bytes / 1024).toFixed(1)} kB; ${best.type} sets ${best.typeFields.toFixed(1)} fields an entry — the most to draw` });
  } else missing.push("feature — no entry has a page of its own");
  return { routes, missing };
}

// ── the tour ────────────────────────────────────────────────────────────────────────────────────────

export const TOUR_WIDTHS = [1280, 390] as const;
/** The first screen at each width — `look`'s viewport heights. */
const SCREEN: Record<number, number> = { 1280: 900, 390: 844 };

export interface TourStop extends TourRoute {
  width: number;
  /** Everything the page's detectors and taste rules found, below the fold included. */
  problems: LookFact[];
  notes: string[];
  image?: { data: string; width: number; height: number };
  /** The crop as a file, `cacheDir/<id>/crop.webp`. */
  file?: string;
  error?: string;
}
export interface TourResult {
  theme: string;
  variation?: string;
  scheme: LookScheme;
  routes: TourRoute[];
  missing: string[];
  stops: TourStop[];
  /** `check theme`: the gates. */
  gates: { ok: boolean; pass: number; rules: { rule: string; status: string; detail: string; where?: string }[] };
  /** The load's warnings on `theme.pieces` — the pairs the theme has not looked at. */
  pairs: string[];
  image: { data: string; width: number; height: number; mimeType: "image/webp" };
  file: string;
  ms: number;
}
export interface TourOptions {
  root: string;
  /** The theme to tour; the live one by default. */
  theme?: string;
  variation?: string;
  scheme?: LookScheme;
  /** `.snypd/look` under the site. */
  cacheDir: string;
  onStop?: (label: string, i: number, n: number) => void;
}

export async function tour(opts: TourOptions): Promise<TourResult> {
  const t0 = performance.now();
  const cfg = loadConfig(opts.root, { theme: opts.theme, variation: opts.variation });
  if (!cfg.ok) throw Object.assign(new Error(`theme "${opts.theme ?? "(live)"}" does not load`), { hint: cfg.diagnostics.filter((d) => d.level === "error").map((d) => d.message).join("; ") });
  // `theme.use` stays the site's under a `theme` override: the theme toured is the one named.
  const theme = opts.theme ?? cfg.config.theme.use, variation = opts.variation ?? (opts.theme ? undefined : cfg.config.theme.variation);
  if (variation && !themeVariations(cfg).some((v) => v.name === variation)) throw Object.assign(new Error(`theme "${theme}" ships no variation "${variation}"`), { hint: "snypd://theme/variations lists what it ships" });
  const scheme = opts.scheme ?? "light";
  const pairs = cfg.diagnostics.filter((d) => d.level === "warning" && d.path.startsWith("theme.pieces")).map((d) => d.message);
  const label = `${theme}${variation ? ` › ${variation}` : ""}`;

  // The gates are static and need no build: asked while the theme builds.
  const gatesP = import("@snypd/render/check").then(({ checkTheme }) => checkTheme(opts.root, theme));
  const s = await buildAndServe(opts.root, { theme, variation, slug: `${theme}${variation ? `-${variation}` : ""}` }, "tour", { drafts: true });
  const stops: TourStop[] = [];
  let picked: ReturnType<typeof tourRoutes>;
  try {
    picked = tourRoutes(opts.root, cfg, s.dist);
    let i = 0;
    const n = picked.routes.length * TOUR_WIDTHS.length;
    for (const r of picked.routes) for (const width of TOUR_WIDTHS) {
      opts.onStop?.(`${r.kind} ${r.route} at ${width}`, ++i, n);
      const stop: TourStop = { ...r, width, problems: [], notes: [] };
      try {
        const l = await look({ url: s.url, cacheDir: opts.cacheDir, route: r.route, width, scheme, since: "none", bare: true, theme: label });
        Object.assign(stop, { problems: l.problems, notes: l.notes, image: l.image && { data: l.image.data, width: l.image.width, height: l.image.height }, file: l.files.crop });
      } catch (e) { stop.error = (e as Error).message.split("\n")[0]; }
      stops.push(stop);
    }
  } finally { s.stop(); }
  const g = await gatesP;
  const gates = { ok: g.ok, pass: g.rules.filter((x) => x.status === "pass").length, rules: g.rules.filter((x) => x.status === "fail" || x.status === "warn") };

  const title = `tour · ${label} · ${picked.routes.map((r) => r.route).join("  ")} · ${TOUR_WIDTHS.join(" + ")} · ${scheme}`;
  const image = await composeTour(picked.routes, stops, title);
  const file = join(opts.cacheDir, `tour-${randomBytes(4).toString("hex")}.webp`);
  writeFileSync(file, Buffer.from(image.data, "base64"));
  pruneTours(opts.cacheDir);
  return { theme, variation, scheme, routes: picked.routes, missing: picked.missing, stops, gates, pairs, image: { ...image, mimeType: "image/webp" }, file, ms: Math.round(performance.now() - t0) };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const verdict = (s: TourStop) => s.error ? "✗ did not load" : s.problems.length ? `✗ ${s.problems.length}: ${[...new Set(s.problems.map((p) => p.rule))].join(", ")}` : "✓ no findings";

/**
 * A row per route, the laptop's first screen beside the phone's, both drawn to one height so the two
 * read as one page at two widths — at the largest height the rows fit in `MAX_EDGE`, and never larger
 * than the screens themselves.
 */
async function composeTour(routes: TourRoute[], stops: TourStop[], title: string): Promise<{ data: string; width: number; height: number }> {
  const gap = 10, pad = 12, cap = 20, titleH = 26;
  const ratio = (w: number) => w / SCREEN[w]!;
  const rowW = TOUR_WIDTHS.reduce((s, w) => s + ratio(w), 0);
  const H = Math.floor(Math.min(
    Math.min(...TOUR_WIDTHS.map((w) => SCREEN[w]!)),
    (MAX_EDGE - pad * 2 - titleH - routes.length * (cap + gap)) / routes.length,
    (MAX_EDGE - pad * 2 - gap * (TOUR_WIDTHS.length - 1)) / rowW,
  ));
  const cell = (s: TourStop | undefined, w: number) => {
    const scale = H / SCREEN[w]!, cw = Math.round(w * scale);
    const inner = s?.image ? `<img style="width:${Math.round(s.image.width * scale)}px;display:block" src="data:image/webp;base64,${s.image.data}">`
      : `<p style="margin:auto;padding:12px;color:#a00">${esc(s?.error ?? "no picture")}</p>`;
    return `<figure style="margin:0;width:${cw}px"><div style="height:${H}px;overflow:hidden;background:#d4d4da;outline:1px solid #0002;display:flex;align-items:flex-start">${inner}</div>
      <figcaption style="padding-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${w} · ${esc(s ? verdict(s) : "")}</figcaption></figure>`;
  };
  const rows = routes.map((r) => `<div style="font-weight:600;padding-top:${gap}px">${esc(r.kind)} · ${esc(r.route)}</div>
    <div style="display:flex;gap:${gap}px">${TOUR_WIDTHS.map((w) => cell(stops.find((s) => s.route === r.route && s.width === w), w)).join("")}</div>`).join("");
  const width = pad * 2 + Math.ceil(TOUR_WIDTHS.reduce((s, w) => s + Math.round(w * H / SCREEN[w]!), 0) + gap * (TOUR_WIDTHS.length - 1));
  const html = `<!doctype html><meta charset=utf-8><body style="margin:0;background:#e8e8ec;color:#1b1b1f;font:12px/1.35 system-ui,sans-serif">
    <div style="display:inline-block;padding:${pad}px"><div style="font-size:13px">${esc(title)}</div>${rows}</div></body>`;
  return eyesPage((page) => photograph(page, html, width));
}

/** Keep the newest four tour sheets. */
function pruneTours(dir: string): void {
  const all = readdirSync(dir).filter((f) => /^tour-.*\.webp$/.test(f)).map((f) => ({ f: join(dir, f), t: statSync(join(dir, f)).mtimeMs }));
  for (const { f } of all.sort((a, b) => b.t - a.t).slice(4)) rmSync(f, { force: true });
}

/** The facts as the agent reads them, before the sheet: the gates, the pairs, then each stop that has something to say. */
export function formatTour(r: TourResult, uri?: (f: string) => string): string {
  const lines = [`tour · ${r.theme}${r.variation ? ` › ${r.variation}` : ""} · ${r.routes.length} routes × ${TOUR_WIDTHS.join(" + ")} · ${r.scheme} · ${(r.ms / 1000).toFixed(1)} s`];
  for (const x of r.routes) lines.push(`${x.kind.padEnd(7)} ${x.route}  — ${x.why}`);
  for (const m of r.missing) lines.push(`ℹ no ${m}`);
  lines.push(r.gates.rules.length
    ? `${r.gates.ok ? "⚠" : "✗"} gates: check theme ${r.theme} — ${r.gates.pass} pass · ${r.gates.rules.slice(0, 4).map((x) => `${x.status === "fail" ? "✗" : "⚠"} ${x.rule} ${x.detail}`).join(" · ")}${r.gates.rules.length > 4 ? ` · … ${r.gates.rules.length - 4} more` : ""}`
    : `✓ gates: check theme ${r.theme} — ${r.gates.pass} pass`);
  lines.push(r.pairs.length ? `⚠ pairs: ${r.pairs.join(" · ")}` : "✓ pairs: none the theme has not looked at");
  for (const s of r.stops) {
    const who = `${s.kind} ${s.width}`;
    if (s.error) { lines.push(`✗ ${who}: ${s.error}`); continue; }
    if (s.problems.length) lines.push(`✗ ${who}: ${s.problems.slice(0, 4).map((p) => `${p.rule} ${p.where} ${p.detail}`).join(" · ")}${s.problems.length > 4 ? ` · … ${s.problems.length - 4} more` : ""}`);
    for (const nte of s.notes) lines.push(`ℹ ${who}: ${nte}`);
  }
  const clean = r.stops.filter((s) => !s.error && !s.problems.length).length;
  lines.push(`✓ ${clean} of ${r.stops.length} pages with no findings — each page whole, below the fold too; the picture is each first screen`);
  lines.push(`one page whole: \`theme\` › look { name: "${r.theme}", route, width } — a slot to change: look { board: "<slot>" }`);
  if (uri) lines.push(`sheet: ${uri(r.file)}`);
  return lines.join("\n");
}
