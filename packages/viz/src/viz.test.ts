import { describe, expect, test } from "bun:test";
import { renderChart, normalizeRows, renderDiagram, normalizeGraph, renderFlow, desugarFlow, layoutGraph, CHART_TYPES, MAX_POINTS, MAX_NODES, type ChartRow, type LayoutItem } from "./index";
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


// ---- S9: diagram ---------------------------------------------------------------------------------

/** spec: diagram.budget.svgKb */
const DIAGRAM_KB = 25;
const box = (id: string): LayoutItem => ({ id, rankSize: 80, crossSize: 34 });
const graph = (nodes: string[], edges: Array<[string, string]>) =>
  ({ nodes: nodes.map((id) => ({ id, label: id })), edges: edges.map(([from, to]) => ({ from, to })) });
const chain = (n: number) => graph(Array.from({ length: n }, (_, i) => `n${i}`), Array.from({ length: n - 1 }, (_, i) => [`n${i}`, `n${i + 1}`] as [string, string]));

describe("layout", () => {
  test("ranks follow the longest path, not the first one found", () => {
    const r = layoutGraph(["a", "b", "c", "d"].map(box), [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "a", to: "c" }, { from: "c", to: "d" }]);
    expect([...r.placed.values()].map((p) => p.rank)).toEqual([0, 1, 2, 3]);   // a→c does not pull c up to rank 1
    expect(r.ranks).toBe(4);
  });
  test("a cycle is broken, not dropped: every node still gets its own rank", () => {
    const r = layoutGraph(["a", "b", "c"].map(box), [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "a" }]);
    expect([...r.placed.values()].map((p) => p.rank)).toEqual([0, 1, 2]);
    expect(r.edges.filter((e) => e.reversed).map((e) => `${e.from}>${e.to}`)).toEqual(["c>a"]);
  });
  test("an edge that skips ranks is routed through a dummy per rank it crosses", () => {
    const r = layoutGraph(["a", "b", "c", "d"].map(box), [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "d" }, { from: "a", to: "d" }]);
    const long = r.edges.find((e) => e.from === "a" && e.to === "d")!;
    expect(long.via.length).toBe(2);                                          // ranks 1 and 2
    expect(long.via.map((p) => p.u)).toEqual([...long.via].sort((x, y) => x.u - y.u).map((p) => p.u));
    expect(r.edges.find((e) => e.from === "a" && e.to === "b")!.via).toEqual([]);
  });
  test("nodes sharing a rank never overlap, and self-loops are ignored", () => {
    const r = layoutGraph(["a", "b", "c", "d"].map(box), [{ from: "a", to: "b" }, { from: "a", to: "c" }, { from: "a", to: "d" }, { from: "b", to: "b" }]);
    const same = ["b", "c", "d"].map((id) => r.placed.get(id)!.v).sort((x, y) => x - y);
    for (let i = 1; i < same.length; i++) expect(same[i]! - same[i - 1]!).toBeGreaterThanOrEqual(34);
    expect(r.edges.some((e) => e.from === "b" && e.to === "b")).toBe(false);
  });
  test("an empty graph lays out to nothing rather than throwing", () => {
    expect(layoutGraph([], [])).toEqual({ placed: new Map(), edges: [], ranks: 0, uSize: 0, vSize: 0 });
  });
});

describe("normalizeGraph", () => {
  test("takes the shapes an agent writes, warns about the rest", () => {
    expect(normalizeGraph({ nodes: ["md", "build"] }).nodes).toEqual([{ id: "md", label: "md", kind: "box" }, { id: "build", label: "build", kind: "box" }]);
    expect(normalizeGraph({ nodes: [{ id: "a", label: "A", kind: "pill" }] }).nodes[0]!.kind).toBe("pill");
    expect(normalizeGraph({ nodes: [{ id: "a", kind: "hexagon" }] }).warnings[0]).toContain("drawn as a box");
    expect(normalizeGraph({ nodes: [{ id: "a" }, { id: "a" }] }).warnings[0]).toContain("declared twice");
    expect(normalizeGraph([{ id: "a" }]).warnings[0]).toContain("not `nodes:` and `edges:`");
    expect(normalizeGraph({ edges: [] }).warnings[0]).toContain("no `nodes:` list");
  });
  test("an edge to a node that does not exist is dropped and named", () => {
    const g = normalizeGraph({ nodes: [{ id: "a" }, { id: "b" }], edges: [{ from: "a", to: "b" }, { from: "a", to: "ghost" }, { from: "a", to: "a" }, { to: "b" }] });
    expect(g.edges).toEqual([{ from: "a", to: "b", label: undefined }]);
    expect(g.warnings.join(" ")).toContain("`ghost`, which is not a node");
    expect(g.warnings.join(" ")).toContain("at itself");
    expect(g.warnings.join(" ")).toContain("needs both");
  });
});

