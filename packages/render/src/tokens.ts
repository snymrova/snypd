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
