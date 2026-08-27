/**
 * `viz/diagram` (docs/07 S9): a nodes-and-edges body → inline SVG at build time. No client JS, no Mermaid.
 *
 * Geometry decisions, made once here so every theme inherits them (decision 17):
 *   - Layers come from `layout.ts` (Sugiyama). `direction: lr` runs the ranks left → right, `tb` top →
 *     bottom; nothing else moves a box, and a theme cannot.
 *   - Edges are **orthogonal-ish**: they leave along the rank axis, turn once at the midpoint between the
 *     two ranks, and arrive along the rank axis again, with the corners rounded. A long edge turns at each
 *     dummy it was routed through instead of cutting diagonally across the layer it crosses.
 *   - Arrowheads are drawn as triangles, not `<marker>`s: two diagrams on one page would collide over a
 *     shared marker id, and a marker cannot take the edge's colour without `context-stroke`.
 *   - An edge that closes a cycle is reversed for layout and drawn with its arrow back on the real target,
 *     so a feedback loop reads correctly and still layers.
 *   - An edge label rides the longest straight run of its own edge, haloed in `Canvas` (the page's own
 *     background in both light and dark), because three edges can share one gap and there is no offset
 *     that clears them all.
 *   - ≤ 40 nodes is the spec's cap. Past it lint fails; the renderer still draws and returns a warning.
 * Output is deterministic — same graph, same bytes — because a route's cache key hashes the post, and a
 * diagram that relaid itself per run would re-render every page every build.
 */
import { layoutGraph, type LayoutItem, type LayoutResult } from "./layout";
import { EDGE, HALO, LABEL, NODE_FILL, NODE_STROKE, TICK } from "./palette";
import { clip, el, escape, n, text, textWidth } from "./svg";

export type Direction = "lr" | "tb";
/**
 * `diamond` is not in the spec's `diagram` vocabulary and a diagram body cannot ask for it (`isKind`
 * checks `NODE_KINDS`). It exists because `flow` (S10) desugars a decision into a node, and a decision
 * that looks like a step is the one thing a flowchart must not do.
 */
export type NodeKind = "box" | "rounded" | "pill" | "diamond";
/** The kinds a `diagram` body may name — the spec's list, and what lint rule 2 checks against. */
export const NODE_KINDS: NodeKind[] = ["box", "rounded", "pill"];
export interface DiagramNode { id: string; label: string; kind: NodeKind }
export interface DiagramEdge { from: string; to: string; label?: string }
export interface DiagramInput {
  /** The parsed YAML body: `{ nodes: [...], edges: [...] }`. */
  data: unknown;
  direction?: string;
  /** Says what the diagram shows; the accessible name when `title` is absent (spec: diagram.title). */
  caption?: string;
  title?: string;
}
export interface DiagramResult { svg: string; warnings: string[]; nodes: DiagramNode[]; edges: DiagramEdge[]; ranks: number; direction: Direction }

/** spec: diagram.budget.maxNodes — the readable limit, not a technical one. */
export const MAX_NODES = 40;

const FS = { node: 13, edge: 11 };
const PAD_X = 14, PAD_Y = 10, LINE_H = 17, MIN_W = 68, MAX_W = 172, MAX_LINES = 3, MIN_H = 34;
/** A diamond wraps earlier than a box: the same words in a rhombus are 1.6× as wide (see `measure`). */
const DIAMOND_W = 160;
const MARGIN = 6, ARROW = 8, ARROW_HALF = 3.6, CORNER = 7;

const isKind = (s: unknown): s is NodeKind => NODE_KINDS.includes(s as NodeKind);
const isDirection = (s: unknown): s is Direction => s === "lr" || s === "tb";

/** `direction=` as written → the axis, plus the warning when it was written wrong. `diagram` reads left to
 * right by default, `flow` top to bottom (spec) — the fallback is the caller's, the parsing is shared. */
