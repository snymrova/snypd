import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultStatus, loadConfig, parsePath, parseYaml, pathKey, renderPlugins, REPLACE } from "./index";

const ROOT = "corpora/_test/core";
const w = (file: string, text: string) => { mkdirSync(join(ROOT, file, ".."), { recursive: true }); writeFileSync(join(ROOT, file), text); };

beforeAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
  w("snypd.yaml", `snypd: 1
site:
  name: Example
  url: https://example.com
  locales: [en, fr]
theme:
  use: ink
  tokens: { color.accent: "#0FF0FC", content.width: 68ch }
types:
  post: { extends: post }
  caseStudy:
    extends: post
    dir: content/work
    urlPattern: /work/{slug}
    taxonomies: [industry, service]
    fields:
      client:  { type: string, required: true }
      metrics: { type: list, of: { type: object, fields: { value: { type: string } } } }
    mcp: { read: true, write: publish }
taxonomies:
  industry: { hierarchical: false, attaches: [caseStudy] }
  service:  { hierarchical: true,  attaches: [caseStudy, post] }
plugins:
  - snypd-plugin-seo
  - snypd-plugin-newsletter: { provider: buttondown }
jobs:
  refreshStaleReport: { every: 7d }
bench:
  budgets: { lcp: 1000 }
`);
  w("snypd.prod.yaml", `site: { url: https://example.org }\ntypes:\n  post:\n    taxonomies: !replace [tag]\n`);
  w("themes/ink/theme.yaml", `tokens: { color.accent: "#000", font.heading: Inter }\nlayouts: [post, page, index]\n`);
  // A plugin with a manifest (P1): the root keys merge as they did since S4; `plugin:` never does.
  w("plugins/snypd-plugin-seo/snypd.yaml", `plugin: { name: seo, version: 0.2.0, api: 1, description: SEO fields. }\ntypes:\n  post:\n    fields:\n      seoTitle: { type: string, max: 70 }\n    taxonomies: [seoTopic]\ntaxonomies:\n  seoTopic: { attaches: [post] }\njobs:\n  seoAudit: { every: 1d }\n`);
});
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

describe("yaml", () => {
  test("provenance lines and !replace", () => {
    const p = parseYaml(`a:\n  b: 1\n  c: !replace [1, 2]\nd: !replace { x: 1 }\n`, "f.yaml");
    expect(p.origins.get("a.b")).toEqual({ file: "f.yaml", line: 2 });
    expect(p.origins.get("a.c[1]")!.line).toBe(3);
    const v = p.value as { a: { c: number[] }; d: object };
    expect((v.a.c as any)[REPLACE]).toBe(true);
    expect((v.d as any)[REPLACE]).toBe(true);
    expect(JSON.stringify(v)).toBe('{"a":{"b":1,"c":[1,2]},"d":{"x":1}}'); // marker is non-enumerable
    expect(p.warnings).toEqual([]);
  });
  test("path keys round-trip, dotted keys bracketed", () => {
    for (const p of [["theme", "tokens", "color.accent"], ["types", "post", "taxonomies", 1]]) expect(parsePath(pathKey(p))).toEqual(p);
    expect(pathKey(["theme", "tokens", "color.accent"])).toBe("theme.tokens[color.accent]");
  });
});

