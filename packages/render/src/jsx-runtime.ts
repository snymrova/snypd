/**
 * The theme JSX runtime: JSX → HTML strings, no virtual DOM, no hydration (docs/04 "Themes are TSX").
 * Strings are escaped; `Html` values (the output of another element, or `raw()`) pass through.
 * Attributes: `false | null | undefined` are dropped, `true` renders bare, everything else is escaped.
 * Set via tsconfig `jsxImportSource: "@snypd/render"`; ~60 lines is the whole component model.
 */
export class Html {
  constructor(readonly html: string) {}
  toString() { return this.html; }
}
export const raw = (s: string) => new Html(s);
export const EMPTY = new Html("");

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]!);
export const escapeText = (s: string) => s.replace(/[&<>]/g, (c) => ESC[c]!);

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

export type Child = Html | string | number | boolean | null | undefined | Child[];
export function children(c: Child): string {
  if (c === null || c === undefined || typeof c === "boolean") return "";
  if (c instanceof Html) return c.html;
  if (Array.isArray(c)) { let s = ""; for (const x of c) s += children(x); return s; }
  return escapeText(String(c));
}

export type Component<P = Record<string, unknown>> = (props: P) => Html;
export const Fragment = Symbol.for("snypd.fragment");

export function jsx(type: string | typeof Fragment | Component<never>, props: Record<string, unknown>): Html {
  if (typeof type === "function") return (type as Component)(props);
  if (type === Fragment) return new Html(children(props.children as Child));
  let attrs = "";
  for (const [k, v] of Object.entries(props)) {
    if (k === "children" || v === false || v === null || v === undefined) continue;
    const name = k === "className" ? "class" : k === "htmlFor" ? "for" : k;
    attrs += v === true ? ` ${name}` : ` ${name}="${escape(String(v))}"`;
  }
  if (VOID.has(type)) return new Html(`<${type}${attrs}>`);
  return new Html(`<${type}${attrs}>${children(props.children as Child)}</${type}>`);
}
export const jsxs = jsx;
export const jsxDEV = (type: Parameters<typeof jsx>[0], props: Record<string, unknown>) => jsx(type, props);

export namespace JSX {
  export type Element = Html;
  export interface ElementChildrenAttribute { children: unknown }
  export interface IntrinsicElements { [tag: string]: Record<string, unknown> }
}
