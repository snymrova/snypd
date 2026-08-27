/** Field-type DSL (docs/01) → JSON Schema (draft 2020-12). Pure; no deps. */
export type Field =
  | { type: "string" | "text" | "markdown" | "image" | "url" | "date" | "datetime" | "number" | "boolean" | "yaml" }
  | { type: "enum"; values: string[] }
  | { type: "ref"; to: string }
  | { type: "list"; of: FieldSpec; min?: number; max?: number }
  | { type: "object"; fields: Record<string, FieldSpec> };
export type FieldSpec = Field & { required?: boolean; default?: unknown; description?: string; min?: number; max?: number; pattern?: string };
export type JsonSchema = Record<string, unknown>;

const FORMATS: Record<string, string> = { date: "date", datetime: "date-time", url: "uri" };

export function fieldToJsonSchema(f: FieldSpec): JsonSchema {
  const s: JsonSchema = {};
  switch (f.type) {
    case "number": s.type = "number"; if (f.min !== undefined) s.minimum = f.min; if (f.max !== undefined) s.maximum = f.max; break;
    case "boolean": s.type = "boolean"; break;
    case "enum": s.type = "string"; s.enum = f.values; break;
    case "ref": s.type = "string"; s["x-ref"] = f.to; break;
    case "list":
      s.type = "array"; s.items = fieldToJsonSchema(f.of);
      if (f.min !== undefined) s.minItems = f.min; if (f.max !== undefined) s.maxItems = f.max;
      break;
    case "object": Object.assign(s, fieldsToJsonSchema(f.fields)); break;
    case "yaml": s.type = "string"; s["x-format"] = "yaml"; break;
    default: // string-like
      s.type = "string";
      if (FORMATS[f.type]) s.format = FORMATS[f.type];
      if (f.type !== "string") s["x-type"] = f.type;
      if (f.min !== undefined) s.minLength = f.min; if (f.max !== undefined) s.maxLength = f.max;
      if (f.pattern) s.pattern = f.pattern;
  }
  if (f.description) s.description = f.description;
  if (f.default !== undefined) s.default = f.default;
  return s;
}

export function fieldsToJsonSchema(fields: Record<string, FieldSpec> = {}): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const [k, f] of Object.entries(fields)) { properties[k] = fieldToJsonSchema(f); if (f.required) required.push(k); }
  const s: JsonSchema = { type: "object", properties, additionalProperties: false };
  if (required.length) s.required = required;
  return s;
}
