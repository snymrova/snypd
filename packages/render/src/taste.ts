/**
 * Taste lint (docs/29 TF5, decision 225) — **the gates were blind to looks, and these are the first eyes
 * that are not a person's.**
 *
 * studio and console passed every rule `check theme` had and were disliked on sight. Nothing below would
 * have saved them on its own; what it does is name, by rule, the handful of moves that make a page read
 * as a template — a gradient on a headline, a coloured stripe down the side of every box, an eyebrow in
 * tracked capitals over every heading, a line of prose 110 characters long — so an agent writing a theme
 * is told before a person has to look. The list is ported from impeccable's detectors and the
 * frontend-design skill (docs/28 §4), cut to the rules a machine can decide without guessing intent.
 *
 * Two halves, one shape. The **static** rules read the theme's own stylesheet and its resolved tokens,
 * and run in `check theme`. The **rendered** rules need layout, so `snypd shoot` runs `TASTE_PROBE` in
 * the page it is already photographing (at design time: the page itself still ships no JavaScript) and
 * `tasteVerdicts` decides on what it measured. Both come back as `RuleResult`s.
 *
 * **Every rule is a warning, never a failure.** Taste is argued, not enforced; a shelf that refused a
 * theme for an eyebrow would be refusing magazines. And **the brief wins**: a rule named under DESIGN.md's
 * `## Chosen` still reports — the row is the record that somebody chose it — but says whose choice it was.
 */
import { resolveColor, rgbToOklch, tokenVars, type Mode, type Rgb } from "@snypd/core";

export type TasteStatus = "pass" | "warn";
export interface TasteRow { rule: string; status: TasteStatus; detail: string }

// ── CSS, read as text ────────────────────────────────────────────────────────────────────────────

/** Comments and strings blanked in place, so offsets — and therefore line numbers — survive. */
export function plainCss(css: string): string {
  let plain = "";
  for (let i = 0; i < css.length; i++) {
    const c = css[i]!;
    if (c === '"' || c === "'") { const q = c; let j = i + 1; while (j < css.length && css[j] !== q) { if (css[j] === "\\") j++; j++; } plain += css.slice(i, j + 1).replace(/[^\n]/g, " "); i = j; continue; }
    if (c === "/" && css[i + 1] === "*") { const end = css.indexOf("*/", i + 2); const j = end < 0 ? css.length : end + 2; plain += css.slice(i, j).replace(/[^\n]/g, " "); i = j - 1; continue; }
    plain += c;
  }
  return plain;
}

interface Block { selector: string; body: string; line: number }
/** Every innermost `selector { declarations }`, with the line its selector starts on. */
function blocks(css: string): Block[] {
  const plain = plainCss(css);
  const out: Block[] = [];
  const re = /([^{};]*)\{([^{}]*)\}/g;
  for (let m = re.exec(plain); m; m = re.exec(plain)) {
    const lead = m[1]!.length - m[1]!.trimStart().length;
    out.push({ selector: m[1]!.trim().replace(/\s+/g, " "), body: m[2]!, line: plain.slice(0, m.index + lead).split("\n").length });
  }
  return out;
}
const decls = (body: string): [string, string][] =>
  body.split(";").map((d) => d.split(/:(.*)/s)).filter((p) => p.length >= 2 && p[0]!.trim()).map((p) => [p[0]!.trim().toLowerCase(), p[1]!.trim()]);

/** A CSS length in px, for the units a border is written in; `undefined` for a keyword or a var(). */
function px(v: string): number | undefined {
  const m = /(?<![\w-])(-?\d*\.?\d+)(px|rem|em)?\b/.exec(v);
  if (!m) return /\b(thin)\b/.test(v) ? 1 : /\bmedium\b/.test(v) ? 3 : /\bthick\b/.test(v) ? 5 : undefined;
  const n = +m[1]!;
  return m[2] === "rem" || m[2] === "em" ? n * 16 : m[2] === "px" ? n : n === 0 ? 0 : undefined;
}

