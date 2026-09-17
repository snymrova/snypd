/**
 * The generators behind the six properties (H4, docs/11 finding 4), and the two knobs every one of them
 * reads. 6,712 lines of tests were example-based, and an example is one input the author thought of;
 * finding 4 said so and named the three inputs a stranger controls — the directives parser, the four
 * YAML documents and the JSON-RPC surface — plus E7, which is a claim about *every* edit sequence and was
 * being asserted with three of them. What lives here is the vocabulary those tests draw from: a site as
 * data, a document as data, an edit as data, so that a counterexample is a printable value and not a
 * directory somebody has to reconstruct.
 *
 * Two environment variables, both read once:
 *   `SNYPD_PROPS_SEED`  the seed every property runs under. Fixed by default, so `bun test` is the same
 *                       suite on every machine and a red laptop is a red CI; the `properties` lane sets it
 *                       to the run's id so each run explores new inputs, and prints it, so a failure there
 *                       is one variable away from reproducing here.
 *   `SNYPD_PROPS_RUNS`  a multiplier on every property's run count. 1 is the ordinary suite's budget
 *                       (about 40 s, on a box where the whole suite is 100); the lane runs at 10.
 * fast-check prints the seed, the path and the shrunk counterexample when a property fails; the seed is
 * also printed once per file on a green run, because a green run at a seed nobody recorded is not
 * evidence anybody can extend.
 */
import fc from "fast-check";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { primitives } from "@snypd/spec";
import { RACY_MS, sha1 } from "@snypd/core";
import { png } from "../src/corpus";

export { fc };

export const SEED = Number(process.env.SNYPD_PROPS_SEED ?? 20260914);
const SCALE = Number(process.env.SNYPD_PROPS_RUNS ?? 1);
/** A property's run count: its own base, scaled. Never below one, so `SNYPD_PROPS_RUNS=0` still runs each property once. */
export const runs = (base: number) => Math.max(1, Math.round(base * SCALE));
/** The parameters every `fc.assert` here is given — the seed, the count, and no early stop on the first failure (shrinking is the point). */
export const params = <T>(base: number, extra: fc.Parameters<T> = {}): fc.Parameters<T> => ({ seed: SEED, numRuns: runs(base), ...extra });
let announced = false;
/** Once per process: the seed on stdout, so a green run is reproducible too. */
export function announce(): void { if (!announced) { announced = true; console.log(`props: seed ${SEED}, runs ×${SCALE}`); } }

// ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Words, slugs, urls
// ───────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A short list on purpose: the properties are about *structure*, and a vocabulary of thirty words means
 * two generated posts share terms, a term page lists more than one entry and a retitle collides with an
 * existing title now and then. The last four are there to be awkward — a slop phrase (lint rule 8),
 * letters outside ASCII (slugify, the `\p{L}` in `cssValue`), and a word that is also a YAML keyword.
 */
const WORDS = ("agent markdown content theme primitive render build cache token spec lint publish draft site static "
  + "fast yaml git commit review evidence source chart diagram twin delve Söhne 日本語 null").split(" ");
export const word = fc.constantFrom(...WORDS);
export const words = (min: number, max: number) => fc.array(word, { minLength: min, maxLength: max }).map((a) => a.join(" "));
export const sentence = words(4, 14).map((s) => s[0]!.toUpperCase() + s.slice(1) + ".");
export const paragraph = fc.array(sentence, { minLength: 1, maxLength: 5 }).map((a) => a.join(" "));

const SLUG_WORDS = ["notes", "launch", "bench", "twin", "cache", "index", "posts", "tag", "about", "a"];
/** `index` is on the list because a page called `index` is the route `/`, which the theme's index layout also wants. */
export const slug = fc.tuple(fc.constantFrom(...SLUG_WORDS), fc.nat({ max: 30 })).map(([w, n]) => (n === 0 ? w : `${w}-${n}`));
export const TAGS = ["ai", "agents", "mcp", "bun", "cms", "speed"];
export const CATEGORIES = ["engineering", "product", "design"];
export const tag = fc.constantFrom(...TAGS);
export const category = fc.constantFrom(...CATEGORIES);
export const date = fc.integer({ min: 0, max: 364 }).map((d) => new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10));

/** What a link, a `source` or an `href` can be — including the two schemes decision 120 refuses and a path off the site. */
export const url = fc.constantFrom("https://snypd.rocks/bench", "https://example.com/a?b=c&d", "/about", "/posts/nowhere", "#top", "mailto:a@b.example", "javascript:alert(1)", "data:text/html,x", "../up");

