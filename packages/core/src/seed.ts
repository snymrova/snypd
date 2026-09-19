/**
 * `snypd seed` (TF3, docs/29 §4) — **one colour and two numbers in, a readable palette and a type
 * scale out.**
 *
 * The factory's candidates differ in taste, and taste is the only place they are allowed to differ. That
 * a link is readable on a raised block in dark mode is not taste; it is arithmetic, and a theme should
 * never have been able to get it wrong. So this file does the arithmetic once: every colour role is
 * solved in OKLCH against the ratio the contrast gate asks of it (`CONTRAST_PAIRS`, the same list `check
 * theme` reads), with a margin, and every value it emits is re-resolved through `resolveColor` — the
 * gate's own parser — and re-measured before it is returned. "Passes by construction" therefore means
 * passes the real gate, not a twin of it.
 *
 * `expandSeed` is pure; `writeSeed`, at the bottom, is the only part that touches a file. The CLI and
 * the MCP tool both call the pair.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isMap, parseDocument } from "yaml";
import { contrastRatio, inGamut, oklchToRgb, resolveColor, rgbToOklch, tokenVars, type Mode, type Rgb } from "./color";
import type { TokenDecl } from "./schema";

/**
 * The colour pairs a reader actually reads, and the ratio each owes (WCAG 2.2 §1.4.3). Lives here, not in
 * `check theme`, so the solver's property test and the gate read one list.
 *
 * Body text, the muted text a date and a caption are set in, and a link, each against both surfaces a
 * theme paints them on — plus the one inversion, a theme's accent used as a fill. 4.5:1 throughout:
 * these are all body-sized, and the 3:1 large-text exception is for 24px, which is a heading. Borders
 * and gridlines are not here on purpose — 1.4.11 asks 3:1 of a control's boundary, and a hairline
 * between two paragraphs is not one, so a rule about it would fail every well-made theme on the shelf.
 */
export const CONTRAST_PAIRS: { rule: string; fg: string; bg: string; min: number; what: string }[] = [
  { rule: "contrast.text", fg: "color.text", bg: "color.bg", min: 4.5, what: "body text on the page" },
  { rule: "contrast.text", fg: "color.text", bg: "color.surface", min: 4.5, what: "body text on a raised block" },
  { rule: "contrast.muted", fg: "color.muted", bg: "color.bg", min: 4.5, what: "dates and captions on the page" },
  { rule: "contrast.muted", fg: "color.muted", bg: "color.surface", min: 4.5, what: "dates and captions on a raised block" },
  { rule: "contrast.accent", fg: "color.accent", bg: "color.bg", min: 4.5, what: "links on the page" },
  { rule: "contrast.accent", fg: "color.accent", bg: "color.surface", min: 4.5, what: "links on a raised block" },
  { rule: "contrast.on-accent", fg: "color.on-accent", bg: "color.accent", min: 4.5, what: "text on an accent fill" },
];

export type SeedStrategy = "restrained" | "balanced" | "expressive";
export type SeedScheme = "both" | "light" | "dark";
export interface SeedInput {
  /** Any colour `resolveColor` reads; its hue and chroma become the accent. */
  seed: string;
  strategy?: SeedStrategy;
  scheme?: SeedScheme;
  /** Type-scale ratio at 390 px and at 1440 px. */
  ratio?: [number, number];
  /** Body size in px at 390 px and at 1440 px. */
  base?: [number, number];
  /** The body face's x-height as a fraction of the em (shelf data); sets leading. Default 0.5. */
  xHeight?: number;
}
export interface SeedReport {
  /** Every gated pair, both modes, as the gate would measure it. */
  pairs: { rule: string; fg: string; bg: string; mode: Mode; ratio: number; min: number }[];
  /** The stricter bars this solver holds itself to: text ≥ 7, viz ≥ 3. */
  extra: { token: string; mode: Mode; ratio: number; min: number }[];
  /** What the solver had to change from what was asked, in words. Empty when nothing moved. */
  notes: string[];
  /** The fluid steps −2 … 5, in rem at each end, and which token each one became. */
  steps: { step: number; min: number; max: number; token?: string }[];
}
export interface SeedResult { input: Required<SeedInput>; tokens: Record<string, TokenDecl>; css: string; report: SeedReport }

export class SeedError extends Error { constructor(msg: string, readonly hint?: string) { super(msg); } }

// ── the palette ──────────────────────────────────────────────────────────────────────────────────

