/**
 * `viz/flow` (docs/07 S10): the `flow` sugar → a graph → the `diagram` painter. No second layout, no second
 * set of geometry decisions — "flow is sugar over diagram" only pays if it is literally the same picture
 * code with a different front door (`drawGraph` in diagram.ts).
 *
 * The sugar (spec: `snypd://spec/primitives/flow`) is an ordered list under `steps:`:
 *   - a **string** is a step;
 *   - `{ id, do }` is a named step, so a jump can point at it;
 *   - `{ ask, yes, no }` is a decision — `yes`/`no` are a step, a list of steps, or another decision, and a
 *     branch that is absent means "carry straight on", drawn as a labelled edge to whatever follows;
 *   - `{ then: id }` is a jump: the path reaching it goes to that step instead of falling through.
 *
 * Sequencing is the whole design, and one rule decides it (decision 19): **a named step that only earlier
 * jumps point at is a branch landing — the straight path steps over it.** The spec's own example is the
 * reason: `no: { then: fix }` puts the fix out of line, and without the rule the `yes` branch would fall
 * into "fix the reported rule" on its way past. A jump *back* to an earlier step is a retry loop, and its
 * target stays on the straight path, or `- Run lint` would drop out of a flow that loops back to it.
 *
 * Everything else follows: a branch rejoins whatever the decision itself would have gone to next, which is
 * the next straight step; a branch ending in a jump does not rejoin; a decision with neither branch is a
 * step with two labelled edges to the same place (and lint says so).
 */
import { drawGraph, pickDirection, MAX_NODES, type Direction, type DiagramEdge, type DiagramNode } from "./diagram";

export interface FlowInput {
  /** The parsed YAML body: `{ steps: [...] }`. */
  data: unknown;
  direction?: string;
  /** Says what the procedure is; the accessible name when `title` is absent (spec: flow.title). */
  caption?: string;
  title?: string;
}
export interface FlowResult {
  svg: string; warnings: string[];
  nodes: DiagramNode[]; edges: DiagramEdge[];
  /** Boxes and diamonds drawn; a jump is an edge, not a node, so `steps + decisions === nodes.length`. */
  steps: number; decisions: number;
  ranks: number; direction: Direction;
}

/** One normalised item of a `steps:` list. `seq` is its position in document order, which is what tells a
 * jump forward (a branch landing) from a jump back (a loop). */
type Item =
  | { t: "step"; node: string; label: string; seq: number; declared?: string }
  | { t: "ask"; node: string; label: string; seq: number; declared?: string; yes?: Item[]; no?: Item[] }
  | { t: "jump"; to: string; seq: number };

/** The items a `then:` can name — a jump has no node of its own to land on. */
type Named = Extract<Item, { node: string }>;
interface Sugar { items: Item[]; declared: Map<string, Named>; jumps: Array<{ to: string; seq: number }>; warnings: string[]; nodes: DiagramNode[] }

const asList = (x: unknown): unknown[] | undefined => (Array.isArray(x) ? x : x === undefined || x === null ? undefined : [x]);
const KEYS = new Set(["id", "do", "ask", "yes", "no", "then"]);

/** Every `id:` the body declares, before anything is numbered: a generated id must not land on one. */
function declaredIds(x: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(x)) { for (const v of x) declaredIds(v, out); return out; }
  if (!x || typeof x !== "object") return out;
  const o = x as Record<string, unknown>;
  if (o.id !== undefined && o.id !== null) out.add(String(o.id));
  for (const v of Object.values(o)) declaredIds(v, out);
  return out;
}

/**
 * The YAML body → items, ids and the warnings for what could not be read. Ids are generated for unnamed
 * steps and deduped against the author's own, because a node id is only ever a layout key here — S9 dropped
 * the per-node `id=` attribute, so two flows on one page cannot collide over one.
 */
