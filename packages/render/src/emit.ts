/**
 * The agent-read surface (docs/00, docs/05 "Agent-read surface completeness"), emitted on every build
 * next to the HTML: `llms.txt`, `feed.xml` (RSS 2.0), `sitemap.xml`, `robots.txt`, the JSON API under
 * `/api/`, and JSON-LD per page (Article/WebPage + whatever the spec's `schema-emit` derives from blocks:
 * FAQPage from `faq`, HowTo from `steps`/`flow`, description from `tldr`). Pure functions over plain data
 * so a theme, the preview server and the bench can call them without a build.
 */
import type { Node, Parent, List, ListItem, Heading } from "mdast";
import type { Block } from "@snypd/core";
import { textOf } from "./html";
import { escape } from "./jsx-runtime";

/** One content item as the surface sees it. */
export interface SurfaceEntry {
  type: string; slug: string; route: string; url: string;
  title: string; date?: string; updated?: string; status: string; description?: string;
  terms: { taxonomy: string; term: string; title: string; route: string; url: string }[];
  author?: { name: string; route: string; url: string };
  markdown: string;   // url of the .md twin
  json: string;       // url of the item's JSON
}
export interface SurfaceSite {
  name: string; url: string; description?: string; locale: string;
  /** Types that have content routes, in config order, with a plural label for headings. */
  types: { name: string; label: string; entries: SurfaceEntry[] }[];
  taxonomies: { name: string; label: string; terms: { term: string; title: string; route: string; url: string; count: number }[] }[];
  /** Every public route with its lastmod, for the sitemap. */
  routes: { route: string; url: string; lastmod?: string }[];
}

export const absolute = (site: string, route: string) => `${site}${route === "/" ? "/" : `${route}/`}`;
export const titleCase = (s: string) => s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
/** Naive English plural for headings: post → Posts, category → Categories. */
export const plural = (s: string) => (/[^aeiou]y$/.test(s) ? `${s.slice(0, -1)}ies` : /(s|x|ch|sh)$/.test(s) ? `${s}es` : `${s}s`);

const rfc822 = (d?: string) => (d ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d).toUTCString() : undefined);
const newest = (es: SurfaceEntry[]) => es.reduce<string | undefined>((m, e) => { const d = e.updated ?? e.date; return d && (!m || d > m) ? d : m; }, undefined);

// ── llms.txt ─────────────────────────────────────────────────────────────────
export function llmsTxt(s: SurfaceSite): string {
  const lines = [`# ${s.name}`, ""];
  if (s.description) lines.push(`> ${s.description}`, "");
  lines.push(
    `Every page has a markdown twin at \`<page>/index.md\` (also served on \`Accept: text/markdown\`). ` +
    `JSON API: ${s.url}/api/site.json. Feed: ${s.url}/feed.xml. Sitemap: ${s.url}/sitemap.xml.`, "");
  for (const t of s.types) {
    if (!t.entries.length) continue;
    lines.push(`## ${t.label}`, "");
    for (const e of t.entries) lines.push(`- [${e.title}](${e.markdown})${e.description ? `: ${e.description}` : ""}`);
    lines.push("");
  }
  for (const t of s.taxonomies) {
    if (!t.terms.length) continue;
    lines.push(`## ${t.label}`, "");
    for (const x of t.terms) lines.push(`- [${x.title}](${x.url}) (${x.count})`);
    lines.push("");
  }
  return lines.join("\n");
}

// ── RSS 2.0 ──────────────────────────────────────────────────────────────────
export function rss(s: SurfaceSite, items: SurfaceEntry[], limit = 20): string {
  const top = items.slice(0, limit);
  const item = (e: SurfaceEntry) => [
    "<item>",
    `<title>${escape(e.title)}</title>`,
    `<link>${escape(e.url)}</link>`,
    `<guid isPermaLink="true">${escape(e.url)}</guid>`,
    e.date ? `<pubDate>${rfc822(e.date)}</pubDate>` : "",
    e.description ? `<description>${escape(e.description)}</description>` : "",
    e.author ? `<dc:creator>${escape(e.author.name)}</dc:creator>` : "",
    ...e.terms.map((t) => `<category domain="${escape(t.url)}">${escape(t.title)}</category>`),
    // the twin, as an alternate representation of the item (RSS's own <source> means "the feed this came from")
    `<atom:link rel="alternate" type="text/markdown" href="${escape(e.markdown)}"/>`,
    "</item>",
  ].filter(Boolean).join("\n");
  const last = newest(top);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    "<channel>",
    `<title>${escape(s.name)}</title>`,
    `<link>${escape(s.url)}/</link>`,
    `<description>${escape(s.description ?? s.name)}</description>`,
    `<language>${escape(s.locale)}</language>`,
    last ? `<lastBuildDate>${rfc822(last)}</lastBuildDate>` : "",
    `<atom:link href="${escape(s.url)}/feed.xml" rel="self" type="application/rss+xml"/>`,
    `<generator>snypd</generator>`,
    ...top.map(item),
    "</channel>",
    "</rss>",
    "",
  ].filter(Boolean).join("\n");
}

// ── sitemap.xml + robots.txt ─────────────────────────────────────────────────
export function sitemap(s: SurfaceSite): string {
  const url = (r: SurfaceSite["routes"][number]) => `<url><loc>${escape(r.url)}</loc>${r.lastmod ? `<lastmod>${r.lastmod}</lastmod>` : ""}</url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${s.routes.map(url).join("\n")}\n</urlset>\n`;
}
export const robotsTxt = (s: SurfaceSite) => `User-agent: *\nAllow: /\n\nSitemap: ${s.url}/sitemap.xml\n`;

