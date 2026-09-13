/**
 * Design tokens → CSS custom properties (docs/04 "CSS"). `theme.yaml` declares tokens as
 * `{ default, customisable, kind, description }`; `snypd.yaml › theme.tokens` overrides with scalars.
 * The merged `config.theme.tokens` carries both shapes; `resolveTokens` flattens to values and
 * `tokensCss` emits `:root { --color-accent: … }` (dots → dashes). No unit handling: a token is a string
 * — but not any string: `cssValue` (core/values.ts, decision 120) refuses one that would close the block
 * this writes it into, and a build stops before it gets here.
 *
 * The sheet is emitted in cascade layers (decision 119). `styleSheet` is the one place the whole
 * stylesheet is assembled — the build, the preview and the desk all call it, because three copies of
 * `tokensCss(tokens) + theme.css` was three places for the layer statement to be forgotten.
 */
export type TokenValue = string | number | { default: string | number };

export function resolveTokens(tokens: Record<string, TokenValue>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tokens)) out[k] = String(typeof v === "object" && v !== null ? v.default : v);
  return out;
}

export const cssVar = (name: string) => `--${name.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;

export function tokensCss(tokens: Record<string, string>): string {
  const keys = Object.keys(tokens);
  if (!keys.length) return "";
  return `@layer snypd.tokens {\n:root {\n${keys.map((k) => `  ${cssVar(k)}: ${tokens[k]};`).join("\n")}\n}\n}\n`;
}

/**
 * The four layers, in the order a site resolves them (decision 119). Declared in one statement at the
 * top of the sheet so the order is the *statement's* and not the accident of which theme in the chain
 * happened to ship CSS: a parent with no stylesheet must not silently promote its child.
 *
 * `snypd.site` is empty today and is declared anyway — it is the name a site's own sheet will take, and
 * naming it now is what makes adding one later not a breaking change. Unlayered CSS still beats all four,
 * which is the escape hatch a person editing their own site should have.
 */
export const CSS_LAYERS = "@layer snypd.tokens, snypd.base, snypd.theme, snypd.site;\n";

/**
 * A theme's stylesheet name as a CSS layer identifier. Theme names are file paths and `theme:` keys, not
 * idents, so anything that is not one becomes a dash and a leading digit gets a prefix — two themes whose
 * names differ only in punctuation would share a layer, and share it in the order they are concatenated,
 * which is the order they already cascade in.
 */
export const layerIdent = (name: string) => {
  const id = name.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "theme";
  return /^[0-9]/.test(id) ? `t-${id}` : id;
};

/**
 * The line an `@import` is on, or 0. Scanned rather than regexed for the same reason `minifyCss` scans:
 * `content: "@import"` and a commented-out import are both text, and neither is a stylesheet reaching
 * the network.
 */
export function atImport(css: string): number {
  let line = 1;
  for (let i = 0; i < css.length; i++) {
    const c = css[i]!;
    if (c === "\n") { line++; continue; }
    if (c === '"' || c === "'") { const q = c; while (++i < css.length && css[i] !== q) { if (css[i] === "\n") line++; else if (css[i] === "\\") i++; } continue; }
    if (c === "/" && css[i + 1] === "*") { const end = css.indexOf("*/", i + 2); const skipped = css.slice(i, end < 0 ? css.length : end + 2); line += skipped.split("\n").length - 1; i += skipped.length - 1; continue; }
    if (c === "@" && css.slice(i, i + 7).toLowerCase() === "@import") return line;
  }
  return 0;
}

/** The whole stylesheet: the layer order, the token block, then the theme chain's sheets (layered by `loadTheme`). */
export function styleSheet(tokens: Record<string, string>, themeCss?: string): string {
  const body = tokensCss(tokens) + (themeCss ?? "");
  return body ? CSS_LAYERS + body : "";
}

/**
 * The emitted stylesheet, minified (S14). A theme's `theme.css` is written to be read — `editorial`'s is
 * a third comments — and none of that belongs on the wire: comments and indentation are 2.2 KB of the
 * 12.6 KB this site emits, and 1.1 KB of the 3.9 KB a host actually sends after gzip.
 *
 * Deliberately conservative, and only the transforms that cannot change what the CSS means: comments go,
 * runs of whitespace collapse to one space, space around `{ } ; ,` goes along with the redundant `;` before
 * a `}`. Nothing touches `:` — `p :first-child` and `p:first-child` are different selectors — and nothing
 * touches `+` or `-`, which `calc()` needs spaces around. Strings are scanned, not regexed over, so a
 * `content: "/* "` or a `url(…)` survives.
 */
export function minifyCss(css: string): string {
  let out = "";
  for (let i = 0; i < css.length; i++) {
    const c = css[i]!;
    if (c === '"' || c === "'") {                       // a string: copy it through verbatim
      const quote = c;
      out += c;
      while (++i < css.length) {
        out += css[i];
        if (css[i] === "\\") { out += css[++i] ?? ""; continue; }
        if (css[i] === quote) break;
      }
      continue;
    }
    if (c === "/" && css[i + 1] === "*") {              // a comment: drop it, leaving one space behind
      const end = css.indexOf("*/", i + 2);
      i = end < 0 ? css.length : end + 1;
      if (out && !/\s$/.test(out)) out += " ";
      continue;
    }
    if (/\s/.test(c)) { if (out && !/\s$/.test(out) && !/[{};,]$/.test(out)) out += " "; continue; }
    if (c === "{" || c === "}" || c === ";" || c === ",") {
      if (out.endsWith(" ")) out = out.slice(0, -1);
      if (c === "}") while (out.endsWith(";")) out = out.slice(0, -1);   // the last `;` in a block
      out += c;
      continue;
    }
    out += c;
  }
  return out.replace(/\s+$/, "");
}