export function pickDirection(raw: unknown, fallback: Direction): { direction: Direction; warning?: string } {
  if (raw === undefined || raw === null || raw === "") return { direction: fallback };
  if (isDirection(raw)) return { direction: raw };
  return { direction: fallback, warning: `unknown direction "${String(raw)}"; laid out ${fallback === "lr" ? "left to right" : "top to bottom"}` };
}

/**
 * Parsed YAML body → nodes and edges. Tolerates what an agent writes (`nodes: [md, build]` as bare ids as
 * well as `- { id, label, kind }`) and drops what it cannot draw with a warning — lint (rule 2) rejects the
 * same shapes earlier, with the fix in the hint, because the renderer does not lint (html.ts).
 */
export function normalizeGraph(data: unknown): { nodes: DiagramNode[]; edges: DiagramEdge[]; warnings: string[] } {
  const warnings: string[] = [];
  const nodes: DiagramNode[] = [], edges: DiagramEdge[] = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    if (data !== undefined && data !== null) warnings.push("diagram body is not `nodes:` and `edges:`");
    return { nodes, edges, warnings };
  }
  const body = data as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(body.nodes)) { warnings.push("diagram has no `nodes:` list"); return { nodes, edges, warnings }; }

  const seen = new Set<string>();
  for (const [i, raw] of body.nodes.entries()) {
    const o = typeof raw === "string" || typeof raw === "number" ? { id: String(raw) } : raw;
    if (!o || typeof o !== "object" || Array.isArray(o)) { warnings.push(`node ${i + 1} is not \`{ id, label }\``); continue; }
    const r = o as Record<string, unknown>;
    const id = r.id === undefined || r.id === null ? "" : String(r.id);
    if (!id) { warnings.push(`node ${i + 1} has no \`id\``); continue; }
    if (seen.has(id)) { warnings.push(`node \`${id}\` is declared twice; the second is dropped`); continue; }
    if (r.kind !== undefined && !isKind(r.kind)) warnings.push(`node \`${id}\` has kind "${String(r.kind)}"; drawn as a box`);
    seen.add(id);
    nodes.push({ id, label: r.label === undefined || r.label === null || String(r.label) === "" ? id : String(r.label), kind: isKind(r.kind) ? r.kind : "box" });
  }

  if (body.edges !== undefined && !Array.isArray(body.edges)) warnings.push("diagram `edges:` is not a list");
  for (const [i, raw] of (Array.isArray(body.edges) ? body.edges : []).entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { warnings.push(`edge ${i + 1} is not \`{ from, to }\``); continue; }
    const r = raw as Record<string, unknown>;
    const from = r.from === undefined || r.from === null ? "" : String(r.from);
    const to = r.to === undefined || r.to === null ? "" : String(r.to);
    if (!from || !to) { warnings.push(`edge ${i + 1} needs both \`from\` and \`to\``); continue; }
    if (!seen.has(from) || !seen.has(to)) { warnings.push(`edge ${i + 1} points at \`${seen.has(from) ? to : from}\`, which is not a node`); continue; }
    if (from === to) { warnings.push(`edge ${i + 1} points \`${from}\` at itself; a self-loop is not drawn`); continue; }
    edges.push({ from, to, label: r.label === undefined || r.label === null ? undefined : String(r.label) });
  }
  return { nodes, edges, warnings };
}

