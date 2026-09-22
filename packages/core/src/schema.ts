/**
 * Zod schema for the merged config (docs/02 §2). Strict where the docs are explicit (top level,
 * types, taxonomies, statuses) so a typo is an error an agent can act on; open where plugins extend
 * (`bench.budgets`, `jobs`, plugin options). Cross-references are checked in config.ts with provenance.
 */
import { z } from "zod";
import { cssValue, SETTING_URL_RE } from "./values";

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

/** What a token holds (docs/29 TF1). The seed solver and the taste lint read it, so it is a closed list. */
export const TOKEN_KINDS = ["color", "keyword", "font", "size", "number"] as const;
export type TokenKind = (typeof TOKEN_KINDS)[number];
/** `length` is what the scaffold wrote before TF1; it is read as `size` so no theme already written breaks. */
export const tokenKind = (k: unknown): TokenKind | undefined => (k === "length" ? "size" : (TOKEN_KINDS as readonly unknown[]).includes(k) ? (k as TokenKind) : undefined);
export const TokenDeclSchema = z.object({ default: z.union([z.string(), z.number()]), customisable: z.boolean().optional(),
  kind: z.union([z.enum(TOKEN_KINDS), z.literal("length").transform((): TokenKind => "size")]).optional(), description: z.string().optional() }).strict();
export type TokenDecl = z.infer<typeof TokenDeclSchema>;

// ── Style variations (docs/10 §5.2, U6a) ─────────────────────────────────────────────────────────
/**
 * One `variations:` entry in `theme.yaml` — a named, complete look the theme ships, as a set of token
 * *values* over its own defaults (decision 91). Values and not declarations: a variation retunes the
 * palette, it cannot add a token, change a `kind`, or move `customisable`. That is the line between a
 * variation and a child theme, and it is what makes "switching changes exactly the tokens it names"
 * something a test can assert rather than a habit.
 *
 * `tokens` is optional because the theme's own defaults are themselves a look, and a theme that names
 * them gets to describe them: `paper: { description: … }` is `editorial` as it already was.
 */
export const VariationSchema = z.object({
  /** One line for whoever is choosing — an agent reading `snypd://theme`, or a caption under a gallery screenshot. */
  description: z.string().min(1),
  tokens: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
}).strict();
export type Variation = z.infer<typeof VariationSchema>;
/** A variation with its name and the theme in the chain that declared it — what `loadConfig` hands on. */
export interface VariationDecl extends Variation { name: string; declaredBy?: string }
/** A variation name: the same shape a theme name takes, because both end up in a URL and a screenshot filename. */
export const VARIATION_NAME_RE = /^[a-z][a-z0-9-]*$/;

// ── Theme settings (docs/09 §4.2, U3) ────────────────────────────────────────────────────────────
/**
 * The closed type list for v0.1.5, minus one. docs/09 §4.2 wrote `relative` into `dateFormat`'s options
 * as an *example value*, not a type, and the type list itself is adopted as written — except that a
 * theme's settings are declared in a file and rendered into a static page, so every type here has to
 * mean the same thing an hour after the build as it did during it.
 */
export const SETTING_TYPES = ["text", "textarea", "richtext", "url", "number", "boolean", "select", "color", "size", "font", "image", "link_list"] as const;
export type SettingType = (typeof SETTING_TYPES)[number];
/** One item of a `link_list` setting: a label and a url, verbatim — a menu is `content/nav/<location>.yaml` (U2) and this is not one. */
export const LinkItemSchema = z.object({
  label: z.string().min(1),
  /** Scheme-checked like the `url` setting it sits beside (docs/11 finding 10): a list of links is a
   *  list of links, and `javascript:` in one of them is the same hole in a different key. */
  url: z.string().min(1).refine((u) => SETTING_URL_RE.test(u), "expected a url — https://…, mailto:… or a site-relative /path"),
  rel: z.string().optional(),
}).strict();
export type LinkItem = z.infer<typeof LinkItemSchema>;
export type SettingValue = string | number | boolean | LinkItem[];
/**
 * One `settings:` entry in `theme.yaml` — what the theme says a site may set, beside `tokens:` and not
 * inside it (docs/09 §4.2: tokens compile to CSS custom properties and settings do not, which is a
 * difference in what the value is *for*). A list rather than a map because order is the declaration's
 * own: it is the order `snypd://theme/settings` prints and the order a form would take. Strict, so a
 * misspelled key names the theme and the line, like every other key in this file.
 */
