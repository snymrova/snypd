/**
 * The board and the stills (W2, docs/37 §5, docs/38 §9): a piece seen before it is chosen.
 *
 * **The board** is every variant of one slot, on *this site's* content, in one picture. The agent choosing
 * a `home` looks at the front pages its own site would have, side by side (~1,500–2,500 image tokens),
 * instead of building one theme per variant. With `sets` it draws each variant on the token sets of
 * `board.yaml` too — the sheet a person passes or parks a piece on (docs/37 §3·6, decision 278).
 *
 * **The stills** are the same machinery pointed at the specimen and the shelf's host theme, once per piece,
 * written beside `piece.yaml` as `still-1280.webp` (640×400) and `still-390.webp` (195×422), so a piece has
 * a picture an agent can open for ~350 tokens before anything is built.
 *
 * Both work by writing **child themes** into a scratch directory — `extends:` the theme being looked at,
 * the one slot swapped in `pieces:`, a set's tokens, a shelf face — and building each out of band with
 * `buildAndServe`'s search path, the switch `look { name }` already makes. Nothing in the site is written
 * and no stylesheet is composed by hand: a cell is exactly the theme `pieces: { <slot>: <variant> }`
 * would be, which is what makes the board honest.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join, relative } from "node:path";
import { stringify } from "yaml";
import { loadConfig, themeVariations, type LoadedConfig } from "@snypd/core";
import { installFace, shelfFace } from "@snypd/shelf";
import { loadPieces, STILL_FILES, STILL_FRAMES, type BoardSet, type PieceEntry, type StillRecord } from "../../pieces/src/index";
import { buildAndServe } from "./gallery";
import { eyesPage, look, MAX_EDGE, type LookFact, type LookResult } from "./look";
import type { Page } from "./cdp";

// ── the child theme ─────────────────────────────────────────────────────────────────────────────────

export interface ChildTheme {
  /** The theme it extends — the site's, or the shelf's host for a still. */
  parent: string;
  /** `pieces:` entries over the parent's: `{ home: "split" }`, or `{ prose: { use: "book", "display-heads": true } }`. */
  pieces?: Record<string, string | Record<string, string | boolean>>;
  /** A variation of the parent, folded into the child's tokens (a child cannot name its parent's variation). */
  variationTokens?: Record<string, unknown>;
  set?: BoardSet;
}

/**
 * Write `<scratch>/themes/<name>/theme.yaml` for one cell. A set's face is copied in from the shelf the
 * way `seed` installs one, and takes the role the face was made for: a text face sets the body (and the
 * headings, as the prose face); a display face sets the headings and the display size, with the shelf's
 * own system pairing for the body.
 */
export function writeChildTheme(scratch: string, name: string, c: ChildTheme): void {
  const dir = join(scratch, "themes", name);
  mkdirSync(dir, { recursive: true });
  const tokens: Record<string, unknown> = { ...(c.variationTokens ?? {}), ...(c.set?.tokens ?? {}) };
  const doc: Record<string, unknown> = { theme: name, version: "0.0.0", spec: "^1", extends: c.parent };
  if (c.set?.face) {
    const f = installFace(c.set.face, dir);
    doc.font = f.font;
    if (f.face.role === "text") Object.assign(tokens, { "font.body": f.stack, "font.heading": "var(--font-body)", "font.display": "var(--font-heading)", "font.ui": f.face.category === "sans" ? "var(--font-body)" : f.face.pairsWith });
    else Object.assign(tokens, { "font.heading": f.stack, "font.display": f.stack, "font.body": f.face.pairsWith, "font.ui": f.face.pairsWith });
  }
  if (c.pieces && Object.keys(c.pieces).length) doc.pieces = c.pieces;
  if (Object.keys(tokens).length) doc.tokens = tokens;
  writeFileSync(join(dir, "theme.yaml"), `# A board cell (W2), written by @snypd/bench/board and removed with the scratch directory.\n${stringify(doc)}`);
}

// ── where a slot is best seen on this site ─────────────────────────────────────────────────────────

