/**
 * Text imports (`with { type: "text" }`) as TypeScript sees them — the generated barrels of decision 46.
 * Bun resolves these at build time and inlines the file's contents; `tsc` needs telling they are strings.
 */
declare module "*.yaml" { const contents: string; export default contents; }
declare module "*.css" { const contents: string; export default contents; }