/** A value split on whitespace and `/` at paren depth 0, so `calc(var(--r) - 1px)` stays one word. */
function words(v: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const c of v) {
    if (c === "(") depth++; else if (c === ")") depth--;
    if (depth === 0 && (/\s/.test(c) || c === "/")) { if (cur) out.push(cur); cur = ""; } else cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

/** The faces both skill lists name as the most used, off the shelf by default (decision 227). */
export const OVERUSED_FACES = ["Inter", "Roboto", "Geist", "Fraunces", "Space Grotesk", "Plus Jakarta Sans"] as const;
/** The first family a stack names — the one that renders. `var()` and generic keywords are not faces. */
export function leadFamily(stack: string): string | undefined {
  const first = stack.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "");
  if (!first || /^var\(/.test(first) || /^(ui-|system-ui|sans-serif|serif|monospace|cursive|fantasy|-apple-system)/.test(first)) return undefined;
  return first;
}

export interface StaticInput {
  /** The theme's own stylesheet, and its file name for the `file:line` evidence. */
  css?: string;
  cssFile?: string;
  /** The theme's resolved tokens, as `themeView` gives them. */
  tokens: Record<string, string>;
  /** The webfont's family, when the theme ships one. */
  fontFamily?: string;
}

const at = (file: string | undefined, b: Block) => `${file ?? "theme.css"}:${b.line}`;
const listed = (xs: string[], n = 4) => `${xs.slice(0, n).join("; ")}${xs.length > n ? `; +${xs.length - n} more` : ""}`;

/** The six static rules, in docs/29 §6.1's order. */
export function staticTaste(input: StaticInput): TasteRow[] {
  const bs = input.css === undefined ? [] : blocks(input.css);
  const own = input.css !== undefined;
  const rows: TasteRow[] = [];
  const row = (rule: string, hits: string[], pass: string, what: string) =>
    rows.push(hits.length ? { rule, status: "warn", detail: `${listed(hits)} — ${what}` } : { rule, status: "pass", detail: pass });

  // gradient text: `background-clip: text` over a gradient, in one block.
  const grad = bs.filter((b) => /(?:-webkit-)?background-clip\s*:\s*text\b/i.test(b.body) && /gradient\(/i.test(b.body));
  row("taste.gradient-text", grad.map((b) => `${at(input.cssFile, b)} \`${b.selector}\``),
    own ? "no gradient is clipped to text" : "no stylesheet of its own",
    "a gradient clipped to a headline is the first thing a reader learns to recognise as generated; one solid colour, and the weight does the work");

  // side stripe: a coloured border down one side of a *filled* box. Padding alone is a blockquote, which
  // has worn a rule down its side since long before any kit; the fill is what makes it the admonition.
  const stripe = bs.filter((b) => {
    const d = decls(b.body);
    const side = d.find(([k, v]) => /^border-(left|inline-start)(-width)?$/.test(k) && !/\bnone\b|\bhidden\b|transparent/.test(v) && (px(v) ?? 0) > 1);
    return side && d.some(([k, v]) => /^background(-color)?$/.test(k) && !/^(none|transparent|inherit|unset|initial)$/.test(v));
  });
  row("taste.side-stripe", stripe.map((b) => `${at(input.cssFile, b)} \`${b.selector}\``),
    own ? "no box carries a coloured stripe down one side" : "no stylesheet of its own",
    "a thick left border on a filled box is the admonition every docs kit ships; a rule, a fill or a label says it without the kit");

  // overused faces: the webfont, and the first family of every font token.
  const faces = new Set<string>();
  if (input.fontFamily) faces.add(input.fontFamily);
  for (const [k, v] of Object.entries(input.tokens)) if (k.startsWith("font.")) { const f = leadFamily(v); if (f) faces.add(f); }
  const hot = [...faces].filter((f) => OVERUSED_FACES.some((o) => o.toLowerCase() === f.toLowerCase()));
  row("taste.overused-font", hot.map((f) => `\`${f}\``),
    faces.size ? `sets ${[...faces].map((f) => `\`${f}\``).join(", ")} — none of the ${OVERUSED_FACES.length} the shelf leaves off` : "names system stacks only",
    "the face every generated page reaches for (decision 227); the shelf has sixteen that are not it");

  // untinted neutrals: a pure grey page under an accent that has a hue.
  const vars = tokenVars(input.tokens);
  const grey: string[] = [];
  let resolved = false;
  for (const mode of ["light", "dark"] as Mode[]) {
    const accent = input.tokens["color.accent"] ? resolveColor(input.tokens["color.accent"], mode, vars) : undefined;
    if (!accent || rgbToOklch(accent).c < 0.04) continue;
    for (const k of ["color.bg", "color.surface", "color.text"]) {
      const v = input.tokens[k];
      const c = v ? resolveColor(v, mode, vars) : undefined;
      if (!c) continue;
      resolved = true;
      if (rgbToOklch(c).c < 0.0025) grey.push(`${k} ${mode} ${hex(c)}`);
    }
  }
  row("taste.untinted-neutral", grey,
    resolved ? "every neutral leans toward the accent's hue, however slightly" : "no hued accent to lean toward, or no neutral this build can resolve",
    "a pure grey or white under a coloured accent reads as a default nobody chose; give the neutrals a trace of the accent's hue (OKLCH chroma ≥ 0.003)");

  // transition: all
  const all = bs.filter((b) => decls(b.body).some(([k, v]) => (k === "transition" || k === "transition-property") && /(^|,)\s*all\b/.test(v)));
  row("taste.transition-all", all.map((b) => `${at(input.cssFile, b)} \`${b.selector}\``),
    own ? "every transition names its properties" : "no stylesheet of its own",
    "`all` animates layout properties nobody meant to move, and costs a frame for it; name what changes");

  // radius soup: more than three distinct corner radii. A value is split into its corners, so `0 r r 0`
  // is the radius `r` on two corners and not a second radius; and full rounding — a circle's `50%`, a
  // pill's `999px` — is one shape, however it is written.
  const radii = new Map<string, number>();
  for (const b of bs) for (const [k, v] of decls(b.body)) {
    if (!/^border(-[a-z]+)*-radius$/.test(k)) continue;
    for (const corner of words(v.replace(/\s*!important$/, ""))) {
      if (/^(0|0px|0rem|0em|inherit|unset|initial)$/.test(corner)) continue;
      const n = px(corner);
      const key = corner === "50%" || (n !== undefined && n >= 99) ? "full" : corner;
      if (!radii.has(key)) radii.set(key, b.line);
    }
  }
  const soup = radii.size > 3;
  const shown = [...radii].map(([v, l]) => `${v === "full" ? "full rounding" : `\`${v}\``} (${input.cssFile ?? "theme.css"}:${l})`);
  rows.push({
    rule: "taste.radius-soup", status: soup ? "warn" : "pass",
    detail: soup
      ? `${radii.size} distinct radii: ${shown.join(", ")} — pick two or three and make them tokens; a page of different corners reads as assembled`
      : own ? `${radii.size} distinct radi${radii.size === 1 ? "us" : "i"}${radii.size ? `: ${[...radii.keys()].map((v) => v === "full" ? "full rounding" : `\`${v}\``).join(", ")}` : ""}` : "no stylesheet of its own",
  });
  return rows;
}

