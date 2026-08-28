/**
 * @snypd/spec — the closed vocabulary (docs/01) and the built-in defaults (docs/02):
 * 13 primitive YAMLs, types, taxonomies, statuses, budgets, field types, and the detector table
 * `suggest_blocks` scores against (S15, `../detect`). Exposed as MCP
 * resources (docs/03) and exported as JSON Schema. The YAMLs are reached through `./assets`, a
 * generated barrel of static text imports (decision 46) — `import.meta.dir` was the old answer and it
 * does not survive `--compile`: `readdirSync` cannot list `$bunfs`, and a computed `import(join(dir,
 * name))` puts nothing in the binary to read. The barrel is the same in a checkout and in the binary.
 */
import { join } from "node:path";
import { parse } from "yaml";
import { ASSETS, assetDir } from "./assets";
import { fieldsToJsonSchema, type FieldSpec, type JsonSchema } from "./schema";
export * from "./schema";

export const SPEC_VERSION = 1;
const sentence = (s: string) => s.split(/\.\s/)[0]!.replace(/\.$/, "") + ".";
// Real paths into the checkout. Nothing on the runtime path may use them — they do not exist in a
// compiled binary. They are here for the generator and for tests that read the source of truth on disk.
const ROOT = join(import.meta.dir, "..");
export const PRIMITIVES_DIR = join(ROOT, "primitives");
export const DEFAULTS_DIR = join(ROOT, "defaults");
export const DETECT_DIR = join(ROOT, "detect");

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
/** Parse one bundled asset by its package-relative path. Throws like the `readFileSync` it replaced. */
function yaml<T>(path: string): T {
  let v = cache.get(path);
  if (v === undefined) {
    const src = ASSETS[path];
    if (src === undefined) throw new Error(`spec asset not bundled: ${path} (run \`bun packages/spec/src/assets.gen.ts\`)`);
    v = parse(src); cache.set(path, v);
  }
  return v as T;
}

/** Names in the vocabulary, sorted. */
export function primitiveNames(): string[] {
  return assetDir("primitives").map((f) => f.slice(0, -5)).sort();
}
export function primitive(name: string): Primitive | undefined {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) return undefined;
  try { return yaml<Primitive>(`primitives/${name}.yaml`); } catch { return undefined; }
}
export function primitives(): Primitive[] { return primitiveNames().map((n) => primitive(n)!); }
/** Raw YAML — what `snypd://spec/primitives/{name}` serves, byte for byte. */
export function primitiveSource(name: string): string | undefined {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) return undefined;
  return ASSETS[`primitives/${name}.yaml`];
}

// ── Detectors (S15) ───────────────────────────────────────────────────────────
// How `content.suggest_blocks` recognises a primitive in prose someone already wrote. Deliberately
// *not* in `primitives/*.yaml` and *not* in `resources()`: an agent reading the vocabulary needs to
// know how to write a chart, not how snypd spots one, and every token in the primitive YAMLs is paid
// by every agent on every session (`tokens.learn`, gated at 4,800 — docs/07 decision 35).

/** A shape is a candidate extractor in `@snypd/core/suggest`; `none` means this primitive is never suggested. */
export type Shape = "table" | "ordered-list" | "list" | "blockquote" | "heading-run" | "image-paragraph" | "paragraph" | "none";
export const SHAPES: Shape[] = ["table", "ordered-list", "list", "blockquote", "heading-run", "image-paragraph", "paragraph"];

/** One scored signal. Exactly one operator; `because` is the sentence the agent is shown. */
export interface Signal {
  fact: string;
  weight: number;
  because: string;
  equals?: number | string;
  atLeast?: number;
  atMost?: number;
  matches?: string;
  isTrue?: boolean;
  isFalse?: boolean;
  oneOf?: (string | number)[];
}
export interface Detector {
  name: string;
  shape: Shape;
  /** Confidence when `require` holds and nothing fires. */
  base: number;
  /** Hard gates: `[min, max]` for a number fact, `true`/`false` for a boolean. Outside them there is no candidate. */
  require: Record<string, [number, number] | boolean>;
  signals: Signal[];
  /** Floor below which a candidate is never suggested. */
  min: number;
  /** Why this primitive has no detector (`shape: none` only). */
  because?: string;
}

const DETECT_DEFAULTS = { base: 0.3, require: {}, signals: [], min: 0.6 };

/** Every detector, keyed by primitive name. Primitives with no file get `shape: none`. */
export function detectors(): Record<string, Detector> {
  const out: Record<string, Detector> = {};
  for (const name of primitiveNames()) {
    const file = `detect/${name}.yaml`;
    let raw: Partial<Detector> = {};
    // A missing file is a *packaging* fault, not an opt-out — every primitive ships one, and a binary
    // built without `detect/` would otherwise turn suggest_blocks into a tool that silently finds nothing.
    try { raw = yaml<Partial<Detector>>(file) ?? {}; }
    catch { raw = { shape: "none", because: `No detector file at ${file} — the spec's detect/ directory did not ship with this build.` }; }
    out[name] = { ...DETECT_DEFAULTS, ...raw, name, shape: (raw.shape ?? "none") as Shape } as Detector;
  }
  return out;
}
export function detector(name: string): Detector | undefined { return detectors()[name]; }
/** The detectors that actually run, grouped by the shape they read — the loop `suggest_blocks` walks. */
export function detectorsByShape(): Map<Shape, Detector[]> {
  const m = new Map<Shape, Detector[]>();
  for (const d of Object.values(detectors())) {
    if (d.shape === "none") continue;
    (m.get(d.shape) ?? m.set(d.shape, []).get(d.shape)!).push(d);
  }
  return m;
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
  for (const f of assetDir("defaults")) Object.assign(out, yaml<object>(`defaults/${f}`));
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
