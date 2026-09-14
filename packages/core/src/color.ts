/**
 * Colour, carried exactly far enough to answer one question: **is this theme's text readable on this
 * theme's background** (docs/11 §5 item 4, the contrast gate `theme check` owes the shelf)?
 *
 * The honest way to resolve a modern colour token is to ask a browser — `getComputedStyle` implements
 * `light-dark()`, relative colour syntax and OKLCH to the letter, and the bench already drives one. But
 * `snypd check theme` is a verb someone types on a machine with no display, in a repository that may not
 * have a site in it, and a check that needs Chromium is a check nobody runs. So the subset the contract
 * actually uses is implemented here, in about a hundred lines of arithmetic that never allocates a page.
 *
 * The subset is not a guess: it is every shape `base`, `editorial` and `technical` write, plus the two a
 * third-party theme is likeliest to reach for. Hex, `rgb()`, `hsl()`, `oklch()`, `oklab()`, `light-dark()`,
 * `var()` back into the token map, `color-mix(in oklab, …)`, and relative colour — `oklch(from
 * var(--color-bg) calc(l + 0.045) c h)`, which is how a well-made theme derives a surface from a
 * background instead of declaring twelve colours by hand.
 *
 * **Anything outside it returns `undefined`, and every caller reports that as "not checked" rather than
 * as a pass.** A contrast gate that silently scores an unparsed value as fine is worse than no gate:
 * it would put a badge on the one theme whose colours nothing could read.
 */

/** sRGB, each channel 0–1, gamma-encoded — the space a hex literal is already in. */
export interface Rgb { r: number; g: number; b: number }

const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
const cbrt = (v: number) => Math.cbrt(v);

// ── sRGB ⇄ linear ────────────────────────────────────────────────────────────────────────────────
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