const hex = (c: Rgb) => "#" + [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");

// ── the rendered half: measured by `shoot`, decided here ─────────────────────────────────────────

/** What `TASTE_PROBE` measures on one page. Every number is a computed value, in px. */
export interface TasteMeasure {
  /** Uppercase, tracked elements directly before an h1/h2. */
  eyebrows: { text: string; heading: string }[];
  /** Body copy (p, li in main) with ≥ 40 characters, smallest first. */
  body: { px: number; text: string }[];
  /** Characters per full line, one per paragraph of ≥ 180 characters that wraps at least three times. */
  measures: number[];
  /** The first h1, h2 and h3 on the page. */
  heads: { h1?: number; h2?: number; h3?: number };
  /** Vertical gaps between adjacent blocks of the prose column that are not both paragraphs. */
  gaps: number[];
}

/**
 * Runs in the page (`Runtime.evaluate`), returns a `TasteMeasure`. Self-contained on purpose — it is
 * sent as its own source — so it names nothing outside itself.
 */
function probe(): TasteMeasure {
  // The DOM through globalThis: this file is typed for the server, and the probe is the one part that is not.
  type Element = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { document, getComputedStyle } = globalThis as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const vis = (e: Element) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const cs = (e: Element) => getComputedStyle(e);
  const text = (e: Element) => (e.textContent || "").replace(/\s+/g, " ").trim();
  const scope = document.querySelector("main") || document.body;

  const eyebrows: { text: string; heading: string }[] = [];
  for (const h of document.querySelectorAll("h1, h2")) {
    const p = h.previousElementSibling;
    if (!p || !vis(p) || !text(p)) continue;
    const s = cs(p), size = parseFloat(s.fontSize) || 16, ls = parseFloat(s.letterSpacing) || 0;
    if (s.textTransform === "uppercase" && ls / size > 0.05) eyebrows.push({ text: text(p).slice(0, 40), heading: text(h).slice(0, 40) });
  }

  const body: { px: number; text: string }[] = [];
  for (const e of scope.querySelectorAll("p, li")) {
    if (e.closest("nav, footer, header, figcaption, aside, .footnotes") || !vis(e)) continue;
    const t = text(e);
    if (t.length >= 40) body.push({ px: parseFloat(cs(e).fontSize) || 0, text: t.slice(0, 40) });
  }
  body.sort((a, b) => a.px - b.px);

  const measures: number[] = [];
  let column: Element | null = null;
  for (const p of scope.querySelectorAll("p")) {
    if (p.closest("nav, footer, header, aside") || !vis(p)) continue;
    const t = text(p);
    if (t.length < 180) continue;
    column = column || p.parentElement;
    const range = document.createRange(); range.selectNodeContents(p);
    const lh = parseFloat(cs(p).lineHeight) || (parseFloat(cs(p).fontSize) || 16) * 1.4;
    const tops = [...range.getClientRects()].filter((r) => r.width > 0).map((r) => r.top).sort((a, b) => a - b);
    let lines = 0, last = -Infinity;
    for (const y of tops) if (y - last > lh / 2) { lines++; last = y; }
    if (lines >= 3) measures.push(Math.round(t.length / (lines - 0.5)));
  }

  const size = (sel: string) => { const e = document.querySelector(sel); return e && vis(e) ? parseFloat(cs(e).fontSize) : undefined; };
  const heads = { h1: size("h1"), h2: size("main h2") ?? size("h2"), h3: size("main h3") ?? size("h3") };

  const gaps: number[] = [];
  if (column) {
    const kids = [...column.children].filter((k) => vis(k) && cs(k).position !== "absolute" && cs(k).position !== "fixed");
    for (let i = 1; i < kids.length; i++) {
      const a = kids[i - 1]!, b = kids[i]!;
      if (a.tagName === "P" && b.tagName === "P") continue;
      gaps.push(Math.round(b.getBoundingClientRect().top - a.getBoundingClientRect().bottom));
    }
  }
  return { eyebrows, body, measures, heads, gaps };
}
/** The probe as an expression `Runtime.evaluate` can run. */
export const TASTE_PROBE = `(${probe.toString()})()`;

/** Which rendered rules a width is judged at: phone rules at a phone width, reading rules at a desktop one. */
export const RENDERED_RULES = ["taste.eyebrow", "taste.tiny-text", "taste.measure", "taste.flat-hierarchy", "taste.monotonous-spacing"] as const;
export type RenderedRule = (typeof RENDERED_RULES)[number];
export const judgedAt = (rule: RenderedRule, width: number): boolean =>
  rule === "taste.tiny-text" ? width <= 480 : width >= 1024;

export interface TasteHit { rule: RenderedRule; fired: boolean; detail: string }

/** One page's measurements, judged at one width. A rule this width does not judge is left out. */
export function tasteVerdicts(m: TasteMeasure, width: number): TasteHit[] {
  const out: TasteHit[] = [];
  const add = (rule: RenderedRule, fired: boolean, detail: string) => { if (judgedAt(rule, width)) out.push({ rule, fired, detail }); };

  add("taste.eyebrow", m.eyebrows.length > 0, m.eyebrows.length
    ? `${m.eyebrows.length} tracked-caps kicker${m.eyebrows.length === 1 ? "" : "s"} over a heading ("${m.eyebrows[0]!.text}" over "${m.eyebrows[0]!.heading}")`
    : "no tracked-caps kicker over a heading");

  const tiny = m.body.filter((b) => b.px < 14);
  add("taste.tiny-text", tiny.length > 0, tiny.length
    ? `${tiny.length} block${tiny.length === 1 ? "" : "s"} of body copy under 14 px at ${width} (${tiny[0]!.px} px: "${tiny[0]!.text}…")`
    : m.body.length ? `body copy ≥ ${m.body[0]!.px} px at ${width}` : "no body copy on this page");

  const med = median(m.measures);
  add("taste.measure", med !== undefined && m.measures.length >= 2 && (med > 80 || med < 45), med === undefined || m.measures.length < 2
    ? "fewer than two long paragraphs to measure"
    : `a line of prose holds ~${med} characters at ${width} (median of ${m.measures.length})${med > 80 ? " — over 80, the eye loses the next line" : med < 45 ? " — under 45, the eye jumps more than it reads" : ""}`);

  const { h1, h2, h3 } = m.heads;
  const r12 = h1 && h2 ? h1 / h2 : undefined, r23 = h2 && h3 ? h2 / h3 : undefined;
  const flat = (r12 !== undefined && r12 < 1.15) || (r23 !== undefined && r23 < 1.15);
  add("taste.flat-hierarchy", flat, r12 === undefined && r23 === undefined
    ? "fewer than two heading levels on this page"
    : `h1 ${h1 ?? "–"} px, h2 ${h2 ?? "–"} px, h3 ${h3 ?? "–"} px${r12 ? ` · h1:h2 ${r12.toFixed(2)}` : ""}${r23 ? ` · h2:h3 ${r23.toFixed(2)}` : ""}${flat ? " — under 1.15, two levels that read as one" : ""}`);

  const [value, share] = mode(m.gaps);
  const mono = m.gaps.length >= 6 && share > 0.8;
  add("taste.monotonous-spacing", mono, m.gaps.length < 6
    ? "fewer than six gaps between unlike blocks to compare"
    : `${Math.round(share * m.gaps.length)} of ${m.gaps.length} gaps between unlike blocks are ${value} px${mono ? " — a heading gets the same air as a figure; space is how a page says what belongs together" : ""}`);
  return out;
}

function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function mode(xs: number[]): [number, number] {
  const n = new Map<number, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  let best = 0, count = 0;
  for (const [v, c] of n) if (c > count) { best = v; count = c; }
  return [best, xs.length ? count / xs.length : 0];
}

/** Many pages' verdicts folded into one row per rule: a warning names the routes it fired on. */
export function foldRendered(pages: { route: string; width: number; hits: TasteHit[] }[]): TasteRow[] {
  return RENDERED_RULES.map((rule) => {
    const seen = pages.flatMap((p) => p.hits.filter((h) => h.rule === rule).map((h) => ({ ...h, route: p.route, width: p.width })));
    const fired = seen.filter((h) => h.fired);
    if (fired.length) return { rule, status: "warn" as const, detail: `${[...new Set(fired.map((h) => h.route))].join(", ")} — ${fired[0]!.detail}` };
    const routes = new Set(seen.map((h) => h.route)).size;
    return { rule, status: "pass" as const, detail: routes ? `${routes} route${routes === 1 ? "" : "s"} at ${[...new Set(seen.map((h) => h.width))].join("/")} px — ${seen[0]!.detail}` : "no page was judged at a width this rule reads" };
  });
}

// ── DESIGN.md: the brief beside theme.yaml ───────────────────────────────────────────────────────

/** The sections a brief is not a brief without; `meta.design` names the empty ones. */
export const BRIEF_SECTIONS = ["Use scene", "Visitor mode", "The rut", "Boldness goes here", "Safe / Risk"] as const;

/** `## Heading` → its content, with HTML comments (the scaffold's hints) removed. */
export function designSections(md: string): Map<string, string> {
  const out = new Map<string, string>();
  const parts = md.replace(/<!--[\s\S]*?-->/g, "").split(/^## +/m).slice(1);
  for (const p of parts) {
    const nl = p.indexOf("\n");
    const head = (nl < 0 ? p : p.slice(0, nl)).trim();
    out.set(head, nl < 0 ? "" : p.slice(nl + 1).trim());
  }
  return out;
}

/** The taste rules a brief overrides, each with the reason it gives (docs/29 §6.2, "the brief wins"). */
export function chosenRules(md: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  const body = md ? designSections(md).get("Chosen") : undefined;
  if (!body) return out;
  for (const line of body.split("\n")) {
    const m = /(taste\.[a-z-]+)`?\s*[:—–-]?\s*(.*)$/.exec(line);
    if (m) out.set(m[1]!, m[2]!.trim());
  }
  return out;
}

/** Apply the brief: a chosen rule keeps its warning, and the row says whose choice it was. */
export function applyChosen(rows: TasteRow[], chosen: Map<string, string>): TasteRow[] {
  return rows.map((r) => r.status === "warn" && chosen.has(r.rule)
    ? { ...r, detail: `chosen (DESIGN.md: ${chosen.get(r.rule) || "no reason given"}) — ${r.detail}` }
    : r);
}

/** What `meta.design` says about a DESIGN.md, or its absence. */
export function designVerdict(md: string | undefined): TasteRow {
  if (md === undefined) return { rule: "meta.design", status: "warn", detail: "no DESIGN.md — the brief that says who this is for, the rut it avoids and where it spends its boldness; `snypd new theme` writes one to fill" };
  const s = designSections(md);
  const empty = BRIEF_SECTIONS.filter((h) => !s.get(h));
  return empty.length
    ? { rule: "meta.design", status: "warn", detail: `DESIGN.md has nothing under ${empty.map((h) => `\`## ${h}\``).join(", ")} — the scaffold's hints are comments, and a brief with them only is a to-do` }
    : { rule: "meta.design", status: "pass", detail: `DESIGN.md: ${BRIEF_SECTIONS.length} brief sections filled${chosenRules(md).size ? `, ${chosenRules(md).size} taste rule${chosenRules(md).size === 1 ? "" : "s"} chosen` : ""}` };
}