export const SettingDeclSchema = z.object({
  id: z.string().regex(/^[a-z][a-zA-Z0-9]*$/, "id: lowerCamelCase, letters and digits"),
  type: z.enum(SETTING_TYPES),
  label: z.string().min(1),
  group: z.string().min(1).optional(),
  /** One line for whoever is choosing the value — an agent reading the resource, or a person reading a form. */
  info: z.string().optional(),
  default: z.unknown().optional(),
  /** `select` only, and required there: the closed list of values this setting takes. */
  options: z.array(z.string().min(1)).min(1).optional(),
  /** `number` only. */
  min: z.number().optional(),
  max: z.number().optional(),
}).strict().superRefine((v, ctx) => {
  if (v.type === "select" && !v.options) ctx.addIssue({ code: "custom", path: ["options"], message: `setting "${v.id}": a select declares its options` });
  if (v.type !== "select" && v.options) ctx.addIssue({ code: "custom", path: ["options"], message: `setting "${v.id}": options belong to a select, not a ${v.type}` });
  if (v.type !== "number" && (v.min !== undefined || v.max !== undefined)) ctx.addIssue({ code: "custom", path: ["min"], message: `setting "${v.id}": min and max belong to a number, not a ${v.type}` });
});
export type SettingDecl = z.infer<typeof SettingDeclSchema>;

/**
 * A site's answer, checked against what the theme declared. Returns the coerced value or why it was
 * refused — one function, so `set_settings` refuses before it writes, `loadConfig` refuses a hand edit,
 * and the renderer never has to ask a second time.
 */
export function settingValue(decl: SettingDecl, v: unknown): { ok: true; value: SettingValue } | { ok: false; why: string } {
  const no = (why: string) => ({ ok: false as const, why });
  const str = (what: string) => (typeof v === "string" ? { ok: true as const, value: v } : no(`expected ${what}, got ${typeof v}`));
  switch (decl.type) {
    case "text": case "textarea": case "richtext":
      return str("a string");
    // The three that reach a stylesheet (decision 120). A part interpolates them into a `style`
    // attribute or a theme reads them into a custom property, and either way the value has to be a
    // value: `settingValue` is the only gate between `set_settings` and the page.
    case "font": case "color": case "size": {
      const r = cssValue(v);
      return r.ok ? { ok: true, value: r.value } : no(r.why);
    }
    case "url": {
      if (typeof v !== "string") return no(`expected a url, got ${typeof v}`);
      return SETTING_URL_RE.test(v) ? { ok: true, value: v } : no(`expected a url — https://…, mailto:… or a site-relative /path`);
    }
    case "image": {
      if (typeof v !== "string") return no(`expected the url of an image, got ${typeof v}`);
      return /^(https?:\/\/|\/)/.test(v) ? { ok: true, value: v } : no(`expected a site-relative url like /media/logo.svg (put the file in content/media/) or an absolute one`);
    }
    case "number": {
      if (typeof v !== "number" || Number.isNaN(v)) return no(`expected a number, got ${typeof v}`);
      if (decl.min !== undefined && v < decl.min) return no(`${v} is below the minimum ${decl.min}`);
      if (decl.max !== undefined && v > decl.max) return no(`${v} is above the maximum ${decl.max}`);
      return { ok: true, value: v };
    }
    case "boolean":
      return typeof v === "boolean" ? { ok: true, value: v } : no(`expected true or false, got ${JSON.stringify(v)}`);
    case "select": {
      const opts = decl.options ?? [];
      return typeof v === "string" && opts.includes(v) ? { ok: true, value: v } : no(`expected one of ${opts.join(" | ")}, got ${JSON.stringify(v)}`);
    }
    case "link_list": {
      const r = z.array(LinkItemSchema).safeParse(v);
      return r.success ? { ok: true, value: r.data } : no(`expected a list of { label, url, rel? } — ${r.error.issues[0]?.message ?? "invalid"}`);
    }
  }
}