// ── OKLab ⇄ linear sRGB (Björn Ottosson's matrices) ──────────────────────────────────────────────
function oklabToRgb(L: number, a: number, b: number): Rgb {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  // Clamped into gamut rather than gamut-mapped. A browser would compress toward the achromatic axis and
  // land a fraction away from this; for a 4.5:1 threshold the difference is noise, and the clamp is the
  // conservative direction — it never makes a colour read as further from its background than it is.
  return {
    r: toGamma(clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    g: toGamma(clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    b: toGamma(clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  };
}
function rgbToOklab(c: Rgb): { L: number; a: number; b: number } {
  const r = toLinear(c.r), g = toLinear(c.g), bl = toLinear(c.b);
  const l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * bl);
  const m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * bl);
  const s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * bl);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

// ── WCAG 2.2 ─────────────────────────────────────────────────────────────────────────────────────
/** Relative luminance (WCAG 2.x §relativeluminancedef) — linear sRGB under the CIE Y coefficients. */
export const luminance = (c: Rgb): number => 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b);
/** The contrast ratio between two opaque colours, 1–21. Order does not matter. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ── the little parser ────────────────────────────────────────────────────────────────────────────
/** Split on top-level separators only, so `oklch(from var(--x) calc(l + 1) c h)` survives intact. */
function split(s: string, on: "," | " "): string[] {
  const out: string[] = []; let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth === 0 && (on === "," ? ch === "," : /\s/.test(ch))) { if (cur.trim()) out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
/** `name(body)` when the value is exactly one function call, else undefined. */
function fn(v: string): { name: string; body: string } | undefined {
  const m = /^([a-z-]+)\(([\s\S]*)\)$/i.exec(v.trim());
  if (!m) return undefined;
  // Guard against `oklch(1) oklch(2)`, which is two values and not a call: the parens must balance once.
  let depth = 0;
  for (let i = 0; i < m[2]!.length; i++) { const c = m[2]![i]; if (c === "(") depth++; else if (c === ")") { if (depth === 0) return undefined; depth--; } }
  return depth === 0 ? { name: m[1]!.toLowerCase(), body: m[2]! } : undefined;
}

/**
 * A calc() over the channel names a relative colour binds — `calc(l + 0.045)`, `calc(c * 0.5)`. Enough
 * arithmetic for what the syntax is for, and no more: an expression it cannot evaluate is `undefined`,
 * which travels all the way out as "not checked".
 */
function calc(expr: string, env: Record<string, number>): number | undefined {
  const toks = expr.match(/[0-9.]+%?|[a-z]+|[()+\-*/]/gi);
  if (!toks) return undefined;
  let i = 0;
  const peek = () => toks[i];
  const expect = (t: string) => (toks[i] === t ? (i++, true) : false);
  const primary = (): number | undefined => {
    const t = toks[i++];
    if (t === undefined) return undefined;
    if (t === "(") { const v = sum(); return expect(")") ? v : undefined; }
    if (t === "-") { const v = primary(); return v === undefined ? undefined : -v; }
    if (t === "+") return primary();
    if (t.endsWith("%")) return parseFloat(t) / 100;
    if (/^[0-9.]/.test(t)) { const n = parseFloat(t); return Number.isFinite(n) ? n : undefined; }
    return t.toLowerCase() in env ? env[t.toLowerCase()] : undefined;
  };
  const product = (): number | undefined => {
    let v = primary();
    while (v !== undefined && (peek() === "*" || peek() === "/")) {
      const op = toks[i++]; const r = primary();
      if (r === undefined) return undefined;
      v = op === "*" ? v * r : r === 0 ? undefined : v / r;
    }
    return v;
  };
  const sum = (): number | undefined => {
    let v = product();
    while (v !== undefined && (peek() === "+" || peek() === "-")) {
      const op = toks[i++]; const r = product();
      if (r === undefined) return undefined;
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const v = sum();
  return i === toks.length ? v : undefined;
}

/** One component of a colour function: a number, a percentage of `pct`, `none`, a bound channel, or a calc. */
function component(tok: string, env: Record<string, number>, pct: number): number | undefined {
  const t = tok.trim().toLowerCase();
  if (t === "none") return 0;
  if (t in env) return env[t];
  if (t.endsWith("%")) { const n = parseFloat(t); return Number.isFinite(n) ? (n / 100) * pct : undefined; }
  if (/^[+-]?[0-9.]+(deg|rad|turn)?$/.test(t)) {
    const n = parseFloat(t);
    if (!Number.isFinite(n)) return undefined;
    return t.endsWith("rad") ? (n * 180) / Math.PI : t.endsWith("turn") ? n * 360 : n;
  }
  const c = fn(t);
  return c?.name === "calc" ? calc(c.body, env) : undefined;
}

const HEX = /^#([0-9a-f]{3,8})$/i;
function hex(v: string): Rgb | undefined {
  const m = HEX.exec(v.trim());
  if (!m) return undefined;
  let h = m[1]!;
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
  if (h.length !== 6 && h.length !== 8) return undefined;
  // An alpha channel means the rendered colour depends on what is behind it, which this function cannot
  // know. Refused rather than composited against a guess — see the file header.
  if (h.length === 8 && parseInt(h.slice(6), 16) !== 255) return undefined;
  return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 };
}

/** The two sides of a `light-dark()` pair. A value with no pair in it renders the same on both. */
export type Mode = "light" | "dark";
/** Resolve `var(--name)` — the token map, keyed by custom property exactly as `tokensCss` emits it. */
export type Vars = (name: string) => string | undefined;

const MAX_DEPTH = 12;

/**
 * Resolve one CSS colour value to sRGB, on one side of `light-dark()`.
 *
 * `undefined` means *this function does not know*, and never means black. Every caller has to say so.
 */
export function resolveColor(value: string, mode: Mode, vars: Vars = () => undefined, depth = 0): Rgb | undefined {
  if (depth > MAX_DEPTH) return undefined;                    // a var() cycle, which the loader allows and CSS ignores
  const v = String(value).trim();
  if (!v) return undefined;
  const h = hex(v);
  if (h) return h;
  const f = fn(v);
  if (!f) return NAMED[v.toLowerCase()] ? hex(NAMED[v.toLowerCase()]!) : undefined;
  const args = split(f.body, ",");

  if (f.name === "var") {
    const [name, ...fallback] = split(args[0] ?? "", " ");
    const got = vars(name ?? "");
    const next = got ?? (args.length > 1 ? args.slice(1).join(",") : fallback.join(" "));
    return next ? resolveColor(next, mode, vars, depth + 1) : undefined;
  }
  if (f.name === "light-dark") {
    const side = mode === "light" ? args[0] : args[1];
    return side ? resolveColor(side, mode, vars, depth + 1) : undefined;
  }
  if (f.name === "color-mix") {
    // `color-mix(in <space>, A p%, B q%)`. Mixed in OKLab whatever the space says: the difference between
    // interpolation spaces at a 4.5:1 threshold is far below the precision this gate claims, and saying so
    // here is better than pretending to implement six of them.
    const [, a, b] = [args[0], args[1], args[2]];
    if (!a || !b) return undefined;
    const part = (s: string): { c: Rgb; w: number } | undefined => {
      const bits = split(s, " ");
      const pctAt = bits.findIndex((x) => x.endsWith("%"));
      const w = pctAt >= 0 ? parseFloat(bits[pctAt]!) / 100 : NaN;
      const c = resolveColor(bits.filter((_, i) => i !== pctAt).join(" "), mode, vars, depth + 1);
      return c ? { c, w } : undefined;
    };
    const pa = part(a), pb = part(b);
    if (!pa || !pb) return undefined;
    const wa = Number.isNaN(pa.w) ? (Number.isNaN(pb.w) ? 0.5 : 1 - pb.w) : pa.w;
    const la = rgbToOklab(pa.c), lb = rgbToOklab(pb.c), t = clamp(wa);
    return oklabToRgb(la.L * t + lb.L * (1 - t), la.a * t + lb.a * (1 - t), la.b * t + lb.b * (1 - t));
  }
  if (f.name === "rgb" || f.name === "rgba" || f.name === "hsl" || f.name === "hsla") {
    // Both spellings: `rgb(1, 2, 3)` and `rgb(1 2 3)`. An alpha in either — a fourth argument or a
    // `/ <a>` — is refused for the reason an eight-digit hex is: what is behind it is not knowable here.
    const parts = args.length > 1 ? args : split(f.body, " ");
    if (parts.length !== 3) return undefined;
    if (f.name.startsWith("rgb")) {
      const ch = parts.map((t) => component(t, {}, 255));
      if (ch.some((c) => c === undefined)) return undefined;
      return { r: clamp(ch[0]! / 255), g: clamp(ch[1]! / 255), b: clamp(ch[2]! / 255) };
    }
    const hh = component(parts[0]!, {}, 360), s = component(parts[1]!, {}, 100), l = component(parts[2]!, {}, 100);
    if (hh === undefined || s === undefined || l === undefined) return undefined;
    return hslToRgb(((hh % 360) + 360) % 360, clamp(s / 100), clamp(l / 100));
  }
  if (f.name === "oklch" || f.name === "oklab") {
    const bits = split(f.body, " ");
    if (bits.includes("/")) return undefined;
    let env: Record<string, number> = {};
    let rest = bits;
    if (bits[0]?.toLowerCase() === "from") {
      const base = resolveColor(bits[1] ?? "", mode, vars, depth + 1);
      if (!base) return undefined;
      const lab = rgbToOklab(base);
      const C = Math.hypot(lab.a, lab.b);
      const H = C < 1e-6 ? 0 : ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360;
      env = f.name === "oklch" ? { l: lab.L, c: C, h: H } : { l: lab.L, a: lab.a, b: lab.b };
      rest = bits.slice(2);
    }
    if (rest.length < 3) return undefined;
    const L = component(rest[0]!, env, 1);
    if (f.name === "oklch") {
      const C = component(rest[1]!, env, 0.4), H = component(rest[2]!, env, 360);
      if (L === undefined || C === undefined || H === undefined) return undefined;
      const rad = (H * Math.PI) / 180;
      return oklabToRgb(clamp(L), Math.max(0, C) * Math.cos(rad), Math.max(0, C) * Math.sin(rad));
    }
    const A = component(rest[1]!, env, 0.4), B = component(rest[2]!, env, 0.4);
    if (L === undefined || A === undefined || B === undefined) return undefined;
    return oklabToRgb(clamp(L), A, B);
  }
  return undefined;
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: f(0), g: f(8), b: f(4) };
}

/**
 * The handful of CSS named colours a theme might plausibly write for a background or a rule. Not the
 * full 148: a theme that names `lightgoldenrodyellow` gets "not checked", which is the correct answer
 * from a file that would otherwise be a third of a kilobyte of lookup table nothing reads.
 */
const NAMED: Record<string, string> = {
  black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", blue: "#0000ff",
  gray: "#808080", grey: "#808080", silver: "#c0c0c0", navy: "#000080", teal: "#008080",
  orange: "#ffa500", yellow: "#ffff00", purple: "#800080", maroon: "#800000", olive: "#808000",
};

/**
 * Resolve a colour on both sides of `light-dark()` at once — what a contrast gate wants, because a
 * theme that follows the reader has two palettes and both of them have to be readable.
 */
export function resolveBoth(value: string, vars: Vars = () => undefined): { light?: Rgb; dark?: Rgb } {
  return { light: resolveColor(value, "light", vars), dark: resolveColor(value, "dark", vars) };
}

/** `color.viz.node-stroke` → `--color-viz-node-stroke`, exactly as `tokensCss` writes it. */
export const cssVarName = (token: string): string => `--${token.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;

/** A `Vars` over a token map, keyed the way a stylesheet would reach for them. */
export function tokenVars(tokens: Record<string, string | number>): Vars {
  const byVar = new Map<string, string>();
  for (const [k, v] of Object.entries(tokens)) byVar.set(cssVarName(k), String(v));
  return (name) => byVar.get(name.trim());
}