describe("renderDiagram", () => {
  test("nothing drawable → null, which is the theme's signal to fall back to the edge list", () => {
    expect(renderDiagram({ data: undefined })).toBe(null);
    expect(renderDiagram({ data: { edges: [{ from: "a", to: "b" }] } })).toBe(null);
    expect(renderDiagram({ data: { nodes: [] } })).toBe(null);
  });
  test("one box and one arrowhead per node and edge, and the caption is the accessible name", () => {
    const r = renderDiagram({ data: graph(["a", "b", "c"], [["a", "b"], ["b", "c"]]), caption: "How a post becomes a page" })!;
    expect([...r.svg.matchAll(/<rect /g)].length).toBe(3);
    expect([...r.svg.matchAll(/<path /g)].length).toBe(4);                     // two runs + two heads
    expect(r.svg).toContain("<title>How a post becomes a page</title>");
    expect(r.svg).toContain("<desc>Diagram, 3 nodes, 2 connections. a to b; b to c.</desc>");
    expect(r.warnings).toEqual([]);
  });
  test("direction turns the ranks without a second code path", () => {
    const wide = renderDiagram({ data: chain(4), direction: "lr" })!.svg.match(/viewBox="0 0 (\d+) (\d+)"/)!;
    const tall = renderDiagram({ data: chain(4), direction: "tb" })!.svg.match(/viewBox="0 0 (\d+) (\d+)"/)!;
    expect(+wide[1]!).toBeGreaterThan(+wide[2]!);
    expect(+tall[2]!).toBeGreaterThan(+tall[1]!);
    expect(renderDiagram({ data: chain(2), direction: "sideways" })!.warnings[0]).toContain("laid out left to right");
  });
  test("edges leaving one box fan out instead of stacking on one pixel", () => {
    const r = renderDiagram({ data: graph(["a", "b", "c", "d"], [["a", "b"], ["a", "c"], ["a", "d"]]) })!;
    const starts = [...r.svg.matchAll(/<path d="M(-?[\d.]+) (-?[\d.]+)/g)].slice(0, 3).map((m) => m[2]);
    expect(new Set(starts).size).toBe(3);
  });
  test("kind changes the corner, never the geometry", () => {
    const rx = (kind: string) => renderDiagram({ data: { nodes: [{ id: "a", label: "a", kind }] } })!.svg.match(/rx="([\d.]+)"/)![1];
    expect([rx("box"), rx("rounded"), rx("pill")]).toEqual(["2", "8", "18.5"]);   // pill = half the box height
  });
  test("the same graph renders the same bytes twice — a route key depends on it", () => {
    const once = renderDiagram({ data: chain(6), caption: "c" })!.svg;
    const twice = renderDiagram({ data: chain(6), caption: "c" })!.svg;
    expect(twice).toBe(once);
  });
  test("the layout cache keys on geometry, so the same shape with other words still says the other words", () => {
    const a = renderDiagram({ data: graph(["x", "y"], [["x", "y"]]) })!.svg;
    const b = renderDiagram({ data: { nodes: [{ id: "x", label: "one" }, { id: "y", label: "two" }], edges: [{ from: "x", to: "y" }] } })!.svg;
    expect(b).toContain(">one<");
    expect(b).not.toContain(">x<");
    expect(b.match(/viewBox="[^"]+"/)![0]).toBe(a.match(/viewBox="[^"]+"/)![0]);
  });
  test("at the spec's cap it still fits the byte budget; past the cap it draws and says so", () => {
    const at = renderDiagram({ data: chain(MAX_NODES), caption: "the cap" })!;
    expect(at.warnings).toEqual([]);
    expect(kb(at.svg)).toBeLessThan(DIAGRAM_KB);
    const over = renderDiagram({ data: chain(MAX_NODES + 8) })!;
    expect(over.warnings[0]).toContain(`the spec's cap is ${MAX_NODES}`);
  });
  test("labels and captions are escaped, not injected", () => {
    const r = renderDiagram({ data: { nodes: [{ id: "a", label: '<script>&"' }, { id: "b", label: "b" }], edges: [{ from: "a", to: "b", label: "<i>" }] }, caption: "<b>c</b>" })!;
    expect(r.svg).not.toContain("<script");
    expect(r.svg).toContain("&lt;script&gt;&amp;&quot;");
    expect(r.svg).toContain("<title>&lt;b&gt;c&lt;/b&gt;</title>");
    expect(r.svg).toContain("&lt;i&gt;");
  });
});

/** The picture as a reader would read it: `label --edge label--> label`, in emission order. */
const arrows = (data: unknown): string[] => {
  const g = desugarFlow(data);
  const label = new Map(g.nodes.map((x) => [x.id, x.label]));
  return g.edges.map((e) => `${label.get(e.from)} -${e.label ? `${e.label}-` : ""}> ${label.get(e.to)}`);
};

describe("desugarFlow", () => {
  test("a list of strings is a chain, and every step is a rounded box", () => {
    const g = desugarFlow({ steps: ["one", "two", "three"] });
    expect(g.nodes.map((x) => x.label)).toEqual(["one", "two", "three"]);
    expect(new Set(g.nodes.map((x) => x.kind))).toEqual(new Set(["rounded"]));
    expect(arrows({ steps: ["one", "two", "three"] })).toEqual(["one -> two", "two -> three"]);
    expect(g.warnings).toEqual([]);
  });
  test("a decision is a diamond whose branches rejoin the next step", () => {
    expect(arrows({ steps: ["a", { ask: "ok?", yes: "b", no: "c" }, "d"] }))
      .toEqual(["a -> ok?", "ok? -yes-> b", "b -> d", "ok? -no-> c", "c -> d"]);
    expect(desugarFlow({ steps: [{ ask: "ok?" }] }).nodes[0]!.kind).toBe("diamond");
  });
  test("a branch with no steps carries straight on, labelled", () => {
    expect(arrows({ steps: [{ ask: "ok?", no: "fix it" }, "ship"] }))
      .toEqual(["ok? -yes-> ship", "ok? -no-> fix it", "fix it -> ship"]);
  });
  test("a nested list runs in order and rejoins once, at the end", () => {
    expect(arrows({ steps: [{ ask: "ok?", yes: ["log", "tag"] }, "ship"] }))
      .toEqual(["ok? -yes-> log", "log -> tag", "tag -> ship", "ok? -no-> ship"]);
  });
  test("the spec's own example: a forward `then:` lands out of line, and the straight path steps over it", () => {
    // docs: snypd://spec/primitives/flow. Without decision 19 the `yes` branch would fall into "fix" on
    // its way past — the one thing the picture must not say.
    const spec = { steps: [
      "Draft on branch", "Run lint",
      { ask: "Lint clean?", yes: "Open preview", no: { then: "fix" } },
      { id: "fix", do: "Fix and re-lint" },
      "Human approves",
    ] };
    expect(arrows(spec)).toEqual([
      "Draft on branch -> Run lint",
      "Run lint -> Lint clean?",
      "Lint clean? -yes-> Open preview",
      "Open preview -> Human approves",
      "Lint clean? -no-> Fix and re-lint",
      "Fix and re-lint -> Human approves",
    ]);
  });
  test("a `then:` back to an earlier step is a loop, and that step stays on the straight path", () => {
    const retry = { steps: [{ id: "lint", do: "Run lint" }, { ask: "clean?", no: { then: "lint" } }, "Ship"] };
    expect(arrows(retry)).toEqual(["Run lint -> clean?", "clean? -yes-> Ship", "clean? -no-> Run lint"]);
    expect(renderFlow({ data: retry })!.warnings).toEqual([]);   // the cycle is broken by the layout, not rejected
  });
  test("a jump in the straight list sends the path there instead of onwards", () => {
    expect(arrows({ steps: [{ id: "top", do: "Start" }, "Work", { then: "top" }] }))
      .toEqual(["Start -> Work", "Work -> Start"]);
  });
  test("what an agent gets wrong is dropped and named, never drawn as something else", () => {
    expect(desugarFlow({ steps: [{ then: "ghost" }, "a"] }).warnings[0]).toContain("`ghost`, which is not a step id");
    expect(desugarFlow({ steps: [[1, 2]] }).warnings[0]).toContain("not a step, a decision or a jump");
    expect(desugarFlow({ steps: [{ id: "a", do: "A" }, { id: "a", do: "B" }] }).warnings[0]).toContain("twice");
    expect(desugarFlow({ steps: [{ id: "a" }] }).warnings[0]).toContain("no `do:`");
    expect(desugarFlow({ steps: [{ do: "A", when: "later" }] }).warnings[0]).toContain("no key `when`");
    expect(desugarFlow({ steps: "later" }).warnings[0]).toContain("no `steps:` list");
    expect(desugarFlow([{ do: "A" }]).warnings[0]).toContain("not `steps:`");
    expect(desugarFlow(undefined).warnings).toEqual([]);        // an absent body is the theme's fallback, not a complaint
  });
  test("a generated id never lands on one the author wrote", () => {
    const g = desugarFlow({ steps: ["a", { id: "%1", do: "b" }, "c"] });
    expect(new Set(g.nodes.map((x) => x.id)).size).toBe(3);
    expect(g.nodes.map((x) => x.label)).toEqual(["a", "b", "c"]);
  });
});

describe("renderFlow", () => {
  test("nothing drawable → null, which is the theme's signal to fall back to the step list", () => {
    expect(renderFlow({ data: undefined })).toBe(null);
    expect(renderFlow({ data: { steps: [] } })).toBe(null);
    expect(renderFlow({ data: { nope: 1 } })).toBe(null);
  });
  test("top to bottom by default (spec), and the caption is the accessible name", () => {
    const r = renderFlow({ data: { steps: ["one", { ask: "ok?", yes: "yes", no: "no" }] }, caption: "How a draft ships" })!;
    expect(r.direction).toBe("tb");
    expect(r.svg).toContain('class="snypd-flow-svg" data-direction="tb"');
    expect(r.svg).toContain("<title>How a draft ships</title>");
    expect(r.svg).toContain("<desc>Flowchart, 3 steps and 1 decision.");
    expect(renderFlow({ data: { steps: ["a", "b"] }, direction: "sideways" })!.warnings[0]).toContain("top to bottom");
    const wide = renderFlow({ data: { steps: ["a", "b", "c"] }, direction: "lr" })!.svg.match(/viewBox="0 0 (\d+) (\d+)"/)!;
    expect(+wide[1]!).toBeGreaterThan(+wide[2]!);
  });
  test("a decision is a rhombus, a step is a rounded rect — a reader can tell them apart", () => {
    const r = renderFlow({ data: { steps: ["run it", { ask: "clean?", yes: "ship", no: "fix" }] } })!;
    expect([...r.svg.matchAll(/<rect [^>]*rx="8"/g)].length).toBe(3);
    expect([...r.svg.matchAll(/<path d="M[\d.]+ [\d.]+(?:L[\d.]+ [\d.]+){3}Z"\/>/g)].length).toBe(1);   // four corners: an arrowhead has three
  });
  test("the same flow renders the same bytes twice — a route key depends on it", () => {
    const data = { steps: ["a", { ask: "ok?", yes: "b", no: { then: "c" } }, { id: "c", do: "C" }, "d"] };
    expect(renderFlow({ data, caption: "c" })!.svg).toBe(renderFlow({ data, caption: "c" })!.svg);
  });
  test("at the spec's cap it fits the byte budget; past it it draws and says so", () => {
    /** Each round is three nodes: a step, the decision after it and the fix its `no` branch runs. */
    const rounds = (k: number) => Array.from({ length: k }, (_, i) => [`step number ${i} of the pipeline`, { ask: `is ${i} ok?`, no: `fix ${i}` }]).flat();
    const steps = rounds(16);
    const at = renderFlow({ data: { steps: rounds(13) }, caption: "the cap" })!;   // 13 × 3 = 39, one under the cap
    expect(at.nodes.length).toBeLessThanOrEqual(MAX_NODES);
    expect(at.warnings).toEqual([]);
    expect(kb(at.svg)).toBeLessThan(DIAGRAM_KB);   // spec: flow.budget.svgKb, the same 25 KB
    expect(renderFlow({ data: { steps } })!.warnings[0]).toContain(`the spec's cap is ${MAX_NODES}`);
  });
  test("labels and captions are escaped, not injected", () => {
    const r = renderFlow({ data: { steps: ['<script>&"', { ask: "<i>", yes: "ok" }] }, caption: "<b>c</b>" })!;
    expect(r.svg).not.toContain("<script");
    expect(r.svg).toContain("&lt;script&gt;&amp;&quot;");
    expect(r.svg).toContain("<title>&lt;b&gt;c&lt;/b&gt;</title>");
  });
});