/** What a slot's page has more of, the more of it there is to see. `emits` classes of the variants count too. */
const MARKERS: Record<string, RegExp> = {
  entries: /class="[^"]*\bsnypd-(?:entries|home-entries|entry)\b/g,
  prose: /<p[\s>]/g,
  column: /<(?:figure|table|pre)[\s>]/g,
  motion: /<p[\s>]/g,
  code: /<(?:pre|table)[\s>]/g,
  blocks: /class="snypd-[a-z-]+/g,
  cover: /class="[^"]*\bsnypd-cover\b|<article[\s>]/g,
  "post-foot": /class="[^"]*\bsnypd-post-footer\b/g,
  notes: /class="footnotes\b/g,
  toc: /class="[^"]*\bsnypd-toc\b/g,
  wall: /class="[^"]*\bsnypd-logo-wall\b/g,
};
const FRONT = new Set(["home", "masthead", "footer", "backdrop", "house"]);

/**
 * The route of a built site that shows `slot` best: the front page for the slots that are on every page or
 * are the front page; otherwise the page with the most of what the slot styles (`blocks` counts distinct
 * block classes, so the page with every primitive wins over the page with one callout fifty times).
 */
export function routeFor(dist: string, slot: string, classes: string[] = []): string {
  if (FRONT.has(slot) && existsSync(join(dist, "index.html"))) return "/";
  const marker = MARKERS[slot];
  const extra = classes.length ? new RegExp(`class="[^"]*\\b(?:${classes.map((c) => c.replace(/[^\w-]/g, "")).join("|")})\\b`, "g") : undefined;
  let best = { route: "/", score: 0 };
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      if (files.length >= 600) return;
      if (f.isDirectory()) { if (f.name !== "assets" && f.name !== "_snypd") walk(join(d, f.name)); }
      else if (f.name === "index.html") files.push(join(d, f.name));
    }
  };
  walk(dist);
  for (const file of files.sort()) {
    const html = readFileSync(file, "utf8");
    const hits = marker ? html.match(marker) ?? [] : [];
    const score = (slot === "blocks" ? new Set(hits).size : hits.length) + (extra ? (html.match(extra)?.length ?? 0) * 3 : 0);
    const route = `/${relative(dist, file).replace(/index\.html$/, "").split(/[\\/]/).join("/")}`.replace(/\/+/g, "/");
    if (score > best.score || (score === best.score && score > 0 && route.length < best.route.length)) best = { route, score };
  }
  return best.route;
}

// ── the sheet ───────────────────────────────────────────────────────────────────────────────────────

/** One crop on a sheet; `caption` is what is said about it — the column and row names are the sheet's. */
export interface SheetCell { image?: { data: string; width: number; height: number }; caption: string; error?: string }

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function render(page: Page, html: string, width: number): Promise<{ data: string; width: number; height: number }> {
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: 600, deviceScaleFactor: 1, mobile: false });
  const { frameTree } = await page.send<{ frameTree: { frame: { id: string } } }>("Page.getFrameTree");
  await page.send("Page.setDocumentContent", { frameId: frameTree.frame.id, html });
  const r = await page.send<{ result: { value: { w: number; h: number } } }>("Runtime.evaluate", {
    awaitPromise: true, returnByValue: true,
    expression: `(async () => { await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); await document.fonts.ready;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const b = document.body.firstElementChild.getBoundingClientRect(); return { w: Math.ceil(b.width), h: Math.ceil(b.height) }; })()`,
  });
  const { w, h } = r.result.value;
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const { data } = await page.send<{ data: string }>("Page.captureScreenshot", { format: "webp", quality: 82, captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: h, scale } });
  return { data, width: Math.round(w * scale), height: Math.round(h * scale) };
}

/**
 * Lay `rows × cols` crops out as one picture, at most `MAX_EDGE` on its long side, and at the largest scale
 * the crops allow. Two layouts are weighed: the **matrix** — a column per variant, a row per token set, the
 * comparison the eye makes down a column — and a **flow**, the cells in reading order at whatever column
 * count shows them biggest, the variant and set in each caption. A front page is tall and wants the matrix;
 * a masthead is 1280×90 and in a four-column matrix is unreadable, so it flows. The flow wins only when it
 * shows the crops at least 1.4× bigger. Drawn in the eyes' browser: no image library, and real text.
 */