/**
 * `theme.yaml`, validated (docs/09 decision 73). Strict: a mistyped `layout:` is a diagnostic naming
 * file and line, not a key silently discarded. The keys docs/04 documents and nothing reads yet —
 * `variants`, `patterns`, `client` (`locations` joined the schema in U2) — are listed so the diagnostic
 * can say *not built* rather than *unknown*; `loadConfig` turns them into warnings, every other unknown
 * key into an error.
 */
const slot = z.union([z.string().min(1), z.object({ fallback: z.string().min(1) }).strict()]);
/**
 * **The webfont budget** (decision 118). Kilobytes of font a page may carry, measured on the wire by
 * `page.font.kb` the way `page.js.kb` measures script. A theme that declares more than this is refused at
 * load rather than discovered by a bench run in CI, because the person who finds out otherwise is a
 * visitor on a train.
 */
export const MAX_FONT_KB = 40;

/**
 * **The metric-matched fallback face** (B1). The four descriptors that make the font a browser paints
 * *before* the webfont arrives occupy exactly the space the webfont will, so `font-display: swap` swaps
 * the letters and moves nothing else — which is the whole reason decision 118 could permit a webfont
 * without trading `page.cls` away.
 *
 * Declared, not computed: working them out needs both fonts' `hmtx`, `OS/2` and `head` tables, and a
 * static site generator that parsed fonts at build time would be carrying a font parser to re-derive four
 * constants that never change. `scripts/vendor-font.sh` prints this block beside the .woff2 it subsets,
 * so the numbers come from the two files rather than from taste, and regenerating the font reprints them.
 */
const FallbackSchema = z.object({
  /** The installed face whose metrics these override — `local(…)` in the generated `@font-face`. */
  local: z.string().min(1),
  "size-adjust": z.string().regex(/^\d+(\.\d+)?%$/, "size-adjust: a percentage, like `106.2%`"),
  "ascent-override": z.string().regex(/^\d+(\.\d+)?%$/, "ascent-override: a percentage"),
  "descent-override": z.string().regex(/^\d+(\.\d+)?%$/, "descent-override: a percentage"),
  "line-gap-override": z.string().regex(/^\d+(\.\d+)?%$/, "line-gap-override: a percentage"),
}).strict();

/**
 * `font:` in `theme.yaml` — the one webfont a theme may ship (B1, decision 118). Self-hosted, subsetted,
 * variable, WOFF2, with the fallback above. One per page: the nearest theme in the `extends:` chain that
 * declares it wins, the same rule primitives, parts and tokens already follow, so a child inherits its
 * parent's face until it names its own and two faces never stack up to 80 KB by inheritance.
 *
 * `kb` is the declaration the budget lane gates on — what the theme says the file costs, not what the
 * file happens to weigh. That is the same bargain a plugin's `capabilities.client` makes (decision 84):
 * a face that grows past its own claim fails `page.font.kb`, where a lane that measured the file against
 * itself could never fail at all.
 *
 * The family name is CSS's, not the font's: it is what `font.body` and `font.heading` have to name, and
 * `theme check` (X1) is where naming a family no token uses becomes a finding.
 */
