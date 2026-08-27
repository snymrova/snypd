/**
 * Resources served in S4: `snypd://config` (merged YAML with provenance, @snypd/core), `snypd://spec/**`
 * (@snypd/spec), `snypd://types[/name]` and `snypd://taxonomies/{name}` (merged schemas, docs/03).
 * Both packages are imported lazily on first use so cold start stays at the spawn floor.
 */
import type { Handlers } from "./protocol";
import { E, RpcError } from "./protocol";

type Spec = typeof import("@snypd/spec");
type Core = typeof import("@snypd/core");
let spec: Spec | undefined, core: Core | undefined;
const loadSpec = async () => (spec ??= await import("@snypd/spec"));
const loadCore = async () => (core ??= await import("@snypd/core"));

const JSON_ = "application/json", YAML = "application/yaml";

export function handlers(root: string): Handlers {
  const config = async () => (await loadCore()).loadConfig(root);
  return {
    async listResources() {
      const [s, c] = [await loadSpec(), await config()];
      return [
        { uri: "snypd://config", name: "config", mimeType: YAML, description: "Merged site config (spec ← theme ← plugins ← snypd.yaml ← snypd.<env>.yaml) with provenance — read this first" },
        ...s.resources().map(({ uri, name, mimeType, description }) => ({ uri, name, mimeType, description })),
        { uri: "snypd://types", name: "types", mimeType: JSON_, description: "Merged content types (spec + plugins + site), frontmatter as JSON Schema" },
        ...Object.keys(c.config.types).map((n) => ({ uri: `snypd://types/${n}`, name: `types/${n}`, mimeType: JSON_, description: `Merged schema for type ${n}` })),
        ...Object.keys(c.config.taxonomies).map((n) => ({ uri: `snypd://taxonomies/${n}`, name: `taxonomies/${n}`, mimeType: JSON_, description: `Merged schema for taxonomy ${n}` })),
      ];
    },
    async readResource(uri) {
      const text = (mimeType: string, text: string) => [{ uri, mimeType, text }];
      if (uri === "snypd://config") return text(YAML, (await config()).render());
      if (uri.startsWith("snypd://spec")) {
        const r = (await loadSpec()).resource(uri);
        if (r) return text(r.mimeType, r.text());
      }
      const m = /^snypd:\/\/(types|taxonomies)(?:\/([a-z][a-z0-9-]*))?$/i.exec(uri);
      if (m) {
        const [s, c] = [await loadSpec(), await config()];
        const kind = m[1] as "types" | "taxonomies", name = m[2];
        const table = c.config[kind] as Record<string, { fields: Record<string, unknown> }>;
        const schema = (n: string) => ({ $schema: "https://json-schema.org/draft/2020-12/schema", $id: `snypd://${kind}/${n}.json`, title: n, ...s.fieldsToJsonSchema(table[n]!.fields as never), ...(kind === "types" ? { "x-type": { ...table[n], fields: undefined } } : {}) });
        if (!name) { if (kind === "taxonomies") throw new RpcError(E.RESOURCE_NOT_FOUND, `Resource not found: ${uri}`); return text(JSON_, JSON.stringify(Object.fromEntries(Object.keys(table).map((n) => [n, schema(n)])), null, 2)); }
        if (table[name]) return text(JSON_, JSON.stringify(schema(name), null, 2));
      }
      throw new RpcError(E.RESOURCE_NOT_FOUND, `Resource not found: ${uri}`);
    },
  };
}
