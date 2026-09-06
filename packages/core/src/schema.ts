/**
 * Zod schema for the merged config (docs/02 §2). Strict where the docs are explicit (top level,
 * types, taxonomies, statuses) so a typo is an error an agent can act on; open where plugins extend
 * (`bench.budgets`, `jobs`, plugin options). Cross-references are checked in config.ts with provenance.
 */
import { z } from "zod";

const slug = z.string().regex(/^[a-z][a-z0-9-]*$/i, "identifier: letters, digits, dashes");

export const FieldSpec: z.ZodType<Record<string, unknown>> = z.lazy(() =>
  z.object({
    type: z.string(),
    required: z.boolean().optional(), default: z.unknown().optional(), description: z.string().optional(),
    min: z.number().optional(), max: z.number().optional(), pattern: z.string().optional(),
    values: z.array(z.string()).optional(), to: z.string().optional(), of: FieldSpec.optional(), fields: z.record(z.string(), FieldSpec).optional(),
  }).strict(),
);

export const TypeSchema = z.object({
  extends: z.string().optional(),
  dir: z.string().min(1),
  urlPattern: z.string().startsWith("/"),
  layout: z.string().nullable(),
  hierarchical: z.boolean().default(false),
  taxonomies: z.array(z.string()).default([]),
  vocabulary: z.union([z.literal("all"), z.array(z.string())]).default("all"),
  mcp: z.object({ read: z.boolean().default(true), write: z.union([z.literal(false), z.literal("draft"), z.literal("publish")]).default("draft") }).strict().default({ read: true, write: "draft" }),
  fields: z.record(z.string(), FieldSpec).default({}),
}).strict();

export const TaxonomySchema = z.object({
  hierarchical: z.boolean().default(false),
  attaches: z.array(z.string()).default([]),
  urlPattern: z.string().startsWith("/").optional(),
  fields: z.record(z.string(), FieldSpec).default({}),
}).strict();

export const StatusSchema = z.object({ public: z.boolean(), transitions: z.array(z.string()).default([]), description: z.string().optional() }).strict();

export const ROLES = ["subscriber", "contributor", "author", "editor", "admin"] as const;

export const TokenDeclSchema = z.object({ default: z.union([z.string(), z.number()]), customisable: z.boolean().optional(), kind: z.string().optional(), description: z.string().optional() }).strict();
export type TokenDecl = z.infer<typeof TokenDeclSchema>;

/**
 * `theme.yaml`, validated (docs/09 decision 73). Strict: a mistyped `layout:` is a diagnostic naming
 * file and line, not a key silently discarded. The keys docs/04 documents and nothing reads yet —
 * `variants`, `patterns`, `client` (`locations` joined the schema in U2) — are listed so the diagnostic
 * can say *not built* rather than *unknown*; `loadConfig` turns them into warnings, every other unknown
 * key into an error.
 */
const slot = z.union([z.string().min(1), z.object({ fallback: z.string().min(1) }).strict()]);
export const ThemeYamlSchema = z.object({
  theme: z.string().min(1).optional(),
  version: z.string().optional(),
  spec: z.string().optional(),
  extends: z.string().min(1).optional(),
  /** The layouts this theme renders, by name; each resolves to `layouts/<name>.tsx` up the chain. */
  layouts: z.array(z.string().min(1)).optional(),
  /** Primitive → component file (theme-relative) or `{ fallback }` to another primitive's. */
  primitives: z.record(z.string(), slot).optional(),
  /** Part → component file, resolved exactly as primitives are (docs/09 §4.1, decision 72). */
  parts: z.record(z.string(), slot).optional(),
  /** Nav locations this theme renders — one `content/nav/<location>.yaml` each (docs/09 §4.3, U2). Arrays append up the chain, so a child inherits its parent's and may add its own. */
  locations: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/i, "location: letters, digits, dashes")).optional(),
  tokens: z.record(z.string(), z.union([z.string(), z.number(), TokenDeclSchema])).optional(),
  /** One stylesheet, theme-relative; emitted after the token vars as assets/theme.css. */
  css: z.string().min(1).optional(),
  personality: z.string().optional(),
}).strict();
export type ThemeYaml = z.infer<typeof ThemeYamlSchema>;
/** Documented in docs/04, read by nothing yet, and the session that builds each (docs/09 §2.2). */
export const THEME_UNBUILT_KEYS: Record<string, string> = {
  variants: "primitive variants — docs/09 §4.5, deferred",
  patterns: "block patterns — docs/09 §4.5, deferred",
  client: "client scripts against a JS budget — docs/10 decision 84, lands with plugins",
};

// ── The plugin manifest (docs/10 §4.1, decision 81) ──────────────────────────────────────────────
/** The contract version this binary speaks. A manifest that names another is refused before anything else in it is read. */
export const PLUGIN_API = 1;
/** The six slots (docs/10 §4.3). `body-end` is where a beacon goes; the other five are docs/09 §4.4's. */
export const SLOT_NAMES = ["head", "body-start", "before-content", "after-content", "footer-end", "body-end"] as const;
/** The closed six value filters (docs/09 §4.4), each `(value, ctx) => value`. */
export const FILTER_NAMES = ["title", "description", "excerpt", "entries", "jsonLd", "route"] as const;
const pluginPath = z.string().min(1);
const clientKb = z.union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d+)?\s*kb$/i, "client: `1kb` — kilobytes of client JS this plugin adds")]);
/** `capabilities.client` as a number of kilobytes: `1kb`, `1.5 KB` or a bare number all read the same (P2, decision 84). */
export const clientKbOf = (v: number | string | undefined): number => (v === undefined ? 0 : typeof v === "number" ? v : parseFloat(v));
/**
 * `plugin:` in a plugin's `snypd.yaml` — what the plugin says about itself. Read by the loader and never
 * merged into the site's config; every *other* root key of the same file merges exactly as it did before
 * (types, taxonomies, fieldTypes, jobs, bench). Strict, so an unknown key names the plugin and the line.
 * `options` is JSON Schema, and the site's `plugins: [{ name: {…} }]` entry is validated against it at
 * load (§4.1); `capabilities` is what doctor and `snypd://plugins` print beside the version (§4.7).
 * `slots` and `filters` run since P2 (§4.3): each names a module, relative to the plugin's own directory,
 * that must exist at load. The keys of tiers 2–4 (`stages`, `events`, `tools`, `prompts`) are in the schema
 * so a manifest written for P3–P4 parses today; `loadConfig` warns that each is not built yet.
 */
