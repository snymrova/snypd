/**
 * The four YAML documents under fuzz (H4, docs/11 finding 4, the second input): `snypd.yaml`, the env
 * layer over it, a theme's `theme.yaml`, and a menu. One property over a site whose files are
 * generated — well-formed with wrong values, wrong shapes, or not YAML at all — with four clauses:
 *
 *  a. `loadConfig` never throws. A config that does not load is a diagnostic with a file and a line;
 *     a stack trace is the one answer `snypd doctor` may not give.
 *  b. `ok` means what it says: true exactly when no diagnostic is an error.
 *  c. A token value cannot change the meaning of the sheet (E5, decision 120): every token that
 *     reaches a loaded config — a theme default, a variation, a site override, an env override —
 *     writes exactly one declaration into `:root { … }` and closes nothing. Asserted on the emitted
 *     CSS and not on the guard, so a value that reached the config by a path the guard never saw
 *     would still be caught here.
 *  d. The menus resolve or are reported: every item a loaded nav file carries either became a link
 *     or is named in a diagnostic — never dropped in silence, never thrown over.
 */
import { afterAll, describe, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, loadNav, navLocations, resolveNav, routeLookup } from "@snypd/core";
import { minifyCss, resolveTokens, tokensCss } from "@snypd/render";
import { announce, fc, params, sentence, word, words } from "./arbitrary";

setDefaultTimeout(600_000);
announce();

const ROOT = "corpora/_test/props/config";
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

// ── values ──────────────────────────────────────────────────────────────────────────────────────────
/** A CSS value the guard allows — the ordinary case, so the sheet clause runs on loaded configs and not on refusals. */
const cssOk = fc.constantFrom("#fff", "1.65", "38rem", "var(--x)", "oklch(0.7 0.1 200)", "light-dark(#fff, #000)", "calc(100% - 2rem)", "'Iowan Old Style', Georgia, serif", "Söhne, sans-serif", "0", "1px solid #ccc", "clamp(1rem, 2vw, 2rem)", 0, 1.5, 42);
/** What a stranger puts where a CSS value goes: the ones the guard must refuse, and the ones nobody thought of. */
const cssBad = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom("red; } body { display: none", "}", "{", "url(https://evil.example/x.css)", "expression(alert(1))", "a /* b */ c", "</style><script>1</script>", "@import 'x'", "\\65", "a !important", "calc(1px", "1px)", "'unclosed", "attr(title)", "image-set('a.png' 1x)", "x".repeat(300), "\u2028", "\uFF1B", "") },
  { weight: 2, arbitrary: fc.string({ unit: fc.constantFrom("a", " ", "(", ")", ";", "{", "}", "#", "-", "1", "%", ",", "'", "\"", "/", "*", "<", "@", "!", "var", "calc", "url", "\\"), maxLength: 24 }) },
  { weight: 1, arbitrary: fc.oneof(fc.boolean(), fc.constant(null), fc.array(fc.string(), { maxLength: 2 }), fc.dictionary(word, fc.string(), { maxKeys: 2, noNullPrototype: true })) },
);
/** Mostly allowed, so a run lands on the sheet clause; sometimes not, so the guard is what stops it. */
const cssish = fc.oneof({ weight: 5, arbitrary: cssOk }, { weight: 2, arbitrary: cssBad });
const tokenName = fc.constantFrom("color.bg", "color.text", "measure", "font.body", "leading.body", "x", "a b", "--injected", "color.bg; }");
/** A value where a scalar goes and does not belong. */
const junk = fc.oneof(fc.string({ maxLength: 12 }), fc.integer(), fc.boolean(), fc.constant(null), fc.array(fc.string({ maxLength: 4 }), { maxLength: 2 }), fc.dictionary(word, fc.string({ maxLength: 4 }), { maxKeys: 2, noNullPrototype: true }));
const opt = <T>(a: fc.Arbitrary<T>, freq = 2) => fc.option(a, { nil: undefined, freq });
const compact = <T extends object>(a: fc.Arbitrary<T>) => a.map((c) => Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)) as Record<string, unknown>);

// ── documents ───────────────────────────────────────────────────────────────────────────────────────
/**
 * A config as a site writes one, then zero or one thing wrong with it — so most runs *load*, which is
 * where clauses c and d have anything to check, and a refusal is one edit away from the config that
 * loaded, which is what a person's mistake looks like. A config of nothing but wrong values is refused
 * on its first key and exercises one line of the loader; the first cut of this generator was that, and
 * loaded four sites in three hundred.
 */
