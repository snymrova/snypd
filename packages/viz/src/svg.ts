/**
 * SVG string plumbing: escaping, short numbers, elements. Charts are strings, not a DOM — the same
 * reason themes are string-JSX (decision 14). Coordinates are rounded to 2 decimals because the byte
 * budget (12 KB / chart) is spent mostly on digits.
 */
const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escape = (s: string) => String(s).replace(/[&<>"']/g, (c) => ESC[c]!);

/** Coordinate → shortest form: 2 decimals, no trailing zeros, no "-0". */
export function n(v: number): string {
  if (!Number.isFinite(v)) return "0";
  const s = (Math.round(v * 100) / 100).toString();
  return s === "-0" ? "0" : s;
}

/** Data value → label. Fixed locale, so the same rows always produce the same bytes (the route key). */
const FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
export function num(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return FMT.format(v);
}

export type Attrs = Record<string, string | number | undefined | false>;

export function attrs(a: Attrs): string {
  let s = "";
  for (const [k, v] of Object.entries(a)) {
    if (v === undefined || v === false || v === "") continue;
    s += ` ${k}="${escape(String(v))}"`;
  }
  return s;
}

export const el = (tag: string, a: Attrs, body?: string) =>
  body === undefined ? `<${tag}${attrs(a)}/>` : `<${tag}${attrs(a)}>${body}</${tag}>`;

export const text = (s: string, a: Attrs) => el("text", a, escape(s));

/** Path from points, `M x y L x y …`; `close` adds Z. */
export function path(pts: Array<[number, number]>, close = false): string {
  if (!pts.length) return "";
  let d = `M${n(pts[0]![0])} ${n(pts[0]![1])}`;
  for (let i = 1; i < pts.length; i++) d += `L${n(pts[i]![0])} ${n(pts[i]![1])}`;
  return close ? d + "Z" : d;
}

/** Donut slice: an annular sector from `a0` to `a1` radians, clockwise from 12 o'clock. */
export function arc(cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number): string {
  const full = a1 - a0 >= Math.PI * 2 - 1e-9;
  if (full) {   // one slice covering the whole circle: two half arcs, or the path collapses
    const half = a0 + Math.PI;
    return arc(cx, cy, rOuter, rInner, a0, half) + arc(cx, cy, rOuter, rInner, half, a0 + Math.PI * 2);
  }
  const p = (r: number, a: number): [number, number] => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = p(rOuter, a0), [x1, y1] = p(rOuter, a1);
  const [x2, y2] = p(rInner, a1), [x3, y3] = p(rInner, a0);
  return `M${n(x0)} ${n(y0)}A${n(rOuter)} ${n(rOuter)} 0 ${large} 1 ${n(x1)} ${n(y1)}` +
         `L${n(x2)} ${n(y2)}A${n(rInner)} ${n(rInner)} 0 ${large} 0 ${n(x3)} ${n(y3)}Z`;
}

/** Longest label wins the gutter; 7px per character at 13px type is close enough for a monospace-free guess. */
export const textWidth = (s: string, size = 13) => s.length * size * 0.55;

/** Labels are truncated to keep the gutter sane; the full data is in the caption, the twin and the JSON. */
export function clip(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, Math.max(1, max - 1)).trimEnd() + "…";
}
