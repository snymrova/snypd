/**
 * What an archive's head says and how a grid of covers is shaped (W4, docs/37 §16) — shared by the `list`
 * pieces that open an archive (`plain`, `ruled`, `grid`) and the `home` piece that draws a type's covers
 * (`portfolio`), so the count, the filter row and the frame read the same wherever they are drawn.
 */
import { formatDate, settingText, type Entry, type SiteCtx, type TermLink } from "./theme";
import { nounOf, typeDescription } from "./feature";
import { plural, titleCase } from "./emit";
import { Slot } from "./hooks";
import { jsx, Fragment, type Child, type Html } from "./jsx-runtime";

const h = (tag: string | typeof Fragment, attrs: Record<string, unknown>, ...children: Child[]): Html => jsx(tag, { ...attrs, children });

/** `, 2025–2026` across years; `, 12 Sep 2026 to 25 Sep 2026` within one; `, on 25 Sep 2026` for one day. Newest first. */
export function archiveSpan(days: string[], format?: string): string {
  if (!days.length) return "";
  const last = days[0]!, first = days[days.length - 1]!;
  if (first.slice(0, 4) !== last.slice(0, 4)) return `, ${first.slice(0, 4)}–${last.slice(0, 4)}`;
  const when = (d: string) => formatDate(d, !format || format === "iso" ? "short" : format);   // a sentence, not a table
  return first === last ? `, on ${when(last)}` : `, ${when(first)} to ${when(last)}`;
}

/** `35 posts, 1 Aug 2026 to 12 Sep 2026.` — how many of `type` the entries are, by its noun, and when. */
export const archiveCount = (ctx: SiteCtx, entries: Entry[], type: string): string =>
  `${entries.length} ${nounOf(ctx.config, type, entries.length)}${archiveSpan(entries.map((e) => e.date?.slice(0, 10)).filter((d): d is string => !!d), settingText(ctx, "dateFormat"))}.`;

/** A term as a reader sees it: its title, or a bare slug title-cased — *Product*, not *product*. */
export const termTitle = (t: TermLink): string => (t.title === t.term ? titleCase(t.term) : t.title);

/** The terms the entries carry, by taxonomy in the type's declared order, each with its count, most-carried first. */
export function archiveFilters(ctx: SiteCtx, entries: Entry[], type: string | undefined): { taxonomy: string; terms: (TermLink & { n: number })[] }[] {
  const by = new Map<string, Map<string, TermLink & { n: number }>>();
  for (const e of entries) for (const t of e.terms ?? []) {
    const tax = by.get(t.taxonomy) ?? new Map(); by.set(t.taxonomy, tax);
    const have = tax.get(t.term); if (have) have.n++; else tax.set(t.term, { ...t, n: 1 });
  }
  const order = type ? ctx.config.types[type]?.taxonomies ?? [] : [];
  const rank = (t: string) => { const i = order.indexOf(t); return i < 0 ? order.length : i; };
  return [...by.entries()].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([taxonomy, tax]) => ({ taxonomy, terms: [...tax.values()].sort((a, b) => b.n - a.n || a.title.localeCompare(b.title)) }));
}

export interface ArchiveHeadProps {
  ctx: SiteCtx; entries: Entry[]; route: string; title: string;
  /** Set inside the heading, above the title — a term's page names its taxonomy here. */
  kicker?: string;
  /** The intro in place of the type's sentence — a term's description. */
  intro?: string;
  type?: string;
  /** The term whose page this is, marked current in the filter row. */
  current?: TermLink;
  /** Where *All* goes: the archive the build names (the page itself on the archive, the type's on a term's page), or nowhere. */
  all?: string;
}

/**
 * An archive's head: the heading (with a kicker), one line of intro — counted and dated from the entries,
 * then the type's sentence — and the terms as a filter row, one line per taxonomy the entries carry: *All*
 * once, then each term with how many, a link to its page, the one the reader is on marked current.
 */
export function ArchiveHead({ ctx, entries, route, title, kicker, intro, type, current, all }: ArchiveHeadProps): Html {
  const lede = entries.length && type ? archiveCount(ctx, entries, type) : undefined;
  const about = intro ?? (type ? typeDescription(ctx.config, type) : undefined);
  const isCurrent = (t: TermLink) => current?.taxonomy === t.taxonomy && current.term === t.term;
  return h(Fragment, {},
    h("h1", {}, kicker ? h("small", { class: "snypd-list-kicker" }, kicker) : null, title),
    lede || about ? h("p", { class: "snypd-lede" }, [lede, about].filter(Boolean).join(" ")) : null,
    Slot({ name: "before-content", ctx, route, title }),
    archiveFilters(ctx, entries, type).map((f, i) => h("nav", { class: "snypd-list-filter", "aria-label": `${titleCase(f.taxonomy)}: filter the list` },
      h("span", { class: "snypd-list-filter-name" }, titleCase(plural(f.taxonomy))),
      // *All* once, on the first line; its count is the archive's, which a term's page does not know.
      all && i === 0 ? h("a", { href: all.endsWith("/") ? all : `${all}/`, "aria-current": current ? undefined : "page" }, "All", current ? "" : h(Fragment, {}, " ", h("span", { class: "snypd-list-count" }, String(entries.length)))) : null,
      f.terms.map((t) => h("a", { href: `${t.route}/`, "aria-current": isCurrent(t) ? "page" : undefined }, termTitle(t), " ", h("span", { class: "snypd-list-count" }, String(t.n)))),
    )),
  );
}

/** The site-relative url of an entry's cover image, when it has one. */
export const coverOf = (e: Entry): string | undefined => (e.frontmatter.cover as { image?: string } | undefined)?.image;

/**
 * The shape a grid's frames share: the median of its covers' proportions (width over height), held between
 * 3:4 and 16:9 — 1 when no cover has a size. A grid of landscape covers gets landscape frames.
 */
export function coverFrame(ctx: SiteCtx, entries: Entry[]): number {
  const shapes = entries.map((e) => ctx.media[coverOf(e) ?? ""]).filter((m) => m?.width && m.height).map((m) => m!.width / m!.height).sort((a, b) => a - b);
  const frame = shapes.length ? Math.min(16 / 9, Math.max(3 / 4, shapes[Math.floor(shapes.length / 2)]!)) : 1;
  return Number(frame.toFixed(3));
}

/** A date without its year, when a heading above has said it: `2026-09-12` → `09-12`, `12 Sep 2026` → `12 Sep`. */
export const withoutYear = (label: string, year: string): string =>
  label.startsWith(`${year}-`) ? label.slice(year.length + 1) : label.endsWith(` ${year}`) ? label.slice(0, -(year.length + 1)) : label;
