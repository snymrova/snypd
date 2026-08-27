/**
 * `viz/chart` (docs/07 S8): rows → inline SVG at build time. Five types, no client JS, no D3.
 *
 * Geometry decisions, made once here so every theme inherits them:
 *   - `bar` and `lollipop` are **horizontal** — the category axis is vertical. Charts carry text labels
 *     ("Markdown twin"), and horizontal rows read them left-to-right at full size instead of rotating
 *     ticks 45°, which is both ugly and hostile to assistive tech.
 *   - `line` and `area` are vertical, x = the rows in order, y = the value; `area` always includes 0 in
 *     the domain (it fills to a baseline), `line` does not (it would flatten a narrow trend).
 *   - `donut` has no axis: one slice per positive row, legend to the right carrying value and share.
 *   - Every value label is `font-variant-numeric: tabular-nums`, so digits line up column-wise.
 *   - ≤ 12 points is the spec's intent; more still renders (labels thin out) and returns a warning.
 * The output is deterministic — same rows, same bytes — because the route key hashes the rendered HTML's
 * inputs, not its output: a chart that reformatted itself per run would re-render every page every build.
 */
import { AXIS, GRID, LABEL, TICK, seriesColor } from "./palette";
import { band, linear, niceDomain, points, ticks } from "./scale";
import { arc, clip, el, escape, n, num, path, text, textWidth } from "./svg";

export type ChartType = "bar" | "line" | "area" | "donut" | "lollipop";
export const CHART_TYPES: ChartType[] = ["bar", "line", "area", "donut", "lollipop"];
export const isChartType = (s: unknown): s is ChartType => CHART_TYPES.includes(s as ChartType);

export interface ChartRow { label: string; value: number; series?: string }
export interface ChartInput {
  type: ChartType | string;
  /** Rows, or the parsed YAML body around them (`{ rows: … }` / `{ data: … }`). */
  data: unknown;
  unit?: string;
  /** Says what the chart shows; used as the accessible name when `title` is absent (spec: chart.title). */
  caption?: string;
  title?: string;
  width?: number;
}
export interface ChartResult { svg: string; warnings: string[]; rows: ChartRow[]; series: string[]; type: ChartType }

/** The spec's intent line: one comparison, ≤ 12 points. Past this labels thin out and a warning is raised. */
export const MAX_POINTS = 12;

const FS = { label: 13, tick: 12, value: 13, legend: 12 };
const TABULAR = "font-variant-numeric:tabular-nums";

/**
 * Parsed YAML body → rows. Tolerates the two container shapes an agent writes (`- {label, value}` at the
 * top level, or under `rows:` / `data:`) and numeric strings; anything else is dropped with a warning
 * rather than rendered as a hole. Lint (rule 2) rejects the same shapes earlier, with a fix hint.
 */
export function normalizeRows(data: unknown): { rows: ChartRow[]; warnings: string[] } {
  const warnings: string[] = [];
  let list: unknown = data;
  if (list && !Array.isArray(list) && typeof list === "object") {
    const o = list as Record<string, unknown>;
    list = Array.isArray(o.rows) ? o.rows : Array.isArray(o.data) ? o.data : undefined;
    if (list === undefined) return { rows: [], warnings: ["chart data is an object, not a list of rows"] };
  }
  if (!Array.isArray(list)) return { rows: [], warnings: data === undefined || data === null ? [] : ["chart data is not a list of rows"] };

  const rows: ChartRow[] = [];
  for (const [i, raw] of list.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { warnings.push(`row ${i + 1} is not \`{ label, value }\``); continue; }
    const r = raw as Record<string, unknown>;
    const label = r.label === undefined || r.label === null ? "" : String(r.label);
    const value = typeof r.value === "number" ? r.value : typeof r.value === "string" && r.value.trim() !== "" ? Number(r.value) : NaN;
    if (!label) { warnings.push(`row ${i + 1} has no \`label\``); continue; }
    if (!Number.isFinite(value)) { warnings.push(`row ${i + 1} ("${label}") has no numeric \`value\``); continue; }
    rows.push({ label, value, series: r.series === undefined || r.series === null ? undefined : String(r.series) });
  }
  return { rows, warnings };
}

