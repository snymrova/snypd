/**
 * The directives parser under fuzz (H4, docs/11 finding 4, the first of the three inputs). One property
 * with five clauses, over documents the vocabulary generator writes and over strings nothing wrote —
 * a document with a character deleted, a fence never closed, an attribute list never closed, and
 * plain noise.
 *
 *  a. Nothing throws: parse, the typed tree, lint, and a render through the base theme — every one of
 *     the thirteen primitives with props it never meant, YAML bodies that are not YAML, a chart with
 *     no rows. A throw here is a build that stops on one file with a stack trace, and `snypd dev`
 *     serving a 500 for a typo.
 *  b. The index and the parser read the same frontmatter. `readFrontmatter` is the fast path the
 *     index takes without a markdown parse; the renderer's status, title and date come from the parse.
 *     Where they disagree, a post is published in the index and a draft on the page, or the reverse.
 *  c. A document survives its cache. The build stores parsed documents as JSON and reads them back
 *     (`MdastCache`); an incremental build renders from the JSON and a cold build from the parse, so
 *     the two have to render the same bytes — E7 again, one level down.
 *  d. Every diagnostic points somewhere: a rule, a line inside the file, a hint.
 *  e. What the renderer emits carries script only where lint said so — rule 13 and the build's
 *     refusal (E6) are two readers of one detector, and a page cannot reach one without the other.
 *     Since U7 that includes every invoker `base` writes on its own: `commandfor`, `popovertarget`, a
 *     `closedby`, an `anchor-name` in a `style` — an invoker attribute is not a script site, and the
 *     generator's figures, faqs and footnotes put one on most pages.
 */
import { afterAll, beforeAll, describe, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildTree, lint, loadConfig, MdastCache, parseMarkdown, readFrontmatter, scriptSites, type LoadedConfig } from "@snypd/core";
import { loadTheme, resolveTokens, EMPTY_HOOKS, type SiteCtx, type Theme } from "@snypd/render";
import { renderDoc } from "../../render/src/build";
import { announce, body, fc, params, sentence, source, words } from "./arbitrary";
import { DOCUMENTS } from "./corpus";

setDefaultTimeout(600_000);
announce();

const ROOT = "corpora/_test/props/content";
let theme: Theme, ctx: SiteCtx, cfg: LoadedConfig;
beforeAll(async () => {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(join(ROOT, "content/posts"), { recursive: true });
  writeFileSync(join(ROOT, "snypd.yaml"), "snypd: 1\nsite: { name: P, url: https://p.example }\ntheme: { use: base }\n");
  cfg = loadConfig(ROOT);
  theme = await loadTheme(cfg);
  ctx = { site: { name: "P", url: "https://p.example" }, tokens: resolveTokens({}), theme: { name: theme.name }, assets: { feed: "/feed.xml", llms: "/llms.txt", api: "/api/site.json" }, media: { "/media/one.png": { width: 64, height: 40 } }, config: cfg.config, parts: theme.parts, nav: {}, hooks: EMPTY_HOOKS, settings: {}, preview: false };
});
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

/** A frontmatter block as an author writes one, or as a stranger does: unquoted colons, a list, a date, a tab, a fence that never closes. */
const frontmatter = fc.oneof(
  { weight: 4, arbitrary: fc.record({ title: words(1, 5), date: fc.constantFrom("2026-03-01", "2026-13-40", "March", "2026-03-01T10:00:00Z"), status: fc.constantFrom("published", "draft", "review"), tags: fc.uniqueArray(fc.constantFrom("ai", "mcp", "null", "yes"), { maxLength: 3 }) }, { noNullPrototype: true }).map((fm) => `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n")}\n---\n`) },
  { weight: 1, arbitrary: fc.constantFrom("---\ntitle: a: b\n---\n", "---\n- a list\n---\n", "---\njust a string\n---\n", "---\ntitle: \"unclosed\n---\n", "---\ntitle: x\n", "---\ntitle: x\n---", "---\ntitle: x\n--- \n", "---\ntitle: x\n----\n", "---\r\ntitle: x\r\n---\r\n", "--- \ntitle: x\n---\n", "\n---\ntitle: x\n---\n", "---\n\ttitle: x\n---\n", "---\n---\n") },
  { weight: 1, arbitrary: fc.constant("") },
);
/** A document: frontmatter then a body, or the body alone, or the body with something broken in it, or noise. */
const document: fc.Arbitrary<string> = fc.oneof(
  { weight: 5, arbitrary: fc.tuple(frontmatter, body).map(([f, b]) => f + (f ? "\n" : "") + b) },
  { weight: 2, arbitrary: fc.tuple(body, fc.nat({ max: 400 })).map(([b, k]) => (k < b.length ? b.slice(0, k) + b.slice(k + 1) : b)) },
  { weight: 2, arbitrary: fc.tuple(body, fc.constantFrom(":::callout{", ":::chart{type=\"bar\"", "::stat{value=", "```", "<script", "<details>", "[^1", "| a |", ":::")).map(([b, tail]) => `${b}\n${tail}`) },
  { weight: 1, arbitrary: fc.string({ unit: "grapheme", maxLength: 200 }) },
  { weight: 1, arbitrary: fc.string({ unit: fc.constantFrom(":", ":::", "{", "}", "\"", "=", "\n", "\n\n", " ", "#", "-", "|", "`", "[", "]", "(", ")", "<", ">", "a", "chart", "callout", "stat"), maxLength: 60 }) },
);