describe("layering", () => {
  let c: ReturnType<typeof loadConfig>;
  beforeAll(() => { c = loadConfig(ROOT, { env: "prod" }); });
  test("five layers, later wins, with provenance", () => {
    expect(c.ok).toBe(true);
    // A plugin's identity is its short name (P1): `plugins[seo]` in a diagnostic, `plugin:seo` in provenance.
    expect(c.layers.map((l) => `${l.name}${l.from ? ":" + l.from : ""}${l.found ? "" : "!"}`)).toEqual(["spec", "theme:ink", "plugin:seo", "plugin:newsletter!", "site", "env:prod"]);
    expect(c.raw).not.toHaveProperty("plugin");   // the manifest is read, never merged (decision 81)
    expect(c.config.site.url).toBe("https://example.org");
    expect(c.explain("site.url")).toBe('`site.url` = "https://example.org" ← snypd.prod.yaml:1, overrides snypd.yaml:4');
    expect(c.explain("types.post.urlPattern")).toBe('`types.post.urlPattern` = "/posts/{slug}" ← @snypd/spec default');
    expect(c.explain("theme.tokens[color.accent]")).toContain("snypd.yaml:8, overrides themes/ink/theme.yaml:1 (theme ink)");
    expect(c.config.theme.tokens["font.heading"]).toBe("Inter");
    expect(c.explain("nope.x")).toBe("`nope.x` is not set");
  });
  test("arrays append unless !replace; objects deep-merge", () => {
    expect(c.config.types.post!.taxonomies).toEqual(["tag"]);              // !replace in env
    expect(c.source("types.post.taxonomies")!.appended).toBeUndefined();
    const dev = loadConfig(ROOT, { env: "dev" });
    expect(dev.config.types.post!.taxonomies).toEqual(["category", "tag", "seoTopic"]); // spec + plugin append
    expect(dev.explain("types.post.taxonomies")).toContain("appended to @snypd/spec default");
    expect(dev.config.types.post!.fields.seoTitle).toEqual({ type: "string", max: 70 });
    expect(dev.config.types.post!.fields.title).toBeDefined();
    expect(Object.keys(dev.config.jobs).sort()).toEqual(["refreshStaleReport", "seoAudit"]);
    expect(dev.config.bench.budgets.lcp).toBe(1000);
    expect(dev.config.bench.budgets.cls).toBe(0.05);
  });
  test("extends: inherit then override, arrays replace, provenance says inherited", () => {
    const cs = c.config.types.caseStudy!;
    expect(cs.layout).toBe("post");
    expect(cs.taxonomies).toEqual(["industry", "service"]);
    expect(cs.mcp.write).toBe("publish");
    expect(Object.keys(cs.fields)).toEqual(expect.arrayContaining(["title", "date", "seoTitle", "client", "metrics"]));
    expect(cs.extends).toBeUndefined();
    expect(c.explain("types.caseStudy.layout")).toBe('`types.caseStudy.layout` = "post" ← inherited from types.post (@snypd/spec default)');
    expect(c.explain("types.caseStudy.dir")).toBe('`types.caseStudy.dir` = "content/work" ← snypd.yaml:13');
  });
  test("snypd://config render: annotated, site-sized, defaults collapsed", () => {
    const y = c.render();
    expect(y).toContain("url: https://example.org # ← snypd.prod.yaml:1, overrides snypd.yaml:4");
    expect(y).toContain("page: <@snypd/spec default — snypd://spec/types/page>");
    expect(y).toContain("statuses: <@snypd/spec default — snypd://spec.json>");
    expect(y).toContain("title: <inherited from types.post>");
    expect(y).toContain("#   3. plugin seo (plugins/snypd-plugin-seo/snypd.yaml) — 0.2.0, plugins/snypd-plugin-seo, declares");
    expect(y).toContain("#   4. plugin newsletter — not found");
    expect(y.indexOf("snypd: 1")).toBeLessThan(y.indexOf("types:"));
    expect(y.split("\n").length).toBeLessThan(160);
  });
});