/** Series in first-appearance order; a chart with no `series` key has one unnamed series. */
const seriesOf = (rows: ChartRow[]): string[] => {
  const out: string[] = [];
  for (const r of rows) { const s = r.series ?? ""; if (!out.includes(s)) out.push(s); }
  return out;
};
/** Category labels in first-appearance order (a series may skip one; the line breaks there). */
const labelsOf = (rows: ChartRow[]): string[] => {
  const out: string[] = [];
  for (const r of rows) if (!out.includes(r.label)) out.push(r.label);
  return out;
};

const valueLabel = (v: number, unit?: string) => (unit ? `${num(v)} ${unit}` : num(v));

/** `<title>`/`<desc>`: the accessible name, then the data in words — the picture read out loud. */
function describe(type: ChartType, rows: ChartRow[], unit?: string): string {
  const shown = rows.slice(0, MAX_POINTS);
  const body = shown.map((r) => `${r.label}${r.series ? ` (${r.series})` : ""} ${valueLabel(r.value, unit)}`).join(", ");
  return `${type} chart. ${body}${rows.length > shown.length ? `, and ${rows.length - shown.length} more` : ""}.`;
}

const legend = (names: string[], x: number, y: number): string => {
  let out = "", cx = x;
  for (const [i, name] of names.entries()) {
    out += el("rect", { x: n(cx), y: n(y - 8), width: 9, height: 9, rx: 1.5, fill: seriesColor(i) });
    out += text(clip(name, 22), { x: n(cx + 14), y: n(y), "font-size": FS.legend, fill: LABEL });
    cx += 14 + textWidth(clip(name, 22), FS.legend) + 16;
  }
  return el("g", {}, out);
};

interface Frame { svg: string; x0: number; x1: number; y0: number; y1: number }

/** Grid + axis + tick labels for the cartesian types. `orient` says which axis carries the values. */
function frame(o: { x0: number; x1: number; y0: number; y1: number; scale: ReturnType<typeof linear>; tickValues: number[]; orient: "x" | "y" }): string {
  let out = "";
  for (const t of o.tickValues) {
    const p = o.scale(t);
    if (o.orient === "x") {
      out += el("line", { x1: n(p), y1: n(o.y0), x2: n(p), y2: n(o.y1), stroke: GRID });
      out += text(num(t), { x: n(p), y: n(o.y1 + 15), "font-size": FS.tick, fill: TICK, "text-anchor": "middle", style: TABULAR });
    } else {
      out += el("line", { x1: n(o.x0), y1: n(p), x2: n(o.x1), y2: n(p), stroke: GRID });
      out += text(num(t), { x: n(o.x0 - 8), y: n(p + 4), "font-size": FS.tick, fill: TICK, "text-anchor": "end", style: TABULAR });
    }
  }
  // the baseline: the value axis' zero if it is inside the domain, otherwise the frame edge
  const [d0, d1] = o.scale.domain;
  const zero = d0 <= 0 && d1 >= 0 ? o.scale(0) : undefined;
  if (o.orient === "x") out += el("line", { x1: n(zero ?? o.x0), y1: n(o.y0), x2: n(zero ?? o.x0), y2: n(o.y1), stroke: AXIS });
  else out += el("line", { x1: n(o.x0), y1: n(zero ?? o.y1), x2: n(o.x1), y2: n(zero ?? o.y1), stroke: AXIS });
  return out;
}