/** `fc.record` with a real prototype: a generated object reaches `JSON.stringify`, `Object.entries` and `toEqual`, and a null-prototype one surprises the last. */
const rec = <T>(model: { [K in keyof T]: fc.Arbitrary<T[K]> }): fc.Arbitrary<T> => fc.record(model, { noNullPrototype: true });

/** An attribute value as a directive writes it: no quotes, no braces, no newlines — those are the syntax the *fuzz* side supplies. */
const attr = (a: fc.Arbitrary<string>) => a.map((s) => `"${s.replace(/["{}\n\\]/g, "")}"`);

// ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Documents: markdown with the vocabulary in it, and the shapes lint says no to
// ───────────────────────────────────────────────────────────────────────────────────────────────────────

const inline = fc.oneof(
  { weight: 6, arbitrary: sentence },
  { weight: 1, arbitrary: fc.tuple(word, url).map(([w, u]) => `[${w}](${u})`) },
  { weight: 1, arbitrary: word.map((w) => `\`${w}\``) },
  { weight: 1, arbitrary: word.map((w) => `**${w}**`) },
  { weight: 1, arbitrary: fc.tuple(word, url).map(([w, u]) => `![${w}](${u})`) },
  { weight: 1, arbitrary: word.map((w) => `<em>${w}</em>`) },
  { weight: 1, arbitrary: fc.constant("footnote[^1]") },
);
const prose = fc.array(inline, { minLength: 1, maxLength: 6 }).map((a) => a.join(" "));
const heading = fc.tuple(fc.integer({ min: 1, max: 4 }), words(1, 5)).map(([n, t]) => `${"#".repeat(n)} ${t}`);
const list = fc.array(words(1, 5), { minLength: 1, maxLength: 4 }).map((a) => a.map((s) => `- ${s}`).join("\n"));
const ordered = fc.array(words(1, 5), { minLength: 1, maxLength: 4 }).map((a) => a.map((s, i) => `${i + 1}. ${s}`).join("\n"));
const fence = fc.tuple(fc.constantFrom("sh", "ts", ""), words(1, 6)).map(([lang, s]) => `\`\`\`${lang}\n${s}\n\`\`\``);
const quote = sentence.map((s) => `> ${s}`);
const table = fc.tuple(word, word, word, word).map(([a, b, c, d]) => `| ${a} | ${b} |\n|---|---|\n| ${c} | ${d} |`);
const footnote = sentence.map((s) => `[^1]: ${s}`);
/** Raw HTML that is not script: the twin keeps it verbatim and the renderer passes it through (H2 is what refuses the other kind). */
const html = fc.constantFrom("<br>", "<!-- a note -->", "<details><summary>More</summary>\n\nHidden.\n\n</details>", "<img src=\"/media/x.png\" alt=\"\">");