describe("diagnostics", () => {
  test("missing snypd.yaml → error, defaults still usable", () => {
    const c = loadConfig("corpora/_test/nowhere");
    expect(c.ok).toBe(false);
    expect(c.diagnostics[0]!.message).toContain("no snypd.yaml");
    expect(Object.keys(c.config.types)).toEqual(["post", "page", "author"]);
  });
  test("schema and cross-reference errors carry file:line", () => {
    const R = "corpora/_test/bad";
    mkdirSync(R, { recursive: true });
    writeFileSync(join(R, "snypd.yaml"), `snypd: 1\nsite:\n  name: X\n  url: not-a-url\n  defaultLocale: fr\ntypes:\n  thing:\n    dir: content/things\n    urlPattern: things/{slug}\n    layout: post\n    taxonomies: [nope]\n    vocabulary: [chart, grid]\n    fields: { x: { type: money } }\n  loop: { extends: loop2, dir: a, urlPattern: /a, layout: null }\n  loop2: { extends: loop, dir: a, urlPattern: /a, layout: null }\nstatuses:\n  draft: { public: false, transitions: [gone] }\ntypo: 1\n`);
    const c = loadConfig(R, { env: "test" });
    const msgs = c.diagnostics.filter((d) => d.level === "error").map((d) => `${d.path}: ${d.message}${d.where ? ` (${d.where})` : ""}`);
    expect(c.ok).toBe(false);
    expect(msgs).toContainEqual(expect.stringMatching(/^types\.loop2?\.extends: cycle: /));
    expect(msgs).toContainEqual(expect.stringContaining("typo: unknown key \"typo\" (snypd.yaml:18)"));
    expect(msgs).toContainEqual(expect.stringMatching(/^site\.url: .*(snypd\.yaml:4)/));
    expect(msgs).toContainEqual(expect.stringContaining("types.thing.urlPattern"));
    // cross-refs only run once the shape validates
    writeFileSync(join(R, "snypd.yaml"), `snypd: 1\nsite: { name: X, url: https://x.io, defaultLocale: fr }\ntypes:\n  thing: { dir: content/things, urlPattern: "/things/{slug}", layout: post, taxonomies: [nope], vocabulary: [chart, grid], fields: { x: { type: money } } }\nstatuses:\n  draft: { public: false, transitions: [gone] }\n`);
    const c2 = loadConfig(R, { env: "test" });
    const m2 = c2.diagnostics.filter((d) => d.level === "error").map((d) => `${d.path}: ${d.message} (${d.where})`);
    expect(m2).toEqual(expect.arrayContaining([
      'site.defaultLocale: "fr" is not in site.locales (snypd.yaml:2)',
      'types.thing.taxonomies[0]: unknown taxonomy "nope" (snypd.yaml:4)',
      'types.thing.vocabulary[1]: unknown primitive "grid" (snypd.yaml:4)',
      'types.thing.fields.x.type: unknown field type "money" (snypd.yaml:4)',
      'statuses.draft.transitions[2]: unknown status "gone" (snypd.yaml:6)',   // appended to the spec's [published, trashed]
    ]));
    rmSync(R, { recursive: true, force: true });
  });
  test("corpus config is clean", () => {
    const c = loadConfig("corpora/100");
    expect(c.ok).toBe(true);
    expect(c.diagnostics).toEqual([]);
    const theme = c.layers.find((l) => l.name === "theme")!;
    expect(theme.found).toBe(true); expect(theme.dir!.endsWith("themes/base")).toBe(true);
    // `base/theme.yaml`, not an absolute path: a theme lives beside the site rather than in it, so the
    // old rule wrote the checkout's location into `snypd://config` and made `tokens.learn` a number that
    // moved with a directory name (S18d′ — CI read 4,807 where this box read 4,777). `dir` above is a
    // real path used to open files; `file` is provenance an agent reads, and only that one is rewritten.
    expect(theme.file).toBe("base/theme.yaml");
  });
});

