/**
 * Design tokens → CSS custom properties (docs/04 "CSS"). `theme.yaml` declares tokens as
 * `{ default, customisable, kind, description }`; `snypd.yaml › theme.tokens` overrides with scalars.
 * The merged `config.theme.tokens` carries both shapes; `resolveTokens` flattens to values and
 * `tokensCss` emits `:root { --color-accent: … }` (dots → dashes). No unit handling: a token is a string.
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
  return `:root {\n${keys.map((k) => `  ${cssVar(k)}: ${tokens[k]};`).join("\n")}\n}\n`;
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
