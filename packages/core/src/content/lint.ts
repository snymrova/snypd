/**
 * S5 validate stage, part 2: editorial lint (docs/01 "Editorial lint"), rules 1–9 plus the frontmatter
 * schema (rule 0). Every diagnostic carries a stable id, a severity and a fix hint an agent can act on.
 *
 *  0 frontmatter        required fields, unknown fields, types, status (from the merged type schema)
 *  1 unknown-block      directive not in the vocabulary                          (tree.ts)
 *  2 required-prop / invalid-prop / unknown-prop / slot-limit                    (tree.ts)
 *  3 unsourced-evidence stat / chart without a checkable source
 *  4 image-alt          figure / markdown image / cover without alt text
 *  5 dead-internal-link site-relative href that resolves to no route
 *  6 heading-skip       h1 in the body, or a level jump (## → ####)
 *  7 stale-updated      `updated` before `date`; `updatedNote` without `updated`   (git-based staleness: S11)
 *  8 slop-phrase        phrases from the slop list
 *  9 callout-density    more than N callouts per 1,000 words
 * 10 slug-change        route changed since the file was first indexed and nothing redirects the old one   (lintSite, from the index)
 * 11 tag-once           a tag no other post uses                                                          (lintSite)
 */
import type { Node, Parent, Heading, Link, Image, Text } from "mdast";
import type { FieldSpec } from "@snypd/spec";
import type { ParsedDoc } from "./parse";
import { frontmatterKeyLine } from "./parse";
import { checkProp, type Block, type Diagnostic, type PrimitiveTree } from "./tree";

export interface TypeShape { fields: Record<string, FieldSpec>; taxonomies?: string[] }
export interface LintOptions {
  /** Merged content type for this file (frontmatter schema). Rule 0 is skipped without it. */
  type?: TypeShape;
  /** Valid status names. */
  statuses?: string[];
  /** Known site routes (`/posts/foo`, `/about`, …). Rule 5 is skipped without it. */
  routes?: Set<string>;
  /** Rule 9 threshold; default 3 (callout.yaml anti-intent). */
  maxCalloutsPer1000?: number;
  /** Extra slop phrases. */
  slop?: string[];
  file?: string;
}

export interface LintResult {
  file?: string;
  diagnostics: Diagnostic[];
  errors: number; warnings: number;
  words: number;
  /** Rules that ran (rule 5 and 0 are skipped when their inputs are absent). */
  skipped: string[];
}

/** The slop list (rule 8). Case-insensitive, matched on prose only (not code, not YAML bodies). */
export const SLOP = [
  "delve", "delves", "delving", "in today's fast-paced", "in today's digital", "it's important to note", "it is important to note",
  "game-changer", "game changer", "unlock the", "unlocking the", "in conclusion", "at the end of the day", "seamlessly", "seamless",
  "leverage", "leveraging", "elevate your", "tapestry", "navigate the landscape", "navigating the", "a testament to", "ever-evolving",
  "let's dive in", "dive into", "look no further", "in the realm of", "revolutionize", "cutting-edge", "robust", "harness the power",
  "embark on", "journey", "unleash", "supercharge", "world of", "when it comes to", "not only .* but also", "it's worth noting",
  "the bottom line", "without further ado", "buckle up", "treasure trove", "in this article, we", "in this post, we will",
];

