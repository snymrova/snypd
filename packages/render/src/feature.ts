/**
 * What a `feature` piece draws a type from (docs/37 §2, W3): the type's own declaration, read through the
 * `role:` its fields carry. A case study says `client: { role: fact }`, a log entry `session: { role:
 * kicker }`, a release `breaking: { role: flag }` — and one piece draws the facts strip, the line above the
 * title and the badge beside it for any of them, without knowing a field by name. The *model* stays the
 * site's; only its drawing moves to the shelf.
 *
 * A type with any field that has a role is a **feature type**: `build` renders it through the theme's
 * `feature` layout when the theme has one (and no layout of the type's own name), and a `list` piece says
 * how many of it an archive holds.
 */
import { typeLineage, type Config, type FieldRole } from "@snypd/core";
import { formatDate, settingFlag, settingText, type Page, type SiteCtx, type TermLink } from "./theme";
import { plural, titleCase } from "./emit";
import { jsx, Fragment, type Child, type Html } from "./jsx-runtime";

const h = (tag: string | typeof Fragment, attrs: Record<string, unknown>, ...children: Child[]): Html => jsx(tag, { ...attrs, children });

interface FieldDecl { type: string; to?: string; of?: FieldDecl; role?: FieldRole | FieldRole[]; label?: string; show?: string; href?: string }

const fieldsOf = (config: Config, type: string): [string, FieldDecl][] =>
  Object.entries((config.types[type]?.fields ?? {}) as unknown as Record<string, FieldDecl>);
const has = (f: FieldDecl, role: FieldRole) => (Array.isArray(f.role) ? f.role.includes(role) : f.role === role);

/** True when a type says which of its fields are facts, kicker or flags — the types a `feature` piece draws. */
export const isFeatureType = (config: Config, type: string): boolean => fieldsOf(config, type).some(([, f]) => f.role !== undefined);

/** What one of `type` is called, singular or plural by `n`: `noun:` from the type, else its name. `6 cases`. */
export function nounOf(config: Config, type: string, n: number): string {
  const noun = config.types[type]?.noun ?? type;
  return n === 1 ? noun : plural(noun);
}

/** The sentence a type declares about itself (`description:`), for the line under its archive's count. */
export const typeDescription = (config: Config, type: string): string | undefined =>
  config.types[type]?.description;

/** One cell of a facts strip: the term a reader sees and the value, drawn. */
export interface Fact { name: string; term: string; body: Html }
export interface Feature {
  /** The line above the title: the first `kicker` field with a value, written through its `show:`. */
  kicker?: string;
  /** Every `flag` field that is true, by its label — a badge each. */
  flags: string[];
  /** Every `fact` field with a value, in the type's declared order. */
  facts: Fact[];
}

const shown = (f: FieldDecl, v: unknown) => (f.show ? f.show.replaceAll("{value}", String(v)) : String(v));
const hrefOf = (f: FieldDecl, v: unknown) => (f.href ? f.href.replaceAll("{value}", encodeURIComponent(String(v).replace(/^#/, ""))) : undefined);
const external = (href: string) => (/^[a-z][a-z0-9+.-]*:/i.test(href) ? "external" : undefined);
const termOf = (name: string, f: FieldDecl, n: number) => f.label ?? titleCase(n === 1 && f.type === "list" && name.endsWith("s") ? name.slice(0, -1) : name);

/** The type's roles, read against one page: its kicker, its flags, its facts. */
export function featureOf(ctx: SiteCtx, page: Page): Feature {
  const fm = page.frontmatter as Record<string, unknown>;
  const taxonomies = ctx.config.taxonomies as Record<string, unknown>;
  const dates = settingFlag(ctx, "showDates", true);
  const format = settingText(ctx, "dateFormat");
  const out: Feature = { flags: [], facts: [] };
  for (const [name, f] of fieldsOf(ctx.config, page.type)) {
    if (!f.role) continue;
    const v = fm[name];
    if (has(f, "flag") && v === true) out.flags.push(f.label ?? titleCase(name));
    if (has(f, "kicker") && out.kicker === undefined && (typeof v === "string" || typeof v === "number")) out.kicker = shown(f, v);
    if (!has(f, "fact")) continue;
    const to = f.type === "ref" ? f.to : f.type === "list" && f.of?.type === "ref" ? f.of.to : undefined;
    if (to && to in taxonomies) {
      const terms = page.terms.filter((t) => t.taxonomy === to);
      if (terms.length) out.facts.push({ name, term: termOf(name, f, terms.length), body: termLinks(terms) });
      continue;
    }
    if (f.type === "date" || f.type === "datetime") {
      if (typeof v === "string" && dates) out.facts.push({ name, term: termOf(name, f, 1), body: h("time", { datetime: v }, formatDate(v, format)) });
      continue;
    }
    if (Array.isArray(v)) {
      const items = v.filter((x) => typeof x === "string" || typeof x === "number");
      if (items.length) out.facts.push({ name, term: termOf(name, f, items.length), body: h("span", { class: "snypd-fact-items" }, items.map((x) => value(f.of ? { ...f.of, href: f.of.href ?? f.href, show: f.of.show ?? f.show } : f, x))) });
      continue;
    }
    if (typeof v === "string" || typeof v === "number") out.facts.push({ name, term: termOf(name, f, 1), body: value(f, v) });
  }
  return out;
}

function value(f: FieldDecl, v: unknown): Html {
  const href = hrefOf(f, v);
  return href ? h("a", { href, rel: external(href) }, shown(f, v)) : h("span", {}, shown(f, v));
}

/** Terms as links, comma-separated — how a taxonomy fact reads. */
export const termLinks = (terms: TermLink[]): Html => h("span", {}, terms.map((t, i) => h(Fragment, {}, i ? ", " : "", h("a", { href: `${t.route}/`, rel: "tag" }, t.title))));

/** The layouts every theme draws by contract (docs/04); a layout outside these is a type's own. */
const STANDARD_LAYOUTS = new Set(["post", "page", "index", "term", "author", "home"]);

/**
 * The layout a type renders through on a theme with `layouts` (R1, decision 197; W3): a feature type through
 * `feature` when the theme has it — unless the theme draws the type by a name of its own — and otherwise the
 * layout it names, or the first of its bases' layouts the theme has, then `post`. `used` is null when the
 * type has no layout, or when nothing up the line exists (the build refuses that).
 */
export function typeLayout(config: Config, layouts: Record<string, unknown>, type: string): { wanted: string | null; used: string | null; tried: string[] } {
  const wanted = config.types[type]?.layout ?? null;
  if (!wanted) return { wanted, used: null, tried: [] };
  if (layouts.feature && isFeatureType(config, type) && !(layouts[wanted] && !STANDARD_LAYOUTS.has(wanted))) return { wanted, used: "feature", tried: [wanted] };
  if (layouts[wanted]) return { wanted, used: wanted, tried: [wanted] };
  const tried = [wanted];
  for (const t of typeLineage(config.types, type).slice(1)) { const l = config.types[t]?.layout; if (l && !tried.includes(l)) tried.push(l); }
  if (!tried.includes("post")) tried.push("post");
  return { wanted, used: tried.find((l) => layouts[l]) ?? null, tried };
}