/** Added to every gated minimum: absorbs the three-decimal rounding the emitted values go through. */
const MARGIN = 0.3;
const TEXT_MIN = 7, VIZ_MIN = 3;
const BG_CHROMA: Record<SeedStrategy, number> = { restrained: 0.004, balanced: 0.01, expressive: 0.022 };
const SURFACE_CHROMA: Record<SeedStrategy, number> = { restrained: 0.004, balanced: 0.012, expressive: 0.045 };
const TEXT_CHROMA: Record<SeedStrategy, number> = { restrained: 0.01, balanced: 0.015, expressive: 0.02 };

interface C { l: number; c: number; h: number }
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (x: C) => `oklch(${r3(x.l)} ${r3(x.c)} ${r1(x.h)})`;
/**
 * What a browser, and the gate, will see: the value as written, rounded. The same arithmetic
 * `resolveColor` does for an `oklch()` literal, without the string round trip — the search calls this
 * thousands of times; `expandSeed` re-measures the emitted strings through `resolveColor` itself at the end.
 */
const rgb = (x: C): Rgb => oklchToRgb(Math.min(1, Math.max(0, r3(x.l))), r3(x.c), r1(x.h));
const ratio = (a: C, b: C) => contrastRatio(rgb(a), rgb(b));
const worst = (fg: C, bgs: C[]) => Math.min(...bgs.map((b) => ratio(fg, b)));

/** The most chroma sRGB can show at this L and H, up to `c`. */
function fit(l: number, c: number, h: number): C {
  // Rounded down to what will be written, so the three-decimal value is inside the gamut too.
  if (inGamut(r3(l), c, h)) return { l, c, h };
  let lo = 0, hi = c;
  for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; if (inGamut(r3(l), m, h)) lo = m; else hi = m; }
  return { l, c: Math.floor(lo * 1000) / 1000, h };
}
/** A role the solver could not place is a bug worth a sentence, not a crash three calls later. */
function must(x: C | undefined, mode: Mode, role: string): C {
  if (!x) throw new SeedError(`${mode}: no lightness makes ${role} readable against the page`, "This is a bug for an ordinary seed; please report the seed.");
  return x;
}

/**
 * The L, walking from `from` towards `to`, at which `fg` first clears `min` against every `bgs` —
 * binary search, 24 steps, chroma re-fitted to the gamut at each L. Undefined when even `to` fails.
 */
function solveL(from: number, to: number, c: number, h: number, bgs: C[], min: number): C | undefined {
  const at = (l: number) => fit(l, c, h);
  if (worst(at(from), bgs) >= min) return at(from);
  if (worst(at(to), bgs) < min) return undefined;
  let bad = from, good = to;
  for (let i = 0; i < 24; i++) { const m = (bad + good) / 2; if (worst(at(m), bgs) >= min) good = m; else bad = m; }
  // Rounding to three decimals can land a hair on the wrong side; step on until the written value passes.
  let x = at(r3(good));
  const dir = Math.sign(to - from) * 0.001;
  for (let i = 0; i < 20 && worst(x, bgs) < min; i++) x = at(r3(x.l + dir));
  return worst(x, bgs) >= min ? x : undefined;
}

interface Side { bg: C; surface: C; text: C; muted: C; accent: C; onAccent: C; border: C; viz: C[]; grid: C; edge: C; node: C; nodeStroke: C }

