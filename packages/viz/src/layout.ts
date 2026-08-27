/**
 * Sugiyama layered layout — the geometry half of `viz/diagram` (S9) and, from S10, of `viz/flow`.
 * Pure, dependency-free and deterministic: the same graph produces the same coordinates every run, or a
 * diagram would change its page's bytes on every build and re-render the whole site (docs/04).
 *
 * The four classic phases, each kept small enough to read:
 *   1. **acyclic** — a DFS marks the edges that close a cycle and reverses them for layout only; the
 *      painter puts the arrowhead back on the original target, so a feedback edge points backwards on the
 *      page and still layers cleanly.
 *   2. **rank** — longest path from the sources (Kahn), so every edge points at least one rank forward.
 *   3. **order** — dummy nodes fill the ranks a long edge crosses (an edge is then a chain of unit edges),
 *      then median-heuristic sweeps and adjacent-swap transposes cut crossings.
 *   4. **coordinates** — each layer is placed at the median of its neighbours, separation enforced by a
 *      forward pass, then the layer is recentred on what the medians actually asked for.
 *
 * Axes are abstract: `u` runs along the ranks, `v` across them. `direction: lr` maps (u, v) → (x, y) and
 * `tb` maps them → (y, x), so one layout serves both without a second code path.
 */

export interface LayoutItem { id: string; /** size along the rank axis */ rankSize: number; /** size across it */ crossSize: number }
export interface LayoutEdge { from: string; to: string }
/** A node's centre. */
export interface Placed { id: string; rank: number; u: number; v: number }
/** `via` = the centres of the dummies the edge passes through, in travel order (empty for a unit edge). */
export interface RoutedEdge { from: string; to: string; reversed: boolean; via: Array<{ u: number; v: number }> }
export interface LayoutResult { placed: Map<string, Placed>; edges: RoutedEdge[]; ranks: number; uSize: number; vSize: number }

export interface LayoutOptions { rankGap?: number; crossGap?: number; sweeps?: number }

/** A dummy's thickness across the ranks: an edge crossing a layer needs its own lane, not zero width. */
const DUMMY_CROSS = 8;

interface Item extends LayoutItem { rank: number; dummy: boolean }

