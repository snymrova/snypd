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
 * 12 unsafe-url          a link or image whose scheme executes rather than navigates
 * 13 inline-script      raw HTML that introduces script — the one thing the build will refuse to write
 * 14 home-twice         two pages ask for `/`                                                            (lintSite, content/index.ts)
 * 15 autoplay           a second autoplaying clip on the page; an autoplay with no poster, or on a picture
 * 16 logo-wall-thin     a logo-wall of fewer than three logos — a list, not a wall
 * 17 hero-too-tall      on the front page, more than one block before the first `##` — the hero is a cover and one block
 * 18 duplicate-title    a block's `title` inside a `##` section that repeats or restates the heading
 * 19 frontmatter-unparsed  a taxonomy term's or an author's frontmatter that does not parse — the build reads those with
 *                       `readFrontmatter`, which returns `{}`, so the term showed its slug and nothing said why (lintSite)
 * 20 media-size        report-only: a file in content/media/ over 300 KB, with who names it; a file nothing names (lintSite, media.ts)
 */
import type { Node, Parent, Heading, Link, Image, Text, Literal } from "mdast";
import type { FieldSpec } from "@snypd/spec";
import type { ParsedDoc } from "./parse";
import { frontmatterKeyLine } from "./parse";
import { checkProp, type Block, type Diagnostic, type PrimitiveTree } from "./tree";
import { safeContentUrl } from "../values";
import { scriptSites, lineOf } from "../script";

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

/**
 * The mdast walk, carrying the nearest line a node can honestly be blamed on: its own `position`
 * whenever it has one, and otherwise the closest ancestor that had one.
 *
 * A node without a position is not a malformed document — remark's own transforms drop them. An
 * unclosed `[` followed by a bare URL in the same paragraph (`Text [agent(https://example.com/x)`)
 * sends `mdast-util-gfm-autolink-literal` back through the text node, and every node it splits out
 * comes back with none. That paragraph still knows where it starts, and a diagnostic is a place
 * (property 4d) — so `0`, a line no file has, is not an available answer.
 */
const walk = (n: Node, fn: (n: Node, parent: Parent | undefined, at: number) => void, parent?: Parent, at = 1) => {
  const line = n.position?.start.line ?? at;
  fn(n, parent, line);
  if ("children" in n) for (const c of (n as Parent).children) walk(c, fn, n as Parent, line);
};
const hasImage = (n: Node): boolean => n.type === "image" || ("children" in n && (n as Parent).children.some(hasImage));

