/**
 * The theme contract (docs/36 §3, decision 269) — what a piece may read and what it may style.
 *
 * A piece is one answer to one question a theme must answer (the masthead, the prose, the list of
 * entries), carved from a sheet a person already judged and meant to sit on *any* theme. That only
 * works if every piece reads the same studs and styles the same sockets: the contract tokens, which all
 * four sheets already declare, and the classes `base`'s markup emits. `spec/defaults/theme-contract.yaml`
 * writes both lists down; this module reads CSS against them.
 *
 * Two lints, both over one piece's CSS and both reporting a line:
 *
 * - **`piece.literal`** — a colour, a font name, or a length outside the stated vocabulary. A piece that
 *   writes `#8a3324` or `Inter` or `11rem` is a piece of *one* theme; the value belongs in a token (the
 *   seed writes it), a switch, or the theme's own residue. The vocabulary is stated rather than "no
 *   literals", because a strict rule refuses 7–10 % of every sheet and most of those are the right call:
 *   `1px` hairlines, `2px` focus rings, `em`/`ch`/`%` that scale with the type they sit in, the `100vmax`
 *   pill.
 * - **`piece.selector`** — a class outside `base`'s list plus the piece's own `emits:`. A piece that
 *   styles a class nothing emits styles nothing; one that styles another piece's class leans on it.
 *
 * `cssRules` is also how P1 counted the rules the four sheets share (the `house` piece): leaf rules with
 * their at-rule context, so `@media (…) { a {…} }` and `a {…}` are different rules.
 */
import { plainCss } from "./taste";

export interface CssRule {
  /** The enclosing at-rules, outermost first, whitespace collapsed — `["@media (max-width: 34rem)"]`. */
  context: string[];
  selector: string;
  decls: [prop: string, value: string][];
  line: number;
}

/**
 * Every innermost `selector { declarations }` with the at-rules around it. Comments and strings are
 * blanked first (so a `content: "{"` is not a brace), then a brace-depth walk; a block with nested blocks
 * inside it is a context (an at-rule, or a selector that uses CSS nesting), and its own declarations
 * before the first nested block are kept as a rule of their own.
 */
