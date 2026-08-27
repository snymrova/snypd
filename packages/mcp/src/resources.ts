/**
 * Resources served in S4: `snypd://config` (merged YAML with provenance, @snypd/core), `snypd://spec/**`
 * (@snypd/spec), `snypd://types[/name]` and `snypd://taxonomies/{name}` (merged schemas, docs/03).
 * S5 adds `snypd://lint/{type}/{slug}` — diagnostics for one file, rules 0–9 with fix hints.
 * S11 adds `snypd://content/{type}/{slug}[.md]` and `snypd://history/{type}/{slug}`, both **templates**:
 * one resource per post would put a thousand rows in `resources/list` and make the cheapest call on the
 * server the most expensive one. An agent that wants the list calls `content.query`.
 * Both packages are imported lazily on first use so cold start stays at the spawn floor.
 */
import { readFileSync } from "node:fs";
import { relative } from "node:path";
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
    async listTemplates() {
      return [
        { uriTemplate: "snypd://content/{type}/{slug}", name: "content", mimeType: YAML, description: "One content item: its frontmatter, then the markdown body. Add `.md` for the file exactly as it is on disk" },
        { uriTemplate: "snypd://history/{type}/{slug}", name: "history", mimeType: JSON_, description: "Commits touching one item, newest first, each with the principal that made it (docs/02 §7)" },
        { uriTemplate: "snypd://lint/{type}/{slug}", name: "lint", mimeType: JSON_, description: "Lint diagnostics for one content file: rule id, severity, line, message and a fix hint (docs/01 editorial lint)" },
      ];
    },
    async readResource(uri) {
      const text = (mimeType: string, text: string) => [{ uri, mimeType, text }];
      const contentM = /^snypd:\/\/(content|history)\/([a-z][a-z0-9-]*)\/([a-z0-9][a-z0-9/-]*?)(\.md)?$/i.exec(uri);
      if (contentM) {
        const c = await loadCore(), cfg = await config();
        const [, kind, type, slug, md] = contentM;
        if (!cfg.config.types[type!]) throw new RpcError(E.RESOURCE_NOT_FOUND, `Resource not found: ${uri} (unknown type ${type}; known: ${Object.keys(cfg.config.types).join(", ")})`);
        const t = c.target(root, cfg, type!, slug!);
        if (kind === "history") {
          const repo = c.Repo.open(root);
          return text(JSON_, JSON.stringify({ path: t.path, git: !!repo, commits: repo?.history(t.path) ?? [] }, null, 2));
        }
        let source: string;
        try { source = readFileSync(t.file, "utf8"); }
        catch { throw new RpcError(E.RESOURCE_NOT_FOUND, `Resource not found: ${uri} (no ${type} with slug ${slug})`); }
        if (md) return text("text/markdown", source);
        const { yaml, body } = c.splitFrontmatter(source);
        return text(YAML, `# ${t.path} → ${t.route}\n${yaml}\nbody: |\n${body.split("\n").map((l) => `  ${l}`).join("\n").replace(/\s+$/, "")}\n`);
      }
      const lintM = /^snypd:\/\/lint\/([a-z][a-z0-9-]*)\/([a-z0-9][a-z0-9/-]*)$/i.exec(uri);
      if (lintM) {
        const c = await loadCore(), cfg = await config();
        const [, type, slug] = lintM;
        const file = c.listContent(root, cfg).find((f) => f.type === type && f.slug === slug);
        if (!file) throw new RpcError(E.RESOURCE_NOT_FOUND, `Resource not found: ${uri} (no ${type} with slug ${slug})`);
        const index = await c.SiteIndex.open(root); index.sync(cfg);
        const site = c.lintSite(root, { cfg, moves: index.moves(), cache: new c.MdastCache(index.mdastStore()) });   // whole site: rule 5 needs every route, 11 every tag, 10 the move log
        index.close();
        const r = site.files.find((f) => f.file === relative(root, file.file))!;
        return text(JSON_, JSON.stringify({ file: r.file, errors: r.errors, warnings: r.warnings, words: r.words, skipped: r.skipped, diagnostics: r.diagnostics }, null, 2));
      }
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