// ── JSON API ─────────────────────────────────────────────────────────────────
const json = (v: unknown) => JSON.stringify(v, null, 1) + "\n";
const listItem = (e: SurfaceEntry) => ({ slug: e.slug, route: e.route, url: e.url, title: e.title, date: e.date, updated: e.updated, description: e.description, terms: e.terms.map((t) => ({ taxonomy: t.taxonomy, term: t.term })), markdown: e.markdown, json: e.json });

export function apiSite(s: SurfaceSite): string {
  return json({
    name: s.name, url: s.url, description: s.description, locale: s.locale, generator: "snypd",
    types: Object.fromEntries(s.types.map((t) => [t.name, { count: t.entries.length, list: `${s.url}/api/${t.name}.json` }])),
    taxonomies: Object.fromEntries(s.taxonomies.map((t) => [t.name, { count: t.terms.length, list: `${s.url}/api/${t.name}.json` }])),
    llms: `${s.url}/llms.txt`, feed: `${s.url}/feed.xml`, sitemap: `${s.url}/sitemap.xml`,
  });
}
export const apiType = (s: SurfaceSite, t: SurfaceSite["types"][number]) => json({ type: t.name, count: t.entries.length, items: t.entries.map(listItem) });
export const apiTaxonomy = (s: SurfaceSite, t: SurfaceSite["taxonomies"][number]) => json({ taxonomy: t.name, count: t.terms.length, terms: t.terms });
export const apiItem = (e: SurfaceEntry, frontmatter: Record<string, unknown>, schema: unknown[]) =>
  json({ ...listItem(e), type: e.type, status: e.status, author: e.author, html: e.url, frontmatter, schema });

// ── JSON-LD ──────────────────────────────────────────────────────────────────
export interface SchemaCtx { site: { name: string; url: string } }
const kids = (n: Node): Node[] => ("children" in n ? (n as Parent).children : []);

/** The page's own node: BlogPosting for posts, Person for authors, WebPage otherwise. */
export function pageSchema(e: SurfaceEntry, description: string | undefined, ctx: SchemaCtx): Record<string, unknown> {
  const base = { "@context": "https://schema.org", url: e.url, name: e.title };
  if (e.type === "author") return { ...base, "@type": "Person" };
  if (e.type === "post") return {
    ...base, "@type": "BlogPosting", headline: e.title, description, datePublished: e.date, dateModified: e.updated ?? e.date,
    author: e.author ? { "@type": "Person", name: e.author.name, url: e.author.url } : undefined,
    publisher: { "@type": "Organization", name: ctx.site.name, url: `${ctx.site.url}/` },
    keywords: e.terms.length ? e.terms.map((t) => t.title).join(", ") : undefined,
    mainEntityOfPage: e.url,
  };
  return { ...base, "@type": "WebPage", description };
}

/** What the spec's `schema-emit` derives from the blocks of one document (docs/01). */
export function blockSchemas(blocks: Block[]): { schemas: Record<string, unknown>[]; description?: string } {
  const schemas: Record<string, unknown>[] = [];
  let description: string | undefined;
  for (const b of blocks) {
    const emit = b.spec?.["schema-emit"] as { type?: string; from?: string; description?: string } | undefined;
    if (!emit) continue;
    if (emit.description === "body" && description === undefined) description = textOf(b.node).trim();
    else if (emit.type === "FAQPage") {
      const qa: { q: string; a: string[] }[] = [];
      for (const n of kids(b.node)) {
        if (n.type === "heading") qa.push({ q: textOf(n as Heading).trim(), a: [] });
        else if (qa.length) qa[qa.length - 1]!.a.push(textOf(n).trim());
      }
      if (qa.length) schemas.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: qa.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a.filter(Boolean).join("\n\n") } })) });
    } else if (emit.type === "HowTo") {
      const steps = emit.from === "list"
        ? (kids(b.node).find((n) => n.type === "list") as List | undefined)?.children.map((li: ListItem) => textOf(li).trim()) ?? []
        : flowSteps(b.data);
      if (steps.length) schemas.push({ "@context": "https://schema.org", "@type": "HowTo", name: (b.props.title as string | undefined) ?? (b.props.caption as string | undefined), totalTime: b.props.time, step: steps.map((s) => ({ "@type": "HowToStep", text: s })) });
    }
  }
  return { schemas, description };
}

/** Flatten a `flow` body to step texts: strings, `{ id, do }`, `{ ask, yes, no }` (branches inline), `{ then }` skipped. */
export function flowSteps(data: unknown): string[] {
  const out: string[] = [];
  const walk = (x: unknown) => {
    if (Array.isArray(x)) { for (const i of x) walk(i); return; }
    if (typeof x === "string") { out.push(x); return; }
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, unknown>;
    if (typeof o.do === "string") out.push(o.do);
    if (typeof o.ask === "string") { out.push(`${o.ask}`); walk(o.yes); walk(o.no); }
  };
  walk((data as { steps?: unknown } | undefined)?.steps);
  return out;
}

export const jsonLd = (schemas: unknown[]) => schemas.map((s) => JSON.stringify(s, (_, v) => (v === undefined ? undefined : v))).join("\n");