export async function composeSheet(opts: { cols: string[]; rows: string[]; cells: SheetCell[][]; title: string; maxAspect?: number }): Promise<{ data: string; width: number; height: number }> {
  const gap = 10, pad = 12, cap = 22, titleH = 26;
  const imgs = opts.cells.flat().map((c) => c.image).filter((i): i is NonNullable<SheetCell["image"]> => !!i);
  const W0 = Math.max(320, ...imgs.map((i) => i.width));
  const H0 = Math.max(60, Math.min(Math.max(0, ...imgs.map((i) => i.height)), Math.round(W0 * (opts.maxAspect ?? 1.1))));
  const n = opts.cols.length * opts.rows.length;
  /** The scale a grid of `c × r` shows the crops at, with `label` px of row names and `head` px of column names. */
  const plan = (c: number, r: number, label: number, head: number) => {
    const colW = Math.min(800, W0, Math.floor((MAX_EDGE - pad * 2 - label - gap * c) / c));
    const fitH = Math.floor((MAX_EDGE - pad * 2 - titleH - head - r * (cap + gap)) / r);
    const scale = Math.min(colW / W0, fitH / H0);
    return { c, r, label, head, colW: Math.round(W0 * scale), cellH: Math.max(24, Math.round(H0 * scale)), scale };
  };
  const matrix = plan(opts.cols.length, opts.rows.length, opts.rows.length > 1 ? 92 : 0, 20);
  let flow = plan(1, n, 0, 0);
  for (let c = 2; c <= n; c++) { const p = plan(c, Math.ceil(n / c), 0, 0); if (p.scale > flow.scale) flow = p; }
  const useFlow = n > 1 && flow.scale > matrix.scale * 1.4;
  const L = useFlow ? flow : matrix;
  const cell = (c: SheetCell, caption: string) => `<figure style="margin:0;width:${L.colW}px">
    <div style="height:${L.cellH}px;overflow:hidden;background:#d4d4da;outline:1px solid #0002;display:flex;justify-content:center;align-items:flex-start">
      ${c.image ? `<img style="width:${Math.round(c.image.width * (L.colW / W0))}px;display:block" src="data:image/webp;base64,${c.image.data}">` : `<p style="margin:auto;padding:12px;color:#a00">${esc(c.error ?? "no picture")}</p>`}
    </div><figcaption style="padding-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(caption)}</figcaption></figure>`;
  let body: string;
  if (useFlow) {
    body = opts.rows.flatMap((r, i) => opts.cells[i]!.map((c, j) => cell(c, `${opts.cols[j]}${opts.rows.length > 1 ? ` on ${r}` : ""} · ${c.caption}`))).join("");
  } else {
    const head = `${L.label ? "<div></div>" : ""}${opts.cols.map((c) => `<div style="font-weight:600">${esc(c)}</div>`).join("")}`;
    body = head + opts.rows.map((r, i) => `${L.label ? `<div style="font-weight:600;padding-top:4px">${esc(r)}</div>` : ""}${opts.cells[i]!.map((c) => cell(c, c.caption)).join("")}`).join("");
  }
  const width = pad * 2 + L.label + (L.colW + gap) * L.c;
  const html = `<!doctype html><meta charset=utf-8><body style="margin:0;background:#e8e8ec;color:#1b1b1f;font:12px/1.35 system-ui,sans-serif">
    <div style="display:inline-grid;grid-template-columns:${L.label ? `${L.label}px ` : ""}repeat(${L.c},${L.colW}px);gap:${gap}px;padding:${pad}px">
    <div style="grid-column:1/-1;font-size:13px">${esc(opts.title)}</div>${body}</div></body>`;
  return eyesPage((page) => render(page, html, width));
}

