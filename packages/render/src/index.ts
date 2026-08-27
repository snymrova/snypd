/** @snypd/render — content → typed tree → theme TSX → dist/, incrementally (docs/04 "The renderer"). */
export { build, type BuildOptions, type BuildResult } from "./build";
export { toHtml, excerpt, slugify, textOf, type HtmlOptions } from "./html";
export { loadTheme, themeHash, genericPrimitive, type Theme, type SiteCtx, type Entry, type Page, type TermLink, type PrimitiveProps, type PrimitiveComponent, type LayoutProps, type LayoutComponent, type Coverage } from "./theme";
export { Html, raw, escape, escapeText, jsx, jsxs, Fragment } from "./jsx-runtime";
