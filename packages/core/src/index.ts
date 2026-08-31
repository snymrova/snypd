/** @snypd/core — YAML layering → validated Config with provenance (docs/02 §1–§2). */
export { loadConfig, renderConfig, formatDiagnostics, resolveThemeChain, PLACEHOLDER_URL, isPlaceholderUrl, type Diagnostic, type LoadedConfig, type LoadOptions, type LayerInfo, type ThemeLink } from "./config";
export { ConfigSchema, TypeSchema, TaxonomySchema, StatusSchema, FieldSpec, TokenDeclSchema, ROLES, type TokenDecl, type Config, type TypeDef, type TaxonomyDef } from "./schema";
export { describeSource, type Source, type Provenance, type LayerName } from "./merge";
export { parseYaml, pathKey, parsePath, REPLACE, type Path, type Origin } from "./yaml";
// The theme filesystem seam (decision 46): every theme read on the runtime path, disk or binary.
export { themeFile, themeHas, themeFiles, themeBytes, themeModule, themeSignature, bundledDir, bundledNames, isBundledDir } from "./themefs";
export * from "./content";
export { SiteIndex, readFrontmatter, taxonomyFields, defaultStatus, hasIndex, sha1, INDEX_DIR, type IndexedFile, type TermRef, type Move, type SyncResult, type RouteRow } from "./store";
export { Repo, git, initRepo, isRepoRoot, principal, commitHint, DRAFTS_BRANCH, DEFAULT_BASE, type GitResult, type CommitResult } from "./git";
export { writeDeploy, buildCommand, DEPLOY_TARGETS, VERSION, type DeployTarget } from "./deploy";
export { setConfig, setRedirect, redirects, normalizeRoute, themeTokens, installedThemes, initSite, registerMcp, onPath, mcpCommand, MCP_FILE, renderThemeSummary, CONFIG_FILE, type ConfigWrite, type TokenInfo, type InitResult } from "./site";
export { createContent, updateContent, setStatus, trashContent, restoreContent, target, typeDef, writePolicy, transitions, splitFrontmatter, slugify as slugifyTitle, draftSource, approve, approvalOf, clearApproval, approvalKey, approvals, contentHash, publishCheck, reviewPath, WriteError, TRASH_DIR, type WriteResult, type WriteTarget, type CreateInput, type UpdateInput, type StatusInput, type Approval, type ApprovalStore } from "./write";