/** bar + lollipop: horizontal rows, category axis down the left. */
function horizontal(type: "bar" | "lollipop", rows: ChartRow[], labels: string[], series: string[], W: number, unit?: string): { body: string; height: number } {
  const grouped = series.length > 1;
  const thickness = grouped ? 12 : 16;
  const rowStep = Math.max(26, series.length * (thickness + 4) + 14);
  const top = grouped ? 30 : 10;
  const plotH = labels.length * rowStep;
  const height = top + plotH + 30;

  const gutter = Math.min(190, Math.max(46, Math.ceil(textWidth(clip(labels.reduce((a, b) => (b.length > a.length ? b : a), ""), 26), FS.label)) + 12));
  const values = rows.map((r) => r.value);
  const domain = niceDomain(Math.min(0, ...values), Math.max(0, ...values));
  // A value label sits beyond the end of its own bar, so both ends of the plot need room for one —
  // on the left only when the data actually goes negative (otherwise the gutter would float).
  const room = (vs: number[]) => (vs.length ? Math.ceil(Math.max(...vs.map((v) => textWidth(valueLabel(v, unit), FS.value)))) + 12 : 0);
  const x0 = gutter + room(values.filter((v) => v < 0));
  const x1 = Math.max(x0 + 40, W - 10 - room(values.filter((v) => v >= 0)));
  const x = linear(domain, [x0, x1]);
  const y = band(labels.length, [top, top + plotH], 0.08);
  const zero = x(domain[0] <= 0 && domain[1] >= 0 ? 0 : domain[0]);

  let out = frame({ x0, x1, y0: top, y1: top + plotH, scale: x, tickValues: ticks(domain[0], domain[1]), orient: "x" });
  if (grouped) out += legend(series, gutter, 14);

  for (const [i, label] of labels.entries()) {
    const bandTop = y.at(i) + (y.bandwidth - series.length * (thickness + 4) + 4) / 2;
    out += text(clip(label, 26), { x: n(gutter - 10), y: n(y.at(i) + y.bandwidth / 2 + 4.5), "font-size": FS.label, fill: LABEL, "text-anchor": "end" });
    for (const [s, name] of series.entries()) {
      const row = rows.find((r) => r.label === label && (r.series ?? "") === name);
      if (!row) continue;
      const px = x(row.value);
      const top_ = bandTop + s * (thickness + 4);
      const mid = top_ + thickness / 2;
      const colour = seriesColor(s);
      if (type === "bar") out += el("rect", { x: n(Math.min(zero, px)), y: n(top_), width: n(Math.abs(px - zero)), height: thickness, fill: colour });
      else {
        out += el("line", { x1: n(zero), y1: n(mid), x2: n(px), y2: n(mid), stroke: colour, "stroke-width": 2 });
        out += el("circle", { cx: n(px), cy: n(mid), r: 4.5, fill: colour });
      }
      const after = px >= zero;
      out += text(valueLabel(row.value, unit), { x: n(px + (after ? 8 : -8)), y: n(mid + 4.5), "font-size": FS.value, fill: LABEL, "text-anchor": after ? "start" : "end", style: TABULAR });
    }
  }
  return { body: out, height };
}