/** Words → at most `MAX_LINES` lines that fit the box; the last one takes an ellipsis rather than overflow. */
function wrapLabel(label: string, maxW = MAX_W): string[] {
  const room = maxW - PAD_X * 2;
  const chars = Math.max(4, Math.floor(room / (FS.node * 0.55)));
  const lines: string[] = [];
  let cur = "";
  for (const word of label.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (!cur || textWidth(next, FS.node) <= room) cur = next;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  if (!lines.length) return [""];
  if (lines.length <= MAX_LINES) return lines.map((l) => clip(l, chars));
  const kept = lines.slice(0, MAX_LINES);
  kept[MAX_LINES - 1] = clip(`${kept[MAX_LINES - 1]!} ${lines.slice(MAX_LINES).join(" ")}`, chars);
  return kept;
}

interface Box { id: string; lines: string[]; w: number; h: number; kind: NodeKind }

const measure = (node: DiagramNode): Box => {
  const lines = wrapLabel(node.label, node.kind === "diamond" ? DIAMOND_W : MAX_W);
  const tw = Math.ceil(Math.max(...lines.map((l) => textWidth(l, FS.node))));
  if (node.kind === "diamond") {
    // A rhombus only holds what satisfies |x|/(w/2) + |y|/(h/2) ≤ 1, so text that fits a box needs
    // ≈ 1.6× the width and ≈ 2.6× the height inside a diamond. A decision is wide and shallow on purpose:
    // widening is cheap (one rank is as tall as its tallest node either way), heightening pushes ranks apart.
    return { id: node.id, lines, w: Math.max(MIN_W + 40, Math.ceil(tw * 1.6) + 24), h: Math.max(MIN_H + 16, Math.ceil(lines.length * LINE_H * 2.6) + 10), kind: node.kind };
  }
  const w = Math.min(MAX_W, Math.max(MIN_W, tw + PAD_X * 2));
  return { id: node.id, lines, w, h: Math.max(MIN_H, lines.length * LINE_H + PAD_Y * 2), kind: node.kind };
};

/**
 * Layout cache (docs/07 S9 risk row: split layout from paint). The key is the *geometry* — direction, node
 * sizes and edges — not the labels, so two diagrams of the same shape share one layout even when they say
 * different things. Paint is a few string concatenations and is never cached.
 */
const CACHE = new Map<string, LayoutResult>();
const CACHE_MAX = 512;
function cachedLayout(direction: Direction, items: LayoutItem[], edges: DiagramEdge[]): LayoutResult {
  const key = `${direction}|${items.map((i) => `${i.id}:${i.rankSize}x${i.crossSize}`).join(",")}|${edges.map((e) => `${e.from}>${e.to}`).join(",")}`;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const out = layoutGraph(items, edges);
  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value!);
  CACHE.set(key, out);
  return out;
}

type Pt = { u: number; v: number };

/**
 * Waypoints → an orthogonal run: leave along the rank axis, turn once between the ranks, arrive along it.
 * `lane` (0–1) says *where* in the gap to turn. Every edge turning at the midpoint would stack a dozen
 * vertical segments on one line, and a reader could no longer tell which box an edge came from.
 */
function ortho(pts: Pt[], lane = 0.5): Pt[] {
  const out: Pt[] = pts.length ? [pts[0]!] : [];
  for (let i = 1; i < pts.length; i++) {
    const a = out[out.length - 1]!, b = pts[i]!;
    if (Math.abs(a.v - b.v) > 0.01 && Math.abs(a.u - b.u) > 0.01) {
      const mid = Math.round(a.u + (b.u - a.u) * lane);
      out.push({ u: mid, v: a.v }, { u: mid, v: b.v });
    }
    out.push(b);
  }
  return out.filter((p, i) => i === 0 || Math.abs(p.u - out[i - 1]!.u) > 0.01 || Math.abs(p.v - out[i - 1]!.v) > 0.01);
}

/**
 * Attach points and turn lanes. Two edges leaving the same box would otherwise start at the same pixel and
 * turn on the same line, which is exactly the picture a reader cannot follow. Edges leaving one side of a
 * box fan out across it, ordered by where they are going, and the edges crossing one gap each get their own
 * lane to turn in — both ordered by the run's midpoint, so the fan does not introduce crossings of its own.
 */
