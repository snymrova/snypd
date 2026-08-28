/**
 * mdast → HTML for the renderer. Own, small (the pipeline already owns the mdast; hast would be a second
 * tree and two more packages). Covers CommonMark + GFM tables/strikethrough/task lists/footnotes and hands
 * every directive node to the theme through `onBlock`. Raw HTML nodes pass through as CommonMark does —
 * the vocabulary is enforced by lint, not by the renderer.
 */
import type { Root, Node, Parent, Literal, Heading, Code, Link, Image, List, ListItem, Table, TableCell, Definition, FootnoteDefinition, FootnoteReference, LinkReference, ImageReference } from "mdast";
import { parseMarkdown, type Block } from "@snypd/core";
import { Html, escape, escapeText, raw } from "./jsx-runtime";

export interface HtmlOptions {
  /** Called for every directive node; receives the typed Block and a renderer for its markdown children. */
  onBlock?: (block: Block, body: () => Html) => Html;
  /** Block lookup for directive nodes (from `PrimitiveTree.all`). */
  blocks?: Map<Node, Block>;
  /** Heading ids (`<h2 id="…">`) for the toc and deep links. Default on. */
  headingIds?: boolean;
  /** Render top-level paragraphs without their `<p>` — a phrase going into a caption, not a document. */
  inline?: boolean;
}

export const slugify = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "section";

/** Plain text of a node subtree (for heading ids, alt text, excerpts). */
export function textOf(n: Node): string {
  if ("value" in n && typeof (n as { value: unknown }).value === "string" && n.type !== "html") return (n as Literal).value;
  if ("children" in n) return (n as Parent).children.map(textOf).join("");
  return "";
}

export function toHtml(root: Root, opts: HtmlOptions = {}): Html {
  const defs = new Map<string, Definition>();
  const footnotes = new Map<string, FootnoteDefinition>();
  const collect = (n: Node) => {
    if (n.type === "definition") defs.set((n as Definition).identifier, n as Definition);
    else if (n.type === "footnoteDefinition") footnotes.set((n as FootnoteDefinition).identifier, n as FootnoteDefinition);
    if ("children" in n) for (const c of (n as Parent).children) collect(c);
  };
  collect(root);
  const usedFootnotes: string[] = [];
  const ids = new Map<string, number>();
  const headingId = (h: Heading) => { const base = slugify(textOf(h)); const n = ids.get(base) ?? 0; ids.set(base, n + 1); return n ? `${base}-${n}` : base; };

  const kids = (n: Parent, tight = false): string => n.children.map((c) => node(c, tight)).join("");
  const attr = (k: string, v: string | null | undefined) => (v ? ` ${k}="${escape(v)}"` : "");

  const node = (n: Node, tight = false): string => {
    switch (n.type) {
      case "root": return kids(n as Parent);
      case "yaml": case "toml": case "definition": case "footnoteDefinition": return "";
      case "paragraph": return tight || opts.inline ? kids(n as Parent) : `<p>${kids(n as Parent)}</p>\n`;
      case "heading": { const h = n as Heading; const id = opts.headingIds === false ? "" : ` id="${headingId(h)}"`; return `<h${h.depth}${id}>${kids(h)}</h${h.depth}>\n`; }
      case "text": return escapeText((n as Literal).value);
      case "emphasis": return `<em>${kids(n as Parent)}</em>`;
      case "strong": return `<strong>${kids(n as Parent)}</strong>`;
      case "delete": return `<del>${kids(n as Parent)}</del>`;
      case "inlineCode": return `<code>${escapeText((n as Literal).value)}</code>`;
      case "code": { const c = n as Code; const lang = c.lang ? ` class="language-${escape(c.lang)}"` : ""; return `<pre><code${lang}>${escapeText(c.value)}\n</code></pre>\n`; }
      case "html": return (n as Literal).value + "\n";
      case "break": return "<br>\n";
      case "thematicBreak": return "<hr>\n";
      case "blockquote": return `<blockquote>\n${kids(n as Parent)}</blockquote>\n`;
      case "link": { const l = n as Link; return `<a href="${escape(l.url)}"${attr("title", l.title)}>${kids(l)}</a>`; }
      case "image": { const i = n as Image; return `<img src="${escape(i.url)}" alt="${escape(i.alt ?? "")}"${attr("title", i.title)}>`; }
      case "linkReference": { const l = n as LinkReference; const d = defs.get(l.identifier); return d ? `<a href="${escape(d.url)}"${attr("title", d.title)}>${kids(l)}</a>` : `[${kids(l)}]`; }
      case "imageReference": { const i = n as ImageReference; const d = defs.get(i.identifier); return d ? `<img src="${escape(d.url)}" alt="${escape(i.alt ?? "")}"${attr("title", d.title)}>` : `![${escape(i.alt ?? "")}]`; }
      case "list": { const l = n as List; const tag = l.ordered ? "ol" : "ul"; const start = l.ordered && l.start && l.start !== 1 ? ` start="${l.start}"` : ""; return `<${tag}${start}>\n${l.children.map((c) => node(c, !l.spread)).join("")}</${tag}>\n`; }
      case "listItem": { const li = n as ListItem; const box = li.checked === null || li.checked === undefined ? "" : `<input type="checkbox" disabled${li.checked ? " checked" : ""}> `; return `<li>${box}${li.children.map((c) => node(c, tight && c.type === "paragraph")).join("")}</li>\n`; }
      case "table": { const t = n as Table; const rows = t.children; const cell = (c: TableCell, i: number, th: boolean) => { const a = t.align?.[i]; return `<${th ? "th" : "td"}${a ? ` align="${a}"` : ""}>${kids(c)}</${th ? "th" : "td"}>`; };
        const head = rows[0] ? `<thead><tr>${rows[0].children.map((c, i) => cell(c, i, true)).join("")}</tr></thead>\n` : "";
        const body = rows.length > 1 ? `<tbody>\n${rows.slice(1).map((r) => `<tr>${r.children.map((c, i) => cell(c, i, false)).join("")}</tr>\n`).join("")}</tbody>\n` : "";
        return `<table>\n${head}${body}</table>\n`; }
      case "footnoteReference": { const f = n as FootnoteReference; if (!usedFootnotes.includes(f.identifier)) usedFootnotes.push(f.identifier); const i = usedFootnotes.indexOf(f.identifier) + 1; return `<sup><a href="#fn-${escape(f.identifier)}" id="fnref-${escape(f.identifier)}">${i}</a></sup>`; }
      case "containerDirective": case "leafDirective": case "textDirective": {
        const b = opts.blocks?.get(n);
        if (b && opts.onBlock) return opts.onBlock(b, () => raw(kids(n as Parent))).html;
        return n.type === "textDirective" ? kids(n as Parent) : `<div class="snypd-block" data-block="${escape((n as unknown as { name: string }).name)}">${kids(n as Parent)}</div>\n`;
      }
      default: return "children" in n ? kids(n as Parent) : "";
    }
  };
  let out = node(root);
  if (usedFootnotes.length) {
    out += `<section class="footnotes">\n<ol>\n${usedFootnotes.map((id) => { const d = footnotes.get(id); return `<li id="fn-${escape(id)}">${d ? kids(d) : ""}<a href="#fnref-${escape(id)}">↩</a></li>\n`; }).join("")}</ol>\n</section>\n`;
  }
  return new Html(out);
}

