import { describe, expect, test } from "bun:test";
import { renderChart, normalizeRows, CHART_TYPES, MAX_POINTS, type ChartRow } from "./index";
import { band, linear, niceDomain, niceStep, points, ticks } from "./scale";
import { arc, clip, n, num, path } from "./svg";

const rows = (...vs: number[]): ChartRow[] => vs.map((v, i) => ({ label: `r${i}`, value: v }));
const svgOf = (o: Parameters<typeof renderChart>[0]) => renderChart(o)!.svg;
const kb = (s: string) => Buffer.byteLength(s) / 1024;
/** spec: chart.budget.svgKb */
const SVG_KB = 12;

describe("scale", () => {
  test("nice steps are 1 / 2 / 5 × 10ⁿ", () => {
    expect([1, 3, 7, 12, 60, 900, 0.03].map((s) => niceStep(s, 5))).toEqual([0.2, 0.5, 1, 2, 10, 200, 0.005]);
    expect(niceStep(0)).toBe(1);
    expect(niceStep(-4)).toBe(1);
  });
  test("domains round out to whole steps and never collapse", () => {
    expect(niceDomain(0, 6120)).toEqual([0, 7000]);
    expect(niceDomain(-38, 12)).toEqual([-40, 20]);
    expect(niceDomain(0, 0)).toEqual([0, 1]);
    expect(niceDomain(7, 7)).toEqual([0, 8.75]);
    expect(niceDomain(-7, -7)).toEqual([-8.75, 0]);
    expect(niceDomain(NaN, 3)).toEqual([0, 1]);
  });
  test("ticks stay inside the domain and carry no float noise", () => {
    expect(ticks(0, 100)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(ticks(0, 0.3)).toEqual([0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3]);
    expect(ticks(-40, 20)).toEqual([-40, -30, -20, -10, 0, 10, 20]);
    expect(ticks(5, 5)).toEqual([5]);
  });
  test("linear maps both directions, band and point place categories", () => {
    const y = linear([0, 10], [100, 0]);   // screen y runs backwards
    expect([y(0), y(5), y(10)]).toEqual([100, 50, 0]);
    expect(linear([2, 2], [0, 40])(2)).toBe(20);   // degenerate domain sits centred, never NaN
    const b = band(4, [0, 400], 0.2);
    expect([b.step, b.bandwidth, b.at(0), b.at(3)]).toEqual([100, 80, 10, 310]);
    expect([points(3, [0, 90])(0), points(3, [0, 90])(2), points(1, [0, 90])(0)]).toEqual([0, 90, 45]);
  });
});

describe("svg", () => {
  test("numbers are short, fixed-locale and never -0", () => {
    expect([n(1.006), n(-0.001), n(12), n(NaN)]).toEqual(["1.01", "0", "12", "0"]);
    expect([num(6120), num(45.83), num(-4), num(NaN)]).toEqual(["6,120", "45.83", "-4", "—"]);
  });
  test("paths and arcs close, clip keeps the ellipsis inside the budget", () => {
    expect(path([[0, 0], [1.5, 2]], true)).toBe("M0 0L1.5 2Z");
    expect(path([])).toBe("");
    expect(arc(0, 0, 10, 5, 0, Math.PI / 2)).toContain("A10 10 0 0 1");
    expect(arc(0, 0, 10, 5, 0, Math.PI * 2).match(/A10 10/g)!.length).toBe(2);   // a full circle is two arcs
    expect(clip("abcdef", 4)).toBe("abc…");
    expect(clip("abc", 4)).toBe("abc");
  });
});

describe("normalizeRows", () => {
  test("takes the shapes an agent writes, warns about the rest", () => {
    expect(normalizeRows([{ label: "a", value: 1 }]).rows).toEqual([{ label: "a", value: 1, series: undefined }]);
    expect(normalizeRows({ rows: [{ label: "a", value: "2" }] }).rows[0]!.value).toBe(2);
    expect(normalizeRows({ data: [{ label: "a", value: 3 }] }).rows.length).toBe(1);
    expect(normalizeRows([{ label: 2026, value: 1 }]).rows[0]!.label).toBe("2026");
    expect(normalizeRows(undefined)).toEqual({ rows: [], warnings: [] });
    expect(normalizeRows({ totals: 1 }).warnings[0]).toContain("not a list of rows");
    const bad = normalizeRows([{ label: "a" }, 12, { value: 3 }, { label: "b", value: "x" }]);
    expect(bad.rows).toEqual([]);
    expect(bad.warnings.length).toBe(4);
  });
});

describe("renderChart", () => {
  test("every type renders one accessible svg inside the byte budget", () => {
    for (const type of CHART_TYPES) {
      const r = renderChart({ type, data: rows(6120, 504, 1180, 260), unit: "tokens", caption: "Tokens per page" })!;
      expect(r.type).toBe(type);
      expect(r.warnings).toEqual([]);
      expect(r.svg.startsWith("<svg ") && r.svg.endsWith("</svg>")).toBe(true);
      expect(r.svg).toContain('role="img"');
      expect(r.svg).toContain("<title>Tokens per page</title>");
      expect(r.svg).toContain(`<desc>${type} chart. r0 6,120 tokens,`);
      expect(r.svg).toContain(`data-chart="${type}"`);
      expect(r.svg).toContain('style="max-width:100%;height:auto"');   // responsive with zero CSS
      expect(kb(r.svg)).toBeLessThan(SVG_KB);
    }
  });
  test("12 points of long labels — the worst shape the spec allows — stays inside the budget", () => {
    for (const type of CHART_TYPES) {
      const long = Array.from({ length: MAX_POINTS }, (_, i) => ({ label: `a fairly long category label ${i}`, value: 1234.56 * (i + 1) }));
      expect(kb(svgOf({ type, data: long, unit: "milliseconds" }))).toBeLessThan(SVG_KB);
    }
  });
  test("same rows, same bytes — the route key hashes inputs, so a chart may not drift per run", () => {
    const input = { type: "bar" as const, data: rows(1, 2, 3), unit: "ms", caption: "c" };
    expect(svgOf(input)).toBe(svgOf(structuredClone(input)));
    expect(svgOf(input)).toBe(svgOf({ ...input, data: JSON.parse(JSON.stringify(input.data)) }));
  });
  test("every paint is a token with a literal fallback, so a theme with no CSS still draws", () => {
    for (const type of CHART_TYPES) {
      const svg = svgOf({ type, data: rows(3, -1, 2), unit: "ms" });
      for (const m of svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)) {
        if (m[1] === "none") continue;
        expect(m[1]).toMatch(/^var\(--color-viz-[\w-]+, .+\)$/);
      }
    }
  });
  test("nothing drawable → null, which is the theme's signal to fall back to the table", () => {
    expect(renderChart({ type: "bar", data: [] })).toBeNull();
    expect(renderChart({ type: "bar", data: undefined })).toBeNull();
    expect(renderChart({ type: "bar", data: [{ label: "a" }] })).toBeNull();
  });
  test("degenerate data renders rather than throwing", () => {
    for (const type of CHART_TYPES) {
      expect(svgOf({ type, data: rows(5) })).toContain("<svg ");            // one point
      expect(svgOf({ type, data: rows(0, 0, 0) })).toContain("<svg ");      // no spread at all
      expect(svgOf({ type, data: rows(7, 7, 7) })).toContain("<svg ");      // flat series
      expect(svgOf({ type, data: rows(1e9, 0.001) })).toContain("<svg ");   // nine orders of magnitude
    }
    expect(svgOf({ type: "nope", data: rows(1, 2) })).toContain('data-chart="bar"');
    expect(renderChart({ type: "nope", data: rows(1, 2) })!.warnings[0]).toContain('unknown chart type "nope"');
  });
  test("bar geometry: bars are proportional and negatives cross the zero line", () => {
    const svg = svgOf({ type: "bar", data: rows(100, 50, -50) });
    const rects = [...svg.matchAll(/<rect x="([\d.-]+)"[^>]*width="([\d.-]+)"/g)].map((m) => [+m[1]!, +m[2]!]);
    expect(rects.length).toBe(3);
    expect(rects[0]![1] / rects[1]![1]).toBeCloseTo(2, 5);                        // 100 is twice 50
    expect(rects[1]![1]).toBeCloseTo(rects[2]![1], 5);                            // |−50| is drawn like 50
    expect(rects[2]![0] + rects[2]![1]).toBeCloseTo(rects[0]![0], 5);             // −50 ends where 0 starts
    expect(svgOf({ type: "bar", data: rows(1, 2) })).not.toContain("stroke-width");   // bars are fills, not strokes
  });
  test("a series column groups bars and adds a legend; the labels stay one per category", () => {
    const r = renderChart({ type: "bar", unit: "ms", data: [
      { label: "cold", value: 699, series: "S6" }, { label: "cold", value: 3414, series: "S7" },
      { label: "warm", value: 14, series: "S6" }, { label: "warm", value: 45.8, series: "S7" },
    ] })!;
    expect(r.series).toEqual(["S6", "S7"]);
    expect([...r.svg.matchAll(/<rect /g)].length).toBe(6);                       // 4 bars + 2 legend swatches
    expect([...r.svg.matchAll(/>cold</g)].length).toBe(1);
    expect(r.svg).toContain(">S6<");
    expect(r.svg).toContain("var(--color-viz-2,");                                // the second series takes the second colour
  });
  test("line breaks where a series has no row for a category; area fills to the baseline", () => {
    const line = svgOf({ type: "line", data: [
      { label: "a", value: 1, series: "x" }, { label: "b", value: 2, series: "x" },
      { label: "a", value: 3, series: "y" },
    ] });
    const ds = [...line.matchAll(/<path d="M([^"]+)"/g)].map((m) => m[1]!);
    expect(ds.length).toBe(2);
    expect(ds[1]!.includes("L")).toBe(false);                                     // series y has one point, no segment
    expect(svgOf({ type: "area", data: rows(1, 2) })).toContain("fill-opacity");
    expect(svgOf({ type: "line", data: rows(1, 2) })).not.toContain("fill-opacity");
  });
  test("donut: one slice per positive row, shares in the legend, ≤ 0 listed but not drawn", () => {
    const r = renderChart({ type: "donut", unit: "ms", data: [
      { label: "parse", value: 450 }, { label: "render", value: 50 }, { label: "gone", value: 0 },
    ] })!;
    expect([...r.svg.matchAll(/<path /g)].length).toBe(2);
    expect(r.svg).toContain("450 ms (90%)");
    expect(r.svg).toContain("50 ms (10%)");
    expect(r.svg).toContain(">gone<");
    expect(r.warnings[0]).toContain("not drawn");
    expect(renderChart({ type: "donut", data: [{ label: "a", value: 1 }] })!.svg.match(/A\d/g)!.length).toBe(4);   // one full circle = two arcs × 2 radii
    expect(renderChart({ type: "donut", data: [{ label: "a", value: 1, series: "s" }, { label: "b", value: 1, series: "t" }] })!.warnings[0]).toContain("no series axis");
  });
  test("past the spec's intent the chart still renders, thins its labels and says so", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ label: `point ${i}`, value: i }));
    const r = renderChart({ type: "line", data: many })!;
    expect(r.warnings[0]).toContain(`40 points; the spec's intent is ≤ ${MAX_POINTS}`);
    expect([...r.svg.matchAll(/>point \d+</g)].length).toBeLessThan(many.length);
    expect(r.svg).not.toContain("<circle");                                       // dots would be a smear at 40 points
    expect(kb(r.svg)).toBeLessThan(SVG_KB);
  });
  test("labels and captions are escaped, not injected", () => {
    const r = renderChart({ type: "bar", data: [{ label: '<script>&"', value: 1 }], caption: "<b>c</b>" })!;
    expect(r.svg).not.toContain("<script");
    expect(r.svg).toContain("&lt;script&gt;&amp;&quot;");
    expect(r.svg).toContain("<title>&lt;b&gt;c&lt;/b&gt;</title>");
  });
});