function ports(edges: DiagramEdge[], ends: Array<{ start: Pt; end: Pt }>, cross: (id: string) => number): number[] {
  // Every ordering below reads this snapshot, so an edge's lane does not depend on how far a previous
  // edge's port has already moved — the layout must not change when the same graph is drawn twice.
  const mid = ends.map((e) => (e.start.v + e.end.v) / 2);
  type Attach = { i: number; at: "start" | "end" };
  const sides = new Map<string, { id: string; list: Attach[] }>();
  const add = (id: string, u: number, a: Attach) => {
    const k = `${id}@${u}`;
    if (!sides.has(k)) sides.set(k, { id, list: [] });
    sides.get(k)!.list.push(a);
  };
  edges.forEach((e, i) => { add(e.from, ends[i]!.start.u, { i, at: "start" }); add(e.to, ends[i]!.end.u, { i, at: "end" }); });
  for (const { id, list } of sides.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => mid[a.i]! - mid[b.i]! || a.i - b.i);
    const gap = Math.min(11, (cross(id) * 0.62) / (list.length - 1));
    list.forEach((a, j) => {
      const off = Math.round((j - (list.length - 1) / 2) * gap);
      if (a.at === "start") ends[a.i]!.start.v += off; else ends[a.i]!.end.v += off;
    });
  }

  const lanes: number[] = edges.map(() => 0.5);
  const gaps = new Map<number, number[]>();
  edges.forEach((_, i) => {
    const u = ends[i]!.start.u;
    if (!gaps.has(u)) gaps.set(u, []);
    gaps.get(u)!.push(i);
  });
  for (const list of gaps.values()) {
    list.sort((a, b) => mid[a]! - mid[b]! || a - b);
    list.forEach((i, j) => { lanes[i] = list.length === 1 ? 0.5 : 0.3 + (0.4 * j) / (list.length - 1); });
  }
  return lanes;
}

