/**
 * S15 `content.suggest_blocks` — prose someone already wrote → the primitives it was always trying to be.
 *
 * Three stages, and the third is the one that matters:
 *
 *  1. **shapes** — seven candidate extractors over the mdast (`table`, `ordered-list`, `list`,
 *     `blockquote`, `heading-run`, `image-paragraph`, `paragraph`). Each publishes plain *facts*
 *     (numbers, booleans, strings) and a source range. Extractors are code because extraction is.
 *  2. **scoring** — `packages/spec/detect/{name}.yaml` scores those facts. `require:` gates, `signals:`
 *     add weights, `min:` is the floor. Adding a primitive that fits an existing shape is one YAML file
 *     and no code, which is the whole point of keeping the detectors out here (docs/07 decision 35).
 *  3. **verification** — every suggestion is parsed, typed and linted *before it is returned*, against the
 *     document it would land in. A suggestion may never introduce a lint error it did not declare. What it
 *     cannot get from the prose it declares as a `need` (a `chart` has no `source:` in a plain table), and
 *     `apply` refuses a suggestion with an unmet need rather than writing a post that fails lint.
 *
 * Only top-level candidates are considered: a container's body is a slice of the original source, and a
 * slice taken from inside a list item would arrive at column 5 with its fences at column 1.
 */
import { detectorsByShape, primitive, type Detector, type Signal, type Shape } from "@snypd/spec";
import type { Node, Parent, Table, List, Paragraph, Heading, Image, Link } from "mdast";
import { parseMarkdown, type ParsedDoc } from "./parse";
import { buildTree } from "./tree";
import { lint, type LintOptions } from "./lint";
import type { Diagnostic } from "./tree";

// ── facts ─────────────────────────────────────────────────────────────────────
export type Fact = number | boolean | string;
export interface Candidate {
  shape: Shape;
  /** Byte offsets into the source the suggestion would replace. */
  start: number; end: number;
  /** 1-based line span, for the human half of the message. */
  line: number; endLine: number;
  facts: Record<string, Fact>;
  /** Everything a rewriter needs that is not a fact. */
  nodes: Node[];
  source: string;
  /** The nearest heading above this candidate, or a one-sentence lead paragraph — the caption a
   *  primitive that requires one can honestly take, rather than inventing a sentence. */
  lead?: string;
}

/** What the prose could not supply. A suggestion with unmet needs is shown, explained, and not applied. */
export interface Need { prop: string; why: string; placeholder: string }

export interface Suggestion {
  /** Stable within one call, so `apply` and `fill` can name a suggestion: "1", "2", … */
  id: string;
  primitive: string;
  confidence: number;
  line: number; endLine: number;
  start: number; end: number;
  /** The reasons, in weight order — authored in the detector YAML, written for a reader. */
  because: string[];
  /** The primitive that scored second on the same range, if any: "could also be `steps` (0.61)". */
  alsoConsidered?: { primitive: string; confidence: number };
  /** What replaces `[start, end)`. Lint-clean except for the declared needs. */
  markdown: string;
  /** The source it replaces, so a caller can show a diff without re-reading the file. */
  replaces: string;
  needs: Need[];
}

const num = (v: Fact | undefined) => (typeof v === "number" ? v : NaN);
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const sentences = (s: string) => s.split(/[.!?](?:\s|$)/).filter((x) => x.trim()).length;

/** Text of a node with the markdown removed — what a fact reads. */
function toText(n: Node): string {
  if ("value" in n && typeof (n as { value: unknown }).value === "string") return (n as { value: string }).value;
  if ("children" in n) return (n as Parent).children.map(toText).join("");
  return "";
}
const hasType = (n: Node, type: string): boolean =>
  n.type === type || ("children" in n && (n as Parent).children.some((c) => hasType(c, type)));

/** "1,240 ms" → 1240; "$4.2k" → 4200; "—" → NaN. A cell is numeric when this is finite. */
export function toNumber(raw: string): number {
  const s = raw.trim().replace(/[,\s ]/g, "").replace(/^[$£€]/, "");
  const m = /^([-+]?\d*\.?\d+)(.*)$/.exec(s);
  if (!m) return NaN;
  const v = Number(m[1]);
  if (!Number.isFinite(v)) return NaN;
  // A magnitude suffix is the *whole* remainder: "4.2k" is four thousand two hundred, "1240ms" is
  // twelve hundred and forty milliseconds. Reading the m of ms as a million is off by a factor of 1e6.
  const rest = (m[2] ?? "").toLowerCase();
  return rest === "k" ? v * 1e3 : rest === "m" ? v * 1e6 : rest === "b" ? v * 1e9 : v;
}

