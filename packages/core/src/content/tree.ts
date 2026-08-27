/**
 * S5 validate stage, part 1: mdast (+ directive nodes) → typed primitive tree, checked against @snypd/spec.
 * Every directive becomes a `Block` with its spec, coerced props, parsed YAML body (for `chart`, `diagram`,
 * `flow`) and the structural issues found on the way (unknown name, prop errors, slot limits). Rules that
 * need the whole document (density, headings, links, slop) live in lint.ts.
 */
import { load as parseYaml } from "js-yaml";
import { primitive as specPrimitive, type Primitive, type FieldSpec } from "@snypd/spec";
import type { Root, Node, Parent } from "mdast";
import type { ContainerDirective, LeafDirective, TextDirective } from "mdast-util-directive";
import type { ParsedDoc } from "./parse";

export type Directive = ContainerDirective | LeafDirective | TextDirective;
export type Severity = "error" | "warning";

/** One lint finding. `rule` is stable; `n` is the docs/01 rule number (0 = frontmatter schema). */
export interface Diagnostic {
  rule: string; n: number; severity: Severity;
  message: string; hint: string;
  line: number; column?: number;
  /** Directive name when the finding is about a block. */
  block?: string;
  file?: string;
}

export interface Block {
  name: string;
  kind: "leaf" | "container" | "inline";
  /** Attributes as written (strings), plus coerced numbers/booleans where the spec says so. */
  props: Record<string, unknown>;
  /** Parsed YAML body for `slots.body.type: yaml` containers. */
  data?: unknown;
  /** Raw source of the container body (between the fences). */
  body?: string;
  spec?: Primitive;
  depth: number;
  line: number; column: number;
  node: Directive;
  children: Block[];
}

export interface PrimitiveTree {
  blocks: Block[];          // top-level directives, in order
  all: Block[];             // every directive, depth-first
  issues: Diagnostic[];     // structural findings (rules 1, 2 and slot limits)
}

const isDirective = (n: Node): n is Directive => n.type === "containerDirective" || n.type === "leafDirective" || n.type === "textDirective";
const kindOf = (n: Directive): Block["kind"] => n.type === "containerDirective" ? "container" : n.type === "leafDirective" ? "leaf" : "inline";

/** Source text between a container's fences, using the node's source positions. */
function bodyOf(node: ContainerDirective, source: string): string {
  const s = node.position?.start.offset, e = node.position?.end.offset;
  if (s === undefined || e === undefined) return "";
  const lines = source.slice(s, e).split("\n");
  // first line is `:::name{...}`; last is the closing `:::` (may be missing when unterminated)
  const inner = lines.slice(1, /^\s*:::\s*$/.test(lines[lines.length - 1] ?? "") ? -1 : undefined);
  return inner.join("\n");
}