export function desugarFlow(data: unknown): { nodes: DiagramNode[]; edges: DiagramEdge[]; warnings: string[]; steps: number; decisions: number } {
  const warnings: string[] = [];
  const empty = { nodes: [] as DiagramNode[], edges: [] as DiagramEdge[], warnings, steps: 0, decisions: 0 };
  if (data === undefined || data === null) return empty;
  if (typeof data !== "object" || Array.isArray(data)) { warnings.push("flow body is not `steps:`"); return empty; }
  const raw = (data as { steps?: unknown }).steps;
  if (!Array.isArray(raw)) { warnings.push("flow has no `steps:` list"); return empty; }

  const s: Sugar = { items: [], declared: new Map(), jumps: [], warnings, nodes: [] };
  const taken = declaredIds(raw);
  let counter = 0, seq = 0;
  const idFor = (declared?: string): string => {
    if (declared) return declared;
    let id = `%${++counter}`;
    while (taken.has(id)) id = `%${++counter}`;
    return id;
  };
  const node = (id: string, label: string, kind: DiagramNode["kind"]) => { s.nodes.push({ id, label, kind }); };

  const one = (x: unknown, where: string): Item | undefined => {
    const at = ++seq;
    if (typeof x === "string" || typeof x === "number") {
      const label = String(x).trim();
      if (!label) { warnings.push(`${where} is empty`); return undefined; }
      const id = idFor();
      node(id, label, "rounded");
      return { t: "step", node: id, label, seq: at };
    }
    if (!x || typeof x !== "object" || Array.isArray(x)) { warnings.push(`${where} is not a step, a decision or a jump`); return undefined; }
    const o = x as Record<string, unknown>;
    for (const k of Object.keys(o)) if (!KEYS.has(k)) warnings.push(`${where} has no key \`${k}\``);
    let declared = o.id === undefined || o.id === null ? undefined : String(o.id);
    if (declared && s.declared.has(declared)) {
      warnings.push(`flow declares step \`${declared}\` twice; the second keeps its words but no jump reaches it`);
      declared = undefined;
    }

    if (o.then !== undefined && o.then !== null && o.ask === undefined && o.do === undefined) {
      const to = String(o.then);
      s.jumps.push({ to, seq: at });
      return { t: "jump", to, seq: at };
    }
    if (o.ask !== undefined && o.ask !== null) {
      const label = String(o.ask).trim() || "?";
      const id = idFor(declared);
      node(id, label, "diamond");
      const item: Item = { t: "ask", node: id, label, seq: at, declared };
      if (declared) s.declared.set(declared, item);
      // The branches are read after the decision itself, so every step inside them sorts after it in
      // document order — which is what makes a jump out of a branch into a later step a *forward* jump.
      item.yes = branch(o.yes, `${where} \`yes:\``);
      item.no = branch(o.no, `${where} \`no:\``);
      return item;
    }
    const label = o.do === undefined || o.do === null ? "" : String(o.do).trim();
    if (!label) { warnings.push(`${where} has no \`do:\``); return undefined; }
    const id = idFor(declared);
    node(id, label, "rounded");
    const item: Item = { t: "step", node: id, label, seq: at, declared };
    if (declared) s.declared.set(declared, item);
    return item;
  };

  const branch = (x: unknown, where: string): Item[] | undefined => {
    const list = asList(x);
    if (!list) return undefined;
    const out = list.map((v, i) => one(v, `${where} step ${i + 1}`)).filter((v): v is Item => v !== undefined);
    return out.length ? out : undefined;
  };

  s.items = raw.map((v, i) => one(v, `flow step ${i + 1}`)).filter((v): v is Item => v !== undefined);
  if (!s.nodes.length) return { ...empty, warnings };

  // A named step is a landing — stepped over by the straight path — only when every jump to it comes from
  // earlier in the flow. A jump from later is a loop back, and its target stays on the path.
  const landings = new Set<string>();
  for (const [id, item] of s.declared) {
    const refs = s.jumps.filter((j) => j.to === id);
    if (refs.length && refs.every((j) => j.seq < item.seq)) landings.add(item.node);
  }
  for (const j of s.jumps) if (!s.declared.has(j.to)) warnings.push(`flow jumps to \`${j.to}\`, which is not a step id`);

  const edges: DiagramEdge[] = [];
  const edge = (from: string, to: string, label?: string) => { edges.push({ from, to, label }); };
  const entry = (item: Item): string | undefined => (item.t === "jump" ? s.declared.get(item.to)?.node : item.node);
  const isLanding = (item: Item) => item.t !== "jump" && landings.has(item.node);
  /** The entry of a sequence = its first step that is not a landing; a leading landing is jumped into. */
  const entryOf = (list: Item[], from: number, after: string | undefined): string | undefined => {
    for (let i = from; i < list.length; i++) if (!isLanding(list[i]!)) return entry(list[i]!);
    return after;
  };

  const walk = (list: Item[], after: string | undefined): void => {
    for (const [i, item] of list.entries()) {
      const succ = entryOf(list, i + 1, after);
      if (item.t === "jump") continue;              // a jump is only ever somebody else's successor
      if (item.t === "step") { if (succ) edge(item.node, succ); continue; }
      for (const [b, label] of [[item.yes, "yes"], [item.no, "no"]] as const) {
        if (!b) { if (succ) edge(item.node, succ, label); continue; }
        const into = entryOf(b, 0, succ);
        if (into) edge(item.node, into, label);
        walk(b, succ);
      }
    }
  };
  walk(s.items, undefined);

  const decisions = s.nodes.filter((x) => x.kind === "diamond").length;
  return { nodes: s.nodes, edges, warnings, steps: s.nodes.length - decisions, decisions };
}