const container = (name: string, attrs: fc.Arbitrary<string>, body: fc.Arbitrary<string>) => fc.tuple(attrs, body).map(([a, b]) => `:::${name}${a}\n${b}\n:::`);
const tldr = container("tldr", fc.constant(""), prose);
const callout = container("callout", fc.tuple(fc.constantFrom("note", "tip", "warning", "danger", "quote-me", "bogus"), fc.option(attr(words(1, 3)), { nil: undefined })).map(([k, t]) => `{kind="${k}"${t ? ` title=${t}` : ""}}`), prose);
const pullquote = container("pullquote", fc.tuple(fc.option(attr(words(1, 3)), { nil: undefined }), fc.option(url, { nil: undefined })).map(([c, h]) => (c || h ? `{${[c ? `cite=${c}` : "", h ? `href="${h}"` : ""].filter(Boolean).join(" ")}}` : "")), prose);
const stat = fc.tuple(fc.nat({ max: 999 }), fc.constantFrom("%", " ms", " KB", ""), words(1, 3), url).map(([v, u, l, s]) => `::stat{value="${v}${u}" label="${l}" source="${s}"}`);
/** One to five: the spec says two to four, and both sides of that are shapes lint has to name rather than the build has to survive. */
const statRow = container("stat-row", fc.constant(""), fc.array(stat, { minLength: 1, maxLength: 5 }).map((a) => a.join("\n")));
const chartRows = fc.array(fc.tuple(word, fc.oneof(fc.nat({ max: 500 }), fc.constant(-3), fc.constant("nan" as const))), { minLength: 0, maxLength: 6 }).map((rows) => rows.map(([l, v]) => `- { label: ${l}, value: ${v} }`).join("\n"));
const chart = container("chart", fc.tuple(fc.constantFrom("bar", "line", "area", "donut", "lollipop", "pie"), url, attr(sentence), fc.option(attr(word), { nil: undefined })).map(([t, s, c, u]) => `{type="${t}" source="${s}" caption=${c}${u ? ` unit=${u}` : ""}}`), fc.oneof({ weight: 4, arbitrary: chartRows }, { weight: 1, arbitrary: fc.constant("- not: [a, row") }, { weight: 1, arbitrary: fc.constant("just a string") }));
const faq = container("faq", fc.constant(""), fc.array(fc.tuple(words(2, 5), sentence), { minLength: 1, maxLength: 3 }).map((qs) => qs.map(([q, a]) => `### ${q}?\n${a}`).join("\n")));
const steps = container("steps", fc.option(fc.tuple(attr(words(1, 3)), fc.constantFrom("5 min", "an hour")).map(([t, m]) => `{title=${t} time="${m}"}`), { nil: "" }), ordered);
const cta = fc.tuple(attr(words(1, 4)), attr(words(1, 2)), url, fc.constantFrom("", ' variant="subtle"', ' variant="loud"')).map(([t, b, h, v]) => `::cta{title=${t} button=${b} href="${h}"${v}}`);
const figure = fc.tuple(fc.constantFrom("/media/one.png", "/media/two.png", "/media/missing.png", "https://example.com/x.png"), attr(sentence), fc.constantFrom("", ' width="wide"', ' width="full"'), fc.boolean()).map(([s, a, w, noAlt]) => `::figure{src="${s}"${noAlt ? "" : ` alt=${a}`}${w}}`);
const cover = fc.tuple(fc.option(attr(word), { nil: undefined }), fc.option(attr(sentence), { nil: undefined }), fc.option(fc.constantFrom("/media/one.png", "/media/two.png"), { nil: undefined })).map(([e, s, i]) => `::cover{${[e ? `eyebrow=${e}` : "", s ? `subtitle=${s}` : "", i ? `image="${i}" alt="A block of colour"` : ""].filter(Boolean).join(" ")}}`);
/** Every primitive's own `example:`, verbatim — the fourteen shapes the spec vouches for, in among the ones it does not. */
const example = fc.constantFrom(...primitives().map((p) => p.example.trimEnd()));
const unknown = fc.tuple(fc.constantFrom("wat", "grid", "stat", "Callout"), fc.option(attr(word), { nil: undefined }), prose).map(([n, a, b]) => `:::${n}${a ? `{x=${a}}` : ""}\n${b}\n:::`);
const leafUnknown = fc.constantFrom("::nope", "::cta", "::figure{src=\"\"}", ":stat[inline]{value=\"1\"}");

/** One block of a document body. Weighted towards prose, because most posts are. */
export const block: fc.Arbitrary<string> = fc.oneof(
  { weight: 8, arbitrary: prose },
  { weight: 3, arbitrary: heading },
  { weight: 2, arbitrary: list },
  { weight: 1, arbitrary: ordered },
  { weight: 1, arbitrary: fence },
  { weight: 1, arbitrary: quote },
  { weight: 1, arbitrary: table },
  { weight: 1, arbitrary: footnote },
  { weight: 1, arbitrary: html },
  { weight: 2, arbitrary: tldr },
  { weight: 2, arbitrary: callout },
  { weight: 1, arbitrary: pullquote },
  { weight: 2, arbitrary: statRow },
  { weight: 2, arbitrary: chart },
  { weight: 1, arbitrary: faq },
  { weight: 1, arbitrary: steps },
  { weight: 2, arbitrary: cta },
  { weight: 2, arbitrary: figure },
  { weight: 2, arbitrary: example },
  { weight: 1, arbitrary: unknown },
  { weight: 1, arbitrary: leafUnknown },
);
/** A body: blocks, and a `cover` first about a fifth of the time, since "first in the body" is the one place the spec allows it. */
export const body = fc.tuple(fc.option(cover, { nil: undefined, freq: 5 }), fc.array(block, { minLength: 0, maxLength: 8 })).map(([c, bs]) => [c, ...bs].filter((b): b is string => Boolean(b)).join("\n\n") + "\n");