test("a type with no status field has no lifecycle, so it is public (S13)", () => {
  const R = "corpora/_test/status";
  rmSync(R, { recursive: true, force: true });
  mkdirSync(R, { recursive: true });
  writeFileSync(join(R, "snypd.yaml"), "snypd: 1\nsite: { name: S, url: https://s.example }\n");
  const cfg = loadConfig(R);
  // `post` and `page` declare `status:` — an unstated status starts the lifecycle, normally at `draft`.
  expect(defaultStatus(cfg, "post")).toBe(cfg.config.initialStatus);
  expect(defaultStatus(cfg, "page")).toBe(cfg.config.initialStatus);
  // `author` does not. It used to inherit `draft` and became invisible: the base theme ships an `author`
  // layout that could never render, and publishing one meant a frontmatter key lint calls unknown.
  expect(cfg.config.types.author!.fields).not.toHaveProperty("status");
  expect(cfg.config.statuses[defaultStatus(cfg, "author")]!.public).toBe(true);
  rmSync(R, { recursive: true, force: true });
});

/**
 * P1 — the plugin contract (docs/10 §4.1, decisions 81–83). Each rule in §4.1 is a test here: the
 * manifest is strict with file:line; `api:` is checked first; options are validated against the
 * plugin's own schema and the failure is attributed to the site's line; resolution mirrors themes and
 * ends at the barrel; a plugin with a bad manifest or bad options is not loaded and the site is.
 */
