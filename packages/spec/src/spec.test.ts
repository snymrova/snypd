import { describe, expect, test } from "bun:test";
import { defaults, exportJsonSchema, fieldToJsonSchema, frontmatterSchema, primitive, primitiveNames, primitives, primitiveSchema, primitivesIndex, resource, resources, specOverview } from "./index";

const LOCKED = ["callout", "chart", "cover", "cta", "diagram", "faq", "figure", "flow", "pullquote", "stat", "stat-row", "steps", "tldr"];

describe("primitives", () => {
  test("exactly the 13 locked in docs/07 §2", () => expect(primitiveNames()).toEqual(LOCKED));
  test("every primitive has the required keys and a parseable example", () => {
    for (const p of primitives()) {
      for (const k of ["name", "kind", "group", "purpose", "props", "intent", "anti-intent", "example", "fallback"]) expect(p, p.name).toHaveProperty(k);
      expect(["leaf", "container", "inline"]).toContain(p.kind);
      expect(p.example).toContain(p.kind === "container" ? `:::${p.name}` : `::${p.name}`);
      if (p.kind === "container") expect(p.example.trimEnd().endsWith(":::")).toBe(true);
    }
  });
  test("evidence primitives require a source; figure requires alt; viz carry budgets", () => {
    expect(primitive("stat")!.props.source!.required).toBe(true);
    expect(primitive("chart")!.props.source!.required).toBe(true);
    expect(primitive("figure")!.props.alt!.required).toBe(true);
    for (const n of ["chart", "diagram", "flow"]) expect(primitive(n)!.budget).toBeDefined();
    expect(primitive("diagram")!.budget!.maxNodes).toBe(40);
  });
  test("unknown / unsafe names return undefined", () => {
    expect(primitive("grid")).toBeUndefined();
    expect(primitive("../package")).toBeUndefined();
  });
});

describe("json schema", () => {
  test("field DSL maps every docs/01 type", () => {
    expect(fieldToJsonSchema({ type: "enum", values: ["a", "b"], default: "a" })).toEqual({ type: "string", enum: ["a", "b"], default: "a" });
    expect(fieldToJsonSchema({ type: "url" })).toEqual({ type: "string", format: "uri", "x-type": "url" });
    expect(fieldToJsonSchema({ type: "list", of: { type: "ref", to: "tag" }, min: 1 })).toEqual({ type: "array", items: { type: "string", "x-ref": "tag" }, minItems: 1 });
    expect(fieldToJsonSchema({ type: "object", fields: { a: { type: "number", required: true } } })).toEqual({ type: "object", properties: { a: { type: "number" } }, additionalProperties: false, required: ["a"] });
  });
  test("primitive schema lists required props", () => {
    expect(primitiveSchema(primitive("cta")!).required).toEqual(["title", "button", "href"]);
    expect((primitiveSchema(primitive("chart")!).properties as any).type.enum).toEqual(["bar", "line", "area", "donut", "lollipop"]);
  });
  test("frontmatter schema for built-in types and the full export", () => {
    expect(frontmatterSchema("types", "post")!.required).toEqual(["title", "date"]);
    expect(frontmatterSchema("types", "nope")).toBeUndefined();
    const all = exportJsonSchema();
    expect(Object.keys(all.primitives)).toEqual(LOCKED);
    expect(Object.keys(all.types)).toEqual(["post", "page", "author"]);
    expect(JSON.parse(JSON.stringify(all))).toEqual(all); // serialisable
  });
});

describe("defaults", () => {
  const d = defaults();
  test("statuses: draft → published → trashed, transitions closed", () => {
    expect(Object.keys(d.statuses)).toEqual(["draft", "published", "trashed"]);
    expect(d.initialStatus).toBe("draft");
    for (const s of Object.values(d.statuses)) for (const t of s.transitions) expect(d.statuses).toHaveProperty(t);
  });
  test("taxonomies attach to declared types and types reference declared taxonomies", () => {
    for (const t of Object.values(d.taxonomies)) for (const ty of t.attaches) expect(d.types).toHaveProperty(ty);
    for (const t of Object.values(d.types)) for (const tx of t.taxonomies) expect(d.taxonomies).toHaveProperty(tx);
  });
  test("budgets match docs/05 defaults used by bench", () => {
    expect(d.budgets.buildPer100).toBe(2000); expect(d.budgets.incremental).toBe(300); expect(d.budgets.mcpColdStart).toBe(50);
    expect(d.budgets.tokensPerPage).toBe(2500); expect(d.budgets.tokensToLearn).toBe(6000); expect(d.budgets.mdReduction).toBe(85);
  });
  test("every field type used in defaults and primitives is declared", () => {
    const declared = new Set(Object.keys(d.fieldTypes)).add("yaml");
    const walk = (f: any, where: string) => { expect(declared.has(f.type), `${where}: ${f.type}`).toBe(true); if (f.of) walk(f.of, where); if (f.fields) Object.values(f.fields).forEach((x) => walk(x, where)); };
    for (const [n, t] of Object.entries(d.types)) Object.values(t.fields).forEach((f) => walk(f, `type ${n}`));
    for (const [n, t] of Object.entries(d.taxonomies)) Object.values(t.fields).forEach((f) => walk(f, `taxonomy ${n}`));
    for (const p of primitives()) Object.values(p.props ?? {}).forEach((f) => walk(f, p.name));
  });
});

describe("resources", () => {
  test("uris, index, overview", () => {
    const uris = resources().map((r) => r.uri);
    expect(uris).toContain("snypd://spec");
    expect(uris).toContain("snypd://spec/primitives");
    for (const n of LOCKED) expect(uris).toContain(`snypd://spec/primitives/${n}`);
    expect(primitivesIndex().split("\n").filter((l) => l.startsWith("- **")).length).toBe(13);
    expect(primitivesIndex()).not.toContain("..");
    expect(specOverview()).toContain("## Statuses");
    expect(resource("snypd://spec/primitives/stat")!.text()).toContain("source:");
    expect(resource("snypd://nope")).toBeUndefined();
    for (const r of resources()) expect(r.text().length).toBeGreaterThan(20);
  });
});