// ───────────────────────────────────────────────────────────────────────────────────────────────────────
// A site as data, and how it is written
// ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Item {
  type: "post" | "page" | "author";
  /** The file's name, and for a nested page the directory above it. */
  slug: string; parent?: string;
  fm: Record<string, unknown>;
  body: string;
}
export interface NavItem { label: string; ref?: string; url?: string }
export interface Site {
  name: string; description?: string;
  /** `types.author.layout`: the byline links to a page that exists, or is a name (H1). */
  authorPages: boolean;
  redirects: Record<string, string>;
  jsKb: number;
  items: Item[];
  /** Term files: a title and a description for a tag or category, which the term page and the surface carry. */
  terms: Array<{ taxonomy: "tag" | "category"; term: string; title: string; description?: string }>;
  /** `content/media/<name>.png`: dimensions and a colour, so the bytes are real rasters with a header the build reads. */
  media: Array<{ name: string; width: number; height: number; rgb: [number, number, number] }>;
  nav: { header?: NavItem[]; footer?: NavItem[] };
  /** `plugins:` — the interruption property enables its killer here; the site itself declares none. */
  plugins?: string[];
}

const status = fc.oneof({ weight: 5, arbitrary: fc.constant("published") }, { weight: 2, arbitrary: fc.constant("draft") }, { weight: 1, arbitrary: fc.constant("trashed") }, { weight: 1, arbitrary: fc.constant("review") });
const y = (v: unknown) => JSON.stringify(v);   // a YAML scalar, quoted: a title with a colon or a `#` in it is a title, not a mapping
export const post = (authors: string[]): fc.Arbitrary<Item> => rec({
  type: fc.constant("post" as const), slug,
  fm: rec({
    title: words(1, 6), date, status,
    updated: fc.option(date, { nil: undefined, freq: 4 }),
    description: fc.option(sentence, { nil: undefined, freq: 3 }),
    author: fc.option(fc.constantFrom(...authors, "nobody"), { nil: undefined, freq: authors.length ? 2 : 6 }),
    category: fc.option(category, { nil: undefined, freq: 2 }),
    tags: fc.option(fc.uniqueArray(tag, { minLength: 0, maxLength: 3 }), { nil: undefined, freq: 3 }),
    cover: fc.option(rec({ image: fc.constantFrom("/media/one.png", "/media/two.png"), alt: sentence, eyebrow: fc.option(word, { nil: undefined }) }), { nil: undefined, freq: 5 }),
    noindex: fc.option(fc.boolean(), { nil: undefined, freq: 6 }),
  }).map((fm) => Object.fromEntries(Object.entries(fm).filter(([, v]) => v !== undefined))),
  body,
});
export const page: fc.Arbitrary<Item> = rec({
  type: fc.constant("page" as const), slug,
  parent: fc.option(fc.constantFrom("docs", "help"), { nil: undefined, freq: 3 }),
  fm: rec({ title: words(1, 5), status, description: fc.option(sentence, { nil: undefined, freq: 3 }) }).map((fm) => Object.fromEntries(Object.entries(fm).filter(([, v]) => v !== undefined))),
  body,
});
export const author: fc.Arbitrary<Item> = rec({
  type: fc.constant("author" as const), slug: fc.constantFrom("sunny", "ada", "kim"),
  fm: rec({ name: words(1, 2), bio: fc.option(sentence, { nil: undefined }), url: fc.option(url, { nil: undefined, freq: 3 }) }).map((fm) => Object.fromEntries(Object.entries(fm).filter(([, v]) => v !== undefined))),
  body: paragraph.map((p) => p + "\n"),
});
export const item = (authors: string[]) => fc.oneof({ weight: 5, arbitrary: post(authors) }, { weight: 2, arbitrary: page }, { weight: 1, arbitrary: author });

const navItem = (refs: string[]): fc.Arbitrary<NavItem> => fc.oneof(
  rec({ label: words(1, 2), ref: fc.constantFrom(...refs, "/", "/tag/ai", "page/nowhere") }),
  rec({ label: words(1, 2), url: fc.constantFrom("/feed.xml", "https://github.com/snymrova/snypd") }),
);
/**
 * A `ref` is written as `type/slug`, never as a route. The index remembers a slug change (`moves`) and
 * `routeLookup` follows it, so a menu written as `/posts/old` still points at the post after a rename —
 * *on an index that saw the rename*. A cold build has no such memory, and that item is dropped: the one
 * place an incremental build and a cold one are allowed to differ, by design (docs/09 U2, lint rule 10),
 * and so the one place this generator does not go. Recorded in docs/11 decision 153.
 */