/** `<desc>`: the procedure read out loud — the same words as the theme's step-list fallback, in the same order. */
function describe(nodes: DiagramNode[], edges: DiagramEdge[], steps: number, decisions: number): string {
  const label = new Map(nodes.map((x) => [x.id, x.label]));
  const out: string[] = [];
  let shown = 0;
  for (const node of nodes) {
    const mine = edges.filter((e) => e.from === node.id);
    if (!mine.length || shown >= 24) continue;
    shown += mine.length;
    out.push(node.kind === "diamond"
      ? `${node.label} — ${mine.map((e) => `${e.label ?? "then"}: ${label.get(e.to)}`).join("; ")}.`
      : `${node.label}, then ${mine.map((e) => label.get(e.to)).join(" and ")}.`);
  }
  const more = shown < edges.length ? ` And ${edges.length - shown} more connections.` : "";
  return `Flowchart, ${steps} step${steps === 1 ? "" : "s"} and ${decisions} decision${decisions === 1 ? "" : "s"}. ${out.join(" ")}${more}`;
}

/**
 * A `flow` body → one `<svg>`. Returns `null` when there is nothing to draw, which is the theme's signal to
 * render the spec's declared fallback (the numbered step list) instead of an empty picture.
 */
export function renderFlow(input: FlowInput): FlowResult | null {
  const { nodes, edges, warnings, steps, decisions } = desugarFlow(input.data);
  const { direction, warning } = pickDirection(input.direction, "tb");   // spec: flow.direction defaults to tb
  if (warning) warnings.push(warning);
  if (!nodes.length) return null;
  if (nodes.length > MAX_NODES) warnings.push(`${nodes.length} steps; the spec's cap is ${MAX_NODES} — past it the procedure stops being followable`);
  const { svg, ranks } = drawGraph(nodes, edges, {
    direction, name: input.title ?? input.caption ?? "flow", desc: describe(nodes, edges, steps, decisions), className: "snypd-flow-svg",
  });
  return { svg, warnings, nodes, edges, steps, decisions, ranks, direction };
}