/**
 * One still: the crop from its top, scaled into the frame, centred when it is narrower. The frame is the
 * most a still may be (640×400, 195×422): a slot shorter than that — a masthead — gets a still its own
 * height, so its picture costs ~100 tokens and not 345 of mostly paper.
 */
async function frameStill(image: { data: string; width: number; height: number }, frame: [number, number], scale: number): Promise<{ data: string; size: [number, number] }> {
  const fw = frame[0], fh = Math.min(frame[1], Math.max(24, Math.ceil(image.height * scale)));
  const html = `<!doctype html><body style="margin:0"><div style="width:${fw}px;height:${fh}px;overflow:hidden;background:#fff;display:flex;justify-content:center;align-items:flex-start">
    <img style="width:${Math.round(image.width * scale)}px;display:block" src="data:image/webp;base64,${image.data}"></div></body>`;
  const r = await eyesPage((page) => render(page, html, fw));
  return { data: r.data, size: [r.width, r.height] };
}

// ── the board ───────────────────────────────────────────────────────────────────────────────────────

export interface BoardCell {
  variant: string;
  set?: string;
  current: boolean;
  route: string;
  /** What the crop resolved to — `main.snypd-home`, `.snypd-ledger`; absent when the slot was not on the route. */
  selector?: string;
  problems: LookFact[];
  /** The load's own warnings for this cell — a `pairs:` the variant wants and the theme does not give. */
  warnings: string[];
  error?: string;
  ms: number;
}
export interface BoardResult {
  slot: string;
  theme: string;
  route: string;
  width: number;
  variants: string[];
  sets: string[];
  cells: BoardCell[];
  image: { data: string; width: number; height: number; mimeType: "image/webp" };
  file: string;
  ms: number;
}
export interface BoardOptions {
  /** The site. */
  root: string;
  slot: string;
  /** 1 (default): the variants on the theme's own tokens. 3 or 5: on that many of `board.yaml`'s sets. */
  sets?: number;
  /** The theme to swap pieces in; the live one by default. */
  theme?: string;
  variation?: string;
  /**
   * Only these columns; every variant on the shelf by default, and beside each one its draft switches turned
   * on (decision 278: a drawn switch is seen on the board like a drawn piece). A column is a variant's name,
   * or `name+switch` / `name+switch=value` for that variant with one switch set.
   */
  variants?: string[];
  width?: number;
  /** Where the slot is photographed; the page of this site that shows it best by default (`routeFor`). */
  route?: string;
  /** Where the sheet and the scratch builds go: `.snypd/look`. */
  cacheDir: string;
  onCell?: (label: string, i: number, n: number) => void;
}

const warningsOf = (c: LoadedConfig) => c.diagnostics.filter((d) => d.level === "warning" && d.path.startsWith("theme.pieces")).map((d) => d.message);

/** One column of a board: a variant, or a variant with one switch set (`book+display-heads`). */
interface Column { entry: PieceEntry; label: string; switches?: Record<string, string | boolean> }
const column = (p: PieceEntry, sw: string, value: string | boolean): Column =>
  ({ entry: p, label: `${p.name}+${sw}${typeof value === "string" ? `=${value}` : value ? "" : "=false"}`, switches: { [sw]: value } });