function side(mode: Mode, seed: C, strategy: SeedStrategy, notes: string[]): Side {
  const dark = mode === "dark";
  const h = seed.h;
  const bg = fit(dark ? 0.165 : 0.985, BG_CHROMA[strategy] * (dark ? 1.2 : 1), h);
  const surface = fit(dark ? bg.l + 0.045 : bg.l - 0.035, SURFACE_CHROMA[strategy] * (dark ? 1.2 : 1), h);
  const grounds = [bg, surface];
  // Text sits where a reader expects it — near-black, or short of white — and only moves if that fails.
  const text = must(solveL(dark ? 0.93 : 0.22, dark ? 0.95 : 0.05, TEXT_CHROMA[strategy], h, grounds, TEXT_MIN + MARGIN), mode, "text");
  // Muted is as quiet as the gate allows: the search walks in from the background and stops at the line.
  const muted = must(solveL(bg.l, text.l, TEXT_CHROMA[strategy] * 1.4, h, grounds, 4.5 + MARGIN), mode, "muted");
  // Accent keeps the seed's hue and chroma; its L is the seed's own if that passes, else the nearest that does.
  const c = seed.c * (dark ? 0.85 : 1);
  let accent = solveL(seed.l, dark ? 0.99 : 0.05, c, h, grounds, 4.5 + MARGIN);
  if (!accent) {
    accent = must(solveL(seed.l, dark ? 0.05 : 0.99, c, h, grounds, 4.5 + MARGIN), mode, "accent");
    notes.push(`${mode}: the seed could not be made a readable link by moving ${dark ? "lighter" : "darker"}; moved the other way instead.`);
  }
  if (Math.abs(accent.l - seed.l) > 0.005) notes.push(`${mode}: accent L ${r3(seed.l)} → ${r3(accent.l)} to clear ${4.5 + MARGIN}:1 on bg and surface.`);
  if (accent.c < c - 0.002) notes.push(`${mode}: accent chroma ${r3(c)} → ${r3(accent.c)}, the most sRGB shows at that L.`);
  // On-accent: the page itself if it reads on the fill, else the text colour, else solved.
  const onMin = 4.5 + MARGIN;
  const onAccent = ratio(bg, accent) >= onMin ? bg : ratio(text, accent) >= onMin ? text
    : solveL(accent.l, accent.l < 0.6 ? 0.995 : 0.02, 0.01, h, [accent], onMin) ?? (notes.push(`${mode}: no text colour reads on the accent at ${onMin}:1.`), text);
  const border = fit(dark ? bg.l + 0.1 : bg.l - 0.09, BG_CHROMA[strategy] * 1.5, h);
  // Six series at 60° steps from the seed, one shared L, each as saturated as the gamut allows there.
  const vc = Math.min(Math.max(seed.c, 0.1), 0.16);
  const hues = [0, 60, 120, 180, 240, 300].map((d) => (h + d) % 360);
  let vl = dark ? 0.7 : 0.58;
  const vizAt = (l: number) => hues.map((hh) => fit(l, vc, hh));
  for (let i = 0; i < 60 && vizAt(vl).some((v) => ratio(v, bg) < VIZ_MIN + MARGIN); i++) vl += dark ? 0.005 : -0.005;
  return {
    bg, surface, text, muted, accent, onAccent, border, viz: vizAt(r3(vl)),
    grid: fit(dark ? bg.l + 0.07 : bg.l - 0.06, BG_CHROMA[strategy], h),
    edge: fit((muted.l + border.l) / 2, BG_CHROMA[strategy] * 2, h),
    node: surface,
    nodeStroke: fit(dark ? bg.l + 0.14 : bg.l - 0.14, BG_CHROMA[strategy] * 1.5, h),
  };
}

// ── type and space ───────────────────────────────────────────────────────────────────────────────

const VW_MIN = 390, VW_MAX = 1440;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
/** `clamp()` from a px size at 390 to one at 1440, in rem (Utopia's formula). */
function fluid(minPx: number, maxPx: number): string {
  const slope = (maxPx - minPx) / (VW_MAX - VW_MIN);
  const icpt = minPx - slope * VW_MIN;
  const lo = Math.min(minPx, maxPx) / 16, hi = Math.max(minPx, maxPx) / 16;
  return `clamp(${r4(lo)}rem, ${r4(icpt / 16)}rem + ${r4(slope * 100)}vw, ${r4(hi)}rem)`;
}
/** Which scale step each size token is: editorial's names, h1 two steps above h2 for a real headline. */
const STEP_TOKENS: Record<number, string> = { [-1]: "size.small", 0: "size.body", 1: "size.h3", 2: "size.h2", 4: "size.h1" };
const SIZE_WHAT: Record<string, string> = {
  "size.small": "Meta and caption.", "size.body": "Body size; fluid between phone and desktop.",
  "size.h3": "Sub-heading.", "size.h2": "Section heading.", "size.h1": "Post and index title.",
};
const SPACE = [0.25, 0.5, 1, 1.5, 2.5, 4];
const SPACE_WHAT = ["Hairline gap.", "Inside a line.", "Between paragraphs.", "Around a block.", "Between sections.", "Page top and bottom."];

// ── the whole ────────────────────────────────────────────────────────────────────────────────────

const COLOR_WHAT: Record<string, string> = {
  "color.bg": "Page background.", "color.surface": "Raised blocks — callout, cta, tldr.", "color.text": "Body text.",
  "color.muted": "Dates, captions, secondary labels.", "color.accent": "Links and the one emphatic colour.",
  "color.on-accent": "Text on an accent fill.", "color.border": "Hairlines and block edges.",
  "color.viz.axis": "Axis lines.", "color.viz.grid": "Gridlines.", "color.viz.tick": "Tick labels.",
  "color.viz.label": "Node and edge labels.", "color.viz.edge": "Diagram and flow edges.",
  "color.viz.node": "Node fill.", "color.viz.node-stroke": "Node outline.",
};
const ORDINAL = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth"];