const validConfig = compact(fc.record({
  snypd: fc.constant(1),
  site: compact(fc.record({ name: words(1, 3), url: fc.constantFrom("https://p.example", "http://localhost:4321", "https://p.example/"), description: opt(sentence), icon: opt(fc.constant("/media/icon.png"), 4), redirects: opt(fc.dictionary(fc.constantFrom("/old", "/a"), fc.constantFrom("/", "/about"), { maxKeys: 2, noNullPrototype: true }), 3) }, { noNullPrototype: true })),
  theme: compact(fc.record({ use: fc.constantFrom("base", "t", "t"), variation: opt(fc.constantFrom("dusk", "paper"), 4), tokens: opt(fc.dictionary(tokenName, cssish, { maxKeys: 4, noNullPrototype: true })), settings: opt(fc.dictionary(fc.constantFrom("showDates", "tagline"), fc.oneof(fc.boolean(), words(1, 2)), { maxKeys: 2, noNullPrototype: true }), 4) }, { noNullPrototype: true })),
  types: opt(compact(fc.record({ author: fc.record({ layout: fc.constantFrom("author", null) }, { noNullPrototype: true }) }, { noNullPrototype: true })), 3),
  bench: opt(fc.record({ budgets: fc.dictionary(fc.constantFrom("jsKb", "cssKb"), fc.nat({ max: 100 }), { maxKeys: 2, noNullPrototype: true }) }, { noNullPrototype: true }), 3),
  plugins: opt(fc.constant(["changelog"]), 4),
}, { noNullPrototype: true }));
type Doc = Record<string, unknown>;
const set = (c: Doc, path: string[], v: unknown): Doc => { const out = structuredClone(c); let o: Doc = out; for (const k of path.slice(0, -1)) { if (typeof o[k] !== "object" || o[k] === null) o[k] = {}; o = o[k] as Doc; } o[path[path.length - 1]!] = v; return out; };
/** One thing wrong: the shapes `ConfigSchema` refuses, the values the guards refuse, and the keys nothing declares. */
const corruption: fc.Arbitrary<(c: Doc) => Doc> = fc.oneof(
  fc.constantFrom<(c: Doc) => Doc>(
    (c) => set(c, ["snypd"], 2), (c) => set(c, ["snypd"], "1"), (c) => set(c, ["site", "url"], "not a url"), (c) => set(c, ["site", "url"], "/relative"), (c) => set(c, ["site", "name"], ""),
    (c) => set(c, ["site"], null), (c) => set(c, ["theme"], "base"), (c) => set(c, ["theme", "use"], "missing"), (c) => set(c, ["theme", "use"], 7), (c) => set(c, ["theme", "variation"], "none"),
    (c) => set(c, ["types", "post", "layout"], "nope"), (c) => set(c, ["types", "post", "fields", "date", "type"], "bogus"), (c) => set(c, ["types"], []), (c) => set(c, ["statuses"], { draft: { public: "yes" } }), (c) => set(c, ["initialStatus"], "nothing"),
    (c) => set(c, ["bench", "budgets", "jsKb"], -1), (c) => set(c, ["bench", "budgets", "jsKb"], "many"), (c) => set(c, ["plugins"], ["missing"]), (c) => set(c, ["plugins"], "changelog"), (c) => set(c, ["site", "redirects"], { "/a": 3 }), (c) => set(c, ["site", "redirects", "b"], "/"),
    (c) => set(c, ["theme", "settings", "nothing"], 1), (c) => set(c, ["site", "locales"], []), (c) => set(c, ["nonsense"], 1), (c) => { const o = structuredClone(c); delete o.site; return o; },
  ),
  fc.tuple(tokenName, cssBad).map(([k, v]) => (c: Doc) => set(c, ["theme", "tokens", k], v)),
  fc.tuple(fc.constantFrom("site", "theme", "types", "bench", "plugins"), junk).map(([k, v]) => (c: Doc) => set(c, [k], v)),
);
const config = fc.tuple(validConfig, fc.array(corruption, { maxLength: 1 })).map(([c, cs]) => cs.reduce((acc, f) => f(acc), c));