const IMPERATIVE = /^(add|run|open|write|set|copy|paste|click|install|create|make|check|verify|build|deploy|push|pull|commit|start|stop|edit|rename|delete|remove|choose|select|enter|type|save|download|upload|configure|point|send|call|read|replace|move|drop|name|give|put|use|wait|restart|confirm|apply|import|export|generate|publish|merge|clone|fetch|tag|serve|return|answer|reload|watch|measure|compare|record|repeat|split|join|mount|link|test|lint|format|sort|filter|count|log|track|scan|list|find|swap|bump|pin|patch|revert|rebase|stash)\b/i;
const CONDITIONAL = /\b(if|unless|otherwise|when it|either|whether|in case|should (?:it|you|the)|on failure|fails?,|passes,)\b/i;
const BACKREF = /\b(back to|return to|repeat (?:from|step)|go to step|retry)\b/i;
const UNIT = /\b(ms|s|kb|mb|gb|%|pp|tokens|req\/s|rps|px|x|×)\b/i;
const CALLOUT_PREFIX = /^\s*(?:\*\*|__)?(note|tip|hint|warning|caution|danger|important)(?:\*\*|__)?\s*[:.—-]/i;

/** Headers that name an axis rather than a measurement: the column is numeric and is still the label. */
const AXIS_HEADER = /^\s*(year|yr|quarter|q|month|week|day|date|period|version|release|run|session|n|size|bucket|bin|step)\b/i;

/**
 * One reading of a table, shared by the `table` facts and the `chart` rewriter — they disagreed once
 * (a `Year | Kilobytes` table has two numeric columns and so, on the first cut, no label axis at all),
 * and a fact the rewriter recomputes differently is a fact that will drift.
 */
export function readTable(t: Table): { header: string[]; rows: string[][]; numericAt: number[]; labelAt?: number } {
  const header = (t.children[0]?.children ?? []).map(toText);
  const rows = t.children.slice(1).map((r) => r.children.map(toText));
  const numericAt: number[] = [];
  for (let i = 0; i < header.length; i++) {
    const ok = rows.map((r) => toNumber(r[i] ?? "")).filter(Number.isFinite).length;
    if (rows.length && ok / rows.length >= 0.8) numericAt.push(i);
  }
  let labelAt = [...Array(header.length).keys()].find((i) => !numericAt.includes(i));
  if (labelAt === undefined && numericAt.length > 1) {
    // Every column parses as a number. A first column of unique, whole, ordered values under a header
    // like "Year" is the axis the rows are measured *along*, not another measurement.
    const first = numericAt[0]!;
    const vals = rows.map((r) => toNumber(r[first] ?? ""));
    const whole = vals.every((v) => Number.isInteger(v));
    const ordered = vals.every((v, i) => i === 0 || v > vals[i - 1]!) || vals.every((v, i) => i === 0 || v < vals[i - 1]!);
    if (whole && ordered && new Set(vals).size === vals.length && AXIS_HEADER.test(header[first] ?? "")) {
      labelAt = first;
      numericAt.splice(0, 1);
    }
  }
  return { header, rows, numericAt, labelAt };
}

const rangeOf = (nodes: Node[]) => ({
  start: nodes[0]!.position!.start.offset!, end: nodes[nodes.length - 1]!.position!.end.offset!,
  line: nodes[0]!.position!.start.line, endLine: nodes[nodes.length - 1]!.position!.end.line,
});

/** The nearest heading above `i`, else a preceding single-sentence paragraph. Never invented. */
function leadFor(top: Node[], i: number): string | undefined {
  for (let k = i - 1; k >= 0 && i - k <= 3; k--) {
    const n = top[k]!;
    if (n.type === "heading") return toText(n).replace(/\s+/g, " ").trim().replace(/[.:]$/, "") + ".";
    if (n.type === "paragraph") {
      const t = toText(n).replace(/\s+/g, " ").trim();
      if (t && sentences(t) === 1 && words(t) <= 20) return t.replace(/[.:]$/, "") + ".";
    }
  }
  return undefined;
}

