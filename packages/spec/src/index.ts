/**
 * @snypd/spec — the closed vocabulary (docs/01) and the built-in defaults (docs/02):
 * 13 primitive YAMLs, types, taxonomies, statuses, budgets, field types. Exposed as MCP
 * resources (docs/03) and exported as JSON Schema. Files are read from `import.meta.dir`
 * so the same code works from a checkout and from a `--compile --asset` binary (/$bunfs).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { fieldsToJsonSchema, type FieldSpec, type JsonSchema } from "./schema";
export * from "./schema";

export const SPEC_VERSION = 1;
const sentence = (s: string) => s.split(/\.\s/)[0]!.replace(/\.$/, "") + ".";
const ROOT = join(import.meta.dir, "..");
export const PRIMITIVES_DIR = join(ROOT, "primitives");
export const DEFAULTS_DIR = join(ROOT, "defaults");

export interface Primitive {
  name: string;
  kind: "leaf" | "container" | "inline";
  group: string;
  purpose: string;
  props: Record<string, FieldSpec>;
  slots?: Record<string, unknown>;
  intent: string;
  "anti-intent": string;
  example: string;
  "schema-emit"?: Record<string, unknown>;
  budget?: Record<string, unknown>;
  fallback: string;
}

const cache = new Map<string, unknown>();
function yaml<T>(path: string): T {
  let v = cache.get(path);
  if (v === undefined) { v = parse(readFileSync(path, "utf8")); cache.set(path, v); }
  return v as T;
}

/** Names in the vocabulary, sorted. */
export function primitiveNames(): string[] {
  return readdirSync(PRIMITIVES_DIR).filter((f) => f.endsWith(".yaml")).map((f) => f.slice(0, -5)).sort();
}
export function primitive(name: string): Primitive | undefined {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) return undefined;
  try { return yaml<Primitive>(join(PRIMITIVES_DIR, `${name}.yaml`)); } catch { return undefined; }
}
export function primitives(): Primitive[] { return primitiveNames().map((n) => primitive(n)!); }
/** Raw YAML — what `snypd://spec/primitives/{name}` serves, byte for byte. */
export function primitiveSource(name: string): string | undefined {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) return undefined;
  try { return readFileSync(join(PRIMITIVES_DIR, `${name}.yaml`), "utf8"); } catch { return undefined; }
}

export interface Defaults {
  types: Record<string, { dir: string; urlPattern: string; layout: string | null; hierarchical: boolean; taxonomies: string[]; vocabulary: "all" | string[]; mcp: { read: boolean; write: false | "draft" | "publish" }; fields: Record<string, FieldSpec> }>;
  taxonomies: Record<string, { hierarchical: boolean; attaches: string[]; urlPattern: string; fields: Record<string, FieldSpec> }>;
  statuses: Record<string, { public: boolean; transitions: string[]; description: string }>;
  initialStatus: string;
  budgets: Record<string, number | Record<string, number>>;
  fieldTypes: Record<string, { json: string; format?: string; keys?: string[]; description?: string }>;
}
/** Layer 1 of the YAML stack (docs/02 §1): every built-in, merged from defaults/*.yaml. */
export function defaults(): Defaults {
  const out: Record<string, unknown> = {};
  for (const f of readdirSync(DEFAULTS_DIR).filter((f) => f.endsWith(".yaml")).sort()) Object.assign(out, yaml<object>(join(DEFAULTS_DIR, f)));
  return out as unknown as Defaults;
}

/** JSON Schema for one primitive's props (+ slots as `x-slots`). */
export function primitiveSchema(p: Primitive): JsonSchema {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `snypd://spec/primitives/${p.name}.json`,
    title: p.name, description: p.purpose,
    ...fieldsToJsonSchema(p.props ?? {}),
    "x-kind": p.kind, "x-group": p.group, ...(p.slots ? { "x-slots": p.slots } : {}), ...(p.budget ? { "x-budget": p.budget } : {}),
  };
}
/** JSON Schema for a type's or taxonomy's frontmatter. */
export function frontmatterSchema(kind: "types" | "taxonomies", name: string): JsonSchema | undefined {
  const entry = (defaults()[kind] as Record<string, { fields: Record<string, FieldSpec> }>)[name];
  if (!entry) return undefined;
  return { $schema: "https://json-schema.org/draft/2020-12/schema", $id: `snypd://${kind}/${name}.json`, title: name, ...fieldsToJsonSchema(entry.fields) };
}
/** Everything, as one JSON document — `snypd://spec.json`, the SKILL.md source, the theme.check contract. */
export function exportJsonSchema() {
  const d = defaults();
  return {
    spec: SPEC_VERSION,
    primitives: Object.fromEntries(primitives().map((p) => [p.name, primitiveSchema(p)])),
    types: Object.fromEntries(Object.keys(d.types).map((n) => [n, frontmatterSchema("types", n)])),
    taxonomies: Object.fromEntries(Object.keys(d.taxonomies).map((n) => [n, frontmatterSchema("taxonomies", n)])),
    statuses: d.statuses, initialStatus: d.initialStatus, budgets: d.budgets, fieldTypes: d.fieldTypes,
  };
}