export const site: fc.Arbitrary<Site> = fc.uniqueArray(author, { minLength: 0, maxLength: 2, selector: (a) => a.slug }).chain((authors) =>
  rec({
    name: words(1, 3), description: fc.option(sentence, { nil: undefined }),
    authorPages: fc.boolean(),
    redirects: fc.dictionary(fc.constantFrom("/old", "/posts/gone", "/about"), fc.constantFrom("/", "/about", "/posts/notes"), { maxKeys: 2, noNullPrototype: true }),
    jsKb: fc.constantFrom(0, 0, 0, 20),
    items: fc.uniqueArray(fc.oneof({ weight: 5, arbitrary: post(authors.map((a) => a.slug)) }, { weight: 2, arbitrary: page }), { minLength: 1, maxLength: 6, selector: (i) => `${i.type}/${i.parent ?? ""}/${i.slug}` }).map((items) => [...authors, ...items]),
    terms: fc.uniqueArray(rec({ taxonomy: fc.constantFrom("tag" as const, "category" as const), term: fc.constantFrom(...TAGS, ...CATEGORIES), title: words(1, 2), description: fc.option(sentence, { nil: undefined }) }), { maxLength: 3, selector: (t) => `${t.taxonomy}/${t.term}` }),
    media: fc.uniqueArray(rec({ name: fc.constantFrom("one", "two"), width: fc.constantFrom(16, 64, 320), height: fc.constantFrom(16, 40, 200), rgb: fc.tuple(fc.nat({ max: 255 }), fc.nat({ max: 255 }), fc.nat({ max: 255 })) }), { maxLength: 2, selector: (m) => m.name }),
    nav: fc.constant({}),
  }).chain((s) => {
    const refs = s.items.filter((i) => i.type !== "author").map((i) => `${i.type}/${i.parent ? `${i.parent}/` : ""}${i.slug}`);
    return rec({ header: fc.option(fc.array(navItem(refs), { maxLength: 4 }), { nil: undefined }), footer: fc.option(fc.array(navItem(refs), { maxLength: 3 }), { nil: undefined, freq: 3 }) })
      .map((nav) => ({ ...s, nav: Object.fromEntries(Object.entries(nav).filter(([, v]) => v !== undefined)) }));
  }));

export const DIRS = { post: "content/posts", page: "content/pages", author: "content/authors" } as const;
export const fileOf = (root: string, i: Item) => join(root, DIRS[i.type], i.parent ?? "", `${i.slug}.md`);
export const routeOf = (i: Item) => (i.type === "post" ? `/posts/${i.slug}` : i.type === "author" ? `/authors/${i.slug}` : (`/${i.parent ? `${i.parent}/` : ""}${i.slug}`.replace(/\/index$/, "") || "/"));
export const source = (i: Item) => `---\n${Object.entries(i.fm).map(([k, v]) => `${k}: ${y(v)}`).join("\n")}\n---\n\n${i.body}`;
const yamlOf = (v: unknown) => JSON.stringify(v);   // every YAML document here is written as JSON, which YAML reads and no quoting rule can break
export function configOf(s: Site): string {
  const cfg: Record<string, unknown> = { snypd: 1, site: { name: s.name, url: "https://p.example", ...(s.description ? { description: s.description } : {}), ...(Object.keys(s.redirects).length ? { redirects: s.redirects } : {}) }, theme: { use: "base" }, types: { author: { layout: s.authorPages ? "author" : null } }, bench: { budgets: { jsKb: s.jsKb } }, ...(s.plugins ? { plugins: s.plugins } : {}) };
  return `${yamlOf(cfg)}\n`;
}

/** Write the whole site under `root`, from nothing. */
export function writeSite(root: string, s: Site): void {
  rmSync(root, { recursive: true, force: true });
  for (const d of Object.values(DIRS)) mkdirSync(join(root, d), { recursive: true });
  writeFileSync(join(root, "snypd.yaml"), configOf(s));
  for (const i of s.items) writeItem(root, i);
  for (const t of s.terms) { const f = join(root, "content/taxonomies", t.taxonomy, `${t.term}.md`); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, `---\ntitle: ${y(t.title)}\n${t.description ? `description: ${y(t.description)}\n` : ""}---\n`); }
  for (const m of s.media) writeMedia(root, m);
  for (const [loc, items] of Object.entries(s.nav)) if (items) { mkdirSync(join(root, "content/nav"), { recursive: true }); writeFileSync(join(root, `content/nav/${loc}.yaml`), `${yamlOf(items)}\n`); }
}
export function writeItem(root: string, i: Item): void { const f = fileOf(root, i); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, source(i)); }
export function writeMedia(root: string, m: Site["media"][number]): void { const f = join(root, "content/media", `${m.name}.png`); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, png(m.width, m.height, m.rgb)); }

// ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Edits: what happens to a site between two builds
// ───────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Every edit names its target by an index, taken modulo whatever the site holds when the edit is applied,
 * so a shrunk sequence still means something after the edits before it were dropped. `apply` mutates the
 * model and the tree together and returns what it did, in words, for the failure report.
 */
export type Edit =
  | { kind: "create"; item: Item }
  | { kind: "body"; i: number; body: string }
  /** The H3 finding 3 shape: same length, and the mtime put back to what it was, as a coarse filesystem would leave it. */
  | { kind: "same-length"; i: number }
  | { kind: "retitle"; i: number; title: string }
  | { kind: "status"; i: number; status: string }
  | { kind: "tags"; i: number; tags: string[] }
  | { kind: "rename"; i: number; slug: string }
  | { kind: "delete"; i: number }
  /** A stat well before the racy window: the fast path the index takes on a file nobody touched. */
  | { kind: "backdate"; i: number; seconds: number }
  | { kind: "media"; media: Site["media"][number]; sameTick: boolean }
  | { kind: "media-delete"; name: string }
  | { kind: "term"; term: Site["terms"][number] }
  | { kind: "nav"; location: "header" | "footer"; items: NavItem[] | undefined }
  | { kind: "config"; patch: Partial<Pick<Site, "name" | "description" | "authorPages" | "jsKb" | "redirects">> }
  /** A `<script>` in a post: the build refuses to write it (E6), which is the interruption that needs no kill. */
  | { kind: "script"; i: number; on: boolean };

const ix = fc.nat({ max: 20 });
export const edit: fc.Arbitrary<Edit> = fc.oneof(
  { weight: 3, arbitrary: rec({ kind: fc.constant("create" as const), item: item(["sunny", "ada"]) }) },
  { weight: 6, arbitrary: rec({ kind: fc.constant("body" as const), i: ix, body }) },
  { weight: 3, arbitrary: rec({ kind: fc.constant("same-length" as const), i: ix }) },
  { weight: 3, arbitrary: rec({ kind: fc.constant("retitle" as const), i: ix, title: words(1, 5) }) },
  { weight: 3, arbitrary: rec({ kind: fc.constant("status" as const), i: ix, status }) },
  { weight: 2, arbitrary: rec({ kind: fc.constant("tags" as const), i: ix, tags: fc.uniqueArray(tag, { maxLength: 3 }) }) },
  { weight: 2, arbitrary: rec({ kind: fc.constant("rename" as const), i: ix, slug }) },
  { weight: 2, arbitrary: rec({ kind: fc.constant("delete" as const), i: ix }) },
  { weight: 3, arbitrary: rec({ kind: fc.constant("backdate" as const), i: ix, seconds: fc.integer({ min: 10, max: 3600 }) }) },
  { weight: 2, arbitrary: rec({ kind: fc.constant("media" as const), media: rec({ name: fc.constantFrom("one", "two"), width: fc.constantFrom(16, 64, 320), height: fc.constantFrom(16, 40, 200), rgb: fc.tuple(fc.nat({ max: 255 }), fc.nat({ max: 255 }), fc.nat({ max: 255 })) }), sameTick: fc.boolean() }) },
  { weight: 1, arbitrary: rec({ kind: fc.constant("media-delete" as const), name: fc.constantFrom("one", "two") }) },
  { weight: 1, arbitrary: rec({ kind: fc.constant("term" as const), term: rec({ taxonomy: fc.constantFrom("tag" as const, "category" as const), term: fc.constantFrom(...TAGS, ...CATEGORIES), title: words(1, 2), description: fc.option(sentence, { nil: undefined }) }) }) },
  { weight: 1, arbitrary: rec({ kind: fc.constant("nav" as const), location: fc.constantFrom("header" as const, "footer" as const), items: fc.option(fc.array(navItem(["post/notes", "page/about", "post/a-1"]), { maxLength: 3 }), { nil: undefined }) }) },
  { weight: 2, arbitrary: rec({ kind: fc.constant("config" as const), patch: fc.oneof(
    rec({ name: words(1, 3) }), rec({ description: fc.option(sentence, { nil: undefined }) }), rec({ authorPages: fc.boolean() }),
    rec({ jsKb: fc.constantFrom(0, 1, 20) }), rec({ redirects: fc.dictionary(fc.constantFrom("/old", "/posts/gone", "/about"), fc.constantFrom("/", "/about", "/posts/notes"), { maxKeys: 2, noNullPrototype: true }) })) }) },
  { weight: 1, arbitrary: rec({ kind: fc.constant("script" as const), i: ix, on: fc.boolean() }) },
);