// ── shapes ────────────────────────────────────────────────────────────────────
/** Every top-level candidate in the document, one per shape that matches. */
export function candidates(doc: ParsedDoc, source: string): Candidate[] {
  const out: Candidate[] = [];
  const top = doc.tree.children.filter((c) => c.type !== "yaml");
  const bodyText = top.map(toText).join("\n").toLowerCase();
  const make = (shape: Shape, nodes: Node[], facts: Record<string, Fact>, at = 0): void => {
    if (!nodes.length || !nodes[0]!.position?.start.offset === undefined) return;
    const r = rangeOf(nodes);
    out.push({ shape, ...r, facts, nodes, source: source.slice(r.start, r.end), lead: leadFor(top, at) });
  };

  for (const [i, n] of top.entries()) {
    const next = top[i + 1];
    const firstContent = i === 0;

    // ── table ────────────────────────────────────────────────────────────────
    if (n.type === "table") {
      const t = n as Table;
      const { header, rows, numericAt, labelAt: labelCol } = readTable(t);
      const cols = header.length;
      const numericColumns = numericAt.length;
      const series = numericAt.length === 1 ? rows.map((r) => toNumber(r[numericAt[0]!] ?? "")) : [];
      const monotonic = series.length >= 3 && (series.every((v, k) => k === 0 || v >= series[k - 1]!) || series.every((v, k) => k === 0 || v <= series[k - 1]!));
      make("table", [n], {
        rows: rows.length, columns: cols, numericColumns,
        labelColumn: labelCol !== undefined,
        headerText: header.join(" "),
        hasLinks: hasType(n, "link"),
        maxLabelWords: labelCol === undefined ? 0 : Math.max(0, ...rows.map((r) => words(r[labelCol] ?? ""))),
        monotonic,
      }, i);
    }

    // ── ordered-list / list ──────────────────────────────────────────────────
    if (n.type === "list") {
      const l = n as List;
      const items = l.children.map((li) => toText(li).trim());
      const text = items.join("\n");
      const shape: Shape = l.ordered ? "ordered-list" : "list";
      const leading = items.filter((s) => Number.isFinite(toNumber(s)));
      const base = {
        items: items.length, text,
        imperatives: items.filter((s) => IMPERATIVE.test(s)).length,
        conditionals: items.filter((s) => CONDITIONAL.test(s)).length,
        backReferences: items.filter((s) => BACKREF.test(s)).length,
        boldLeadIns: l.children.filter((li) => hasType(li, "strong")).length,
        hasCode: hasType(n, "inlineCode") || hasType(n, "code"),
        hasNested: l.children.some((li) => li.children.some((c) => c.type === "list")),
        hasLinks: hasType(n, "link"),
        branchWords: text,
        allNounPhrases: items.every((s) => !IMPERATIVE.test(s)),
        leadingNumbers: leading.length,
        allLeadWithNumber: items.length > 0 && leading.length === items.length,
        hasUnits: UNIT.test(text),
        maxItemWords: Math.max(0, ...items.map(words)),
      };
      make(shape, [n], base, i);
    }

    // ── blockquote ───────────────────────────────────────────────────────────
    if (n.type === "blockquote") {
      const text = toText(n).trim();
      const m = CALLOUT_PREFIX.exec(text);
      const attribution = /(?:^|\n)\s*[—-]{1,2}\s*\S.*$/.test(text);
      const bare = m ? text.slice(m[0].length).trim() : text;
      // The "— Who said it" line is the cite, not a second sentence; counting it made every properly
      // attributed quote — the clearest pullquote there is — score as an excerpt.
      const said = bare.replace(/(?:^|\n)\s*[\u2014-]{1,2}\s*\S.*$/, "").trim();
      make("blockquote", [n], {
        words: words(said), sentences: sentences(said),
        prefix: m ? m[1]!.toLowerCase() : "",
        hasAttribution: attribution,
        hasCode: hasType(n, "inlineCode") || hasType(n, "code"),
        echoesBody: bare.length > 20 && bodyText.split(bare.toLowerCase()).length > 2,
        text: bare,
      });
    }

    // ── heading-run ──────────────────────────────────────────────────────────
    // A run of same-depth headings each followed by body. Anchored on the first, so it is emitted once.
    if (n.type === "heading" && (i === 0 || top[i - 1]!.type !== "heading" || (top[i - 1] as Heading).depth !== (n as Heading).depth)) {
      const depth = (n as Heading).depth;
      const heads: Heading[] = []; const answers: number[] = []; const nodes: Node[] = [];
      let k = i;
      while (k < top.length && top[k]!.type === "heading" && (top[k] as Heading).depth === depth) {
        heads.push(top[k] as Heading); nodes.push(top[k]!);
        let w = 0, j = k + 1;
        for (; j < top.length && top[j]!.type === "paragraph"; j++) { w += words(toText(top[j]!)); nodes.push(top[j]!); }
        // Anything that is not a paragraph ends the run here: `faq`'s slot is "headings, each followed by
        // answer paragraphs", and a run that reaches past them swallows the next block whole.
        if (j < top.length && !(top[j]!.type === "heading" && (top[j] as Heading).depth === depth)) { if (w) answers.push(w); else heads.pop(); k = j; break; }
        if (!w) { heads.pop(); nodes.length = Math.max(0, nodes.length - 1); break; }
        answers.push(w); k = j;
      }
      if (heads.length >= 2) {
        const q = heads.filter((h) => toText(h).trim().endsWith("?")).length;
        make("heading-run", nodes, {
          headings: heads.length, questions: q, questionRatio: q / heads.length, depth,
          avgAnswerWords: answers.reduce((a, b) => a + b, 0) / answers.length,
        });
      }
    }

    // ── image-paragraph ──────────────────────────────────────────────────────
    if (n.type === "paragraph") {
      const p = n as Paragraph;
      const kids = p.children.filter((c) => !(c.type === "text" && !toText(c).trim()));
      const img = kids.length === 1 && kids[0]!.type === "image" ? (kids[0] as Image) : undefined;
      if (img) {
        const capNode = next?.type === "paragraph" && next.children.length === 1 && next.children[0]!.type === "emphasis" ? next : undefined;
        make("image-paragraph", capNode ? [n, capNode] : [n], {
          hasAlt: !!(img.alt ?? "").trim(), alt: img.alt ?? "", src: img.url, title: img.title ?? "",
          captionFollows: !!capNode, caption: capNode ? toText(capNode).trim() : "",
          first: firstContent, beforeAnyHeading: !top.slice(0, i).some((x) => x.type === "heading"),
        });
      } else {
        // ── paragraph ──────────────────────────────────────────────────────────
        const text = toText(n).trim();
        const link = kids.length === 1 && kids[0]!.type === "link" ? (kids[0] as Link) : undefined;
        make("paragraph", [n], {
          first: firstContent, last: i === top.length - 1,
          words: words(text), sentences: sentences(text), text, prefix: text.toLowerCase(),
          linkOnly: !!link, linkIsExternal: !!link && /^https?:\/\//i.test(link.url), href: link?.url ?? "",
          hasLink: hasType(n, "link"),
        });
      }
    }
  }
  return out;
}

