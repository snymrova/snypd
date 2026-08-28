/** @snypd/core — YAML layering → validated Config with provenance (docs/02 §1–§2). */
export { loadConfig, renderConfig, formatDiagnostics, resolveThemeChain, type Diagnostic, type LoadedConfig, type LoadOptions, type LayerInfo, type ThemeLink } from "./config";
export { ConfigSchema, TypeSchema, TaxonomySchema, StatusSchema, FieldSpec, TokenDeclSchema, ROLES, type TokenDecl, type Config, type TypeDef, type TaxonomyDef } from "./schema";
export { describeSource, type Source, type Provenance, type LayerName } from "./merge";
export { parseYaml, pathKey, parsePath, REPLACE, type Path, type Origin } from "./yaml";
export * from "./content";
export { SiteIndex, readFrontmatter, taxonomyFields, defaultStatus, hasIndex, sha1, INDEX_DIR, type IndexedFile, type TermRef, type Move, type SyncResult, type RouteRow } from "./store";
export { Repo, git, initRepo, isRepoRoot, principal, draftBranch, type GitResult, type CommitResult } from "./git";
export { createContent, updateContent, setStatus, trashContent, restoreContent, target, typeDef, writePolicy, transitions, splitFrontmatter, slugify as slugifyTitle, approve, approvalOf, clearApproval, approvalKey, approvals, contentHash, publishCheck, reviewPath, WriteError, TRASH_DIR, type WriteResult, type WriteTarget, type CreateInput, type UpdateInput, type StatusInput, type Approval, type ApprovalStore } from "./write";
