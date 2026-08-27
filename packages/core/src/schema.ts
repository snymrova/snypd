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

export const ConfigSchema = z.object({
  snypd: z.literal(1),
  site: z.object({
    name: z.string().min(1),
    url: z.url(),
    locales: z.array(z.string()).min(1).default(["en"]),
    defaultLocale: z.string().default("en"),
  }).passthrough(),
  theme: z.object({
    use: z.string().default("base"),
    tokens: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  }).passthrough().default({ use: "base", tokens: {} }),
  types: z.record(slug, TypeSchema).default({}),
  taxonomies: z.record(slug, TaxonomySchema).default({}),
  statuses: z.record(slug, StatusSchema).default({}),
  initialStatus: z.string().default("draft"),
  roles: z.object({ agents: z.enum(ROLES).default("contributor") }).passthrough().default({ agents: "contributor" }),
  plugins: z.array(z.union([z.string(), z.record(z.string(), z.unknown())])).default([]),
  jobs: z.record(z.string(), z.object({ every: z.string().regex(/^\d+(ms|s|m|h|d|w)$/, "duration like 7d, 12h, 30m") }).passthrough()).default({}),
  bench: z.object({ budgets: z.record(z.string(), z.union([z.number(), z.record(z.string(), z.number())])).default({}) }).passthrough().default({ budgets: {} }),
  fieldTypes: z.record(z.string(), z.object({ json: z.string() }).passthrough()).default({}),
}).strict();

export type Config = z.infer<typeof ConfigSchema>;
export type TypeDef = z.infer<typeof TypeSchema>;
export type TaxonomyDef = z.infer<typeof TaxonomySchema>;
