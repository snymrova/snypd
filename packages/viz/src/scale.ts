/**
 * Scales and ticks — the numeric layer of `viz/chart` (docs/07 S8). No dependencies and no state: a scale
 * is a closure from a domain to pixels; ticks are nice numbers (1 / 2 / 5 × 10ⁿ) inside the domain. The
 * spec owns geometry (decision 3), so every chart type shares these — a theme can restyle a chart but
 * never move a point.
 */

/** 1 / 2 / 5 × 10ⁿ step for a span the axis should cross in about `count` steps. */
export function niceStep(span: number, count = 5): number {
  if (!Number.isFinite(span) || span <= 0) return 1;
  const raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm >= 7.5 ? 10 : norm >= 3 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
}

/** Kill float noise: 0.30000000000000004 → 0.3, and keep the tick label short. */
const clean = (v: number) => +v.toFixed(10);

/** Domain rounded out to whole steps, so both ends of the axis land on a tick. */
export function niceDomain(min: number, max: number, count = 5): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    if (min === 0) return [0, 1];
    return min > 0 ? [0, clean(min * 1.25)] : [clean(min * 1.25), 0];
  }
  const step = niceStep(max - min, count);
  return [clean(Math.floor(min / step) * step), clean(Math.ceil(max / step) * step)];
}

export function ticks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [clean(min)];
  const step = niceStep(max - min, count);
  const out: number[] = [];
  for (let t = Math.ceil(min / step) * step, guard = 0; t <= max + step / 1e6 && guard < 64; t += step, guard++) out.push(clean(t));
  return out;
}

export interface Linear { (v: number): number; domain: [number, number]; range: [number, number] }

/** Value → pixel. `range` may run backwards (screen y), which is how the y axis flips. */
export function linear(domain: [number, number], range: [number, number]): Linear {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  const f = ((v: number) => (span === 0 ? (r0 + r1) / 2 : r0 + ((v - d0) / span) * (r1 - r0))) as Linear;
  f.domain = domain; f.range = range;
  return f;
}

export interface Band { at: (i: number) => number; bandwidth: number; step: number }

/** `n` categories across `range`, `padding` (0–1) of each step left as gutter. */
export function band(n: number, range: [number, number], padding = 0.2): Band {
  const [r0, r1] = range;
  const step = n > 0 ? (r1 - r0) / n : r1 - r0;
  const bandwidth = Math.max(1, step * (1 - padding));
  return { at: (i) => r0 + i * step + (step - bandwidth) / 2, bandwidth, step };
}

/** `n` points across `range`, first and last on the edges (line / area x axis). One point sits centred. */
export function points(n: number, range: [number, number]): (i: number) => number {
  const [r0, r1] = range;
  if (n <= 1) return () => (r0 + r1) / 2;
  return (i) => r0 + (i / (n - 1)) * (r1 - r0);
}