export function cssRules(css: string): CssRule[] {
  // Structure is read from `plain` (comments and strings blanked, so a `content: "{"` is not a brace);
  // text is read from `text` (comments blanked only), so `[data-kind="note"]` keeps its value. Both
  // keep every offset, which is what lets one index into the other.
  const plain = plainCss(css);
  const text = css.replace(/\/\*[^]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
  const out: CssRule[] = [];
  const lineAt = (i: number) => plain.slice(0, i).split("\n").length;
  const norm = (s: string) => s.trim().replace(/\s+/g, " ");
  const decls = (body: string): [string, string][] =>
    body.split(";").map((d) => d.split(/:(.*)/s)).filter((p) => p.length >= 2 && p[0]!.trim() && !p[0]!.trim().startsWith("@"))
      .map((p) => [p[0]!.trim().toLowerCase(), norm(p[1]!)]);

  function walk(from: number, to: number, context: string[]) {
    let i = from, head = from;
    while (i < to) {
      const c = plain[i]!;
      if (c === ";") { head = i + 1; i++; continue; }
      if (c !== "{") { i++; continue; }
      // Find the matching close brace.
      let depth = 0, end = i;
      for (; end < to; end++) { if (plain[end] === "{") depth++; else if (plain[end] === "}" && --depth === 0) break; }
      const prelude = norm(text.slice(head, i));
      const inner = plain.slice(i + 1, end);
      const innerText = text.slice(i + 1, end);
      const lead = plain.slice(head, i).length - plain.slice(head, i).trimStart().length;
      if (inner.includes("{")) {
        // A context. Its own declarations up to the first nested block (CSS nesting) are a rule too.
        if (!prelude.startsWith("@")) {
          const own = innerText.slice(0, inner.replace(/[^;{}]*\{[^]*$/, "").length);
          const d = decls(own);
          if (d.length) out.push({ context, selector: prelude, decls: d, line: lineAt(head + lead) });
        }
        walk(i + 1, end, [...context, prelude]);
      } else if (prelude) {
        out.push({ context, selector: prelude, decls: decls(innerText), line: lineAt(head + lead) });
      }
      i = end + 1; head = i;
    }
  }
  walk(0, plain.length, []);
  return out;
}

/** A rule as one comparable string: context, selector, declarations sorted. */
export const ruleKey = (r: CssRule): string =>
  [...r.context, r.selector].join(" » ") + " { " + [...r.decls].map(([p, v]) => `${p}: ${v}`).sort().join("; ") + " }";

// ── The vocabulary ───────────────────────────────────────────────────────────────────────────────

export interface LiteralVocabulary {
  /** Units a length may carry and still pass — they scale with what they sit in. */
  units: string[];
  /** Absolute lengths that pass as written, either sign: the hairline, the focus ring. */
  lengths: string[];
  /** Properties whose colour is only an alpha channel — a mask's gradient is a shape, not a colour. */
  alphaOnly?: string[];
}

export interface LiteralHit { line: number; selector: string; prop: string; value: string; kind: "color" | "font" | "length" | "time"; what: string }

const COLOR_FN = /(?<![\w-])(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi;
const HEX = /(?<![\w-])#[0-9a-f]{3,8}\b/gi;
// Named colours a piece would write by hand. System colours, `currentColor`, `transparent` and
// `inherit` are not in this list on purpose: they are the platform's, not a theme's.
const NAMED = /(?<![\w-])(white|black|red|green|blue|gray|grey|silver|navy|teal|orange|purple|yellow|pink|brown|gold|maroon|olive|lime|aqua|fuchsia|beige|ivory|tan)(?![\w-])/gi;
const GENERIC_FAMILIES = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "math", "emoji", "fangsong", "inherit", "initial", "unset", "revert"]);
const LENGTH = /(?<![\w.#-])(-?\d*\.?\d+)(px|rem|em|ch|ex|lh|rlh|vw|vh|vmin|vmax|dvh|svh|lvh|dvw|cqw|cqh|cqi|cqb|pt|cm|mm|in|q|pc)\b/gi;
const TIME = /(?<![\w.#-])(\d*\.?\d+)(ms|s)\b/gi;

/**
 * Relative colour syntax — `oklch(from var(--x) calc(l + 0.04) c h)` — read as derived rather than as a
 * literal: it is "this token, lifted", which is exactly the kind of value a piece may write.
 */
function valueWithoutRelativeColour(v: string): string {
  return v.replace(/\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(\s*from\b/gi, "derived(");
}

/** Every literal in one piece's CSS that the vocabulary does not allow, with its line. */
export function literalHits(css: string, vocab: LiteralVocabulary): LiteralHit[] {
  const out: LiteralHit[] = [];
  const units = new Set(vocab.units.map((u) => u.toLowerCase()));
  const lengths = new Set(vocab.lengths.map((l) => l.toLowerCase()));
  const alphaOnly = new Set((vocab.alphaOnly ?? []).map((p) => p.toLowerCase()));
  for (const r of cssRules(css)) {
    for (const [prop, raw] of r.decls) {
      const v = valueWithoutRelativeColour(raw);
      const hit = (kind: LiteralHit["kind"], what: string) => out.push({ line: r.line, selector: r.selector, prop, value: raw, kind, what });
      if (!alphaOnly.has(prop)) {
        for (const m of v.matchAll(HEX)) hit("color", m[0]);
        for (const m of v.matchAll(COLOR_FN)) hit("color", m[0] + "…)");
      }
      if (!alphaOnly.has(prop) && !/^(font-family|font|grid|grid-template|grid-template-areas|grid-area|container|container-name|view-transition-name|animation|animation-name|transition|transition-property|will-change|content|counter-reset|counter-increment|list-style|quotes)$/.test(prop))
        for (const m of v.matchAll(NAMED)) hit("color", m[0]);
      if (prop === "font-family") {
        for (const fam of v.split(",").map((f) => f.trim()).filter(Boolean))
          if (!fam.startsWith("var(") && !GENERIC_FAMILIES.has(fam.toLowerCase())) hit("font", fam);
      }
      for (const m of v.matchAll(LENGTH)) {
        const unit = m[2]!.toLowerCase();
        if (units.has(unit)) continue;
        if (lengths.has(`${Math.abs(+m[1]!)}${unit}`)) continue;
        if (+m[1]! === 0) continue;
        hit("length", m[0]);
      }
      for (const m of v.matchAll(TIME)) if (+m[1]! !== 0) hit("time", m[0]);
    }
  }
  return out.sort((a, b) => a.line - b.line);
}

// ── Selectors ────────────────────────────────────────────────────────────────────────────────────

export interface SelectorHit { line: number; selector: string; cls: string }

/** Every class a selector names, `.snypd-card:hover > .x` → `snypd-card`, `x`. Attribute values and pseudo-args are not classes. */
export function selectorClasses(selector: string): string[] {
  const bare = selector.replace(/\[[^\]]*\]/g, "");
  return [...new Set([...bare.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]!))];
}

/**
 * The elements a selector styles by their tag alone — `a`, `main a:hover`, `.snypd-cta a` → `a` — one per
 * comma part, with the classes that part names above it. A part whose last compound carries a class, an id
 * or an attribute gives none: the last compound is what gets the declarations, so `.snypd-cta a` styles
 * every link in a cta whatever class the link has. `html`, `body` and `*` are left out: what they set
 * reaches a piece's element by inheritance, which any rule on the element itself beats.
 */
export function bareElements(selector: string): { tag: string; classes: string[] }[] {
  const out: { tag: string; classes: string[] }[] = [];
  for (const part of selector.replace(/\([^()]*\)/g, "()").split(",")) {
    const last = part.trim().split(/\s*[\s>+~]\s*/).pop() ?? "";
    if (/[.#[]/.test(last)) continue;
    const tag = last.split(":")[0]!.toLowerCase();
    if (tag && !["html", "body", "*"].includes(tag)) out.push({ tag, classes: selectorClasses(part) });
  }
  return out;
}

/**
 * Every class a piece's CSS styles that is not in `allowed` — base's contract plus the piece's own
 * `emits:` — and matches none of `prefixes` (`language-`, the class a fenced code block carries).
 */
export function selectorHits(css: string, allowed: Iterable<string>, prefixes: string[] = []): SelectorHit[] {
  const ok = new Set(allowed);
  const out: SelectorHit[] = [];
  for (const r of cssRules(css)) {
    if (r.context.some((c) => /^@keyframes\b/i.test(c))) continue;
    for (const cls of selectorClasses(r.selector)) if (!ok.has(cls) && !prefixes.some((p) => cls.startsWith(p))) out.push({ line: r.line, selector: r.selector, cls });
  }
  return out;
}