function parseSeed(seed: string): C {
  const light = resolveColor(seed, "light");
  if (!light) throw new SeedError(`cannot read the seed colour "${seed}"`, 'Any hex, rgb(), hsl() or oklch() works, e.g. --seed="oklch(0.55 0.13 252)".');
  const o = rgbToOklch(light);
  if (o.c < 0.02) throw new SeedError(`the seed "${seed}" has no hue to seed from (chroma ${r3(o.c)})`, "A grey cannot become an accent; pick a colour with chroma ≥ 0.02.");
  return o;
}

export function expandSeed(raw: SeedInput): SeedResult {
  const input: Required<SeedInput> = {
    seed: raw.seed, strategy: raw.strategy ?? "balanced", scheme: raw.scheme ?? "both",
    ratio: raw.ratio ?? [1.2, 1.25], base: raw.base ?? [17, 19], xHeight: raw.xHeight ?? 0.5,
  };
  if (!["restrained", "balanced", "expressive"].includes(input.strategy)) throw new SeedError(`unknown strategy "${input.strategy}"`, "restrained | balanced | expressive");
  if (!["both", "light", "dark"].includes(input.scheme)) throw new SeedError(`unknown scheme "${input.scheme}"`, "both | light | dark");
  for (const [what, [a, b], lo, hi] of [["ratio", input.ratio, 1.05, 1.62], ["base", input.base, 12, 28]] as const)
    if (!(a >= lo && a <= hi && b >= lo && b <= hi)) throw new SeedError(`--${what}=${a}:${b} is out of range`, `Both ends between ${lo} and ${hi}.`);

  const seed = parseSeed(input.seed);
  const notes: string[] = [];
  const L = input.scheme !== "dark" ? side("light", seed, input.strategy, notes) : undefined;
  const D = input.scheme !== "light" ? side("dark", seed, input.strategy, notes) : undefined;
  const pick = (f: (s: Side) => C) => (L && D ? `light-dark(${fmt(f(L))}, ${fmt(f(D))})` : fmt(f((L ?? D)!)));

  const tokens: Record<string, TokenDecl> = {};
  const decl = (name: string, value: string | number, kind: TokenDecl["kind"], description: string) => { tokens[name] = { default: value, customisable: true, kind, description }; };
  decl("color.scheme", input.scheme === "both" ? "light dark" : input.scheme, "keyword", "Which side of every light-dark() pair resolves. `light dark` follows the reader; `dark` or `light` commits.");
  const roles: [string, (s: Side) => C][] = [
    ["color.bg", (s) => s.bg], ["color.surface", (s) => s.surface], ["color.text", (s) => s.text], ["color.muted", (s) => s.muted],
    ["color.accent", (s) => s.accent], ["color.on-accent", (s) => s.onAccent], ["color.border", (s) => s.border],
  ];
  for (const [name, f] of roles) decl(name, pick(f), "color", COLOR_WHAT[name]!);
  for (let i = 0; i < 6; i++) decl(`color.viz.${i + 1}`, pick((s) => s.viz[i]!), "color", `${ORDINAL[i]} series.`);
  const vizRoles: [string, (s: Side) => C][] = [
    ["color.viz.axis", (s) => s.muted], ["color.viz.grid", (s) => s.grid], ["color.viz.tick", (s) => s.muted], ["color.viz.label", (s) => s.text],
    ["color.viz.edge", (s) => s.edge], ["color.viz.node", (s) => s.node], ["color.viz.node-stroke", (s) => s.nodeStroke],
  ];
  for (const [name, f] of vizRoles) decl(name, pick(f), "color", COLOR_WHAT[name]!);

  const steps: SeedReport["steps"] = [];
  const [rMin, rMax] = input.ratio, [bMin, bMax] = input.base;
  for (let n = -2; n <= 5; n++) {
    const lo = bMin * rMin ** n, hi = bMax * rMax ** n, token = STEP_TOKENS[n];
    steps.push({ step: n, min: r4(lo / 16), max: r4(hi / 16), token });
    if (token) decl(token, fluid(lo, hi), "size", SIZE_WHAT[token]!);
  }
  const x = input.xHeight;
  const over = Math.max(0, (x - 0.5) / 0.02);
  decl("leading.body", Math.min(1.7, Math.round((1.5 + 0.05 * over) * 100) / 100), "number", "Prose line height; from the body face's x-height.");
  decl("leading.tight", Math.min(1.2, Math.round((1.1 + 0.025 * over) * 100) / 100), "number", "Heading line height.");
  decl("measure", "66ch", "size", "Width of the reading column.");
  SPACE.forEach((f, i) => decl(`space.${i + 1}`, fluid(bMin * f, bMax * f), "size", SPACE_WHAT[i]!));

  // Re-measure everything exactly as `check theme` will: through the emitted strings and resolveColor.
  const values: Record<string, string> = Object.fromEntries(Object.entries(tokens).map(([k, v]) => [k, String(v.default)]));
  const vars = tokenVars(values);
  const pairs: SeedReport["pairs"] = [], extra: SeedReport["extra"] = [];
  const modes: Mode[] = input.scheme === "both" ? ["light", "dark"] : [input.scheme];
  for (const mode of modes) {
    const get = (t: string) => resolveColor(values[t]!, mode, vars)!;
    for (const p of CONTRAST_PAIRS) pairs.push({ rule: p.rule, fg: p.fg, bg: p.bg, mode, ratio: contrastRatio(get(p.fg), get(p.bg)), min: p.min });
    for (const g of ["color.bg", "color.surface"]) extra.push({ token: `color.text/${g}`, mode, ratio: contrastRatio(get("color.text"), get(g)), min: TEXT_MIN });
    for (let i = 1; i <= 6; i++) extra.push({ token: `color.viz.${i}`, mode, ratio: contrastRatio(get(`color.viz.${i}`), get("color.bg")), min: VIZ_MIN });
  }
  const failed = [...pairs.filter((p) => p.ratio < p.min).map((p) => `${p.fg} on ${p.bg} (${p.mode}) ${p.ratio.toFixed(2)}:1`),
    ...extra.filter((e) => e.ratio < e.min).map((e) => `${e.token} (${e.mode}) ${e.ratio.toFixed(2)}:1`)];
  if (failed.length) throw new SeedError(`the seed "${input.seed}" could not be solved: ${failed.join("; ")}`, "Try another lightness or chroma for the seed; this is a bug if the seed is an ordinary colour.");

  const css = `:root {\n${Object.entries(values).map(([k, v]) => `  --${k.replace(/[^a-zA-Z0-9_-]+/g, "-")}: ${v};`).join("\n")}\n}\n`;
  return { input, tokens, css, report: { pairs, extra, notes, steps } };
}