export async function board(opts: BoardOptions): Promise<BoardResult> {
  const t0 = performance.now();
  const m = loadPieces();
  const slot = opts.slot;
  if (!m.slots.some((s) => s.slot === slot)) throw Object.assign(new Error(`no slot "${slot}"`), { hint: `slots: ${m.slots.map((s) => s.slot).join(", ")}` });
  const live = loadConfig(opts.root, { theme: opts.theme, variation: opts.variation });
  if (!live.ok) throw Object.assign(new Error(`theme "${opts.theme ?? "(live)"}" does not load`), { hint: live.diagnostics.filter((d) => d.level === "error").map((d) => d.message).join("; ") });
  const parent = live.config.theme.use;
  const current = live.pieces.find((p) => p.slot === slot)?.name;
  const shelf: PieceEntry[] = Object.values(m.pieces).filter((p) => p.slot === slot);
  let variants: Column[] = shelf.flatMap((p) => [{ entry: p, label: p.name },
    ...Object.entries(p.switches).filter(([, d]) => d.draft).flatMap(([sw, d]) => d.of ? d.of.filter((o) => o !== d.default).map((o) => column(p, sw, o)) : [column(p, sw, !d.default)])]);
  if (opts.variants?.length) {
    const unknown: string[] = [];
    variants = opts.variants.flatMap((label) => {
      const [name, sw] = label.split("+") as [string, string | undefined];
      const p = shelf.find((x) => x.name === name);
      if (!p) { unknown.push(label); return []; }
      if (!sw) return [{ entry: p, label: p.name }];
      const [k, val] = sw.split("=") as [string, string | undefined];
      const d = p.switches[k];
      if (!d || (d.of ? !val || !d.of.includes(val) : val !== undefined && val !== "true" && val !== "false")) { unknown.push(label); return []; }
      return [column(p, k, d.of ? val! : val !== "false")];
    });
    if (unknown.length) throw Object.assign(new Error(`${slot} has no ${unknown.join(", ")}`), { hint: `${slot}: ${shelf.map((p) => [p.name, ...Object.entries(p.switches).map(([k, d]) => `${p.name}+${k}${d.of ? `=${d.of.join("|")}` : ""}`)].join(", ")).join(", ")}` });
  }
  if (!variants.length) throw Object.assign(new Error(`nothing on the shelf for ${slot} yet`), { hint: "snypd://theme/pieces lists what each slot has" });
  const n = Math.max(1, Math.min(opts.sets ?? 1, m.board.sets.length));
  const sets: (BoardSet | undefined)[] = n === 1 && !opts.sets ? [undefined] : m.board.sets.slice(0, n);
  const variation = live.config.theme.variation;
  const variationTokens = variation ? themeVariations(live).find((v) => v.name === variation)?.tokens : undefined;
  const width = opts.width ?? 1280;

  const scratch = join(opts.cacheDir, `board-${process.pid}-${randomBytes(3).toString("hex")}`);
  mkdirSync(scratch, { recursive: true });
  const cells: BoardCell[] = [];
  const sheet: SheetCell[][] = sets.map(() => []);
  let route = opts.route;
  try {
    let i = 0;
    for (const [r, set] of sets.entries()) for (const col of variants) {
      const v = col.entry;
      const isCurrent = v.name === current && !col.switches;
      const name = `board-${slot}-${col.label.replace(/[^a-z0-9-]+/g, "-")}${set ? `-${set.name}` : ""}`;
      opts.onCell?.(`${col.label}${set ? ` on ${set.name}` : ""}`, ++i, sets.length * variants.length);
      const c0 = performance.now();
      // The current variant keeps the theme's own switches: the child names nothing for the slot. A switch
      // column on the current variant keeps them too, and sets its one switch over them.
      const piece = !col.switches ? (isCurrent ? undefined : v.name)
        : { use: v.name, ...(v.name === current ? live.pieces.find((p) => p.slot === slot)!.switches : {}), ...col.switches };
      writeChildTheme(scratch, name, { parent, pieces: piece === undefined ? undefined : { [slot]: piece }, variationTokens, set });
      const cfg = loadConfig(opts.root, { theme: name, searchPaths: [scratch] });
      const cell: BoardCell = { variant: col.label, set: set?.name, current: isCurrent, route: route ?? "/", problems: [], warnings: warningsOf(cfg), ms: 0 };
      let pic: LookResult | undefined;
      if (!cfg.ok) cell.error = cfg.diagnostics.filter((d) => d.level === "error").map((d) => d.message).join("; ");
      else {
        let s: Awaited<ReturnType<typeof buildAndServe>> | undefined;
        try {
          s = await buildAndServe(opts.root, { theme: name, slug: name }, "board", { drafts: true, searchPaths: [scratch] });
          route ??= routeFor(s.dist, slot, variants.flatMap((c) => c.entry.emits));
          cell.route = route;
          pic = await look({ url: s.url, cacheDir: opts.cacheDir, route, slot, slotClasses: v.emits, width, since: "none", bare: true, theme: name });
          cell.problems = pic.problems.filter((p) => !p.outside);
          cell.selector = pic.selector;
          if (!pic.selector) cell.problems.unshift({ rule: "board.absent", where: route, detail: `no ${slot} on ${route} — the cell is the first screen` });
        } catch (e) { cell.error = (e as Error).message.split("\n")[0]; }
        finally { s?.stop(); }
      }
      cell.ms = Math.round(performance.now() - c0);
      cells.push(cell);
      const facts = cell.error ? "✗ did not build" : cell.problems.length ? `✗ ${cell.problems.length}: ${[...new Set(cell.problems.map((p) => p.rule))].join(", ")}` : "✓ no findings";
      sheet[r]!.push({ image: pic?.image, error: cell.error, caption: `${cell.current ? "in use · " : ""}${facts}` });
    }
  } finally { rmSync(scratch, { recursive: true, force: true }); }

  const title = `${slot} · ${variants.length} variant${variants.length === 1 ? "" : "s"} on ${parent}${variation ? ` › ${variation}` : ""} · ${route} at ${width}${sets[0] ? ` · ${sets.length} token sets` : " · the theme's own tokens"}`;
  const image = await composeSheet({ cols: variants.map((c) => c.label), rows: sets.map((s) => s?.name ?? parent), cells: sheet, title, maxAspect: slot === "home" ? 1.3 : 1.0 });
  const file = join(opts.cacheDir, `board-${slot}-${randomBytes(4).toString("hex")}.webp`);
  writeFileSync(file, Buffer.from(image.data, "base64"));
  pruneBoards(opts.cacheDir);
  return { slot, theme: parent, route: route ?? "/", width, variants: variants.map((c) => c.label), sets: sets.map((s) => s?.name ?? parent), cells, image: { ...image, mimeType: "image/webp" }, file, ms: Math.round(performance.now() - t0) };
}