const slopCache = new Map<string, RegExp>();
function slopRegex(extra: string[] = []): RegExp {
  const key = extra.join("\u0000");
  let re = slopCache.get(key);
  if (!re) { re = new RegExp(`\\b(${[...SLOP, ...extra].map((s) => s.includes(".*") ? s : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i"); slopCache.set(key, re); }
  return re;
}

const walk = (n: Node, fn: (n: Node, parent?: Parent) => void, parent?: Parent) => {
  fn(n, parent);
  if ("children" in n) for (const c of (n as Parent).children) walk(c, fn, n as Parent);
};

const D = (rule: string, n: number, severity: Diagnostic["severity"], message: string, hint: string, line: number, extra: Partial<Diagnostic> = {}): Diagnostic => ({ rule, n, severity, message, hint, line, ...extra });

/** Check one frontmatter value against a field spec (rule 0). */
function checkField(key: string, f: FieldSpec, v: unknown): string | undefined {
  if (v === null || v === undefined) return;
  const t = f.type;
  const date = (x: unknown) => x instanceof Date || (typeof x === "string" && /^\d{4}-\d{2}-\d{2}/.test(x));
  if (t === "number") return typeof v === "number" ? undefined : `must be a number`;
  if (t === "boolean") return typeof v === "boolean" ? undefined : `must be true or false`;
  if (t === "date" || t === "datetime") return date(v) ? undefined : `must be a ${t === "date" ? "YYYY-MM-DD date" : "ISO datetime"}`;
  if (t === "list") { if (!Array.isArray(v)) return `must be a list`; for (const x of v) { const p = checkField(key, f.of, x); if (p) return `items ${p}`; } return; }
  if (t === "object") {
    if (typeof v !== "object" || Array.isArray(v)) return `must be a mapping`;
    for (const [k, sub] of Object.entries(f.fields)) { const p = checkField(k, sub, (v as Record<string, unknown>)[k]); if (p) return `${k} ${p}`; }
    for (const k of Object.keys(v as object)) if (!(k in f.fields)) return `has unknown key ${k}`;
    return;
  }
  if (t === "enum") return f.values.includes(String(v)) ? undefined : `must be one of ${f.values.join("|")}`;
  if (typeof v !== "string") return `must be a string`;
  return checkProp(f, v).problem;
}

export function lint(doc: ParsedDoc, tree: PrimitiveTree, source: string, opts: LintOptions = {}): LintResult {
  const out: Diagnostic[] = [...tree.issues];
  const skipped: string[] = [];
  const fm = doc.frontmatter;

  // ── 0 frontmatter ──────────────────────────────────────────────────────────
  if (doc.frontmatterError) out.push(D("frontmatter", 0, "error", `Frontmatter is not valid YAML: ${doc.frontmatterError}`, "Fix the YAML between the --- fences", Math.max(1, doc.frontmatterLine)));
  else if (opts.type) {
    const fields = opts.type.fields;
    for (const [k, f] of Object.entries(fields)) {
      if (f.required && (fm[k] === undefined || fm[k] === null || fm[k] === "")) out.push(D("frontmatter", 0, "error", `Frontmatter is missing required field \`${k}\``, `Add \`${k}:\`${f.description ? ` — ${f.description}` : ""}`, doc.frontmatterLine || 1));
      else { const p = checkField(k, f, fm[k]); if (p) out.push(D("frontmatter", 0, "error", `Frontmatter field \`${k}\` ${p}`, `See snypd://types for the schema`, frontmatterKeyLine(doc, k))); }
    }
    for (const k of Object.keys(fm)) if (!(k in fields)) out.push(D("frontmatter", 0, "warning", `Frontmatter has unknown field \`${k}\``, `Unknown fields are ignored; remove it or declare it on the type in snypd.yaml`, frontmatterKeyLine(doc, k)));
    if (opts.statuses && fm.status !== undefined && !opts.statuses.includes(String(fm.status))) out.push(D("frontmatter", 0, "error", `Unknown status \`${fm.status}\``, `Use one of ${opts.statuses.join("|")}`, frontmatterKeyLine(doc, "status")));
  } else skipped.push("frontmatter");

  // ── 3 unsourced evidence ───────────────────────────────────────────────────
  for (const b of tree.all) {
    if (!b.spec || !(b.spec.group === "evidence" && b.spec.props.source?.required)) continue;
    const src = b.props.source;
    if (typeof src !== "string" || !/^https?:\/\//i.test(src))
      out.push(D("unsourced-evidence", 3, "error", `\`${b.name}\` has no checkable source`, `Add source="https://…" pointing at where the number was measured or published; a ${b.name} without one is an opinion`, b.line, { column: b.column, block: b.name }));
  }

  // ── 4 image alt ────────────────────────────────────────────────────────────
  for (const b of tree.all) {
    if (b.name === "figure" && !(typeof b.props.alt === "string" && b.props.alt.trim()))
      out.push(D("image-alt", 4, "error", "`figure` has no alt text", "Add alt=\"what the image shows\" for readers who cannot see it", b.line, { column: b.column, block: b.name }));
  }
  const cover = fm.cover;
  if (cover && typeof cover === "object" && (cover as Record<string, unknown>).image && !(cover as Record<string, unknown>).alt)
    out.push(D("image-alt", 4, "warning", "cover.image has no cover.alt", "Add `alt:` under `cover:`", frontmatterKeyLine(doc, "cover")));

  // ── walk the body once: headings, links, images, words, prose ─────────────
  let words = 0, lastLevel = 1;
  const prose: { text: string; line: number }[] = [];
  const links: { url: string; line: number }[] = [];
  walk(doc.tree, (n, parent) => {
    if (n.type === "yaml" || n.type === "code" || n.type === "inlineCode" || n.type === "html") return;
    if (n.type === "heading") {
      const h = n as Heading, line = h.position?.start.line ?? 0;
      if (h.depth === 1) out.push(D("heading-skip", 6, "warning", "`#` heading in the body", "The title is the page's h1 — start body headings at `##`", line));
      else if (h.depth > lastLevel + 1) out.push(D("heading-skip", 6, "warning", `Heading level jumps from h${lastLevel} to h${h.depth}`, `Use h${lastLevel + 1}, or promote this heading`, line));
      lastLevel = h.depth;
    }
    if (n.type === "link") links.push({ url: (n as Link).url, line: n.position?.start.line ?? 0 });
    if (n.type === "image" && !((n as Image).alt ?? "").trim()) out.push(D("image-alt", 4, "error", "Image has no alt text", "Write `![what the image shows](src)`", n.position?.start.line ?? 0));
    if (n.type === "text" && parent?.type !== "yaml") {
      const t = (n as Text).value;
      words += t.split(/\s+/).filter(Boolean).length; prose.push({ text: t, line: n.position?.start.line ?? 0 });
    }
  });
  // subtract the words inside yaml-bodied containers (chart/diagram/flow data is not prose)
  for (const b of tree.all) if (b.body !== undefined) words -= b.body.split(/\s+/).filter(Boolean).length;
  words = Math.max(0, words);
  for (const b of tree.all) if (b.name === "cta" && typeof b.props.href === "string") links.push({ url: b.props.href, line: b.line });

  // ── 5 dead internal links ──────────────────────────────────────────────────
  if (opts.routes) {
    for (const { url, line } of links) {
      if (!url.startsWith("/") || url.startsWith("//")) continue;
      const path = url.replace(/[#?].*$/, "").replace(/\/+$/, "") || "/";
      if (!opts.routes.has(path)) out.push(D("dead-internal-link", 5, "error", `Internal link \`${url}\` resolves to no route`, `Check the slug (\`snypd://config\` lists url patterns); use an absolute URL for external pages`, line));
    }
  } else skipped.push("dead-internal-link");

  // ── 7 stale updated ────────────────────────────────────────────────────────
  const asDate = (v: unknown) => v instanceof Date ? v : typeof v === "string" ? new Date(v) : undefined;
  const date = asDate(fm.date), updated = asDate(fm.updated);
  if (updated && date && !Number.isNaN(+updated) && !Number.isNaN(+date) && updated < date) out.push(D("stale-updated", 7, "warning", "`updated` is earlier than `date`", "Set `updated:` to the day of the last substantive edit, or remove it", frontmatterKeyLine(doc, "updated")));
  if (fm.updatedNote && !updated) out.push(D("stale-updated", 7, "warning", "`updatedNote` without `updated`", "Add `updated: YYYY-MM-DD` so readers and feeds know when it changed", frontmatterKeyLine(doc, "updatedNote")));

  // ── 8 slop ─────────────────────────────────────────────────────────────────
  const slop = slopRegex(opts.slop);
  const seen = new Set<string>();
  for (const { text, line } of prose) {
    const m = slop.exec(text);
    if (!m) continue;
    const phrase = m[1]!.toLowerCase();
    if (seen.has(phrase)) continue;
    seen.add(phrase);
    out.push(D("slop-phrase", 8, "warning", `Slop phrase “${m[1]}”`, "Say the specific thing instead; the phrase carries no information", line));
  }

  // ── 9 callout density ──────────────────────────────────────────────────────
  const max = opts.maxCalloutsPer1000 ?? 3;
  const callouts = tree.all.filter((b) => b.name === "callout");
  const per1000 = words > 0 ? (callouts.length * 1000) / Math.max(words, 1000) : callouts.length * 1000;
  if (callouts.length > 0 && per1000 > max) {
    const b = callouts[callouts.length - 1]!;
    out.push(D("callout-density", 9, "warning", `${callouts.length} callouts in ${words} words (${per1000.toFixed(1)} per 1,000; limit ${max})`, "Keep the one that must not be skipped; fold the rest into prose or a pullquote", b.line, { column: b.column, block: "callout" }));
  }

  out.sort((a, b) => a.line - b.line || a.n - b.n);
  if (opts.file) for (const d of out) d.file = opts.file;
  return { file: opts.file, diagnostics: out, errors: out.filter((d) => d.severity === "error").length, warnings: out.filter((d) => d.severity === "warning").length, words, skipped };
}

export function formatLint(r: LintResult): string {
  const f = r.file ? `${r.file}:` : "";
  return r.diagnostics.map((d) => `${f}${d.line}${d.column ? `:${d.column}` : ""} ${d.severity} [${d.rule}] ${d.message}\n    ↳ ${d.hint}`).join("\n");
}

export type { Block };