// ── scoring ───────────────────────────────────────────────────────────────────
function gate(d: Detector, facts: Record<string, Fact>): boolean {
  for (const [k, req] of Object.entries(d.require ?? {})) {
    const v = facts[k];
    if (typeof req === "boolean") { if (Boolean(v) !== req) return false; continue; }
    const n = num(v);
    if (!Number.isFinite(n) || n < req[0] || n > req[1]) return false;
  }
  return true;
}
function fires(s: Signal, facts: Record<string, Fact>): boolean {
  const v = facts[s.fact];
  if (v === undefined) return false;
  if (s.isTrue !== undefined) return Boolean(v) === s.isTrue;
  if (s.isFalse !== undefined) return Boolean(v) !== s.isFalse;
  if (s.equals !== undefined) return v === s.equals;
  if (s.atLeast !== undefined) return num(v) >= s.atLeast;
  if (s.atMost !== undefined) return num(v) <= s.atMost;
  if (s.oneOf !== undefined) return s.oneOf.includes(v as string | number);
  if (s.matches !== undefined) return new RegExp(s.matches, "i").test(String(v));
  return false;
}
/** `floor` overrides the detector's own `min` in *both* directions — see `SuggestOptions.minConfidence`. */
export function score(d: Detector, facts: Record<string, Fact>, floor?: number): { confidence: number; because: string[] } | undefined {
  if (!gate(d, facts)) return undefined;
  const hits = (d.signals ?? []).filter((s) => fires(s, facts));
  const confidence = Math.max(0, Math.min(1, (d.base ?? 0.3) + hits.reduce((a, s) => a + s.weight, 0)));
  if (confidence < (floor ?? d.min ?? 0.6)) return undefined;
  return { confidence: +confidence.toFixed(2), because: hits.filter((s) => s.weight > 0).sort((a, b) => b.weight - a.weight).map((s) => s.because) };
}