/** Keep the newest eight sheets. */
function pruneBoards(dir: string): void {
  const all = readdirSync(dir).filter((f) => /^board-.*\.webp$/.test(f)).map((f) => ({ f: join(dir, f), t: statSync(join(dir, f)).mtimeMs }));
  for (const { f } of all.sort((a, b) => b.t - a.t).slice(8)) rmSync(f, { force: true });
}

/** The facts as the agent reads them, before the sheet: one line per cell that has something to say. */
export function formatBoard(r: BoardResult, uri?: (f: string) => string): string {
  const lines = [`board · ${r.slot} · ${r.variants.length} × ${r.sets.length} on ${r.theme} · ${r.route} at ${r.width} · ${(r.ms / 1000).toFixed(1)} s`,
    `columns: ${r.variants.join(" · ")}${r.sets.length > 1 ? ` — rows: ${r.sets.join(" · ")}` : ""}`];
  for (const c of r.cells) {
    const who = `${c.variant}${c.set ? ` on ${c.set}` : ""}${c.current ? " (in use)" : ""}`;
    if (c.error) lines.push(`✗ ${who}: ${c.error}`);
    else if (c.problems.length) lines.push(`✗ ${who}: ${c.problems.slice(0, 4).map((p) => `${p.rule} ${p.where} ${p.detail}`).join(" · ")}${c.problems.length > 4 ? ` · … ${c.problems.length - 4} more` : ""}`);
    for (const w of c.warnings) lines.push(`⚠ ${who}: ${w}`);
  }
  const clean = r.cells.filter((c) => !c.error && !c.problems.length).length;
  lines.push(`✓ ${clean} of ${r.cells.length} cells with no findings`);
  lines.push(`to use one: \`pieces: { ${r.slot}: <name> }\` in theme.yaml — snypd://theme/pieces/${r.slot} has each one's switches`);
  if (uri) lines.push(`sheet: ${uri(r.file)}`);
  return lines.join("\n");
}

// ── the stills ──────────────────────────────────────────────────────────────────────────────────────