/** A theme the site can `use: t` — declares tokens, sometimes a variation, then zero or one thing wrong. */
const validTheme = compact(fc.record({
  theme: fc.constant("t"), extends: fc.constant("base"),
  tokens: fc.dictionary(fc.constantFrom("color.bg", "color.text", "measure", "font.body"), fc.oneof(compact(fc.record({ default: cssish, customisable: opt(fc.boolean()), kind: opt(fc.constantFrom("color", "size", "font", "keyword")) }, { noNullPrototype: true })), cssish), { minKeys: 1, maxKeys: 3, noNullPrototype: true }),
  variations: opt(fc.dictionary(fc.constantFrom("dusk", "paper"), compact(fc.record({ description: sentence, tokens: opt(fc.dictionary(fc.constantFrom("color.bg", "color.text", "measure"), cssish, { maxKeys: 2, noNullPrototype: true })) }, { noNullPrototype: true })), { maxKeys: 2, noNullPrototype: true })),
  locations: opt(fc.constant(["header", "footer"]), 3),
}, { noNullPrototype: true }));
const themeCorruption: fc.Arbitrary<(c: Doc) => Doc> = fc.oneof(
  fc.constantFrom<(c: Doc) => Doc>((c) => set(c, ["extends"], "t"), (c) => set(c, ["extends"], "missing"), (c) => set(c, ["theme"], 1), (c) => set(c, ["variations", "Bad Name"], {}), (c) => set(c, ["variations", "dusk", "tokens", "invented"], "#000"), (c) => set(c, ["locations"], ["Side bar"]), (c) => set(c, ["tokens"], []), (c) => set(c, ["tokens", "x"], { default: "#fff", kind: 3 }), (c) => set(c, ["css"], "./missing.css")),
  fc.tuple(tokenName, cssBad).map(([k, v]) => (c: Doc) => set(c, ["tokens", k], v)),
  fc.tuple(tokenName, cssBad).map(([k, v]) => (c: Doc) => set(c, ["variations", "dusk", "tokens", k], v)),
);
const themeYaml = fc.tuple(validTheme, fc.array(themeCorruption, { maxLength: 1 })).map(([c, cs]) => cs.reduce((acc, f) => f(acc), c));

const navYaml = fc.oneof(
  { weight: 3, arbitrary: fc.array(fc.oneof(
    { weight: 4, arbitrary: fc.record({ label: fc.oneof({ weight: 6, arbitrary: words(1, 2) }, { weight: 1, arbitrary: fc.constant("") }), ref: fc.constantFrom("/", "/about", "page/about", "post/nope", "/old") }, { noNullPrototype: true }) },
    { weight: 4, arbitrary: fc.record({ label: words(1, 2), url: fc.constantFrom("https://x.example", "/feed.xml", "javascript:x") }, { noNullPrototype: true }) },
    { weight: 1, arbitrary: fc.record({ label: words(1, 2), ref: fc.constant("/"), url: fc.constant("/") }, { noNullPrototype: true }) },
    { weight: 1, arbitrary: fc.record({ label: words(1, 2) }, { noNullPrototype: true }) }), { maxLength: 4 }) },
  { weight: 1, arbitrary: junk },
);

/** A YAML document from a value, or text nobody serialised: YAML's own traps and plain noise. */
const yamlOf = (v: unknown) => JSON.stringify(v);
const rawYaml = fc.constantFrom("snypd: 1\nsite:\n\tname: tab\n", "snypd: 1\nsite: &a { name: x, url: https://p.example }\ntheme: *a\n", "snypd: 1\nsite: { name: x, url: https://p.example\n", "- a list\n", "just a string\n", "", "snypd: 1\nsite: { name: x, url: https://p.example }\nsite: { name: twice }\n", "snypd: 1\nsite: { name: !!js/function 'x', url: https://p.example }\n", "snypd: 1\nsite: { <<: *missing }\n", "﻿snypd: 1\nsite: { name: bom, url: https://p.example }\n", "snypd: 1\r\nsite: { name: crlf, url: https://p.example }\r\n");
const document = <T>(a: fc.Arbitrary<T>) => fc.oneof({ weight: 12, arbitrary: a.map(yamlOf) }, { weight: 1, arbitrary: rawYaml }, { weight: 1, arbitrary: fc.string({ unit: fc.constantFrom(":", " ", "\n", "-", "{", "}", "[", "]", "\"", "'", "#", "&", "*", "!", "|", ">", "a", "1", "\t"), maxLength: 40 }) });

