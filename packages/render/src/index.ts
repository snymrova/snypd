/** @snypd/render — content → typed tree → theme TSX → dist/, incrementally (docs/04 "The renderer"). */
export { build, type BuildOptions, type BuildResult } from "./build";
export { toHtml, inline, excerpt, slugify, textOf, type HtmlOptions } from "./html";
export { loadTheme, themeHash, genericPrimitive, type Theme, type SiteCtx, type Entry, type Page, type TermLink, type PrimitiveProps, type PrimitiveComponent, type LayoutProps, type LayoutComponent, type Coverage } from "./theme";
export { Html, raw, escape, escapeText, jsx, jsxs, Fragment } from "./jsx-runtime";
export { resolveTokens, tokensCss, cssVar, minifyCss } from "./tokens";
export { llmsTxt, rss, sitemap, robotsTxt, apiSite, apiType, apiTaxonomy, apiItem, pageSchema, blockSchemas, flowSteps, jsonLd, absolute, plural, titleCase, type SurfaceEntry, type SurfaceSite } from "./emit";
// `preview` is deliberately NOT re-exported here: `snypd build` imports this index, and the preview
// server has no business loading on a build (S11 measured it on the cold-build path). Import it from
// `@snypd/render/preview`.