// ── MCP resources (docs/03): what an agent reads at session start ──────────────────────────
export interface SpecResource { uri: string; name: string; mimeType: string; description: string; text: () => string }

/** `snypd://spec/primitives` — one line per primitive, the cheapest possible read of the vocabulary. */
export function primitivesIndex(): string {
  const lines = primitives().map((p) => {
    const req = Object.entries(p.props ?? {}).filter(([, f]) => f.required).map(([k]) => k);
    const syn = p.kind === "container" ? `:::${p.name}{…} … :::` : `::${p.name}{…}`;
    return `- **${p.name}** (${p.kind}, ${p.group}) \`${syn}\`${req.length ? ` required: ${req.join(", ")}` : ""} — ${sentence(p.purpose)}`;
  });
  return `# snypd spec v${SPEC_VERSION} — primitives (${lines.length})\n\nRead \`snypd://spec/primitives/{name}\` for props, intent and an example. Unknown blocks fail lint.\n\n${lines.join("\n")}\n`;
}
/** `snypd://spec` — the vocabulary overview plus built-in types, taxonomies and statuses. */
export function specOverview(): string {
  const d = defaults();
  const types = Object.entries(d.types).map(([n, t]) => `- **${n}** → \`${t.dir}\`, url \`${t.urlPattern}\`, taxonomies [${t.taxonomies.join(", ")}], mcp.write ${t.mcp.write}`);
  const tax = Object.entries(d.taxonomies).map(([n, t]) => `- **${n}**${t.hierarchical ? " (hierarchical)" : ""} → attaches [${t.attaches.join(", ")}], url \`${t.urlPattern}\``);
  const st = Object.entries(d.statuses).map(([n, s]) => `- **${n}** → [${s.transitions.join(", ")}] — ${s.description}`);
  return `# snypd spec v${SPEC_VERSION}\n\nContent is markdown + YAML frontmatter using a closed vocabulary of ${primitiveNames().length} primitives (\`snypd://spec/primitives\`). Syntax: leaf \`::name{prop="v"}\`, container \`:::name{…}\\n…\\n:::\`. Plain markdown with no directives is valid.\n\n## Types\n${types.join("\n")}\n\n## Taxonomies\n${tax.join("\n")}\n\n## Statuses (initial: ${d.initialStatus})\n${st.join("\n")}\n\nAlso: \`snypd://spec/types/{name}\`, \`snypd://spec/taxonomies/{name}\` (frontmatter as JSON Schema), \`snypd://spec/budgets\`, \`snypd://spec.json\` (everything).\n`;
}

export function resources(): SpecResource[] {
  const d = defaults();
  const md = "text/markdown", js = "application/json", ym = "application/yaml";
  return [
    { uri: "snypd://spec", name: "spec", mimeType: md, description: "The vocabulary, built-in types, taxonomies and statuses — read this first", text: specOverview },
    { uri: "snypd://spec.json", name: "spec.json", mimeType: js, description: "Everything as JSON Schema", text: () => JSON.stringify(exportJsonSchema(), null, 2) },
    { uri: "snypd://spec/primitives", name: "spec/primitives", mimeType: md, description: "One line per primitive", text: primitivesIndex },
    ...primitiveNames().map((n) => ({ uri: `snypd://spec/primitives/${n}`, name: `spec/primitives/${n}`, mimeType: ym, description: sentence(primitive(n)!.purpose), text: () => primitiveSource(n)! })),
    ...Object.keys(d.types).map((n) => ({ uri: `snypd://spec/types/${n}`, name: `spec/types/${n}`, mimeType: js, description: `Frontmatter schema for type ${n}`, text: () => JSON.stringify(frontmatterSchema("types", n), null, 2) })),
    ...Object.keys(d.taxonomies).map((n) => ({ uri: `snypd://spec/taxonomies/${n}`, name: `spec/taxonomies/${n}`, mimeType: js, description: `Term schema for taxonomy ${n}`, text: () => JSON.stringify(frontmatterSchema("taxonomies", n), null, 2) })),
    { uri: "snypd://spec/budgets", name: "spec/budgets", mimeType: js, description: "Default benchmark budgets", text: () => JSON.stringify(d.budgets, null, 2) },
  ];
}
export function resource(uri: string): SpecResource | undefined { return resources().find((r) => r.uri === uri); }