/** line + area: value axis up the left, rows across the bottom in order. */
function vertical(type: "line" | "area", rows: ChartRow[], labels: string[], series: string[], W: number, unit?: string): { body: string; height: number } {
  const height = 320;
  const top = series.length > 1 ? 34 : 14;
  const values = rows.map((r) => r.value);
  const domain = niceDomain(type === "area" ? Math.min(0, ...values) : Math.min(...values), Math.max(0, ...values));
  const tickValues = ticks(domain[0], domain[1]);
  const gutter = Math.ceil(Math.max(...tickValues.map((t) => textWidth(num(t), FS.tick)))) + 16;
  const x0 = gutter, x1 = W - 14, y0 = top, y1 = height - 34;
  const y = linear(domain, [y1, y0]);
  const x = points(labels.length, [x0, x1]);

  let out = frame({ x0, x1, y0, y1, scale: y, tickValues, orient: "y" });
  if (series.length > 1) out += legend(series, gutter, 16);

  // x labels thin out rather than overlap: every k-th, first and last always drawn
  const per = Math.ceil(textWidth(clip(labels.reduce((a, b) => (b.length > a.length ? b : a), ""), 14), FS.tick)) + 10;
  const step = Math.max(1, Math.ceil((labels.length * per) / Math.max(1, x1 - x0)));
  for (const [i, label] of labels.entries()) {
    if (i % step !== 0 && i !== labels.length - 1) continue;
    const anchor = i === 0 && labels.length > 1 ? "start" : i === labels.length - 1 && labels.length > 1 ? "end" : "middle";
    out += text(clip(label, 14), { x: n(x(i)), y: n(y1 + 18), "font-size": FS.tick, fill: TICK, "text-anchor": anchor });
  }

  for (const [s, name] of series.entries()) {
    const colour = seriesColor(s);
    const pts: Array<[number, number]> = [];
    for (const [i, label] of labels.entries()) {
      const row = rows.find((r) => r.label === label && (r.series ?? "") === name);
      if (row) pts.push([x(i), y(row.value)]);
    }
    if (!pts.length) continue;
    if (type === "area") {
      const base = y(domain[0] <= 0 && domain[1] >= 0 ? 0 : domain[0]);
      out += el("path", { d: path([[pts[0]![0], base], ...pts, [pts[pts.length - 1]![0], base]], true), fill: colour, "fill-opacity": series.length > 1 ? 0.16 : 0.22 });
    }
    out += el("path", { d: path(pts), fill: "none", stroke: colour, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" });
    if (pts.length <= MAX_POINTS) for (const [px, py] of pts) out += el("circle", { cx: n(px), cy: n(py), r: 3, fill: colour });
  }
  return { body: out, height };
}

/** donut: one slice per positive row, legend right with value and share. */
function donut(rows: ChartRow[], W: number, unit?: string): { body: string; height: number; warnings: string[] } {
  const warnings: string[] = [];
  const slices = rows.filter((r) => r.value > 0);
  if (slices.length < rows.length) warnings.push("donut shows shares of a whole: rows with a value ≤ 0 are listed but not drawn");
  const total = slices.reduce((a, r) => a + r.value, 0);
  const height = Math.max(300, rows.length * 24 + 40);
  const r = 108, cx = 20 + r, cy = height / 2, rInner = r * 0.62;

  let out = "";
  let a = 0;
  for (const row of slices) {
    const a1 = a + (row.value / total) * Math.PI * 2;
    out += el("path", { d: arc(cx, cy, r, rInner, a, a1), fill: seriesColor(rows.indexOf(row)) });
    a = a1;
  }
  // The legend is a two-column table: labels left, values right-aligned so the digits stack. Its right
  // edge follows the content instead of the canvas, or a short legend leaves a hole across the page.
  const share = (v: number) => (total > 0 && v > 0 ? ` (${num(Math.round((v / total) * 1000) / 10)}%)` : "");
  const lx = cx + r + 28;
  const ly = cy - (rows.length * 22) / 2 + 14;
  const wide = (f: (row: ChartRow) => string, size: number) => Math.ceil(Math.max(...rows.map((row) => textWidth(f(row), size))));
  const right = Math.min(W - 12, lx + 16 + wide((row) => clip(row.label, 22), FS.label) + 28 + wide((row) => valueLabel(row.value, unit) + share(row.value), FS.value));
  for (const [i, row] of rows.entries()) {
    const y = ly + i * 22;
    out += el("rect", { x: n(lx), y: n(y - 9), width: 10, height: 10, rx: 1.5, fill: seriesColor(i) });
    out += text(clip(row.label, 22), { x: n(lx + 16), y: n(y), "font-size": FS.label, fill: LABEL });
    out += text(valueLabel(row.value, unit) + share(row.value), { x: n(right), y: n(y), "font-size": FS.value, fill: LABEL, "text-anchor": "end", style: TABULAR });
  }
  return { body: out, height, warnings };
}

/**
 * Rows → one `<svg>`. Returns `null` when there is nothing to draw, which is the theme's signal to render
 * the spec's declared fallback (a table of the data) instead of an empty picture.
 */
export function renderChart(input: ChartInput): ChartResult | null {
  const { rows, warnings } = normalizeRows(input.data);
  const type: ChartType = isChartType(input.type) ? input.type : "bar";
  if (!isChartType(input.type)) warnings.push(`unknown chart type "${String(input.type)}"; drawn as a bar chart`);
  if (!rows.length) return null;
  if (rows.length > MAX_POINTS) warnings.push(`${rows.length} points; the spec's intent is ≤ ${MAX_POINTS} — the picture is the point, the table is in the twin`);

  const W = input.width ?? 640;
  const series = seriesOf(rows);
  const labels = labelsOf(rows);
  if (type === "donut" && series.length > 1) warnings.push("donut has no series axis: every row is a slice");

  let body: string, height: number;
  if (type === "bar" || type === "lollipop") ({ body, height } = horizontal(type, rows, labels, series, W, input.unit));
  else if (type === "line" || type === "area") ({ body, height } = vertical(type, rows, labels, series, W, input.unit));
  else { const d = donut(rows, W, input.unit); body = d.body; height = d.height; warnings.push(...d.warnings); }

  const name = input.title ?? input.caption ?? `${type} chart`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Math.round(height)}" width="${W}" height="${Math.round(height)}"` +
    ` class="snypd-chart-svg" data-chart="${type}" role="img" style="max-width:100%;height:auto">` +
    `<title>${escape(name)}</title><desc>${escape(describe(type, rows, input.unit))}</desc>${body}</svg>`;
  return { svg, warnings, rows, series, type };
}
