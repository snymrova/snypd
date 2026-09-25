/**
 * The theme contract against the tree (docs/36 P1, decision 269). Both directions, because a list that
 * only grows is a list nobody trusts: a class `base` emits and the contract does not name is a socket a
 * piece cannot use, and a class the contract names that nothing emits is a socket a piece styles in vain.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { themeContract } from "@snypd/spec";
import { bareElements, cssRules, literalHits, ruleKey, selectorClasses, selectorHits } from "./contract";

const REPO = join(import.meta.dir, "../../..");
const contract = themeContract();

/** Every `.tsx` under a directory, recursively. */
const tsx = (dir: string): string[] => readdirSync(dir, { withFileTypes: true, recursive: true })
  .filter((e) => e.isFile() && e.name.endsWith(".tsx")).map((e) => join(e.parentPath, e.name));

/**
 * The classes a source file emits, read statically so every branch counts, not only the one a fixture
 * happens to render: `class="…"` (JSX and template strings), a `className:` option (viz), and the
 * `view-transition-class:` a title carries. Interpolations are dropped; `language-${…}` is a prefix.
 */
function emitted(src: string): Set<string> {
  const out = new Set<string>();
  const add = (v: string) => { for (const c of v.replace(/\$\{[^}]*\}/g, " ").split(/\s+/)) if (/^[a-z][\w-]*[a-z0-9]$/i.test(c)) out.add(c); };
  for (const m of src.matchAll(/\bclass=\\?["'`]([^"'`\\]*)/g)) add(m[1]!);
  for (const m of src.matchAll(/\bclassName:\s*["'`]([^"'`]*)/g)) add(m[1]!);
  for (const m of src.matchAll(/view-transition-class:\s*([\w-]+)/g)) add(m[1]!);
  return out;
}

describe("the theme contract (docs/36 §3)", () => {
  test("every contract token is declared by every bundled theme", () => {
    for (const t of ["editorial", "technical", "studio"]) {
      const declared = new Set(Object.keys((Bun.YAML.parse(readFileSync(join(REPO, "themes", t, "theme.yaml"), "utf8")) as { tokens?: object }).tokens ?? {}));
      expect(contract.tokens.filter((k) => !declared.has(k))).toEqual([]);
    }
  });

  test("an optional token is not also a contract token, and each derives from something", () => {
    for (const [k, v] of Object.entries(contract.optional)) {
      expect(contract.tokens).not.toContain(k);
      expect(v.derive.length).toBeGreaterThan(0);
    }
  });

  test("the class list is exactly what base's markup and the renderer emit", () => {
    const sources = [
      ...tsx(join(REPO, "themes/base")),
      ...["html.ts", "theme.ts", "media.ts"].map((f) => join(REPO, "packages/render/src", f)),
      ...readdirSync(join(REPO, "packages/viz/src")).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => join(REPO, "packages/viz/src", f)),
    ];
    const found = new Set<string>();
    for (const f of sources) for (const c of emitted(readFileSync(f, "utf8"))) found.add(c);
    const listed = new Set(contract.classes);
    const prefixed = (c: string) => contract.classPrefixes.some((p) => c.startsWith(p));
    expect([...found].filter((c) => !listed.has(c) && !prefixed(c)).sort()).toEqual([]);   // emitted, not listed
    expect([...listed].filter((c) => !found.has(c)).sort()).toEqual([]);                  // listed, not emitted
  });

  test("base's header carries the four masthead classes (decision 273)", () => {
    const header = emitted(readFileSync(join(REPO, "themes/base/parts/header.tsx"), "utf8"));
    for (const c of ["snypd-masthead", "snypd-brand", "snypd-logo", "snypd-tagline"]) expect(header.has(c)).toBe(true);
  });
});

describe("cssRules", () => {
  test("leaf rules keep their at-rule context, attribute values, and nested declarations", () => {
    const rs = cssRules(`/* a { b: c } */
a { color: red; }
@media (max-width: 34rem) {
  .x[data-k="note"] { gap: 1em; content: "{"; }
}
.n { margin: 0; &:hover { color: blue; } }`);
    expect(rs.map(ruleKey)).toEqual([
      'a { color: red }',
      '@media (max-width: 34rem) » .x[data-k="note"] { content: "{"; gap: 1em }',
      '.n { margin: 0 }',
      '.n » &:hover { color: blue }',
    ]);
    expect(rs[1]!.line).toBe(4);
  });

  test("the `house` piece: fifteen of the twenty rules the four sheets shared, each still verbatim in the sheets not yet carved (docs/36 §2, P3)", () => {
    // P1 measured twenty rules in all four sheets. The reduced-motion reset went to base (P1); P3's carve
    // moved four more out, because a rule in the first sublayer loses to every later slot whatever its
    // specificity — the byline's link colour (cover), the full-width figure (column), the footnote list
    // (notes, twice). What is left is the floor, and it is still in folio's own sheet word for word until
    // it is carved (studio was, in P3's second half).
    const house = cssRules(readFileSync(join(REPO, "packages/pieces/house/house/piece.css"), "utf8")).map(ruleKey);
    expect(house.length).toBe(15);
    for (const f of ["sites/snypd.rocks/themes/folio/theme.css"]) {
      const keys = new Set(cssRules(readFileSync(join(REPO, f), "utf8")).map(ruleKey));
      expect(house.filter((k) => !keys.has(k)), f).toEqual([]);
    }
    const moved = [
      [".snypd-byline a { color: inherit }", "cover"], ['.snypd-figure[data-width="full"] { grid-column: full }', "column"],
      [".footnotes ol { padding-inline-start: 1.5em }", "notes"],
    ] as const;
    for (const [rule, slot] of moved) expect(house, rule).not.toContain(rule);
    for (const [rule, slot] of moved) {
      const dir = join(REPO, "packages/pieces", slot);
      const holders = readdirSync(dir).filter((v) => cssRules(readFileSync(join(dir, v, "piece.css"), "utf8")).map(ruleKey).includes(rule));
      expect(holders.length, `${rule} in ${slot}/*`).toBeGreaterThan(0);
    }
  });
});

describe("piece.literal", () => {
  const vocab = contract.literals;
  test("tokens, scaling units and hairlines pass; colours, faces, fixed lengths and times do not", () => {
    const hits = literalHits(`.a {
  color: var(--color-text); border: 1px solid var(--color-border); outline-offset: -2px;
  padding: 0.5em 1ch; width: 50%; grid-template-columns: 1fr 2fr; border-radius: 100vmax;
  background: oklch(from var(--color-bg) calc(l + 0.04) c h); line-height: 1.2; font-weight: 650;
  mask-image: linear-gradient(#000 70%, transparent);
}
.b { color: #8a3324; background: rgb(0 0 0 / 0.3); font-family: "Inter", var(--font-ui), sans-serif; max-width: 34rem; transition: color 150ms; border-color: white; }`, vocab);
    expect(hits.map((h) => `${h.kind}:${h.what}`)).toEqual(["color:#8a3324", "color:rgb(…)", "font:\"Inter\"", "length:34rem", "time:150ms", "color:white"]);
    expect(hits.every((h) => h.line === 7)).toBe(true);
  });
});

describe("piece.selector", () => {
  test("a class outside the contract and the piece's own emits is reported; a prefix and an attribute are not", () => {
    expect(selectorClasses('.snypd-card:hover > .snypd-card-title, a[class~=".x"]')).toEqual(["snypd-card", "snypd-card-title"]);
    const css = `.snypd-masthead .snypd-brand { gap: 1em } .snypd-card { margin: 0 } pre.language-ts { tab-size: 2 } .snypd-ledger-row { margin: 0 }`;
    const hits = selectorHits(css, [...contract.classes, "snypd-ledger-row"], contract.classPrefixes);
    expect(hits.map((h) => h.cls)).toEqual(["snypd-card"]);
  });
});

describe("residue.bare (W0, docs/37 §1.4)", () => {
  test("an element named by its tag alone is found, with the classes above it; a classed last compound is not", () => {
    expect(bareElements("a")).toEqual([{ tag: "a", classes: [] }]);
    expect(bareElements("main a:hover, .snypd-cta > a")).toEqual([{ tag: "a", classes: [] }, { tag: "a", classes: ["snypd-cta"] }]);
    expect(bareElements(".snypd-button, a.snypd-button, a[href], #x, body, html, *, ::selection")).toEqual([]);
    expect(bareElements("main :is(h2, h3)")).toEqual([]);
  });
});