export function layoutGraph(items: LayoutItem[], edges: LayoutEdge[], opts: LayoutOptions = {}): LayoutResult {
  const rankGap = opts.rankGap ?? 54;
  const crossGap = opts.crossGap ?? 18;
  const sweeps = opts.sweeps ?? 4;
  if (!items.length) return { placed: new Map(), edges: [], ranks: 0, uSize: 0, vSize: 0 };
  const known = new Set(items.map((i) => i.id));
  const real = edges.filter((e) => known.has(e.from) && known.has(e.to) && e.from !== e.to);

  // ---- 1. make it acyclic ------------------------------------------------------------------------
  const adj = new Map<string, number[]>(items.map((i) => [i.id, [] as number[]]));
  real.forEach((e, i) => adj.get(e.from)!.push(i));
  const reversed = new Set<number>();
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (id: string) => {
    state.set(id, 1);
    for (const ei of adj.get(id)!) {
      if (reversed.has(ei)) continue;
      const to = real[ei]!.to;
      const s = state.get(to) ?? 0;
      if (s === 1) reversed.add(ei);          // an edge back into the current path closes a cycle
      else if (s === 0) visit(to);
    }
    state.set(id, 2);
  };
  for (const it of items) if (!state.get(it.id)) visit(it.id);
  const dag = real.map((e, i) => (reversed.has(i) ? { from: e.to, to: e.from, i } : { from: e.from, to: e.to, i }));

  // ---- 2. rank: longest path from the sources ----------------------------------------------------
  const succ = new Map<string, string[]>(items.map((i) => [i.id, [] as string[]]));
  const indeg = new Map<string, number>(items.map((i) => [i.id, 0]));
  for (const e of dag) { succ.get(e.from)!.push(e.to); indeg.set(e.to, indeg.get(e.to)! + 1); }
  const rank = new Map<string, number>(items.map((i) => [i.id, 0]));
  const queue = items.filter((i) => indeg.get(i.id) === 0).map((i) => i.id);
  const seen = new Set(queue);
  for (let qi = 0; qi < queue.length; qi++) {
    const id = queue[qi]!;
    for (const to of succ.get(id)!) {
      rank.set(to, Math.max(rank.get(to)!, rank.get(id)! + 1));
      indeg.set(to, indeg.get(to)! - 1);
      if (indeg.get(to)! === 0) { queue.push(to); seen.add(to); }
    }
  }
  // Belt and braces: a node the queue never reached (a cycle the DFS could not break) lands after its
  // deepest predecessor rather than at rank 0, where it would draw its edges backwards.
  for (const it of items) if (!seen.has(it.id)) rank.set(it.id, Math.max(0, ...dag.filter((e) => e.to === it.id).map((e) => rank.get(e.from)! + 1)));
  const ranks = Math.max(...items.map((i) => rank.get(i.id)!)) + 1;

  // ---- 3. layers + dummies -----------------------------------------------------------------------
  const layers: Item[][] = Array.from({ length: ranks }, () => []);
  const size = new Map<string, Item>();
  for (const it of items) {
    const item: Item = { ...it, rank: rank.get(it.id)!, dummy: false };
    layers[item.rank]!.push(item); size.set(it.id, item);
  }
  const upper = new Map<string, string[]>(), lower = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    if (!lower.has(a)) lower.set(a, []);
    if (!upper.has(b)) upper.set(b, []);
    lower.get(a)!.push(b); upper.get(b)!.push(a);
  };
  const chains = new Map<number, string[]>();
  for (const e of dag) {
    const r0 = rank.get(e.from)!, r1 = rank.get(e.to)!;
    const chain: string[] = [];
    for (let r = r0 + 1; r < r1; r++) {
      const id = `~${e.i}@${r}`;
      const item: Item = { id, rankSize: 0, crossSize: DUMMY_CROSS, rank: r, dummy: true };
      layers[r]!.push(item); size.set(id, item); chain.push(id);
    }
    chains.set(e.i, chain);
    const hops = [e.from, ...chain, e.to];
    for (let k = 1; k < hops.length; k++) link(hops[k - 1]!, hops[k]!);
  }

  // ---- 4. ordering: median sweeps + transpose ----------------------------------------------------
  const indexIn = (L: Item[]) => new Map(L.map((it, i) => [it.id, i]));
  const medianOf = (id: string, adjacent: Map<string, string[]>, pos: Map<string, number>): number => {
    const xs = (adjacent.get(id) ?? []).map((n) => pos.get(n)).filter((x): x is number => x !== undefined).sort((a, b) => a - b);
    if (!xs.length) return -1;
    const m = xs.length >> 1;
    return xs.length % 2 ? xs[m]! : (xs[m - 1]! + xs[m]!) / 2;
  };
  /**
   * Crossings *between two neighbours' own edges* — the pairs that a swap would fix or create. Counting the
   * whole layer for every candidate swap is O(edges²) per swap and cost 20 ms on a 40-node graph with two
   * wide layers (the D3 budget is 15); only these two nodes' edges can change, so only they are counted.
   */
  const pairCross = (a: string, b: string, adjacent: Map<string, string[]>, pos: Map<string, number>): number => {
    let c = 0;
    for (const x of adjacent.get(a) ?? []) {
      const px = pos.get(x);
      if (px === undefined) continue;
      for (const y of adjacent.get(b) ?? []) { const py = pos.get(y); if (py !== undefined && px > py) c++; }
    }
    return c;
  };
  for (let s = 0; s < sweeps; s++) {
    const down = s % 2 === 0;
    const order = down ? [...layers.keys()].slice(1) : [...layers.keys()].slice(0, -1).reverse();
    for (const r of order) {
      const fixed = indexIn(layers[down ? r - 1 : r + 1]!);
      const adjacent = down ? upper : lower;
      const key = new Map(layers[r]!.map((it, i) => { const m = medianOf(it.id, adjacent, fixed); return [it.id, m < 0 ? i : m]; }));
      layers[r] = [...layers[r]!].sort((x, y) => key.get(x.id)! - key.get(y.id)!);   // stable: ties keep their order
    }
    for (let guard = 0; guard < 3; guard++) {
      let improved = false;
      for (let r = 0; r < ranks; r++) {
        const L = layers[r]!;
        const above = r > 0 ? indexIn(layers[r - 1]!) : undefined;      // only layer r is reordered below,
        const below = r + 1 < ranks ? indexIn(layers[r + 1]!) : undefined;   // so its neighbours' indices hold
        for (let i = 0; i + 1 < L.length; i++) {
          const a = L[i]!.id, b = L[i + 1]!.id;
          let before = 0, after = 0;
          if (above) { before += pairCross(a, b, upper, above); after += pairCross(b, a, upper, above); }
          if (below) { before += pairCross(a, b, lower, below); after += pairCross(b, a, lower, below); }
          if (after < before) { [L[i], L[i + 1]] = [L[i + 1]!, L[i]!]; improved = true; }
        }
      }
      if (!improved) break;
    }
  }

  // ---- 5. coordinates ----------------------------------------------------------------------------
  const v = new Map<string, number>();
  for (const L of layers) { let cum = 0; for (const it of L) { v.set(it.id, cum + it.crossSize / 2); cum += it.crossSize + crossGap; } }
  const place = (L: Item[], adjacent: Map<string, string[]>) => {
    if (!L.length) return;
    const want = L.map((it) => { const m = medianOf(it.id, adjacent, v); return m < 0 ? v.get(it.id)! : m; });
    const pos: number[] = [];
    for (const [i, it] of L.entries()) {
      const floor = i === 0 ? -Infinity : pos[i - 1]! + (L[i - 1]!.crossSize + it.crossSize) / 2 + crossGap;
      pos.push(Math.max(want[i]!, floor));
    }
    // The forward pass can only push down, so the layer drifts away from what the medians asked for;
    // shifting it back by the average difference keeps the separation and returns the balance.
    const shift = want.reduce((a, b) => a + b, 0) / want.length - pos.reduce((a, b) => a + b, 0) / pos.length;
    for (const [i, it] of L.entries()) v.set(it.id, pos[i]! + shift);
  };
  for (let s = 0; s < sweeps * 2; s++) {
    const down = s % 2 === 0;
    const order = down ? [...layers.keys()].slice(1) : [...layers.keys()].slice(0, -1).reverse();
    for (const r of order) place(layers[r]!, down ? upper : lower);
  }
  const minV = Math.min(...[...size.values()].map((it) => v.get(it.id)! - it.crossSize / 2));
  for (const it of size.values()) v.set(it.id, v.get(it.id)! - minV);

  const u = new Map<string, number>();
  let cum = 0;
  for (const L of layers) {
    const thick = Math.max(0, ...L.map((it) => it.rankSize));
    for (const it of L) u.set(it.id, cum + thick / 2);
    cum += thick + rankGap;
  }

  // ---- 6. result ---------------------------------------------------------------------------------
  // Whole pixels: a diagram has no sub-pixel geometry to lose, and every coordinate in the SVG is then two
  // or three characters instead of six — at the 40-node cap that is kilobytes of decimals (D3 budget).
  const round = (x: number) => Math.round(x);
  const placed = new Map<string, Placed>();
  for (const it of items) placed.set(it.id, { id: it.id, rank: rank.get(it.id)!, u: round(u.get(it.id)!), v: round(v.get(it.id)!) });
  const out: RoutedEdge[] = real.map((e, i) => {
    const chain = (chains.get(i) ?? []).map((id) => ({ u: round(u.get(id)!), v: round(v.get(id)!) }));
    return { from: e.from, to: e.to, reversed: reversed.has(i), via: reversed.has(i) ? [...chain].reverse() : chain };
  });
  return {
    placed, edges: out, ranks,
    uSize: Math.round(Math.max(0, cum - rankGap)),
    vSize: Math.round(Math.max(...[...size.values()].map((it) => v.get(it.id)! + it.crossSize / 2))),
  };
}