const page = { route: "/posts/p", type: "post", slug: "p", title: "P", status: "published", frontmatter: {} };
const render = (src: string, cache: MdastCache) => renderDoc(src, { theme, ctx, page, cache });
const json = (v: unknown) => JSON.stringify(v, (_, x) => (x instanceof Date ? { $date: x.toISOString() } : x));

describe("the parser under fuzz", () => {
  test("4. every document parses, lints and renders; the fast frontmatter path agrees with the parser; the cache round-trips; script is where lint says", () => {
    fc.assert(fc.property(document, (src) => {
      // a. nothing throws, and the parse is a function of its input
      const doc = parseMarkdown(src);
      const again = parseMarkdown(src);
      if (json(doc) !== json(again)) throw new Error("two parses of one source differ");
      const tree = buildTree(doc, src);
      const result = lint(doc, tree, src, { type: cfg.config.types.post as never, statuses: Object.keys(cfg.config.statuses), routes: new Set(["/", "/about"]) });
      const fresh = render(src, new MdastCache());

      // b. the index reads what the parser reads
      const fast = readFrontmatter(src);
      if (json(fast) !== json(doc.frontmatter)) throw new Error(`readFrontmatter ${json(fast)} but parseMarkdown ${json(doc.frontmatter)}${doc.frontmatterError ? ` (parser: ${doc.frontmatterError})` : ""}`);

      // c. through the cache's JSON and back, the same blocks and the same bytes
      const store = new Map<string, string>();
      const persisted = new MdastCache({ read: (h) => store.get(h), write: (h, j) => store.set(h, j) });
      persisted.get(src);                       // parses and stores
      const reread = new MdastCache({ read: (h) => store.get(h), write: () => {} });   // every get is a read of the JSON
      const cached = render(src, reread);
      if (reread.misses) throw new Error("the cached document was not read back");
      if (cached.body.html !== fresh.body.html || (cached.cover?.html ?? "") !== (fresh.cover?.html ?? "")) throw new Error(`rendered from the cache differs from rendered from the parse\ncache: ${cached.body.html.slice(0, 300)}\nparse: ${fresh.body.html.slice(0, 300)}`);
      const shape = (bs: typeof tree.all) => json(bs.map((b) => [b.name, b.kind, b.props, b.data ?? null, b.line, b.children.length]));
      if (shape(cached.blocks) !== shape(fresh.blocks)) throw new Error("the cached document's blocks differ from the parse's");

      // d. a diagnostic is a place
      const lines = src.split("\n").length;
      for (const d of result.diagnostics) {
        if (!d.rule || !d.hint || !d.message) throw new Error(`a diagnostic without a rule, message or hint: ${json(d)}`);
        if (!(d.line >= 1 && d.line <= lines)) throw new Error(`rule ${d.rule} at line ${d.line} of ${lines}`);
      }

      // e. script on the page ⇔ rule 13 in the file
      const sites = scriptSites(fresh.body.html + (fresh.cover?.html ?? ""));
      const said = result.diagnostics.some((d) => d.rule === "inline-script");
      if (sites.length > 0 !== said) throw new Error(`the page ${sites.length ? `carries script (${sites.map((s) => s.what).join("; ")})` : "carries no script"} and lint ${said ? "said so" : "did not say so"}`);
    }), params(400, { examples: DOCUMENTS }));
  });

  test("the generator's frontmatter shapes are the ones the index sees on a real site", () => {
    // The generator writes `key: <json>`; make sure at least the ordinary case is a frontmatter both readers accept.
    fc.assert(fc.property(fc.record({ type: fc.constant("post" as const), slug: fc.constant("p"), fm: fc.record({ title: sentence, date: fc.constant("2026-01-01"), status: fc.constant("published") }, { noNullPrototype: true }), body }, { noNullPrototype: true }), (item) => {
      const src = source(item);
      const doc = parseMarkdown(src);
      if (doc.frontmatterError || doc.frontmatter.title !== item.fm.title) throw new Error(`the generator wrote frontmatter the parser refused: ${doc.frontmatterError}`);
    }), params(50));
  });
});