interface Files { site: string; env?: string; theme?: string; nav?: string; footer?: string }
const files: fc.Arbitrary<Files> = fc.record({
  site: document(config),
  env: fc.option(document(config), { nil: undefined, freq: 3 }),
  theme: fc.option(document(themeYaml), { nil: undefined, freq: 3 }),
  nav: fc.option(document(navYaml), { nil: undefined, freq: 2 }),
  footer: fc.option(document(navYaml), { nil: undefined, freq: 4 }),
}, { noNullPrototype: true }).map((f) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)) as unknown as Files);

function write(root: string, f: Files): void {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, "content/pages"), { recursive: true });
  writeFileSync(join(root, "content/pages/about.md"), "---\ntitle: About\nstatus: published\n---\n\nAbout.\n");
  writeFileSync(join(root, "snypd.yaml"), f.site);
  if (f.env !== undefined) writeFileSync(join(root, "snypd.dev.yaml"), f.env);
  if (f.theme !== undefined) { mkdirSync(join(root, "themes/t"), { recursive: true }); writeFileSync(join(root, "themes/t/theme.yaml"), f.theme); }
  if (f.nav !== undefined || f.footer !== undefined) mkdirSync(join(root, "content/nav"), { recursive: true });
  if (f.nav !== undefined) writeFileSync(join(root, "content/nav/header.yaml"), f.nav);
  if (f.footer !== undefined) writeFileSync(join(root, "content/nav/footer.yaml"), f.footer);
}

describe("the four YAML documents under fuzz", () => {
  test("5. every config loads or is refused with a place; ok means no error; a loaded token is one declaration; a menu item is a link or a diagnostic", () => {
    fc.assert(fc.property(files, (f) => {
      write(ROOT, f);
      // a. never a throw
      const cfg = loadConfig(ROOT, { env: "dev" });
      // b. `ok` is the absence of errors, and every diagnostic is a sentence with a level
      const errors = cfg.diagnostics.filter((d) => d.level === "error");
      if (cfg.ok !== (errors.length === 0)) throw new Error(`ok=${cfg.ok} with ${errors.length} errors: ${errors.map((d) => d.message).join("; ")}`);
      for (const d of cfg.diagnostics) {
        if (d.level !== "error" && d.level !== "warning") throw new Error(`a diagnostic with level ${String(d.level)}`);
        if (!d.message?.trim()) throw new Error(`a diagnostic with no message at ${d.path}`);
      }
      if (!cfg.ok) return;
      // c. the sheet: one declaration per token, two braces open, two closed, nothing between them that ends a block
      const tokens = resolveTokens(cfg.config.theme.tokens as Parameters<typeof resolveTokens>[0]);
      const names = Object.keys(tokens);
      const css = tokensCss(tokens);
      if (names.length) {
        const body = css.slice(css.indexOf(":root {\n") + 8, css.lastIndexOf("\n}\n}\n"));
        const lines = body.split("\n");
        if (lines.length !== names.length) throw new Error(`${names.length} tokens became ${lines.length} lines:\n${body}`);
        for (const line of lines) if (!/^  --[a-zA-Z0-9_-]+: [^;{}]*;$/.test(line)) throw new Error(`a token line that is not one declaration: ${JSON.stringify(line)}`);
        if ((css.match(/[{}]/g) ?? []).length !== 4) throw new Error(`the token sheet does not have two blocks:\n${css}`);
        if (/[<@\\!]|\/\*|\*\//.test(body)) throw new Error(`a token value carries what the guard refuses:\n${body}`);
        const min = minifyCss(css);
        if ((min.match(/[{}]/g) ?? []).length !== 4) throw new Error(`minified, the sheet lost or gained a block:\n${min}`);
      } else if (css !== "") throw new Error(`no tokens but a sheet: ${css}`);
      // d. every menu item became a link or a finding
      const lookup = routeLookup(ROOT, cfg);
      for (const location of navLocations(cfg)) {
        const nav = loadNav(ROOT, location, cfg);
        const { links, dead } = resolveNav(nav.items, lookup);
        const named = nav.diagnostics.map((d) => d.message).join("\n");
        for (const item of nav.items) {
          const linked = links.some((l) => l.label === item.label) || dead.some((x) => x.item === item);
          if (!linked && !named.includes(item.label)) throw new Error(`menu item ${JSON.stringify(item)} in ${location} is neither a link nor a diagnostic`);
        }
      }
    }), params(150));
  });
});