// ── rewriters ─────────────────────────────────────────────────────────────────
/**
 * One per suggestible primitive: candidate → the markdown that replaces it, plus whatever the prose
 * could not supply. A rewriter never invents evidence — a `source:` it cannot find is a `need`, not a
 * plausible URL, because the whole point of lint rule 3 is that a number without a checkable origin is
 * an opinion. `NEED` is the placeholder; `applySuggestions` refuses to write one.
 */
export const NEED = "TODO";
type Rewrite = { markdown: string; needs?: Need[] } | undefined;
type Rewriter = (c: Candidate) => Rewrite;

const q = (s: string) => `"${String(s).replace(/"/g, "'").replace(/\s*\n\s*/g, " ").trim()}"`;
const attrs = (o: Record<string, string | undefined>) =>
  Object.entries(o).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${k}=${q(v!)}`).join(" ");
const container = (name: string, props: Record<string, string | undefined>, body: string) => {
  const a = attrs(props);
  return `:::${name}${a ? `{${a}}` : ""}\n${body.replace(/\n+$/, "")}\n:::`;
};
const leaf = (name: string, props: Record<string, string | undefined>) => `::${name}{${attrs(props)}}`;
/** The candidate's own source, de-indented — a container body is a slice, not a re-render. */
const bodyOf = (c: Candidate) => c.source.replace(/\n+$/, "");
const SOURCE_NEED: Need = { prop: "source", why: "Lint rule 3 fails a chart or a stat with no checkable source — a number whose origin cannot be clicked is an opinion, and the prose does not carry one", placeholder: NEED };
/** One `fill` value meets every unfilled `source=` in the block, which is the common case (one bench page
 *  behind every number in the row). Three different origins means three edits, and that is honest work. */

const TIMEISH = /^(19|20)\d{2}\b|^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|^(mon|tue|wed|thu|fri|sat|sun)|^q[1-4]\b|^week\b|^day\b/i;

const rewriteChart: Rewriter = (c) => {
  const { header, rows, numericAt, labelAt } = readTable(c.nodes[0] as Table);
  const valueAt = numericAt[0];
  if (valueAt === undefined || labelAt === undefined) return undefined;
  const seriesAt = numericAt[1];
  const labels = rows.map((r) => (r[labelAt] ?? "").trim());
  // Two numeric columns = two series of the same measure; one row per column keeps `series` honest.
  const data = seriesAt === undefined
    ? rows.map((r) => `- { label: ${yamlScalar(labels[rows.indexOf(r)] ?? "")}, value: ${toNumber(r[valueAt] ?? "")} }`)
    : rows.flatMap((r, i) => [valueAt, seriesAt].map((col) => `- { label: ${yamlScalar(labels[i] ?? "")}, value: ${toNumber(r[col] ?? "")}, series: ${yamlScalar((header[col] ?? "").trim())} }`));
  const unitM = UNIT.exec(header[valueAt] ?? "");
  const type = labels.every((l) => TIMEISH.test(l)) ? "line" : "bar";
  const measure = (header[valueAt] ?? "value").trim(), by = (header[labelAt] ?? "label").trim();
  return {
    markdown: container("chart", { type, source: NEED, caption: `${measure} by ${by.toLowerCase()}.`, unit: unitM ? unitM[1] : undefined }, data.join("\n")),
    needs: [SOURCE_NEED],
  };
};
/** A label is a YAML scalar in a flow-map, so anything with a comma, colon or brace has to be quoted. */
function yamlScalar(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return /^[A-Za-z0-9][A-Za-z0-9 ._/+%-]*$/.test(t) && !/^(y|n|yes|no|true|false|on|off|null|~)$/i.test(t) ? t : JSON.stringify(t);
}

const rewriteSteps: Rewriter = (c) => ({ markdown: container("steps", {}, bodyOf(c)) });

/**
 * `flow`'s body is a graph, not the list — the sugar is `steps:` where a string is a step and
 * `{ ask, yes, no }` a decision. An item whose sentence splits on a conditional becomes the question and
 * its consequence; everything else stays a step. What cannot be split stays a plain step rather than
 * being guessed at, and the branch the prose does not state is left for the author.
 */
const rewriteFlow: Rewriter = (c) => {
  const list = c.nodes[0] as List;
  const caption = c.lead ?? "";
  const items = list.children.map((li) => toText(li).replace(/\s+/g, " ").trim());
  const lines: string[] = [];
  let decisions = 0;
  for (const raw of items) {
    const m = /^(?:if|when|unless)\s+([^,;.]+)[,;.]\s*(.+)$/i.exec(raw);
    if (m) {
      decisions++;
      const [, cond, then] = m;
      const alt = /\botherwise[,]?\s*(.+)$/i.exec(then!);
      const question = cond!.trim().replace(/\?$/, "");
      lines.push(`- ask: ${yamlScalar(question[0]!.toUpperCase() + question.slice(1) + "?")}`);
      lines.push(`  yes: ${yamlScalar((alt ? then!.slice(0, alt.index) : then!).trim().replace(/[.;]$/, ""))}`);
      if (alt) lines.push(`  no: ${yamlScalar(alt[1]!.trim().replace(/[.;]$/, ""))}`);
      continue;
    }
    lines.push(`- ${yamlScalar(raw.replace(/[.;]$/, ""))}`);
  }
  if (!decisions) return undefined;   // lint rule 2 warns on a decisionless flow — that is a `steps`
  return {
    markdown: container("flow", { caption: caption || NEED }, `steps:\n${lines.join("\n")}`),
    needs: caption ? [] : [{ prop: "caption", why: "`flow` requires a caption saying what the procedure is, and there is no heading or short lead paragraph above the list to take one from", placeholder: NEED }],
  };
};

const rewriteFaq: Rewriter = (c) => ({ markdown: container("faq", {}, bodyOf(c)) });

const rewriteCallout: Rewriter = (c) => {
  const prefix = String(c.facts.prefix ?? "");
  const kind = ["warning", "caution", "danger", "important"].includes(prefix) ? "warning" : prefix === "tip" || prefix === "hint" ? "tip" : "note";
  const body = String(c.facts.text ?? "").trim();
  if (!body) return undefined;
  return { markdown: container("callout", { kind }, body[0]!.toUpperCase() + body.slice(1)) };
};

const rewritePullquote: Rewriter = (c) => {
  const text = String(c.facts.text ?? "").trim();
  const m = /(?:^|\n)\s*[—-]{1,2}\s*(\S.*)$/.exec(text);
  const cite = m ? m[1]!.trim() : undefined;
  const body = (m ? text.slice(0, m.index) : text).trim();
  if (!body) return undefined;
  return { markdown: container("pullquote", { cite }, body) };
};

const rewriteTldr: Rewriter = (c) => {
  const body = String(c.facts.text ?? "").replace(/^(tl;?dr|in short|summary|the short version|bottom line)\b\s*[:—-]?\s*/i, "").trim();
  if (!body) return undefined;
  // Stripping the label leaves a sentence that starts mid-thought; the label was doing the capital's work.
  const cap = body[0]!.toUpperCase() + body.slice(1);
  return { markdown: container("tldr", {}, cap) };
};

const rewriteFigure: Rewriter = (c) => {
  const alt = String(c.facts.alt ?? "").trim();
  return {
    markdown: leaf("figure", { src: String(c.facts.src), alt: alt || NEED, caption: String(c.facts.caption ?? "") || undefined }),
    needs: alt ? [] : [{ prop: "alt", why: "Lint rule 4 fails a figure with no alt text, and the markdown image did not carry any", placeholder: NEED }],
  };
};

const rewriteCover: Rewriter = (c) => {
  const alt = String(c.facts.alt ?? "").trim();
  return {
    markdown: leaf("cover", { image: String(c.facts.src), alt: alt || NEED }),
    needs: alt ? [] : [{ prop: "alt", why: "`cover` requires alt whenever an image is set, and the markdown image did not carry any", placeholder: NEED }],
  };
};

/** `- **92 %** fewer tokens ([bench](https://…))` → one `::stat` per item, inside the row. */
const rewriteStatRow: Rewriter = (c) => {
  const list = c.nodes[0] as List;
  const stats: string[] = [];
  const missing: number[] = [];
  for (const [i, li] of list.children.entries()) {
    const text = toText(li).replace(/\s+/g, " ").trim();
    const m = /^([-+]?[$£€]?\d[\d,.]*\s*(?:%|pp|ms|s|kb|mb|gb|x|×|k|m|b)?)\s*[—:-]?\s*(.*)$/i.exec(text);
    if (!m) return undefined;
    const value = m[1]!.trim();
    let label = m[2]!.trim().replace(/\s*\(.*\)\s*$/, "").replace(/[.;]$/, "");
    const href = firstLink(li);
    if (!href) missing.push(i + 1);
    if (!label) return undefined;
    stats.push(`${leaf("stat", { value, label, source: href ?? NEED })}`);
  }
  if (stats.length < 2) return undefined;
  return {
    markdown: container("stat-row", {}, stats.join("\n")),
    needs: missing.length ? [{ ...SOURCE_NEED, prop: `source (stat ${missing.join(", ")})` }] : [],
  };
};
function firstLink(n: Node): string | undefined {
  if (n.type === "link") { const u = (n as Link).url; return /^https?:\/\//i.test(u) ? u : undefined; }
  if ("children" in n) for (const c of (n as Parent).children) { const u = firstLink(c); if (u) return u; }
  return undefined;
}

const rewriteCta: Rewriter = (c) => {
  const href = String(c.facts.href ?? "");
  const label = String(c.facts.text ?? "").trim();
  if (!href || !label) return undefined;
  return { markdown: leaf("cta", { title: label.replace(/[.!]$/, ""), button: label.split(/\s+/).slice(0, 3).join(" ").replace(/[.!]$/, ""), href }) };
};

export const REWRITERS: Record<string, Rewriter> = {
  chart: rewriteChart, steps: rewriteSteps, flow: rewriteFlow, faq: rewriteFaq, callout: rewriteCallout,
  pullquote: rewritePullquote, tldr: rewriteTldr, figure: rewriteFigure, cover: rewriteCover,
  "stat-row": rewriteStatRow, cta: rewriteCta,
};

// ── verification and the public API ───────────────────────────────────────────
export interface SuggestOptions extends LintOptions {
  /** Only suggest these primitives. */
  only?: string[];
  /**
   * Override the floor every detector declares, in both directions. Above it, near-certainties only.
   * *Below* it is the useful direction: it shows what the tool nearly suggested and did not, which is
   * how a detector YAML gets tuned and how a reader argues with the tool's conservatism. Everything the
   * verify pass rejects is still rejected — this moves the confidence line, not the safety one.
   */
  minConfidence?: number;
  /** Vocabulary the type allows (`types.{t}.vocabulary`); "all" or a list. */
  vocabulary?: "all" | string[];
}

/**
 * A suggestion whose markdown would break the post is a bug, not a suggestion. This is where that is
 * enforced. `seen` is the document's *existing* errors, computed once by the caller — an error the post
 * already had is not one this suggestion introduced, and re-linting the original per candidate cost
 * three parses a candidate on the one path an agent waits on.
 */
function verify(source: string, s: Omit<Suggestion, "id">, opts: LintOptions, seen: Set<string>): { ok: true } | { ok: false; why: string } {
  const after = source.slice(0, s.start) + s.markdown + source.slice(s.end);
  const doc = parseMarkdown(after);
  const tree = buildTree(doc, after);
  // `needs` are declared per prop ("source", "alt", "caption"); "source (stat 1, 2)" declares "source".
  const declared = new Set(s.needs.map((n) => n.prop.split(" ")[0]!));
  /** Is this error the hole the suggestion already told the caller about? */
  const isDeclared = (d: Diagnostic): boolean =>
    (d.rule === "unsourced-evidence" && declared.has("source")) ||
    (d.rule === "image-alt" && declared.has("alt")) ||
    [...declared].some((prop) => d.message.includes(`\`${prop}\``));
  const r = lint(doc, tree, after, opts);
  for (const d of r.diagnostics) {
    if (d.severity !== "error" || seen.has(`${d.rule}:${d.message}`)) continue;   // pre-existing, not ours
    if (isDeclared(d)) continue;
    return { ok: false, why: `${d.rule}: ${d.message}` };
  }
  return { ok: true };
}

/**
 * Every upgrade this prose supports, best first. Overlapping candidates are resolved by confidence —
 * the loser rides along as `alsoConsidered`, because "I read this as a flow rather than steps" is the
 * part a human wants to argue with.
 */
export function suggestBlocks(source: string, opts: SuggestOptions = {}): Suggestion[] {
  const doc = parseMarkdown(source);
  const byShape = detectorsByShape();
  const seen = new Set(lint(doc, buildTree(doc, source), source, opts).diagnostics.map((d) => `${d.rule}:${d.message}`));
  const allowed = (name: string) =>
    (!opts.only || opts.only.includes(name)) &&
    (!opts.vocabulary || opts.vocabulary === "all" || opts.vocabulary.includes(name)) &&
    !!REWRITERS[name] && !!primitive(name);

  type Scored = Omit<Suggestion, "id"> & { key: string };
  const scored: Scored[] = [];
  for (const c of candidates(doc, source)) {
    const ranked = (byShape.get(c.shape) ?? [])
      .filter((d) => allowed(d.name))
      .map((d) => ({ d, s: score(d, c.facts, opts.minConfidence) }))
      .filter((x): x is { d: Detector; s: { confidence: number; because: string[] } } => !!x.s)
      .sort((a, b) => b.s.confidence - a.s.confidence);
    for (const [rank, { d, s }] of ranked.entries()) {
      const w = REWRITERS[d.name]!(c);
      if (!w) continue;                       // the shape scored but the prose would not convert cleanly
      const cand: Scored = {
        key: `${c.start}:${c.end}`, primitive: d.name, confidence: s.confidence,
        line: c.line, endLine: c.endLine, start: c.start, end: c.end,
        because: s.because, markdown: w.markdown, replaces: c.source, needs: w.needs ?? [],
        ...(ranked[rank + 1] ? { alsoConsidered: { primitive: ranked[rank + 1]!.d.name, confidence: ranked[rank + 1]!.s.confidence } } : {}),
      };
      const v = verify(source, cand, opts, seen);
      if (!v.ok) continue;                    // never hand back something that breaks the post
      scored.push(cand);
      break;                                  // one suggestion per candidate: the best one that survives
    }
  }

  // Overlapping ranges across shapes (an image paragraph is also a paragraph): highest confidence wins.
  scored.sort((a, b) => b.confidence - a.confidence || a.start - b.start);
  const kept: Scored[] = [];
  for (const s of scored) if (!kept.some((k) => s.start < k.end && k.start < s.end)) kept.push(s);
  kept.sort((a, b) => a.start - b.start);
  return kept.map(({ key: _key, ...s }, i) => ({ id: String(i + 1), ...s }));
}

export interface ApplyResult { markdown: string; applied: Suggestion[]; skipped: { id: string; why: string }[] }

/**
 * Apply suggestions to the source, last first so the earlier offsets stay valid. A suggestion with an
 * unmet need is *skipped, with the reason* rather than written with a `TODO` in it: the tool's contract
 * is that what it writes lints, and `source="TODO"` does not. `fill` is how a caller meets a need —
 * `{ "1": { source: "https://…" } }`, keyed by suggestion id.
 */
export function applySuggestions(source: string, suggestions: Suggestion[], opts: { ids?: string[]; fill?: Record<string, Record<string, string>> } = {}): ApplyResult {
  const want = opts.ids ? suggestions.filter((s) => opts.ids!.includes(s.id)) : suggestions;
  const applied: Suggestion[] = [], skipped: { id: string; why: string }[] = [];
  for (const s of want) {
    const fill = opts.fill?.[s.id] ?? {};
    let md = s.markdown;
    const unmet = s.needs.filter((n) => !fill[n.prop.split(" ")[0]!]);
    for (const n of s.needs) {
      const key = n.prop.split(" ")[0]!;
      const v = fill[key];
      if (v) md = md.split(`${key}="${NEED}"`).join(`${key}="${v.replace(/"/g, "'")}"`);
    }
    if (unmet.length) { skipped.push({ id: s.id, why: `needs ${unmet.map((n) => n.prop).join(", ")} — ${unmet[0]!.why}` }); continue; }
    applied.push({ ...s, markdown: md });
  }
  let out = source;
  for (const s of [...applied].sort((a, b) => b.start - a.start)) out = out.slice(0, s.start) + s.markdown + out.slice(s.end);
  return { markdown: out, applied, skipped };
}

/** The one-screen summary an agent reads: what changed, where, why, and what it still needs. */
export function formatSuggestions(list: Suggestion[]): string {
  if (!list.length) return "No upgrades found — the prose is already the right shape, or the vocabulary has nothing better to offer it.";
  return list.map((s) => {
    const head = `${s.id}. lines ${s.line}–${s.endLine}  →  \`${s.primitive}\`  (${s.confidence.toFixed(2)})`;
    const why = s.because.map((b) => `   · ${b}`);
    const also = s.alsoConsidered ? [`   · also considered \`${s.alsoConsidered.primitive}\` (${s.alsoConsidered.confidence.toFixed(2)})`] : [];
    const needs = s.needs.map((n) => `   ! needs ${n.prop} — ${n.why}`);
    return [head, ...why, ...also, ...needs].join("\n");
  }).join("\n\n");
}

export type { Diagnostic };