export const ThemeFontSchema = z.object({
  family: z.string().min(1),
  /** Theme-relative path to the .woff2; emitted as `assets/fonts/<basename>` and preloaded. */
  file: z.string().min(1).regex(/\.woff2$/i, "a .woff2 — decision 118 ships one, and WOFF2 is the only format every browser since 2020 reads"),
  /** `font-weight` on the generated face: `400` for a static instance, `400 700` for a variable range. */
  weight: z.union([z.string().regex(/^\d{3}( \d{3})?$/, "`400`, or a range: `400 700`"), z.number().int()]).optional(),
  style: z.enum(["normal", "italic"]).optional(),
  kb: z.number().positive().max(MAX_FONT_KB, `at most ${MAX_FONT_KB} — a theme ships one webfont, and it costs what decision 118 affords it`),
  fallback: FallbackSchema,
}).strict();
export type ThemeFont = z.infer<typeof ThemeFontSchema>;

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
  /**
   * What a site may set about this theme without writing CSS (docs/09 §4.2, U3). Declared here; the
   * *values* live in `snypd.yaml › theme.settings` and nowhere else, which is why this key alone of
   * `theme.yaml`'s does not merge into the config: `theme.settings` is the value map, and a declaration
   * list landing on the same key would be a list where the renderer reads a map. Lists append up the
   * chain, and a child redeclaring an `id` replaces its parent's entry where it stands.
   */
  settings: z.array(SettingDeclSchema).optional(),
  /**
   * The named looks this theme ships (U6a, decision 91). A declaration like `settings:` and not a value,
   * so it does not merge into the config either: `theme.variation` is the site's one-word answer and
   * `theme.tokens` is where the chosen variation's tokens land. A map rather than a list because the
   * name is the key a site writes; a child redeclaring a name replaces its parent's entry.
   */
  variations: z.record(z.string().regex(VARIATION_NAME_RE, "variation: lowercase letters, digits, dashes"), VariationSchema).optional(),
  tokens: z.record(z.string(), z.union([z.string(), z.number(), TokenDeclSchema])).optional(),
  /** One stylesheet, theme-relative; emitted after the token vars as assets/theme.css. */
  css: z.string().min(1).optional(),
  /** One webfont, theme-relative, declared and budgeted (B1, decision 118). See `ThemeFontSchema`. */
  font: ThemeFontSchema.optional(),
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
 * that must exist at load. Tiers 2 and 3 (`stages`, `events`) run since P3, and tier 4 (`tools`, `prompts`)
 * since P4 — so every key here is a key this binary runs, and `PLUGIN_UNBUILT_KEYS` is empty for the first
 * time since P1 wrote it.
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
    /**
     * Hosts the plugin's own `ctx.fetch` may reach (P3, docs/10 §4.7): exact hosts, or `*.example.com` for a
     * host and its subdomains. The fetch an event handler is handed refuses every other host before any
     * connection is made; a plugin with no `network:` gets a fetch that refuses everything.
     */
    network: z.array(z.string().min(1)).optional(),
    /**
     * `dist/`-relative prefixes the plugin's `emit` stage may write under (P3, docs/10 §4.4, decision 86);
     * `<name>/` when absent. A file outside them, or one a route or another plugin already claims, is a
     * diagnostic and is not written. Nothing a plugin emits can overwrite a page.
     */
    emit: z.array(z.string().min(1)).optional(),
    /** Client JS it asks to add, summed against the site's `bench.budgets.jsKb` at load (P2, decision 84): over budget is refused, with the remedy in the diagnostic. */
    client: clientKb.optional(),
  }).strict().optional(),
  /** Slot → module, plugin-relative; the default export is `(props: SlotProps) => Html | string` (P2, `@snypd/render` hooks.ts). */
  slots: z.partialRecord(z.enum(SLOT_NAMES), pluginPath).optional(),
  /** Filter → module, plugin-relative; the default export is `(value, ctx) => value` (P2). */
  filters: z.partialRecord(z.enum(FILTER_NAMES), pluginPath).optional(),
  /** Stage → module (P3, `@snypd/render` hooks.ts): `transform` is `(root, ctx) => root` per document; `emit` is `(ctx) => { path, bytes }[]` per build. */
  stages: z.object({ transform: pluginPath.optional(), emit: pluginPath.optional() }).strict().optional(),
  /** Event → module (P3, `@snypd/core` events.ts): `publish` after an item lands, `push` after the branch is sent; each `(payload, ctx) => { ok, message }`. */
  events: z.object({ publish: pluginPath.optional(), push: pluginPath.optional() }).strict().optional(),
  /**
   * One module of MCP tools (P4, docs/10 §4.2 tier 4). Its default export is a `PluginToolsModule`:
   * a description, search keywords, and the named actions the agent may call. The plugin contributes
   * exactly one catalogue tool, named after the plugin, with those actions as its `action` enum — the
   * same shape `theme`, `site` and `bench` have, and for the same reason (one description, not nine).
   * Never in the always-listed set: a plugin tool is found through `find_tools`, so `tokens.tools` does
   * not move when a plugin is enabled (D11).
   */
  tools: pluginPath.nullable().optional(),
  /** One module of MCP prompts (P4): its default export is a `PluginPromptsModule` — named prompts, each returning the opening turn of a conversation. */
  prompts: pluginPath.nullable().optional(),
}).strict();
export type PluginManifest = z.infer<typeof PluginManifestSchema>;
/**
 * Manifest keys the contract names and this build does not run yet, and the session that builds each
 * (docs/10 §7.2). **Empty since P4**, which built the last two (`tools`, `prompts`) — every key
 * `PluginManifestSchema` accepts is now a key that runs. Kept, with the loader's warning around it,
 * because the next key the contract names before it runs belongs here rather than in a comment: a
 * manifest written ahead of the binary should parse, say so, and be ignored, not be refused.
 */