const URL_RE = /^(https?:\/\/[^\s]+|\/[^\s]*|\.\.?\/[^\s]*|#[^\s]*|mailto:[^\s]+)$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Check one attribute against its field spec; returns the coerced value and a problem, if any. */
export function checkProp(f: FieldSpec, raw: string): { value: unknown; problem?: string } {
  switch (f.type) {
    case "number": { const v = Number(raw); return Number.isFinite(v) ? { value: v } : { value: raw, problem: `expected a number, got "${raw}"` }; }
    case "boolean": return raw === "true" || raw === "" ? { value: true } : raw === "false" ? { value: false } : { value: raw, problem: `expected true|false, got "${raw}"` };
    case "enum": return f.values.includes(raw) ? { value: raw } : { value: raw, problem: `expected one of ${f.values.join("|")}, got "${raw}"` };
    case "url": return URL_RE.test(raw) ? { value: raw } : { value: raw, problem: `expected a URL or site path, got "${raw}"` };
    case "date": return DATE_RE.test(raw) ? { value: raw } : { value: raw, problem: `expected YYYY-MM-DD, got "${raw}"` };
    case "string": case "text": case "markdown": case "image": case "datetime": case "ref": {
      if (f.pattern && !new RegExp(f.pattern).test(raw)) return { value: raw, problem: `does not match /${f.pattern}/` };
      if (f.max !== undefined && raw.length > f.max) return { value: raw, problem: `longer than ${f.max} characters` };
      return { value: raw };
    }
    default: return { value: raw };   // list/object/yaml cannot be expressed as an attribute; not checked here
  }
}

/** The spec's intent line for `chart`: one comparison, this many points. Past it the picture stops working. */
export const CHART_MAX_POINTS = 12;

/**
 * `chart` takes its rows three ways (spec: body YAML, `data=` inline, `src=` a file). This resolves the
 * inline forms into `block.data` and reports the shapes an agent actually gets wrong, with the fix in the
 * hint — `@snypd/viz` normalises the same shapes at render time but never speaks, because the renderer
 * does not lint (html.ts). `src=` is parsed but not read in v0.1: the route key hashes the post, so a
 * chart whose numbers live in another file would not rebuild when that file changed.
 */
function checkChart(b: Block, attrs: Record<string, string | null | undefined>, at: (rule: string, n: number, severity: Severity, message: string, hint: string) => void): void {
  if (b.data === undefined && typeof attrs.data === "string" && attrs.data.trim()) {
    try { b.data = parseYaml(attrs.data); }
    catch (e) { at("invalid-prop", 2, "error", `\`chart\` prop \`data\` is not valid YAML/JSON: ${(e as Error).message.split("\n")[0]}`, 'Write the rows in the body instead: `- { label: HTML, value: 6120 }`'); }
  }
  if (typeof attrs.src === "string" && attrs.src.trim())
    at("invalid-prop", 2, "warning", "`chart` prop `src` is not read in v0.1", "Put the rows in the body — a chart's numbers are part of the post, and a route only rebuilds when the post changes");
  if (b.data === undefined) {
    if (!attrs.src) at("required-prop", 2, "error", "`chart` has no data", "Add rows to the body (`- { label, value }`), or `data=`");
    return;
  }
  const list = Array.isArray(b.data) ? b.data
    : b.data && typeof b.data === "object" && Array.isArray((b.data as { rows?: unknown[] }).rows) ? (b.data as { rows: unknown[] }).rows
    : b.data && typeof b.data === "object" && Array.isArray((b.data as { data?: unknown[] }).data) ? (b.data as { data: unknown[] }).data
    : undefined;
  if (!list) { at("invalid-prop", 2, "error", "`chart` data is not a list of rows", 'The body is a YAML list: `- { label: HTML, value: 6120 }`'); return; }
  if (!list.length) { at("required-prop", 2, "error", "`chart` has no rows", 'Add at least one `- { label, value }`'); return; }
  let bad = 0;
  for (const [i, raw] of list.entries()) {
    const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : undefined;
    const value = r ? (typeof r.value === "number" ? r.value : typeof r.value === "string" ? Number(r.value) : NaN) : NaN;
    if (r && r.label !== undefined && r.label !== null && String(r.label) !== "" && Number.isFinite(value)) continue;
    if (bad++ < 3) at("invalid-prop", 2, "error", `\`chart\` row ${i + 1} is not \`{ label, value }\``, 'Every row needs a label and a number: `- { label: HTML, value: 6120 }`');
  }
  if (bad > 3) at("invalid-prop", 2, "error", `\`chart\` has ${bad} malformed rows`, 'Every row needs a label and a number: `- { label: HTML, value: 6120 }`');
  if (list.length > CHART_MAX_POINTS)
    at("slot-limit", 2, "warning", `\`chart\` has ${list.length} points; the spec's intent is ≤ ${CHART_MAX_POINTS}`, "Show the comparison that matters and leave the rest to the table in the .md twin — a chart past a dozen points stops being readable");
}

/** Count nodes a diagram/flow body declares (for the 40-node lint). */
export function countNodes(name: string, data: unknown): number {
  if (!data || typeof data !== "object") return 0;
  const d = data as Record<string, unknown>;
  if (name === "diagram") return Array.isArray(d.nodes) ? d.nodes.length : 0;
  if (name === "flow") {
    // a string or { id, do } is one node; { ask, yes, no } is one node plus its branches; { then } is an edge
    const one = (s: unknown): number => {
      if (typeof s === "string") return 1;
      if (Array.isArray(s)) return walk(s);
      if (!s || typeof s !== "object") return 0;
      const o = s as Record<string, unknown>;
      if ("then" in o) return 0;
      if ("ask" in o) return 1 + one(o.yes) + one(o.no);
      return 1;
    };
    const walk = (steps: unknown): number => Array.isArray(steps) ? steps.reduce<number>((n, s) => n + one(s), 0) : 0;
    return walk(d.steps);
  }
  return 0;
}

export function buildTree(doc: ParsedDoc, source: string): PrimitiveTree {
  const issues: Diagnostic[] = [];
  const all: Block[] = [];

  const visit = (node: Node, depth: number, out: Block[]) => {
    if (isDirective(node)) {
      const b = toBlock(node, depth);
      out.push(b); all.push(b);
      if (node.type !== "textDirective") for (const c of node.children) visit(c, depth + 1, b.children);
      return;
    }
    if ("children" in node) for (const c of (node as Parent).children) visit(c, depth, out);
  };

  const toBlock = (node: Directive, depth: number): Block => {
    const line = node.position?.start.line ?? 0, column = node.position?.start.column ?? 0;
    const spec = specPrimitive(node.name);
    const attrs = (node.attributes ?? {}) as Record<string, string | null | undefined>;
    const b: Block = { name: node.name, kind: kindOf(node), props: {}, spec, depth, line, column, node, children: [] };
    const at = (rule: string, n: number, severity: Severity, message: string, hint: string): void => { issues.push({ rule, n, severity, message, hint, line, column, block: node.name }); };

    if (!spec) {
      at("unknown-block", 1, "error", `Unknown block \`${node.name}\``, `Use one of the vocabulary (read snypd://spec/primitives) or write plain markdown; unknown blocks never pass through silently`);
      for (const [k, v] of Object.entries(attrs)) b.props[k] = v ?? true;
      return b;
    }
    if (spec.kind !== b.kind && !(spec.name === "chart" && b.kind === "leaf")) {
      const want = spec.kind === "container" ? `:::${spec.name} … :::` : spec.kind === "leaf" ? `::${spec.name}{…}` : `:${spec.name}[…]`;
      at("invalid-prop", 2, "error", `\`${node.name}\` is a ${spec.kind}, written as a ${b.kind}`, `Write it as ${want}`);
    }
    const isEvidence = spec.group === "evidence" && spec.props.source?.required;
    for (const [k, f] of Object.entries(spec.props)) {
      const raw = attrs[k];
      if (raw === undefined || raw === null || raw === "") {
        if (f.default !== undefined) b.props[k] = f.default;
        if (f.required && !(isEvidence && k === "source") && !(node.name === "figure" && k === "alt"))   // rules 3 and 4 own those, in lint.ts
          at("required-prop", 2, "error", `\`${node.name}\` is missing required prop \`${k}\``, `Add ${k}="…"${f.description ? ` — ${f.description}` : ""}`);
        continue;
      }
      const { value, problem } = checkProp(f, raw);
      b.props[k] = value;
      if (problem) at("invalid-prop", 2, "error", `\`${node.name}\` prop \`${k}\` ${problem}`, `See snypd://spec/primitives/${node.name}`);
    }
    for (const k of Object.keys(attrs)) {
      if (k in spec.props || k === "class" || k === "id" || k === "variant") { if (!(k in b.props)) b.props[k] = attrs[k]; continue; }
      at("unknown-prop", 2, "warning", `\`${node.name}\` has no prop \`${k}\``, `Remove it or check snypd://spec/primitives/${node.name} for the prop's name`);
      b.props[k] = attrs[k];
    }
    // slots
    const slots = (spec.slots ?? {}) as Record<string, string | { type?: string; min?: number; max?: number | Record<string, number> }>;
    const body = typeof slots.body === "string" ? { type: slots.body } : slots.body;   // `body: yaml` and `body: { type: yaml, … }` are both spec forms
    if (node.type === "containerDirective" && body?.type === "yaml") {
      b.body = bodyOf(node, source);
      try { b.data = parseYaml(b.body); }
      catch (e) { at("invalid-prop", 2, "error", `\`${node.name}\` body is not valid YAML: ${(e as Error).message.split("\n")[0]}`, `The body of ${node.name} is data — see the example in snypd://spec/primitives/${node.name}`); }
      const max = typeof body.max === "object" ? body.max.nodes : undefined;
      if (max !== undefined && b.data) {
        const n = countNodes(node.name, b.data);
        if (n > max) at("slot-limit", 2, "error", `\`${node.name}\` declares ${n} nodes; the limit is ${max}`, `Split it into two ${node.name}s or drop detail — readers cannot follow more than ${max} boxes`);
      }
    }
    if (node.name === "chart") checkChart(b, attrs, at);
    return b;
  };

  const blocks: Block[] = [];
  visit(doc.tree, 0, blocks);

  // slots.children: stat-row 2–4 stats
  for (const b of all) {
    const slots = (b.spec?.slots ?? {}) as Record<string, { type?: string; of?: { to?: string }; min?: number; max?: number }>;
    const ch = slots.children;
    if (!ch) continue;
    const want = ch.of?.to;
    const kids = b.children.filter((c) => !want || c.name === want);
    const strangers = b.children.filter((c) => want && c.name !== want);
    for (const s of strangers) issues.push({ rule: "invalid-prop", n: 2, severity: "error", message: `\`${b.name}\` may only contain \`${want}\`, found \`${s.name}\``, hint: `Move the ${s.name} outside the ${b.name}`, line: s.line, column: s.column, block: b.name });
    if (ch.min !== undefined && kids.length < ch.min) issues.push({ rule: "slot-limit", n: 2, severity: "error", message: `\`${b.name}\` needs at least ${ch.min} ${want ?? "children"}, has ${kids.length}`, hint: kids.length === 1 ? `One number is a sentence, not a row — inline it or add a second stat` : `Add ${want} blocks inside the ${b.name}`, line: b.line, column: b.column, block: b.name });
    if (ch.max !== undefined && kids.length > ch.max) issues.push({ rule: "slot-limit", n: 2, severity: "error", message: `\`${b.name}\` holds at most ${ch.max} ${want ?? "children"}, has ${kids.length}`, hint: `Split into two ${b.name}s`, line: b.line, column: b.column, block: b.name });
  }
  return { blocks, all, issues };
}

export type { Root };