const SCRIPT = "<script>document.title = 'not this'</script>";
/**
 * Put a file's mtime back to what a stat read before it was rewritten, at the precision the index
 * compares (`mtimeMs`, a double). `utimes` with a `Date` rounds to the millisecond and would move it,
 * which is how the first cut of this generator never once took the path H3 finding 3 is about. True
 * when the restore held; a filesystem that would not take it back is reported, not asserted around.
 */
function keepMtime(f: string, before: { atimeMs: number; mtimeMs: number }): boolean {
  utimesSync(f, before.atimeMs / 1000, before.mtimeMs / 1000);
  return statSync(f).mtimeMs === before.mtimeMs;
}
/** Mutate `s` and the tree at `root` by one edit. Returns a one-line account of what changed, for the report. */
export function apply(root: string, s: Site, e: Edit): string {
  const pick = (i: number) => s.items[i % s.items.length];
  const rewrite = (i: Item) => writeItem(root, i);
  switch (e.kind) {
    case "create": {
      const taken = s.items.some((i) => i.type === e.item.type && i.slug === e.item.slug && i.parent === e.item.parent);
      if (taken) return `create: ${e.item.type}/${e.item.slug} exists — skipped`;
      s.items.push(e.item); rewrite(e.item); return `create ${e.item.type}/${e.item.slug}`;
    }
    case "body": { const i = pick(e.i); if (!i) return "body: nothing to edit"; i.body = e.body; rewrite(i); return `body of ${i.type}/${i.slug}`; }
    case "same-length": {
      const i = pick(e.i); if (!i) return "same-length: nothing to edit";
      const f = fileOf(root, i); const before = statSync(f);
      // Swap two characters of the body and keep the length. A body too short to swap gets one character flipped.
      const b = i.body; const k = b.search(/[a-z]/);
      i.body = k >= 0 ? b.slice(0, k) + (b[k] === "z" ? "a" : String.fromCharCode(b.charCodeAt(k) + 1)) + b.slice(k + 1) : b;
      rewrite(i);
      // The mtime the previous write had, put back: an edit inside the filesystem's tick, as FAT's two seconds and
      // HFS+'s one would leave it — but only while that mtime is inside the window the index distrusts. A file
      // last written an hour ago and edited now has a new mtime on every filesystem there is; putting the old
      // one back would be a clock running backwards, which is not a case anything claims to catch.
      const tick = before.mtimeMs >= Date.now() - RACY_MS && keepMtime(f, before);
      return `same-length edit of ${i.type}/${i.slug}${tick ? ", mtime kept" : ""}`;
    }
    case "retitle": { const i = pick(e.i); if (!i) return "retitle: nothing"; i.fm[i.type === "author" ? "name" : "title"] = e.title; rewrite(i); return `retitle ${i.type}/${i.slug}`; }
    case "status": { const i = pick(e.i); if (!i || i.type === "author") return "status: nothing"; i.fm.status = e.status; rewrite(i); return `${i.type}/${i.slug} → ${e.status}`; }
    case "tags": { const i = pick(e.i); if (!i || i.type !== "post") return "tags: nothing"; i.fm.tags = e.tags; rewrite(i); return `tags of ${i.slug} → [${e.tags}]`; }
    case "rename": {
      const i = pick(e.i); if (!i) return "rename: nothing";
      if (s.items.some((o) => o !== i && o.type === i.type && o.slug === e.slug && o.parent === i.parent)) return `rename: ${e.slug} taken — skipped`;
      rmSync(fileOf(root, i)); i.slug = e.slug; rewrite(i); return `rename → ${i.type}/${e.slug}`;
    }
    case "delete": { const i = pick(e.i); if (!i) return "delete: nothing"; rmSync(fileOf(root, i)); s.items.splice(s.items.indexOf(i), 1); return `delete ${i.type}/${i.slug}`; }
    case "backdate": { const i = pick(e.i); if (!i) return "backdate: nothing"; const t = new Date(Date.now() - e.seconds * 1000); utimesSync(fileOf(root, i), t, t); return `backdate ${i.type}/${i.slug} by ${e.seconds}s`; }
    case "media": {
      const f = join(root, "content/media", `${e.media.name}.png`);
      let before: import("node:fs").Stats | undefined; try { before = statSync(f); } catch {}
      const k = s.media.findIndex((m) => m.name === e.media.name);
      if (k >= 0) s.media[k] = e.media; else s.media.push(e.media);
      writeMedia(root, e.media);
      const tick = e.sameTick && before !== undefined && before.mtimeMs >= Date.now() - RACY_MS && keepMtime(f, before);
      return `media ${e.media.name}.png ${e.media.width}×${e.media.height}${tick ? ", mtime kept" : ""}`;
    }
    case "media-delete": { const k = s.media.findIndex((m) => m.name === e.name); if (k < 0) return "media-delete: nothing"; s.media.splice(k, 1); rmSync(join(root, "content/media", `${e.name}.png`)); return `delete media ${e.name}.png`; }
    case "term": { const k = s.terms.findIndex((t) => t.taxonomy === e.term.taxonomy && t.term === e.term.term); if (k >= 0) s.terms[k] = e.term; else s.terms.push(e.term); const f = join(root, "content/taxonomies", e.term.taxonomy, `${e.term.term}.md`); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, `---\ntitle: ${y(e.term.title)}\n${e.term.description ? `description: ${y(e.term.description)}\n` : ""}---\n`); return `term ${e.term.taxonomy}/${e.term.term}`; }
    case "nav": { const f = join(root, `content/nav/${e.location}.yaml`); if (e.items) { s.nav[e.location] = e.items; mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, `${yamlOf(e.items)}\n`); } else { delete s.nav[e.location]; rmSync(f, { force: true }); } return `nav ${e.location}: ${e.items ? `${e.items.length} items` : "removed"}`; }
    case "config": { Object.assign(s, e.patch); if (e.patch.description === undefined && "description" in e.patch) delete s.description; writeFileSync(join(root, "snypd.yaml"), configOf(s)); return `config ${Object.keys(e.patch).join(",")}`; }
    case "script": {
      const i = pick(e.i); if (!i || i.type === "author") return "script: nothing";
      const has = i.body.includes(SCRIPT);
      if (e.on && !has) i.body = `${i.body}\n${SCRIPT}\n`; else if (!e.on && has) i.body = i.body.replace(`\n${SCRIPT}\n`, "");
      else return `script ${e.on ? "on" : "off"}: already`;
      rewrite(i); return `script ${e.on ? "into" : "out of"} ${i.type}/${i.slug}`;
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Reading a dist/ back, and saying how two differ
// ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Every file under `dir`, `/`-relative path → sha1 of its bytes. */
export function snapshot(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string, rel: string) => {
    let entries: import("node:fs").Dirent[];
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(d, e.name), r); else out.set(r.split(sep).join("/"), sha1(readFileSync(join(d, e.name))));
    }
  };
  walk(dir, "");
  return out;
}