export const PluginManifestSchema = z.object({
  name: slug,
  version: z.string().min(1),
  api: z.literal(PLUGIN_API),
  /** One line; doctor and the directory print it. */
  description: z.string().optional(),
  /** JSON Schema for the site's options; `undefined` means the plugin takes none. */
  options: z.record(z.string(), z.unknown()).optional(),
  capabilities: z.object({
    /** Hosts the plugin's own `ctx.fetch` may reach (P3); printed by doctor today. */
    network: z.array(z.string().min(1)).optional(),
    /** Client JS it asks to add, summed against the site's `bench.budgets.jsKb` at load (P2, decision 84): over budget is refused, with the remedy in the diagnostic. */
    client: clientKb.optional(),
  }).strict().optional(),
  /** Slot → module, plugin-relative; the default export is `(props: SlotProps) => Html | string` (P2, `@snypd/render` hooks.ts). */
  slots: z.partialRecord(z.enum(SLOT_NAMES), pluginPath).optional(),
  /** Filter → module, plugin-relative; the default export is `(value, ctx) => value` (P2). */
  filters: z.partialRecord(z.enum(FILTER_NAMES), pluginPath).optional(),
  stages: z.object({ transform: pluginPath.optional(), emit: pluginPath.optional() }).strict().optional(),
  events: z.object({ publish: pluginPath.optional(), push: pluginPath.optional() }).strict().optional(),
  tools: pluginPath.nullable().optional(),
  prompts: pluginPath.nullable().optional(),
}).strict();
export type PluginManifest = z.infer<typeof PluginManifestSchema>;
/** Manifest keys the contract names and this build does not run yet, and the session that builds each (docs/10 §7.2). */
export const PLUGIN_UNBUILT_KEYS: Record<string, string> = {
  stages: "transform and emit stages — docs/10 §4.4, lands in P3",
  events: "publish and push events — docs/10 §4.5, lands in P3",
  tools: "plugin tools in the catalogue — docs/10 §4.2 tier 4, lands in P4",
  prompts: "plugin prompts — docs/10 §4.2 tier 4, lands in P4",
};

export const ConfigSchema = z.object({
  snypd: z.literal(1),
  site: z.object({
    name: z.string().min(1),
    url: z.url(),
    description: z.string().optional(),
    /** Site-relative url of the favicon, usually a file under `content/media/`. Without one a browser asks
     *  for `/favicon.ico` unprompted and every page logs a 404 (S14). */
    icon: z.string().optional(),
    /** Site-relative url of the default social image (`og:image`) for routes with no `cover.image` of
     *  their own (docs/10 §5.1). Without one the tags carry no image and a share card is text only. */
    image: z.string().optional(),
    locales: z.array(z.string()).min(1).default(["en"]),
    defaultLocale: z.string().default("en"),
  }).passthrough(),
  theme: z.object({
    use: z.string().default("base"),
    /** `snypd.yaml` sets scalars; `theme.yaml` declares `{ default, customisable, kind, description }` (docs/04). */
    tokens: z.record(z.string(), z.union([z.string(), z.number(), TokenDeclSchema])).default({}),
  }).passthrough().default({ use: "base", tokens: {} }),
  types: z.record(slug, TypeSchema).default({}),
  taxonomies: z.record(slug, TaxonomySchema).default({}),
  statuses: z.record(slug, StatusSchema).default({}),
  initialStatus: z.string().default("draft"),
  roles: z.object({ agents: z.enum(ROLES).default("contributor") }).passthrough().default({ agents: "contributor" }),
  plugins: z.array(z.union([z.string(), z.record(z.string(), z.unknown())])).default([]),
  jobs: z.record(z.string(), z.object({ every: z.string().regex(/^\d+(ms|s|m|h|d|w)$/, "duration like 7d, 12h, 30m") }).passthrough()).default({}),
  /**
   * Who may send the base branch to the host (S19c). `agent` is the default and is the product's
   * position: MCP is the only interface, and an interface that stops at the last mile and waits for a
   * mouse is not the only interface — it is most of one. A site that wants the older shape sets `human`,
   * and then `site` › push hands back the Desk's URL instead of pushing, which is what every site did
   * between S19a and S19c.
   */
  deploy: z.object({ push: z.enum(["agent", "human"]).default("agent") }).passthrough().default({ push: "agent" }),
  bench: z.object({ budgets: z.record(z.string(), z.union([z.number(), z.record(z.string(), z.number())])).default({}) }).passthrough().default({ budgets: {} }),
  fieldTypes: z.record(z.string(), z.object({ json: z.string() }).passthrough()).default({}),
}).strict();

export type Config = z.infer<typeof ConfigSchema>;
export type TypeDef = z.infer<typeof TypeSchema>;
export type TaxonomyDef = z.infer<typeof TaxonomySchema>;