describe("plugins (P1)", () => {
  const R = "corpora/_test/plugins";
  const site = (plugins: string, extra = "") => { mkdirSync(R, { recursive: true }); writeFileSync(join(R, "snypd.yaml"), `snypd: 1\nsite: { name: P, url: https://p.example }\nplugins:\n${plugins}${extra}`); };
  const plugin = (dir: string, text: string) => { mkdirSync(join(R, dir), { recursive: true }); writeFileSync(join(R, dir, "snypd.yaml"), text); };
  const errors = (c: ReturnType<typeof loadConfig>) => c.diagnostics.filter((d) => d.level === "error").map((d) => `${d.path}: ${d.message}${d.where ? ` (${d.where})` : ""}`);
  const warnings = (c: ReturnType<typeof loadConfig>) => c.diagnostics.filter((d) => d.level === "warning").map((d) => `${d.path}: ${d.message}${d.where ? ` (${d.where})` : ""}`);
  beforeAll(() => rmSync(R, { recursive: true, force: true }));
  afterAll(() => rmSync(R, { recursive: true, force: true }));

  test("a bundled plugin loads on a bare site with no install step (decision 83): `plugins: [changelog]`", () => {
    rmSync(R, { recursive: true, force: true });
    site("  - changelog\n");
    const c = loadConfig(R);
    expect(c.ok).toBe(true);
    expect(errors(c)).toEqual([]);
    const [p] = c.plugins;
    expect(p).toMatchObject({ name: "changelog", found: true, loaded: true, tiers: ["declares"], contributes: { types: ["release"], taxonomies: ["product"] } });
    expect(p!.manifest).toMatchObject({ name: "changelog", version: "0.1.0", api: 1 });
    // On a checkout the workspace copy is on disk and wins, as `themes/` does for a theme; in the binary
    // it is the barrel. Either way it is one loader and one identity.
    expect(["workspace", "bundled"]).toContain(p!.source!);
    expect(c.config.types.release).toMatchObject({ dir: "content/changelog", urlPattern: "/changelog/{slug}", layout: "post", taxonomies: ["product"] });
    expect(c.config.types.release!.fields.version).toMatchObject({ type: "string", required: true });
    expect(c.config.types.release!.fields.title).toBeDefined();   // extends: post
    expect(c.config.taxonomies.product!.attaches).toEqual(["release"]);
    expect(c.explain("types.release.dir")).toContain("(plugin changelog)");
    expect(c.raw).not.toHaveProperty("plugin");
    const text = renderPlugins(c.plugins);
    expect(text).toContain("  changelog:\n    version: \"0.1.0\"");
    expect(text).toContain("does: [declares]");
    expect(text).toContain("contributes: { types: [release], taxonomies: [product] }");
    expect(text).toContain("status: loaded");
    expect(text).toContain("bundled: [changelog]");
  });

  test("resolution: the site's plugins/ first, then node_modules/snypd-plugin-<name>, then node_modules/<name>, then bundled", () => {
    rmSync(R, { recursive: true, force: true });
    site("  - changelog\n  - acme\n  - other\n");
    plugin("plugins/changelog", "plugin: { name: changelog, version: 9.9.9, api: 1 }\ntypes:\n  release: { dir: content/rel, urlPattern: \"/rel/{slug}\", layout: post }\n");
    plugin("node_modules/snypd-plugin-acme", "plugin: { name: acme, version: 1.0.0, api: 1 }\n");
    plugin("node_modules/other", "plugin: { name: other, version: 1.0.0, api: 1 }\n");
    let c = loadConfig(R);
    expect(c.plugins.map((p) => `${p.name}:${p.source}:${p.where}`)).toEqual(["changelog:site:plugins/changelog", "acme:node_modules:node_modules/snypd-plugin-acme", "other:node_modules:node_modules/other"]);
    expect(c.plugins[0]!.manifest!.version).toBe("9.9.9");             // the site's own copy shadows the bundled one
    expect(c.config.types.release!.dir).toBe("content/rel");
    // plugins/<name> beats node_modules/snypd-plugin-<name> for the same name
    plugin("plugins/acme", "plugin: { name: acme, version: 2.0.0, api: 1 }\n");
    c = loadConfig(R);
    expect(c.plugins[1]).toMatchObject({ source: "site", manifest: { version: "2.0.0" } });
    // the `snypd-plugin-` prefix is stripped: one identity however the site spelt it
    site("  - snypd-plugin-acme\n");
    c = loadConfig(R);
    expect(c.plugins[0]).toMatchObject({ name: "acme", entry: "snypd-plugin-acme", source: "site" });
    // not found anywhere: a warning with every place looked, on the site's line — the site still loads
    site("  - nope\n");
    c = loadConfig(R);
    expect(c.ok).toBe(true);
    expect(c.plugins[0]).toMatchObject({ name: "nope", found: false, loaded: false, why: "not found" });
    expect(warnings(c)[0]).toBe('plugins: plugin "nope" has no snypd.yaml (looked for plugins/nope, node_modules/snypd-plugin-nope, node_modules/nope, and the bundled set: changelog) — not installed? (snypd.yaml:4)');
  });

  test("api: is checked before anything else — a manifest for a contract this snypd does not speak is refused, root keys and all", () => {
    rmSync(R, { recursive: true, force: true });
    site("  - future\n  - old\n");
    plugin("plugins/future", "plugin:\n  name: future\n  version: 1.0.0\n  api: 2\n  whatever: true\ntypes:\n  thing: { dir: content/things, urlPattern: \"/things/{slug}\", layout: post }\n");
    plugin("plugins/old", "plugin:\n  name: old\n  version: 1.0.0\ntypes:\n  thing2: { dir: content/things, urlPattern: \"/things/{slug}\", layout: post }\n");
    const c = loadConfig(R);
    expect(c.ok).toBe(true);   // the plugins are refused; the site is not (docs/10 §4.1)
    expect(c.diagnostics.every((d) => d.plugin)).toBe(true);
    expect(errors(c)).toEqual([
      "plugins[future].plugin.api: manifest speaks plugin api 2; this snypd speaks 1 — not loaded (plugins/future/snypd.yaml:4 (plugin future))",
      "plugins[old].plugin.api: manifest declares no `api:`; this snypd speaks plugin api 1 — not loaded (plugins/old/snypd.yaml:1 (plugin old))",
    ]);
    expect(c.plugins.map((p) => p.loaded)).toEqual([false, false]);
    expect(c.config.types).not.toHaveProperty("thing");    // refused means the root keys did not merge either
    expect(c.config.types).not.toHaveProperty("thing2");
    expect(renderPlugins(c.plugins)).toContain("status: refused — manifest speaks plugin api 2; this snypd speaks 1");
  });

  test("the manifest is strict with file:line; a not-yet-built key warns and names its session; a bad manifest is not loaded", () => {
    rmSync(R, { recursive: true, force: true });
    site("  - typo\n  - early\n");
    plugin("plugins/typo", "plugin:\n  name: typo\n  version: 1.0.0\n  api: 1\n  descripton: oops\n  slots: { sidebar: ./x.tsx }\n  capabilities: { client: lots }\ntaxonomies:\n  topic: { attaches: [post] }\n");
    plugin("plugins/early", "plugin:\n  name: early\n  version: 1.0.0\n  api: 1\n  slots: { head: ./head.tsx, body-end: ./beacon.tsx }\n  filters: { title: ./title.ts }\n  stages: { transform: ./transform.ts }\n  events: { push: ./push.ts }\n  tools: ./tools.ts\n  capabilities: { network: [plausible.io], client: 1kb }\ntaxonomies:\n  topic: { attaches: [post] }\n");
    const c = loadConfig(R);
    const e = errors(c);
    expect(e).toContainEqual('plugins[typo].plugin.descripton: unknown key "descripton" in `plugin:` (plugins/typo/snypd.yaml:5 (plugin typo))');
    expect(e).toContainEqual(expect.stringMatching(/^plugins\[typo\]\.plugin\.slots\.sidebar: .* \(plugins\/typo\/snypd\.yaml:6 \(plugin typo\)\)$/));
    expect(e).toContainEqual(expect.stringMatching(/^plugins\[typo\]\.plugin\.capabilities\.client: .*1kb.* \(plugins\/typo\/snypd\.yaml:7 \(plugin typo\)\)$/));
    expect(e).toContainEqual("plugins[typo].plugin: manifest does not validate — not loaded (plugins/typo/snypd.yaml)");
    expect(c.plugins[0]!.loaded).toBe(false);
    // `early` is a complete P2–P4 manifest: it parses, loads as Tier 0, and every key that does not run yet says so
    expect(c.plugins[1]).toMatchObject({ loaded: true, tiers: ["declares", "decorates", "transforms", "reacts", "speaks"] });
    expect(c.config.taxonomies.topic).toBeDefined();
    const w = warnings(c).filter((x) => x.startsWith("plugins[early]"));
    expect(w).toEqual([
      "plugins[early].plugin.slots: `slots` is declared but not built yet (slots — docs/10 §4.3, lands in P2); ignored (plugins/early/snypd.yaml:5 (plugin early))",
      "plugins[early].plugin.filters: `filters` is declared but not built yet (filters — docs/10 §4.3, lands in P2); ignored (plugins/early/snypd.yaml:6 (plugin early))",
      "plugins[early].plugin.stages: `stages` is declared but not built yet (transform and emit stages — docs/10 §4.4, lands in P3); ignored (plugins/early/snypd.yaml:7 (plugin early))",
      "plugins[early].plugin.events: `events` is declared but not built yet (publish and push events — docs/10 §4.5, lands in P3); ignored (plugins/early/snypd.yaml:8 (plugin early))",
      "plugins[early].plugin.tools: `tools` is declared but not built yet (plugin tools in the catalogue — docs/10 §4.2 tier 4, lands in P4); ignored (plugins/early/snypd.yaml:9 (plugin early))",
    ]);
    expect(renderPlugins(c.plugins)).toContain('capabilities: {"network":["plausible.io"],"client":"1kb"}');
  });

  test("options are validated against the plugin's own schema, and a failure is attributed to the site's line and the plugin's key", () => {
    rmSync(R, { recursive: true, force: true });
    const manifest = "plugin:\n  name: analytics\n  version: 0.1.0\n  api: 1\n  options:\n    type: object\n    required: [provider]\n    additionalProperties: false\n    properties:\n      provider: { type: string, enum: [plausible, fathom, umami, cloudflare] }\n      domain: { type: string }\ntaxonomies:\n  topic: { attaches: [post] }\n";
    plugin("plugins/analytics", manifest);
    plugin("plugins/plain", "plugin: { name: plain, version: 0.1.0, api: 1 }\n");
    // bad: a value outside the enum, and a key the schema does not allow
    site("  - analytics: { provider: goatcounter, colour: red }\n");
    let c = loadConfig(R);
    expect(c.ok).toBe(true);   // refused plugin, loaded site
    expect(c.plugins[0]).toMatchObject({ loaded: false, why: "options do not validate" });
    expect(errors(c)).toEqual([
      expect.stringMatching(/^plugins\[analytics\]\.provider: .*(plausible|fathom).* \(snypd\.yaml:4\)$/),
      expect.stringMatching(/^plugins\[analytics\]: .*colour.* \(snypd\.yaml:4\)$/),
      "plugins[analytics]: options do not validate against the plugin's schema — not loaded (snypd.yaml:4)",
    ]);
    expect(c.config.taxonomies).not.toHaveProperty("topic");   // not loaded: its root keys did not merge
    // missing a required key, from the env layer this time: attributed to that file
    site("  - other\n");
    writeFileSync(join(R, "snypd.prod.yaml"), "plugins:\n  - analytics: {}\n");
    c = loadConfig(R, { env: "prod" });
    expect(errors(c)[0]).toMatch(/^plugins\[analytics\]\.provider: .* \(snypd\.prod\.yaml:2\)$/);
    rmSync(join(R, "snypd.prod.yaml"));
    // good: the options are kept, coerced by the schema, and printed
    site("  - analytics: { provider: plausible, domain: p.example }\n  - plain: { greeting: hi }\n");
    c = loadConfig(R);
    expect(c.ok).toBe(true);
    expect(c.plugins[0]).toMatchObject({ loaded: true, options: { provider: "plausible", domain: "p.example" } });
    expect(c.config.taxonomies.topic).toBeDefined();
    expect(renderPlugins(c.plugins)).toContain('options: {"provider":"plausible","domain":"p.example"}');
    // a plugin that declares no schema and is handed options: loaded, and told
    expect(c.plugins[1]!.loaded).toBe(true);
    expect(warnings(c)).toContainEqual("plugins[plain]: takes no options (its manifest declares no `options` schema); `greeting` ignored (snypd.yaml:5)");
    // an entry that is not a name or one `{ name: {…} }`
    site("  - { a: {}, b: {} }\n  - plain: 3\n");
    c = loadConfig(R);
    expect(errors(c)).toEqual([
      expect.stringMatching(/^plugins: invalid plugin entry .* \(snypd\.yaml:4\)$/),
      "plugins[plain]: options must be a mapping, got 3 — not loaded (snypd.yaml:5)",
    ]);
  });

  test("the floor still holds: a snypd.yaml with no plugin: block declares, with one warning that says what to add", () => {
    rmSync(R, { recursive: true, force: true });
    site("  - bare\n");
    plugin("plugins/bare", "taxonomies:\n  topic: { attaches: [post] }\n");
    const c = loadConfig(R);
    expect(c.ok).toBe(true);
    expect(c.plugins[0]).toMatchObject({ loaded: true, tiers: ["declares"], contributes: { taxonomies: ["topic"] } });
    expect(c.plugins[0]!.manifest).toBeUndefined();
    expect(warnings(c)).toEqual(["plugins[bare]: plugins/bare/snypd.yaml has no `plugin:` block — loaded as a plugin that only declares; add `plugin: { name: bare, version: 0.1.0, api: 1 }` so doctor can describe it (plugins/bare/snypd.yaml)"]);
    expect(renderPlugins(c.plugins)).toContain("version: unknown   # no plugin: block");
  });
});
