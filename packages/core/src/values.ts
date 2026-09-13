/**
 * The two grammars that keep a *value* from changing the meaning of what it is written into
 * (docs/11 findings 2 and 10, decision 120). Both live here rather than beside their callers because
 * each has three of them: a token, a setting and `theme › set_tokens` all reach `cssValue`, and a
 * `link_list` item, a markdown link and the renderer all reach `safeContentUrl`.
 *
 * Nothing here sanitises. A refused value is named and refused — the same treatment every other bad
 * value in this codebase gets — because a rewritten value is a value the author did not write
 * (docs/01 §2, decision 102).
 */

/**
 * The functions a value may call. An allow list and not a deny list: the dangerous ones are the ones
 * that *fetch* — `url()`, `image-set()`, `element()`, `paint()` — and a deny list is wrong the day CSS
 * adds a fifty-first. Everything here computes from what it is given.
 *
 * A theme refused for a function that ought to be on this list is a one-line change and a good bug
 * report; a theme that reaches the network from a token value is decision 80's agent, one layer down.
 */
export const CSS_FUNCTIONS = new Set([
  // references and maths
  "var", "env", "calc", "min", "max", "clamp", "round", "mod", "rem", "abs", "sign",
  "pow", "sqrt", "hypot", "log", "exp", "sin", "cos", "tan", "asin", "acos", "atan", "atan2",
  // colour, including the relative syntax U6a is built on
  "rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch", "color", "color-mix", "light-dark", "color-contrast",
  // gradients
  "linear-gradient", "radial-gradient", "conic-gradient",
  "repeating-linear-gradient", "repeating-radial-gradient", "repeating-conic-gradient",
  // easing, sizing, layout, filters, transforms
  "cubic-bezier", "steps", "linear", "minmax", "fit-content", "repeat", "counter", "counters",
  "translate", "translatex", "translatey", "translatez", "translate3d",
  "scale", "scalex", "scaley", "scale3d", "rotate", "rotatex", "rotatey", "rotatez", "rotate3d",
  "skew", "skewx", "skewy", "matrix", "matrix3d", "perspective", "blur", "brightness", "contrast",
  "drop-shadow", "grayscale", "hue-rotate", "invert", "opacity", "saturate", "sepia",
]);

/**
 * Everything a declaration value is allowed to be made of. `{`, `}`, `;`, `<`, `@`, `\` and `!` are the
 * omissions that matter. Letters are `\p{L}` and not `[A-Za-z]`: a font stack naming Söhne or
 * ヒラギノ角ゴ is a stack, and a look-alike punctuation mark — U+FF1B for `;` — is not a letter.
 */
const CSS_CHARS = /^[\p{L}\p{M}\p{N}_\s#%.,()'"+\-*/]*$/u;
const CSS_FUNCTION_RE = /([A-Za-z_-][A-Za-z0-9_-]*)\(/g;
/** Long enough for `editorial`'s font stack (88 characters) with room over; short enough that nothing hides in one. */
const CSS_MAX = 256;
/** The functions whose refusal deserves the longer sentence: every one of them fetches. */
const FETCHES = /^(url|image|image-set|-webkit-image-set|cross-fade|element|paint|attr|expression)$/i;

/**
 * One declaration value, checked before it is interpolated into `:root { … }` (render/tokens.ts).
 * The bar is decision 120's: a value may not close the block it is written into, comment out what
 * follows it, or reach the network. Numbers pass as themselves — `leading.body: 1.65` is a token.
 */
export function cssValue(v: unknown): { ok: true; value: string } | { ok: false; why: string } {
  const no = (why: string) => ({ ok: false as const, why });
  if (typeof v === "number") return Number.isFinite(v) ? { ok: true, value: String(v) } : no(`expected a CSS value, got ${v}`);
  if (typeof v !== "string") return no(`expected a CSS value, got ${v === null ? "null" : Array.isArray(v) ? "a list" : typeof v}`);
  const value = v.trim();
  if (!value) return no("expected a CSS value, got an empty string");
  if (value.length > CSS_MAX) return no(`${value.length} characters; a CSS value stops at ${CSS_MAX}`);
  // The function check runs before the character one so that `url(https://…)` is refused for being
  // `url()` rather than for the `:` in the argument it should never have been given.
  for (const [, fn] of value.matchAll(CSS_FUNCTION_RE))
    if (!CSS_FUNCTIONS.has(fn!.toLowerCase())) return no(`\`${fn}()\` is not a CSS function a value may call${FETCHES.test(fn!) ? " — it would fetch, and a value is not where a site reaches the network" : ""}`);
  if (!CSS_CHARS.test(value)) {
    const bad = [...new Set([...value].filter((c) => !CSS_CHARS.test(c)))].join(" ");
    return no(`\`${bad}\` cannot appear in a CSS value — it would end the declaration or the block it is written into`);
  }
  if (value.includes("/*") || value.includes("*/")) return no("a CSS comment cannot appear in a value — it would comment out what follows it");
  let depth = 0;
  for (const c of value) { if (c === "(") depth++; else if (c === ")" && --depth < 0) return no("unbalanced `)` — a CSS value closes every bracket it opens"); }
  if (depth) return no("unbalanced `(` — a CSS value closes every bracket it opens");
  for (const q of ["'", '"']) if ((value.split(q).length - 1) % 2) return no(`unbalanced ${q} — a CSS value closes every quote it opens`);
  return { ok: true, value };
}

/** What a `url` or `image` setting, and a `link_list` item, may point at: an origin, a mailbox, or this site. */
export const SETTING_URL_RE = /^(https?:\/\/|mailto:|\/)/;

/**
 * A link written in content, judged the way CommonMark's own reference implementation judges one:
 * everything is allowed except the schemes that execute or inline. Content links are relative
 * (`../about`), fragments (`#top`) and `tel:` as often as they are absolute, so this is the one
 * grammar in the file that is a deny list — an allow list here would refuse the web.
 */
export function safeContentUrl(url: string, kind: "link" | "image" = "link"): boolean {
  // Browsers ignore control characters and whitespace inside a scheme: a tab in `java<TAB>script:` navigates.
  const u = url.replace(/[\u0000-\u0020]/g, "").toLowerCase();
  if (u.startsWith("data:")) return kind === "image" && /^data:image\/(png|gif|jpeg|jpg|webp);/.test(u);   // not svg+xml: it carries markup
  return !/^(javascript|vbscript|file):/.test(u);
}