export const PLUGIN_UNBUILT_KEYS: Record<string, string> = {};

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
    /** What `site.image` shows, for `og:image:alt` (S36). A page's `cover.alt` and a share card's title win on their own pages. */
    imageAlt: z.string().optional(),
    locales: z.array(z.string()).min(1).default(["en"]),
    defaultLocale: z.string().default("en"),
  }).passthrough(),
  theme: z.object({
    use: z.string().default("base"),
    /**
     * The named look, of the ones the theme ships (U6a). One word, and the whole of what a site writes to
     * change how it reads: the variation's tokens are merged between the theme's defaults and this site's
     * own `theme.tokens`, so an override here still wins. A name the theme does not declare is a warning
     * and the theme's defaults render — a variation is left stranded by a theme switch exactly as a token
     * override is, and neither should stop a site from building.
     */
    variation: z.string().optional(),
    /** `snypd.yaml` sets scalars; `theme.yaml` declares `{ default, customisable, kind, description }` (docs/04). */
    tokens: z.record(z.string(), z.union([z.string(), z.number(), TokenDeclSchema])).default({}),
    /**
     * Values for the settings the theme declares (U3), by id — and only values: the declaration list is
     * read off `theme.yaml` and never merged here, so this map is always the site's own answers. A value
     * for an id the theme does not declare is a warning (a theme switch leaves them behind, like a
     * stranded token); a value of the wrong type is an error, because the declaration said what it is.
     */
    settings: z.record(z.string(), z.unknown()).default({}),
  }).passthrough().default({ use: "base", tokens: {}, settings: {} }),
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
  deploy: z.object({
    push: z.enum(["agent", "human"]).default("agent"),
    /**
     * Who uploads (docs/31 decision 228). `direct`: `site` › deploy runs the host's CLI from here and reads
     * the URL back. `git`: the host is connected to the repo and builds on push, the S18d′ shape. Absent
     * means *whichever this site already is* — a remote says `git`, none says `direct` — so no site that
     * deploys today changes how it does.
     */
    mode: z.enum(["direct", "git"]).optional(),
  }).passthrough().default({ push: "agent" }),
  bench: z.object({ budgets: z.record(z.string(), z.union([z.number(), z.record(z.string(), z.number())])).default({}) }).passthrough().default({ budgets: {} }),
  fieldTypes: z.record(z.string(), z.object({ json: z.string() }).passthrough()).default({}),
}).strict();

export type Config = z.infer<typeof ConfigSchema>;
export type TypeDef = z.infer<typeof TypeSchema>;
export type TaxonomyDef = z.infer<typeof TaxonomySchema>;