// ── writing it into a theme ──────────────────────────────────────────────────────────────────────

/** The line under `## Seed` in DESIGN.md that makes a re-seed reproducible. */
export function seedLine(i: Required<SeedInput>, face?: string): string {
  return `snypd seed <name> --seed="${i.seed}" --strategy=${i.strategy} --scheme=${i.scheme} --ratio=${i.ratio.join(":")} --base=${i.base.join(":")}${face ? ` --face=${face}` : ""}`;
}

/**
 * Put a seed's tokens into `<dir>/theme.yaml` through the yaml Document API, so every comment in the file
 * survives: a token already declared keeps its description and has its `default` replaced; a new one is
 * appended whole. Then record the inputs under `## Seed` in `<dir>/DESIGN.md`. Returns the files written.
 */
export function writeSeed(dir: string, name: string, r: SeedResult, face?: string): string[] {
  const file = join(dir, "theme.yaml");
  if (!existsSync(file)) throw new SeedError(`no theme at ${dir}`, `\`snypd new theme ${name}\` first; seeding fills a theme, it does not make one.`);
  const doc = parseDocument(readFileSync(file, "utf8"));
  if (!isMap(doc.get("tokens", true))) doc.set("tokens", doc.createNode({}));
  for (const [k, d] of Object.entries(r.tokens)) {
    const at = ["tokens", k];
    if (isMap(doc.getIn(at, true))) doc.setIn([...at, "default"], d.default);
    else { const n = doc.createNode(d); (n as { flow?: boolean }).flow = true; doc.setIn(at, n); }
  }
  writeFileSync(file, `${doc.toString({ lineWidth: 0 }).replace(/\n+$/, "")}\n`);

  const design = join(dir, "DESIGN.md");
  const block = `## Seed\n\n\`\`\`\n${seedLine(r.input, face).replace("<name>", name)}\n\`\`\`\n`;
  const before = existsSync(design) ? readFileSync(design, "utf8") : `# ${name}\n\n`;
  const after = /^## Seed\b/m.test(before)
    ? before.replace(/^## Seed\b[\s\S]*?(?=^## |(?![\s\S]))/m, `${block}\n`)
    : `${before.replace(/\n*$/, "\n\n")}${block}`;
  writeFileSync(design, after.replace(/\n+$/, "\n"));
  return [file, design];
}