/** First paragraph's text, trimmed to `n` characters — the fallback description. */
export function excerpt(root: Root, n = 160): string {
  const p = root.children.find((c) => c.type === "paragraph");
  const t = p ? textOf(p).trim() : "";
  return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : t;
}

/**
 * A `type: markdown` prop, rendered (S14). Five props in the spec are declared markdown — `caption` on
 * `figure`, `chart`, `diagram` and `flow`, and `body` on `cta` — and until now every one of them reached
 * the page as literal text: the fixture shipped a figcaption reading "The `.md` twin is the source file."
 * with the backticks in it. The declared type is the contract, so the renderer honours it.
 *
 * Inline, not block: the value goes inside a `<figcaption>` or a `<p>`, where a `<p>` of its own would be
 * invalid and a heading or a list is not what anyone means by a caption. Only the *display* copy goes
 * through here — `@snypd/viz` still gets the plain string for the SVG's accessible name, where markup
 * would be read out loud.
 *
 * Cached by source: captions repeat across a corpus, and a parse costs more than the string it holds.
 * The cache is bounded — a 10k-post build with a distinct caption per post must not grow one for ever.
 */
const inlineCache = new Map<string, Html>();
const INLINE_CACHE_MAX = 2_048;

/**
 * Characters that can mean something to markdown, and the openers that can only mean something at the
 * start. A string with none of them parses to exactly `escapeText` of itself — the same function the
 * parser's own text nodes go through — so the parse is skipped. This is not a micro-optimisation: a
 * parse costs ~0.5 ms against ~0 for this test, and a 100-post build carries a few hundred captions.
 */
const ACTIVE = /[`*_[\]<>&\\~!\n]/;
const BLOCK_OPENER = /^\s*(?:[-+#>]|\d+[.)])\s/;

export function inline(source: string | undefined | null): Html {
  if (!source) return new Html("");
  if (!ACTIVE.test(source) && !BLOCK_OPENER.test(source)) return new Html(escapeText(source.trim()));
  const hit = inlineCache.get(source);
  if (hit) return hit;
  const html = toHtml(parseMarkdown(source).tree, { headingIds: false, inline: true });
  if (inlineCache.size >= INLINE_CACHE_MAX) inlineCache.clear();
  inlineCache.set(source, html);
  return html;
}
