/**
 * mdast → HTML for the renderer. Own, small (the pipeline already owns the mdast; hast would be a second
 * tree and two more packages). Covers CommonMark + GFM tables/strikethrough/task lists/footnotes and hands
 * every directive node to the theme through `onBlock`. Raw HTML nodes pass through as CommonMark does —
 * the vocabulary is enforced by lint, not by the renderer.
 */
import type { Root, Node, Parent, Literal, Heading, Code, Link, Image, List, ListItem, Table, TableCell, Definition, FootnoteDefinition, FootnoteReference, LinkReference, ImageReference } from "mdast";
import { parseMarkdown, safeContentUrl, type Block } from "@snypd/core";
import { Html, escape, escapeText, raw } from "./jsx-runtime";

/**
 * One heading-led run of a container's body (U7, docs/14 §4.3): the heading's rendered inner html and
 * the id the renderer issued for it, then everything up to the next heading of the same depth. What
 * `faq` wraps in a `<details>`; the id is kept so the question stays a link target inside it.
 */
export interface Section { depth: number; id?: string; title: Html; text: string; body: Html }
/** A container's body split at its shallowest headings; `lead` is whatever came before the first. */
export interface Sectioned { lead: Html; sections: Section[] }

export interface HtmlOptions {
  /**
   * Called for every directive node; receives the typed Block, a renderer for its markdown children and
   * the same rendering split at its headings. Both are thunks over one render — calling either, or both,
   * issues each heading id once.
   */
  onBlock?: (block: Block, body: () => Html, sections: () => Sectioned) => Html;
  /** Block lookup for directive nodes (from `PrimitiveTree.all`). */
  blocks?: Map<Node, Block>;
  /** Heading ids (`<h2 id="…">`) for the toc and deep links. Default on. */
  headingIds?: boolean;
  /**
   * Filled, in document order, with the document's **own** headings — the ones that are direct children of
   * the root — as this render issued their ids (U6b). The heading tree a `toc` part draws from. An
   * out-parameter and not a return value because `toHtml` returns one `Html` to eleven callers; only the
   * one that renders a document body passes this.
   *
   * **Direct children, and that is a filter and not a coincidence.** A directive's markdown children are
   * rendered by the same recursion with the same options, so an `faq`'s `###` questions and a `steps`'s
   * titles get ids exactly as a section heading does — which is right, because they are linkable. They are
   * not the document's spine: an `faq` is one block that happens to contain six questions, and a contents
   * list that names all six describes the page's markup rather than its argument. So they keep their ids
   * and stay out of this array.
   */
  headings?: Array<{ depth: number; id: string; text: string }>;
  /** Render top-level paragraphs without their `<p>` — a phrase going into a caption, not a document. */
  inline?: boolean;
  /**
   * Handed the document's own body split at its shallowest headings (S29, docs/17 §3) — the same
   * split a container's `sections()` gives a primitive, for the root. What a layout that paints each
   * `##` section as its own band reads; the footnote list rides with the last section so the pieces
   * joined are byte for byte the `Html` returned. Only the caller that renders a document body passes
   * this, and it costs that render nothing but the slicing: no heading id is issued a second time.
   */
  sectioned?: (s: Sectioned) => void;
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