export interface StillsOptions {
  /** The repo; the one this file is in by default. */
  repo?: string;
  /** Only these pieces (`home/split`); every piece by default. */
  only?: string[];
  /** Only pieces whose stills are missing or stale. */
  stale?: boolean;
  cacheDir?: string;
  onPiece?: (id: string, i: number, n: number) => void;
}

/**
 * Photograph every piece (or `only` these) on the specimen, on the host theme with only its slot swapped,
 * and write the two stills beside its `piece.yaml`, then `stills.json` with what each is a picture of.
 * Regenerate the manifest after (`bun packages/pieces/src/gen.ts`) so `stills` lands in `pieces.json`.
 */
export async function stills(opts: StillsOptions = {}): Promise<{ written: string[]; skipped: string[]; failed: { id: string; why: string }[] }> {
  const repo = opts.repo ?? join(import.meta.dir, "..", "..", "..");
  const piecesDir = join(repo, "packages", "pieces");
  const gen = await import("../../pieces/src/gen");
  const m = loadPieces();
  const { host, root: rel } = m.board.stills;
  const root = join(repo, rel);
  const record: Record<string, StillRecord> = gen.readStills();
  const hostCfg = loadConfig(root, { theme: host });
  const inHost = new Map(hostCfg.pieces.map((p) => [p.slot, p.name]));
  const ids = Object.keys(m.pieces).filter((id) => (!opts.only?.length || opts.only.includes(id)) && (!opts.stale || record[id]?.inputs !== gen.stillInputs(id, m.board) || !m.pieces[id]!.stills));
  const cacheDir = opts.cacheDir ?? join(root, ".snypd", "look");
  mkdirSync(cacheDir, { recursive: true });
  const scratch = join(cacheDir, `stills-${process.pid}`);
  const written: string[] = [], failed: { id: string; why: string }[] = [];
  const skipped = Object.keys(m.pieces).filter((id) => !ids.includes(id));
  try {
    let i = 0;
    for (const id of ids) {
      const p = m.pieces[id]!;
      opts.onPiece?.(id, ++i, ids.length);
      const name = `still-${p.slot}-${p.name}`;
      writeChildTheme(scratch, name, { parent: host, pieces: inHost.get(p.slot) === p.name ? undefined : { [p.slot]: p.name } });
      let s: Awaited<ReturnType<typeof buildAndServe>> | undefined;
      try {
        s = await buildAndServe(root, { theme: name, slug: name }, "stills", { searchPaths: [scratch] });
        const route = gen.stillRoute(id, m.board);
        const sizes: Record<string, [number, number]> = {};
        for (const f of STILL_FILES) {
          const { width, frame } = STILL_FRAMES[f];
          const r = await look({ url: s.url, cacheDir, route, slot: p.slot, slotClasses: p.emits, width, since: "none", bare: true });
          if (!r.image) throw new Error(`no picture at ${width}`);
          const still = await frameStill(r.image, frame, frame[0] / width);
          writeFileSync(join(piecesDir, p.slot, p.name, f), Buffer.from(still.data, "base64"));
          sizes[f] = still.size;
        }
        record[id] = { inputs: gen.stillInputs(id, m.board), route, sizes };
        written.push(id);
      } catch (e) { failed.push({ id, why: (e as Error).message.split("\n")[0]! }); }
      finally { s?.stop(); }
    }
  } finally { rmSync(scratch, { recursive: true, force: true }); }
  const sorted = Object.fromEntries(Object.keys(record).filter((k) => m.pieces[k]).sort().map((k) => [k, record[k]!]));
  writeFileSync(gen.STILLS_JSON, JSON.stringify({ $comment: "GENERATED by `snypd pieces stills` — what each piece's stills are a picture of.", pieces: sorted }, null, 2) + "\n");
  writeFileSync(join(piecesDir, "pieces.json"), gen.render(gen.generate()));
  return { written, skipped, failed };
}

/** Whether every face `board.yaml` names is on the shelf — the manifest test asks. */
export const boardFacesMissing = (): string[] => loadPieces().board.sets.map((s) => s.face).filter((f): f is string => !!f && !shelfFace(f));