/** The files that are only in one, or differ — each with a hint at where, for text. Empty when the two trees are the same bytes. */
export function differences(aDir: string, bDir: string, names: [string, string] = ["incremental", "cold"]): string[] {
  const a = snapshot(aDir), b = snapshot(bDir);
  const out: string[] = [];
  for (const [f, h] of a) {
    if (!b.has(f)) out.push(`${f}: only in ${names[0]}`);
    else if (b.get(f) !== h) out.push(`${f}: differs — ${firstDifference(readFileSync(join(aDir, f)), readFileSync(join(bDir, f)))}`);
  }
  for (const f of b.keys()) if (!a.has(f)) out.push(`${f}: only in ${names[1]}`);
  return out.sort();
}
function firstDifference(a: Buffer, b: Buffer): string {
  const n = Math.min(a.length, b.length);
  let i = 0; while (i < n && a[i] === b[i]) i++;
  if (i === n && a.length === b.length) return "same bytes";
  const isText = !a.subarray(0, Math.min(a.length, 512)).includes(0);
  if (!isText) return `at byte ${i} (${a.length} vs ${b.length} bytes)`;
  const cut = (x: Buffer) => JSON.stringify(x.subarray(Math.max(0, i - 40), i + 80).toString("utf8"));
  return `at byte ${i}: ${cut(a)} vs ${cut(b)}`;
}