  /** The document's own top level — what `opts.headings` collects from. See the field's note. */
  const topLevel = new Set<Node>(root.children);
  const kids = (n: Parent, tight = false): string => n.children.map((c) => node(c, tight)).join("");
  /**
   * A run of rendered siblings split at the shallowest heading among them (U7): the lead is whatever
   * came before the first, and each section is one heading with everything up to the next of the same
   * depth. Shared by a container's `sections()` and the document's `sectioned`, so both split by one rule.
   */
  const split = (kidsOf: Node[], html: string[]): Sectioned => {
    const depths = kidsOf.map((c) => (c.type === "heading" ? (c as Heading).depth : 0)).filter(Boolean);
    if (!depths.length) return { lead: raw(html.join("")), sections: [] };
    const top = Math.min(...depths);
    let lead = "";
    const out: Section[] = [];
    for (let k = 0; k < kidsOf.length; k++) {
      const c = kidsOf[k]!;
      if (c.type === "heading" && (c as Heading).depth === top) {
        const m = /^<h(\d)(?: id="([^"]*)")?>([\s\S]*)<\/h\d>\n$/.exec(html[k]!);
        out.push({ depth: top, id: m?.[2], title: raw(m?.[3] ?? escapeText(textOf(c))), text: textOf(c).replace(/\s+/g, " ").trim(), body: raw("") });
      } else if (out.length) {
        const last = out[out.length - 1]!;
        last.body = raw(last.body.html + html[k]!);
      } else lead += html[k]!;
    }
    return { lead: raw(lead), sections: out };
  };
  const attr = (k: string, v: string | null | undefined) => (v ? ` ${k}="${escape(v)}"` : "");
  // docs/11 finding 10. Escaping made `javascript:alert(1)` a well-formed attribute; it did not make it
  // a link. The scheme is checked here as well as in lint because lint is advice and this is the last
  // thing between a `.md` file and a page — and a link an agent wrote after reading the open web
  // (decision 80) arrives through the same door as one a person wrote.
  // The text survives either way: the renderer drops the attribute, never the author's words.
  const href = (u: string) => (safeContentUrl(u, "link") ? ` href="${escape(u)}"` : "");
  const img = (u: string, alt: string, title?: string | null) =>
    safeContentUrl(u, "image") ? `<img src="${escape(u)}" alt="${escape(alt)}"${attr("title", title)}>` : escapeText(alt);

  const node = (n: Node, tight = false): string => {
    switch (n.type) {
      case "root": return kids(n as Parent);
      case "yaml": case "toml": case "definition": case "footnoteDefinition": return "";
      case "paragraph": return tight || opts.inline ? kids(n as Parent) : `<p>${kids(n as Parent)}</p>\n`;
      case "heading": {
        const h = n as Heading;
        if (opts.headingIds === false) return `<h${h.depth}>${kids(h)}</h${h.depth}>\n`;
        const id = headingId(h);
        if (topLevel.has(n)) opts.headings?.push({ depth: h.depth, id, text: textOf(h).replace(/\s+/g, " ").trim() });
        return `<h${h.depth} id="${id}">${kids(h)}</h${h.depth}>\n`;
      }
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
      case "link": { const l = n as Link; return `<a${href(l.url)}${attr("title", l.title)}>${kids(l)}</a>`; }
      case "image": { const i = n as Image; return img(i.url, i.alt ?? "", i.title); }
      case "linkReference": { const l = n as LinkReference; const d = defs.get(l.identifier); return d ? `<a${href(d.url)}${attr("title", d.title)}>${kids(l)}</a>` : `[${kids(l)}]`; }
      case "imageReference": { const i = n as ImageReference; const d = defs.get(i.identifier); return d ? img(d.url, i.alt ?? "", d.title) : `![${escape(i.alt ?? "")}]`; }
      case "list": { const l = n as List; const tag = l.ordered ? "ol" : "ul"; const start = l.ordered && l.start && l.start !== 1 ? ` start="${l.start}"` : ""; return `<${tag}${start}>\n${l.children.map((c) => node(c, !l.spread)).join("")}</${tag}>\n`; }
      case "listItem": { const li = n as ListItem; const box = li.checked === null || li.checked === undefined ? "" : `<input type="checkbox" disabled${li.checked ? " checked" : ""}> `; return `<li>${box}${li.children.map((c) => node(c, tight && c.type === "paragraph")).join("")}</li>\n`; }
      case "table": { const t = n as Table; const rows = t.children; const cell = (c: TableCell, i: number, th: boolean) => { const a = t.align?.[i]; return `<${th ? "th" : "td"}${a ? ` align="${a}"` : ""}>${kids(c)}</${th ? "th" : "td"}>`; };
        const head = rows[0] ? `<thead><tr>${rows[0].children.map((c, i) => cell(c, i, true)).join("")}</tr></thead>\n` : "";
        const body = rows.length > 1 ? `<tbody>\n${rows.slice(1).map((r) => `<tr>${r.children.map((c, i) => cell(c, i, false)).join("")}</tr>\n`).join("")}</tbody>\n` : "";
        return `<table>\n${head}${body}</table>\n`; }
      case "footnoteReference": {
        const f = n as FootnoteReference;
        if (!usedFootnotes.includes(f.identifier)) usedFootnotes.push(f.identifier);
        const i = usedFootnotes.indexOf(f.identifier) + 1;
        const id = escape(f.identifier);
        // U7 (docs/14 §4.1): the definition is emitted a second time, beside its mark, as a card the
        // theme may draw as a sidenote in the margin or a hover card over the mark — with no script,
        // because the renderer already holds every definition and CSS does the rest. It is `hidden`
        // so a theme that says nothing about it renders exactly the page it rendered before, and
        // the `<section class="footnotes">` at the end stays: that is the printable, linkable one.
        // Only a definition made of paragraphs is inlined — a list or a code block inside a `<p>`
        // would close the paragraph, and the card is a phrase or nothing.
        const d = footnotes.get(f.identifier);
        const phrase = d && d.children.length > 0 && d.children.every((c) => c.type === "paragraph");
        const anchor = ` style="anchor-name: --fnref-${id}"`;
        const card = phrase ? `<small class="snypd-fn-card" role="note" hidden style="position-anchor: --fnref-${id}">${d.children.map((c) => node(c, true)).join(" ")}</small>` : "";
        return `<sup class="snypd-fnref"><a href="#fn-${id}" id="fnref-${id}"${phrase ? anchor : ""}>${i}</a>${card}</sup>`;
      }
      case "containerDirective": case "leafDirective": case "textDirective": {
        const b = opts.blocks?.get(n);
        if (b && opts.onBlock) {
          // Rendered once and handed out two ways (U7): `body` is the whole, `sections` is the same
          // rendering split at its shallowest headings — what `faq` needs to wrap each question in a
          // `<details>` without a second walk that would issue every heading id a second time.
          let rendered: string[] | undefined;
          const parts = () => rendered ??= (n as Parent).children.map((c) => node(c));
          const sections = (): Sectioned => split((n as Parent).children, parts());
          return opts.onBlock(b, () => raw(parts().join("")), sections).html;
        }
        return n.type === "textDirective" ? kids(n as Parent) : `<div class="snypd-block" data-block="${escape((n as unknown as { name: string }).name)}">${kids(n as Parent)}</div>\n`;
      }
      default: return "children" in n ? kids(n as Parent) : "";
    }
  };
  // The root's children rendered one by one when a caller wants them sectioned, and joined either way —
  // the same strings, so `sectioned` sees exactly what the returned `Html` carries.
  const top = opts.sectioned ? root.children.map((c) => node(c)) : undefined;
  let out = top ? top.join("") : node(root);
  const fn = usedFootnotes.length
    ? `<section class="footnotes">\n<ol>\n${usedFootnotes.map((id) => { const d = footnotes.get(id); return `<li id="fn-${escape(id)}">${d ? kids(d) : ""}<a href="#fnref-${escape(id)}">↩</a></li>\n`; }).join("")}</ol>\n</section>\n`
    : "";
  out += fn;
  if (top && opts.sectioned) {
    const s = split(root.children, top);
    if (fn) { const last = s.sections[s.sections.length - 1]; if (last) last.body = raw(last.body.html + fn); else s.lead = raw(s.lead.html + fn); }
    opts.sectioned(s);
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