/** Polyline → path with rounded corners; a corner shrinks to fit the shorter of its two segments. */
function roundedPath(pts: Array<[number, number]>): string {
  if (pts.length < 2) return "";
  let d = `M${n(pts[0]![0])} ${n(pts[0]![1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1]!, [cx, cy] = pts[i]!, [nx, ny] = pts[i + 1]!;
    const d1 = Math.hypot(cx - px, cy - py), d2 = Math.hypot(nx - cx, ny - cy);
    const r = Math.min(CORNER, d1 / 2, d2 / 2);
    if (r < 0.5) { d += `L${n(cx)} ${n(cy)}`; continue; }
    d += `L${n(cx + ((px - cx) * r) / d1)} ${n(cy + ((py - cy) * r) / d1)}`;
    d += `Q${n(cx)} ${n(cy)} ${n(cx + ((nx - cx) * r) / d2)} ${n(cy + ((ny - cy) * r) / d2)}`;
  }
  const last = pts[pts.length - 1]!;
  return `${d}L${n(last[0])} ${n(last[1])}`;
}

/** `<title>`/`<desc>`: the accessible name, then the graph read out loud — the same words as the fallback. */
function describe(nodes: DiagramNode[], edges: DiagramEdge[]): string {
  const label = new Map(nodes.map((x) => [x.id, x.label]));
  const shown = edges.slice(0, 24);
  const body = shown.map((e) => `${label.get(e.from)} to ${label.get(e.to)}${e.label ? ` (${e.label})` : ""}`).join("; ");
  const more = edges.length > shown.length ? `; and ${edges.length - shown.length} more` : "";
  return `Diagram, ${nodes.length} node${nodes.length === 1 ? "" : "s"}, ${edges.length} connection${edges.length === 1 ? "" : "s"}. ${body}${more}.`;
}

/** What the painter needs beyond the graph itself; `flow` (S10) supplies its own name, prose and class. */
export interface DrawOptions { direction: Direction; name: string; desc: string; className: string }

/**
 * The painter: normalised nodes and edges → one `<svg>`. `renderDiagram` reaches it through a YAML body,
 * `renderFlow` (flow.ts) through the sugar it desugars — one layout and one set of geometry decisions for
 * both, which is what "flow is sugar over diagram" (docs/07 S10) has to mean to be worth anything.
 */
export function drawGraph(nodes: DiagramNode[], edges: DiagramEdge[], opts: DrawOptions): { svg: string; ranks: number } {
  const { direction } = opts;
  const boxes = new Map(nodes.map((node) => [node.id, measure(node)]));
  const lr = direction === "lr";
  const items: LayoutItem[] = nodes.map((node) => {
    const b = boxes.get(node.id)!;
    return { id: node.id, rankSize: lr ? b.w : b.h, crossSize: lr ? b.h : b.w };
  });
  const layout = cachedLayout(direction, items, edges);
  const { placed, ranks, uSize, vSize } = layout;

  const xy = (p: Pt): [number, number] => (lr ? [p.u + MARGIN, p.v + MARGIN] : [p.v + MARGIN, p.u + MARGIN]);
  const width = Math.round((lr ? uSize : vSize) + MARGIN * 2);
  const height = Math.round((lr ? vSize : uSize) + MARGIN * 2);

  // Edges first: a box always sits on top of the line that reaches it.
  let body = "";
  // `layout.edges` keeps the input order — nothing was filtered, because `normalizeGraph` already dropped
  // the edges a layout cannot take (unknown endpoint, self-loop) and said so.
  const half = (id: string) => (lr ? boxes.get(id)!.w : boxes.get(id)!.h) / 2;
  // A diamond has no flat side to fan across — an edge attaching a third of the way along it would end in
  // the white space beside the point. Zero fan puts every edge on the apex, which is what a fork looks like.
  const cross = (id: string) => (boxes.get(id)!.kind === "diamond" ? 0 : lr ? boxes.get(id)!.h : boxes.get(id)!.w);
  const ends = edges.map((e) => {
    const a = placed.get(e.from)!, b = placed.get(e.to)!;
    const ahead = b.u >= a.u;
    return { start: { u: a.u + (ahead ? half(e.from) : -half(e.from)), v: a.v }, end: { u: b.u + (ahead ? -half(e.to) : half(e.to)), v: b.v } };
  });
  const lanes = ports(edges, ends, cross);

  let lines = "", heads = "", marks = "";
  for (const [i, e] of edges.entries()) {
    const via = layout.edges[i]?.via ?? [];
    const pts = ortho([ends[i]!.start, ...via, ends[i]!.end], lanes[i]).map(xy);
    if (pts.length < 2) continue;

    // Stop the line an arrowhead short of the box, then draw the head into it.
    const [ex, ey] = pts[pts.length - 1]!;
    const [bx, by] = pts[pts.length - 2]!;
    const len = Math.hypot(ex - bx, ey - by) || 1;
    const dx = (ex - bx) / len, dy = (ey - by) / len;
    const tip: [number, number] = [ex, ey];
    const base: [number, number] = [ex - dx * ARROW, ey - dy * ARROW];
    pts[pts.length - 1] = base;
    lines += el("path", { d: roundedPath(pts) });
    heads += el("path", { d: `M${n(tip[0])} ${n(tip[1])}L${n(base[0] - dy * ARROW_HALF)} ${n(base[1] + dx * ARROW_HALF)}L${n(base[0] + dy * ARROW_HALF)} ${n(base[1] - dx * ARROW_HALF)}Z` });
    // The label rides the longest straight run of the edge, not whichever corner fell in the middle of the
    // point list — a corner is usually against a box, which is where a label must never sit.
    if (e.label) {
      let best = 0, span = -1;
      for (let k = 1; k < pts.length; k++) {
        const d = Math.hypot(pts[k]![0] - pts[k - 1]![0], pts[k]![1] - pts[k - 1]![1]);
        if (d > span) { span = d; best = k; }
      }
      const [ax, ay] = pts[best - 1]!, [bx2, by2] = pts[best]!;
      const flat = Math.abs(bx2 - ax) >= Math.abs(by2 - ay);
      // The label rides its own line, haloed (see the group below), and is clipped to the run it labels —
      // a label wider than its own segment would sit on the boxes at either end.
      const room = Math.max(8, Math.floor(span / (FS.edge * 0.55)));
      marks += text(clip(e.label, Math.min(24, room)), flat
        ? { x: n((ax + bx2) / 2), y: n((ay + by2) / 2 + 4), "text-anchor": "middle" }
        : { x: n((ax + bx2) / 2 + 9), y: n((ay + by2) / 2 + 4) });
    }
  }
  body += el("g", { fill: "none", stroke: EDGE, "stroke-width": 1.5, "stroke-linecap": "round" }, lines);
  body += el("g", { fill: EDGE }, heads);
  // `Canvas` is the page's own background in both light and dark, so a label sitting on its line stays
  // readable with no token declared and no guess about the theme (the alternative — offsetting the label
  // clear of every line — has nowhere to go when three edges share one 54px gap).
  if (marks) body += el("g", { "font-size": FS.edge, fill: TICK, "paint-order": "stroke", stroke: HALO, "stroke-width": 3, "stroke-linejoin": "round" }, marks);

  // One `<g>` per role rather than the same four paint attributes on forty boxes: a diagram is monochrome
  // by design (the theme seam is a token, not a per-node colour), so the attributes hoist cleanly.
  let rects = "", labels = "";
  for (const node of nodes) {
    const p = placed.get(node.id)!, b = boxes.get(node.id)!;
    const [cx, cy] = xy(p);
    if (b.kind === "diamond") {
      rects += el("path", { d: `M${n(cx)} ${n(cy - b.h / 2)}L${n(cx + b.w / 2)} ${n(cy)}L${n(cx)} ${n(cy + b.h / 2)}L${n(cx - b.w / 2)} ${n(cy)}Z` });
    } else {
      const rx = b.kind === "pill" ? b.h / 2 : b.kind === "rounded" ? 8 : 2;
      rects += el("rect", { x: n(cx - b.w / 2), y: n(cy - b.h / 2), width: n(b.w), height: n(b.h), rx: n(rx) });
    }
    for (const [i, line] of b.lines.entries())
      labels += text(line, { x: n(cx), y: n(cy - ((b.lines.length - 1) * LINE_H) / 2 + i * LINE_H + 4.5) });
  }
  body += el("g", { fill: NODE_FILL, stroke: NODE_STROKE }, rects);
  body += el("g", { "font-size": FS.node, fill: LABEL, "text-anchor": "middle" }, labels);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"` +
    ` class="${opts.className}" data-direction="${direction}" role="img" style="max-width:100%;height:auto">` +
    `<title>${escape(opts.name)}</title><desc>${escape(opts.desc)}</desc>${body}</svg>`;
  return { svg, ranks };
}

/**
 * A `diagram` body → one `<svg>`. Returns `null` when there is nothing to draw, which is the theme's signal
 * to render the spec's declared fallback (the edge list) instead of an empty picture.
 */
export function renderDiagram(input: DiagramInput): DiagramResult | null {
  const { nodes, edges, warnings } = normalizeGraph(input.data);
  const { direction, warning } = pickDirection(input.direction, "lr");
  if (warning) warnings.push(warning);
  if (!nodes.length) return null;
  if (nodes.length > MAX_NODES) warnings.push(`${nodes.length} nodes; the spec's cap is ${MAX_NODES} — past it the picture stops being followable`);
  const { svg, ranks } = drawGraph(nodes, edges, {
    direction, name: input.title ?? input.caption ?? "diagram", desc: describe(nodes, edges), className: "snypd-diagram-svg",
  });
  return { svg, warnings, nodes, edges, ranks, direction };
}