const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : Math.min(n % 10, 4) === 4 ? 0 : n % 10] ?? "th"}`;
const plainText = (n: Node): string => "value" in n && typeof (n as Literal).value === "string" ? (n as Literal).value : "children" in n ? (n as Parent).children.map(plainText).join("") : "";
const wordsOf = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
const STOP = new Set(["the", "and", "our", "your", "you", "for", "with", "how", "what", "who", "why"]);
/** Rule 18: the same words, one inside the other, or most of the shorter's words in the longer. */
export function restates(a: string, b: string): boolean {
  const x = a.toLowerCase().replace(/\s+/g, " ").trim(), y = b.toLowerCase().replace(/\s+/g, " ").trim();
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const wa = wordsOf(a), wb = wordsOf(b);
  if (!wa.length || !wb.length) return false;
  // Every telling word of the shorter is in the longer — "Start your project" under "Start a project" —
  // and at least two of them, so a one-word overlap ("Work" under "How we work") is not a repeat.
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  const shared = short.filter((w) => long.includes(w)).length;
  return shared >= 2 && shared === short.length;
}

const D = (rule: string, n: number, severity: Diagnostic["severity"], message: string, hint: string, line: number, extra: Partial<Diagnostic> = {}): Diagnostic => ({ rule, n, severity, message, hint, line, ...extra });

/**
 * A YAML parse error, as the sentence an agent needs (docs/19 §2 · 5, rules 0 and 19). The parser says
 * `bad indentation of a mapping entry (3:35)` — its line is the YAML's, and the file's is that plus the
 * fence. The commonest cause by far is a colon inside an unquoted value (`description: Objects that get
 * made: tooling`), which YAML reads as a nested mapping; that case gets its own hint, because "fix the
 * YAML" sent the author back to stare at a line that looks fine.
 */
export function yamlFailure(doc: Pick<ParsedDoc, "frontmatterError" | "frontmatterLine" | "frontmatterYaml">): { line: number; hint: string } {
  const m = /\((\d+):(\d+)\)\s*$/.exec(doc.frontmatterError ?? "");
  const line = m ? Math.max(1, doc.frontmatterLine) + Number(m[1]) - 1 : Math.max(1, doc.frontmatterLine);
  const text = m ? (doc.frontmatterYaml.split("\n")[Number(m[1]) - 1] ?? "") : "";
  const colonInValue = /^\s*[\w.-]+:\s+[^"'|>[{#\n][^\n]*:\s/.test(text);
  const hint = colonInValue ? `Quote the value on line ${line} — a colon inside an unquoted value starts a nested mapping` : `Fix the YAML on line ${line}, between the --- fences`;
  return { line, hint };
}

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
  if (doc.frontmatterError) { const f = yamlFailure(doc); out.push(D("frontmatter", 0, "error", `Frontmatter is not valid YAML: ${doc.frontmatterError}`, f.hint, f.line)); }
  else if (opts.type) {
    const fields = opts.type.fields;
    for (const [k, f] of Object.entries(fields)) {
      if (f.required && (fm[k] === undefined || fm[k] === null || fm[k] === "")) out.push(D("frontmatter", 0, "error", `Frontmatter is missing required field \`${k}\``, `Add \`${k}:\`${f.description ? ` — ${f.description}` : ""}`, doc.frontmatterLine || 1));
      else {
        const p = checkField(k, f, fm[k]);
        // A `max` overrun says how far over it is (finding 9): "longer than 160" sent the author back to count.
        const over = typeof fm[k] === "string" && "max" in f && typeof f.max === "number" ? (fm[k] as string).length - f.max : 0;
        if (p) out.push(D("frontmatter", 0, "error", `Frontmatter field \`${k}\` ${p}`, over > 0 ? `Cut ${over} character${over === 1 ? "" : "s"} — the limit is the field's \`max\` in snypd://types` : `See snypd://types for the schema`, frontmatterKeyLine(doc, k)));
      }
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

  // ── 15 autoplay ────────────────────────────────────────────────────────────
  // S29 (docs/17 §4.2), the bound that keeps decision 181's amendment from becoming the reference's
  // 22 MB: one clip per page may play by itself. The second is an error naming the first — a card that
  // wants motion gets a poster and a play button, which is what a clip without `autoplay` is. Two
  // warnings ride along: an autoplay on something that is not a clip does nothing, and one without a
  // poster shows a reader who asked for reduced motion an empty box, because the poster is the still.
  const isClip = (v: unknown) => typeof v === "string" && /\.(?:mp4|webm)(?:[?#].*)?$/i.test(v);
  let firstAuto: Block | undefined;
  for (const b of tree.all) {
    if (b.props.autoplay !== true || (b.name !== "figure" && b.name !== "cover")) continue;
    const src = b.name === "figure" ? b.props.src : b.props.media;
    if (!isClip(src)) { out.push(D("autoplay", 15, "warning", `\`${b.name}\` says autoplay and ${src ? "names a picture" : "has no clip"}`, "autoplay is for a .mp4 or .webm; drop it, or point at a clip", b.line, { column: b.column, block: b.name })); continue; }
    if (firstAuto) { out.push(D("autoplay", 15, "error", `A second clip plays by itself — the first is the \`${firstAuto.name}\` on line ${firstAuto.line}`, "One autoplay per page. Drop `autoplay` here: a clip with a poster and the platform's play button is what every other clip on the page is", b.line, { column: b.column, block: b.name })); continue; }
    firstAuto = b;
    if (typeof b.props.poster !== "string" || !b.props.poster.trim()) out.push(D("autoplay", 15, "warning", `\`${b.name}\` plays by itself and has no poster`, "Add poster=\"/media/….png\" — it is the still a reader who asked for reduced motion sees instead of the clip", b.line, { column: b.column, block: b.name }));
  }

  // ── 16 logo-wall thin ──────────────────────────────────────────────────────
  // S29 (docs/17 §4.3): the spec's own floor. One mark is a figure, two are a comparison, three are a
  // wall. Counted as the renderer counts them — the first image in each list item — so a wall of three
  // items with one picture each and a wall of one item with three pictures are different things.
  for (const b of tree.all) {
    if (b.name !== "logo-wall") continue;
    let n = 0;
    walk(b.node, (x, parent) => { if (x.type === "listItem" && (x as Parent).children.some((c) => hasImage(c))) n++; void parent; });
    if (n < 3) out.push(D("logo-wall-thin", 16, "warning", `\`logo-wall\` holds ${n} logo${n === 1 ? "" : "s"}`, n ? "Three or more make a wall; one is a `figure`, two are two figures side by side" : "Write a markdown list under it, one `![name](/media/mark.svg)` per line, optionally wrapped in a link", b.line, { column: b.column, block: b.name }));
  }

  // ── 17 hero-too-tall ───────────────────────────────────────────────────────
  // docs/18 §2 · 6 and §3: on a `home: true` page everything before the first `##` is the hero, and a hero
  // is the cover and one block — a summary, or a row of numbers, not both and a figure. An agent that
  // stacks three blocks in the lead renders a front page that is a screen and a half of hero on a phone,
  // and today it finds that out from a screenshot; this is the sentence that says the move instead.
  if (doc.frontmatter.home === true) {
    const top = doc.tree.children;
    const first = top.findIndex((n) => n.type === "heading");
    const lead = new Set<Node>(first === -1 ? top : top.slice(0, first));
    const inLead = tree.all.filter((b) => lead.has(b.node as unknown as Node) && b.name !== "cover");
    if (inLead.length > 1) {
      for (const b of inLead.slice(1)) out.push(D("hero-too-tall", 17, "warning", `\`${b.name}\` is the ${ordinal(inLead.indexOf(b) + 1)} block before the first \`##\` — the hero is ${inLead.length} blocks tall`, `Move \`${b.name}\` under a \`##\` heading (the first section is the natural home); the front page's hero is a cover and one block — see snypd://spec/home`, b.line, { column: b.column, block: b.name }));
    }
  }

  // ── 18 duplicate-title ─────────────────────────────────────────────────────
  // docs/18 §2 · 2 and §3: a block's `title` inside a `##` section is a sub-heading (decision 189), and a
  // sub-heading that says what the heading just said is a second headline — "How we work" over "How we
  // work", or "Start a project" over "Start your project". Repeats and restatements: the same words, one
  // inside the other, or most of the shorter one's words in the longer.
  {
    let heading: Heading | undefined;
    for (const n of doc.tree.children) {
      if (n.type === "heading") { heading = n as Heading; continue; }
      if (!heading) continue;
      const b = tree.all.find((x) => (x.node as unknown as Node) === n);
      const title = b && typeof b.props.title === "string" ? b.props.title : undefined;
      if (!b || !title) continue;
      const h = plainText(heading);
      if (restates(title, h)) out.push(D("duplicate-title", 18, "warning", `\`${b.name}\` title “${title}” repeats the heading “${h}”`, `Drop \`title\` — the heading already says it — or make it the specific line under the heading, not the heading again`, b.line, { column: b.column, block: b.name }));
    }
  }

  // ── walk the body once: headings, links, images, words, prose ─────────────
  let words = 0, lastLevel = 1;
  const prose: { text: string; line: number }[] = [];
  const links: { url: string; line: number }[] = [];
  /** Rule 12's own list: the urls this document *wrote*, link and image, before the cta hrefs join `links`. */
  const urls: { url: string; line: number; what: "Link" | "Image" }[] = [];
  /** Rule 13's own list: the raw HTML this document wrote, which every other rule here skips. */
  const raw: { html: string; line: number }[] = [];
  walk(doc.tree, (n, parent, at) => {
    if (n.type === "html") { raw.push({ html: (n as Literal).value, line: at }); return; }
    if (n.type === "yaml" || n.type === "code" || n.type === "inlineCode") return;
    if (n.type === "heading") {
      const h = n as Heading, line = at;
      if (h.depth === 1) out.push(D("heading-skip", 6, "warning", "`#` heading in the body", "The title is the page's h1 — start body headings at `##`", line));
      else if (h.depth > lastLevel + 1) out.push(D("heading-skip", 6, "warning", `Heading level jumps from h${lastLevel} to h${h.depth}`, `Use h${lastLevel + 1}, or promote this heading`, line));
      lastLevel = h.depth;
    }
    if (n.type === "link") { links.push({ url: (n as Link).url, line: at }); urls.push({ url: (n as Link).url, line: at, what: "Link" }); }
    if (n.type === "image") urls.push({ url: (n as Image).url, line: at, what: "Image" });
    if (n.type === "image" && !((n as Image).alt ?? "").trim()) out.push(D("image-alt", 4, "error", "Image has no alt text", "Write `![what the image shows](src)`", at));
    if (n.type === "text" && parent?.type !== "yaml") {
      const t = (n as Text).value;
      words += t.split(/\s+/).filter(Boolean).length; prose.push({ text: t, line: at });
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

  // ── 12 unsafe url ──────────────────────────────────────────────────────────
  // docs/11 finding 10. `[click](javascript:fetch(...))` is valid CommonMark and the renderer used to
  // emit it escaped and intact — escaping stops a value ending the attribute, not the attribute meaning
  // what it says. The renderer drops the href either way (render/html.ts); this is what tells the author,
  // and it is an error rather than a warning because nothing legitimate is written this way by accident.
  for (const { url, line, what } of urls) {
    if (safeContentUrl(url, what === "Image" ? "image" : "link")) continue;
    const scheme = url.replace(/[\u0000-\u0020]/g, "").split(":")[0]!.toLowerCase();
    out.push(D("unsafe-url", 12, "error", `${what} uses the \`${scheme}:\` scheme, which executes rather than ${what === "Image" ? "loads" : "navigates"}`,
      what === "Image" ? "Put the file in content/media/ and point at /media/…, or use an https:// url — the renderer drops this image" : "Use https://…, a site path like /about, or mailto: — the renderer drops this href and keeps the text", line));
  }

  // ── 13 inline script ───────────────────────────────────────────────────────
  // docs/11 finding 1, gate E6. Raw HTML renders verbatim, which is correct CommonMark and is the whole
  // reason an embed works — so this rule says nothing about raw HTML as such. It fires on the one thing
  // inside it that the *build* will refuse to write: script, against a budget the site declares for its
  // plugins. An error rather than a warning because it is not advice — the build stops, and an author
  // who hears about it here hears about it before `snypd build` does. The weight is in the message
  // because the remedy depends on it: a 40-byte handler and a 40 KB bundle are different conversations.
  for (const { html, line } of raw) {
    for (const site of scriptSites(html)) {
      const at = lineOf(html, site.offset, line);
      const weight = site.bytes === undefined ? "fetched from another origin, so its weight cannot be known before it runs" : `${site.bytes} B`;
      out.push(D("inline-script", 13, "error", `Raw HTML adds script — ${site.what} (${weight})`,
        site.kind === "handler" || site.kind === "url"
          ? "A page here carries no JavaScript unless the site afforded some: put the behaviour in a plugin, which declares what it costs and is checked against `bench.budgets.jsKb`"
          : "A page here carries no JavaScript unless the site afforded some: raise `bench.budgets.jsKb` in snypd.yaml if this is script the site means to ship, or move it into a plugin, which declares what it costs. The build refuses this page until one of those is true",
        at));
    }
  }

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
