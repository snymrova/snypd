/** @snypd/core — YAML layering → validated Config with provenance (docs/02 §1–§2). */
export { loadConfig, renderConfig, formatDiagnostics, resolveThemeChain, PLACEHOLDER_URL, isPlaceholderUrl, type Diagnostic, type LoadedConfig, type LoadOptions, type LayerInfo, type ThemeLink } from "./config";
export { ConfigSchema, TypeSchema, TaxonomySchema, StatusSchema, FieldSpec, TokenDeclSchema, ThemeYamlSchema, THEME_UNBUILT_KEYS, SettingDeclSchema, SETTING_TYPES, LinkItemSchema, settingValue, PluginManifestSchema, PLUGIN_API, PLUGIN_UNBUILT_KEYS, SLOT_NAMES, FILTER_NAMES, clientKbOf, ROLES, type TokenDecl, type ThemeYaml, type SettingDecl, type SettingType, type SettingValue, type LinkItem, type PluginManifest, type Config, type TypeDef, type TaxonomyDef } from "./schema";
export { cssValue, safeContentUrl, CSS_FUNCTIONS, SETTING_URL_RE } from "./values";
export { describeSource, type Source, type Provenance, type LayerName } from "./merge";
export { parseYaml, pathKey, parsePath, REPLACE, type Path, type Origin } from "./yaml";
// The theme filesystem seam (decision 46): every theme read on the runtime path, disk or binary.
export { themeFile, themeHas, themeFiles, themeBytes, themeModule, themeSignature, bundledDir, bundledNames, bundledPluginDir, bundledPluginNames, isBundledDir } from "./themefs";
// P1: the plugin contract (docs/10 §4.1, decisions 81–83) — the manifest, the loader, and the `snypd://plugins` text.
export { loadPlugin, resolvePlugin, pluginCandidates, pluginDirs, pluginModule, renderPlugins, tiersOf, hooksOf, clientKbDeclared, shortName as pluginShortName, PLUGIN_TIERS, STAGE_NAMES, EVENT_NAMES, type LoadedPlugin, type PluginSource, type PluginTier, type ResolvedPlugin, type SlotName, type FilterName, type StageName, type EventName } from "./plugins";
export * from "./content";
// S18e: the `.snypd/dev.json` seam — one running preview, findable by the other process (decision 51).
// S18f: the heartbeat on disk, and the six derived facts doctor and the Desk both render (decision 64).
export { readHeartbeat, writeHeartbeat, clearHeartbeat, heartbeatPath, heartbeatProcessAlive, harnessState, type HeartbeatRecord, type HarnessState } from "./heartbeat";
export { onboardingFacts, onboarded, registration, ONE_SENTENCE, type OnboardingFacts, type Registration } from "./onboard";
export { readDev, writeDev, clearDev, liveDev, devPath, devProcessAlive, ALIVE_ROUTE, LIVE_ROUTE, type DevRecord } from "./dev";
export { SiteIndex, readFrontmatter, taxonomyFields, defaultStatus, hasIndex, sha1, INDEX_DIR, type IndexedFile, type TermRef, type Move, type SyncResult, type RouteRow } from "./store";
export { Repo, git, initRepo, isRepoRoot, principal, commitHint, DRAFTS_BRANCH, DEFAULT_BASE, type GitResult, type CommitResult } from "./git";
export { writeDeploy, buildCommand, DEPLOY_TARGETS, LAUNCHER, VERSION, type DeployTarget } from "./deploy";
// S19a: the push — the only outward-facing act in the product, and the one a person performs (decision 44).
export { pushState, pushSite, pushHint, deployTarget, originName, PUSH_ROUTE, type PushState, type PushResult, type PushCommit, type PushBlocker } from "./push";
// P4: tier 4 — speak (docs/10 §4.2). A plugin's MCP tools and prompts: the contract, the loaders, and the call.
export { loadPluginTools, loadPluginPrompts, callPluginTool, type PluginToolCtx, type PluginToolReply, type PluginToolAction, type PluginToolsModule, type PluginToolSet, type PluginPromptCtx, type PluginPromptDef, type PluginPromptsModule, type PluginPromptSet, type PluginPage } from "./speak";
// P3: events — fire and report (docs/10 §4.5, decision 87) — and the allowlisted fetch a handler is handed (§4.7).
export { fireEvent, eventLines, recordEvents, readEvents, changedContent, pluginFetch, hostAllowed, urlOf, EVENT_TIMEOUT_MS, FETCH_TIMEOUT_MS, EVENT_LOG_ROWS, type EventRow, type EventCtx, type EventReply, type EventHandler, type EventPayload, type PublishPayload, type PushPayload, type ChangedContent, type FireOptions } from "./events";
export { NAV_DIR, NavItemSchema, NavFileSchema, navLocations, navFiles, loadNav, routeLookup, termRoutes, resolveRef, resolveNav, siteNav, lintNav, setNav, renderNav, hrefOf, type NavItem, type NavLink, type NavFile, type NavWrite, type SiteNav, type RouteLookup } from "./nav";
export { setConfig, setRedirect, redirects, normalizeRoute, themeTokens, themeSettings, settingValues, strandedSettings, installedThemes, initSite, registerMcp, onPath, mcpCommand, MCP_FILE, renderThemeSummary, CONFIG_FILE, type ConfigWrite, type TokenInfo, type SettingInfo, type InitResult } from "./site";
export { createContent, updateContent, setStatus, trashContent, restoreContent, target, typeDef, writePolicy, transitions, splitFrontmatter, slugify as slugifyTitle, draftSource, approve, approvalOf, clearApproval, approvalKey, approvals, contentHash, publishCheck, reviewPath, WriteError, TRASH_DIR, type WriteResult, type WriteTarget, type CreateInput, type UpdateInput, type StatusInput, type Approval, type ApprovalStore } from "./write";
