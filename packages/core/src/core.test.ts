import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { contrastRatio, luminance, resolveColor, tokenVars, callPluginTool, cssValue, defaultStatus, loadConfig, loadPluginPrompts, loadPluginTools, parsePath, parseYaml, pathKey, renderPlugins, hooksOf, clientKbDeclared, themeSettings, themeVariations, strandedVariation, themeTokens, settingValues, settingValue, strandedSettings, PLUGIN_UNBUILT_KEYS, MAX_FONT_KB, REPLACE, typeLineage, patternDir, typeArchives } from "./index";

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
    expect(cs.extends).toBe("post");   // R1: the base stays named on the resolved type, so a build can follow it
    expect(typeLineage(c.config.types, "caseStudy")).toEqual(["caseStudy", "post"]);
    expect(typeLineage(c.config.types, "post")).toEqual(["post"]);
    // R1, decision 194: the archive is the pattern's directory; one dated type with `/` free lists at `/` and has none
    expect(patternDir("/work/{slug}")).toBe("/work"); expect(patternDir("/posts/{year}/{slug}")).toBe("/posts"); expect(patternDir("/{path}")).toBe("/");
    expect(typeArchives(c.config, true).map((a) => `${a.type}:${a.route}`)).toEqual(["post:/posts", "caseStudy:/work"]);
    expect(typeArchives({ types: { post: c.config.types.post! } }, false)).toEqual([]);
    expect(typeArchives({ types: { post: c.config.types.post! } }, true)).toEqual([{ type: "post", route: "/posts" }]);
    expect(c.explain("types.caseStudy.layout")).toBe('`types.caseStudy.layout` = "post" ← inherited from types.post (@snypd/spec default)');
    expect(c.explain("types.caseStudy.dir")).toBe('`types.caseStudy.dir` = "content/work" ← snypd.yaml:13');
  });
  test("snypd://config render: annotated, site-sized, defaults collapsed", () => {
    const y = c.render();
    expect(y).toContain("url: https://example.org # ← snypd.prod.yaml:1, overrides snypd.yaml:4");
    expect(y).toContain("page: <@snypd/spec default — snypd://spec/types/page>");
    expect(y).toContain("statuses: <@snypd/spec default — snypd://spec.json>");
    // S21 (decision 169): inside a subtree the site wrote into, the keys it did not touch are one counted
    // line, not one line each — `caseStudy.fields` names the two the site declared and counts the fourteen
    // it inherited. The two levels above stay itemised: `types.post`, `types.page` are lines an agent
    // navigates by.
    expect(y).not.toContain("title: <inherited from types.post>");
    expect(y).toContain("      # 14 more untouched: <inherited from types.post>");
    expect(y).toContain("    # 3 more untouched: <inherited from types.post>");
    expect(y).toContain("    lcp: 1000 # ← snypd.yaml:29, overrides @snypd/spec default\n    # 16 more untouched: <@snypd/spec default — snypd://spec/budgets>");
    expect(y).toContain("  page: <@snypd/spec default — snypd://spec/types/page>\n  author: <@snypd/spec default — snypd://spec/types/author>");
    expect(y).toContain("  tag: <@snypd/spec default — snypd://spec/taxonomies/tag>\n  seoTopic:");
    expect(y).toContain("#   3. plugin seo (plugins/snypd-plugin-seo/snypd.yaml) — 0.2.0, plugins/snypd-plugin-seo, declares");
    expect(y).toContain("#   4. plugin newsletter — not found");
    expect(y.indexOf("snypd: 1")).toBeLessThan(y.indexOf("types:"));
    expect(y.split("\n").length).toBeLessThan(160);
  });
  test("two retuned tokens cost two lines, not the theme's whole palette (S21, decision 169)", () => {
    // The kill corpus as the kill test leaves it: `editorial`, two tokens overridden, four plugins on.
    // Before the counted line, this read 2,312 tokens for `snypd://config` alone and put `tokens.learn`
    // over D4's 6,000 — the theme's other 38 declarations each got a line of their own because two of
    // their siblings had been written to.
    const R = "corpora/_test/retuned";
    mkdirSync(R, { recursive: true });
    writeFileSync(join(R, "snypd.yaml"), `snypd: 1\nsite: { name: R, url: https://r.example }\ntheme:\n  use: editorial\n  tokens:\n    color.accent: "#2f5d62"\n    font.body: Georgia\nplugins:\n  - changelog\n`);
    try {
      const y = loadConfig(R).render();
      expect(y).toContain('    color.accent: "#2f5d62" # ← snypd.yaml:6, overrides editorial/theme.yaml:');
      expect(y).toMatch(/    font\.body: Georgia # ← snypd\.yaml:7, overrides editorial\/theme\.yaml:\d+ \(theme editorial\)\n    # 38 more untouched: <theme editorial default — editorial\/theme\.yaml:\d+–\d+>\n/);
      expect(y).not.toContain("color.viz.1:");
      expect(y).toContain("      # 13 more untouched: <inherited from types.post>");
      // The rule only counts; a family with one member keeps its line, and it says the same thing it did.
      expect(y).not.toContain("1 more untouched");
      const lines = y.split("\n");
      expect(lines.filter((l) => l.includes("more untouched")).length).toBe(3);   // tokens, release.fields, release
      expect(lines.length).toBeLessThan(90);
    } finally { rmSync(R, { recursive: true, force: true }); }
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
    expect(text).toContain("bundled: [analytics, autolink, changelog, indexnow]");
    expect(text).not.toContain("hooks:");   // changelog decorates nothing, so the hook table is not printed (free when unused)
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
    expect(warnings(c)[0]).toBe('plugins: plugin "nope" has no snypd.yaml (looked for plugins/nope, node_modules/snypd-plugin-nope, node_modules/nope, and the bundled set: analytics, autolink, changelog, indexnow) — not installed? (snypd.yaml:4)');
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

  test("the manifest is strict with file:line; every key it accepts is a key that runs; a bad manifest is not loaded", () => {
    rmSync(R, { recursive: true, force: true });
    site("  - typo\n  - early\n", "bench: { budgets: { jsKb: 1 } }\n");
    // `early` declares all five tiers, and since P4 every one of them is real: each module must exist
    // (a missing one refuses the plugin — tested below). `PLUGIN_UNBUILT_KEYS` is empty for the first
    // time since P1 wrote it, so this test's "declared but not built yet" warning is gone with it.
    mkdirSync(join(R, "plugins/early"), { recursive: true });
    for (const f of ["head.tsx", "beacon.tsx", "title.ts", "transform.ts", "push.ts"]) writeFileSync(join(R, "plugins/early", f), "export default () => null;\n");
    writeFileSync(join(R, "plugins/early/tools.ts"), "export default { actions: [{ name: \"go\", description: \"does the thing\", run: () => \"done\" }] };\n");
    plugin("plugins/typo", "plugin:\n  name: typo\n  version: 1.0.0\n  api: 1\n  descripton: oops\n  slots: { sidebar: ./x.tsx }\n  capabilities: { client: lots }\ntaxonomies:\n  topic: { attaches: [post] }\n");
    plugin("plugins/early", "plugin:\n  name: early\n  version: 1.0.0\n  api: 1\n  slots: { head: ./head.tsx, body-end: ./beacon.tsx }\n  filters: { title: ./title.ts }\n  stages: { transform: ./transform.ts }\n  events: { push: ./push.ts }\n  tools: ./tools.ts\n  capabilities: { network: [plausible.io], client: 1kb }\ntaxonomies:\n  topic: { attaches: [post] }\n");
    const c = loadConfig(R);
    const e = errors(c);
    expect(e).toContainEqual('plugins[typo].plugin.descripton: unknown key "descripton" in `plugin:` (plugins/typo/snypd.yaml:5 (plugin typo))');
    expect(e).toContainEqual(expect.stringMatching(/^plugins\[typo\]\.plugin\.slots\.sidebar: .* \(plugins\/typo\/snypd\.yaml:6 \(plugin typo\)\)$/));
    expect(e).toContainEqual(expect.stringMatching(/^plugins\[typo\]\.plugin\.capabilities\.client: .*1kb.* \(plugins\/typo\/snypd\.yaml:7 \(plugin typo\)\)$/));
    expect(e).toContainEqual("plugins[typo].plugin: manifest does not validate — not loaded (plugins/typo/snypd.yaml)");
    expect(c.plugins[0]!.loaded).toBe(false);
    // `early` is a complete five-tier manifest: it parses, and since P4 it loads with nothing ignored
    expect(c.plugins[1]).toMatchObject({ loaded: true, tiers: ["declares", "decorates", "transforms", "reacts", "speaks"], clientKb: 1, slots: { head: "./head.tsx", "body-end": "./beacon.tsx" }, filters: { title: "./title.ts" }, stages: { transform: "./transform.ts" }, events: { push: "./push.ts" }, tools: "./tools.ts", network: ["plausible.io"], emitPrefixes: ["early/"] });
    expect(c.config.taxonomies.topic).toBeDefined();
    expect(warnings(c).filter((x) => x.startsWith("plugins[early]"))).toEqual([]);
    expect(PLUGIN_UNBUILT_KEYS).toEqual({});
    const text = renderPlugins(c.plugins, { jsKb: 1 });
    expect(text).toContain('capabilities: {"network":["plausible.io"],"client":"1kb"}');
    // the hook table (docs/09 §4.4 rule 3): every slot, filter, stage and event, with who fills it, in order
    expect(text).toContain("slots: { head: ./head.tsx, body-end: ./beacon.tsx }");
    expect(text).toContain("    stages: { transform: ./transform.ts }");
    expect(text).toContain("    events: { push: ./push.ts }   # may fetch plausible.io");
    expect(text).toContain("  slots: { head: [early], body-start: [], before-content: [], after-content: [], footer-end: [], body-end: [early] }");
    expect(text).toContain("  filters: { title: [early], description: [], excerpt: [], entries: [], jsonLd: [], route: [] }");
    expect(text).toContain("  stages: { transform: [early], emit: [] }");
    expect(text).toContain("  events: { publish: [], push: [early] }");
    expect(text).toContain("client: { declared: 1, budget: 1 }");
    // tier 4 is inspectable the way the others are: the module per plugin, and the MCP surface it adds
    expect(text).toContain("    tools: ./tools.ts");
    expect(text).toContain("  tools: [early]");
    expect(text).toContain("  prompts: []");
    expect(hooksOf(c.plugins)).toMatchObject({ any: true, slots: { head: ["early"], "body-end": ["early"] }, filters: { title: ["early"] }, stages: { transform: ["early"], emit: [] }, events: { publish: [], push: ["early"] } });
  });

  test("P4: a missing tools or prompts module refuses the plugin; a module of the wrong shape is a diagnostic and every other tier still runs", async () => {
    rmSync(R, { recursive: true, force: true });
    site("  - notool\n  - noprompt\n  - junk\n  - dupe\n  - speaker\n");
    // the two that name a module which is not there: found at load, not at the agent's first find_tools
    plugin("plugins/notool", "plugin:\n  name: notool\n  version: 1.0.0\n  api: 1\n  tools: ./tools.ts\n");
    plugin("plugins/noprompt", "plugin:\n  name: noprompt\n  version: 1.0.0\n  api: 1\n  prompts: ./prompts.ts\n");
    // and three whose module is there: one that is not a tools module at all, one that declares the same
    // action twice, and one that is right — each a diagnostic or a tool, never an exception
    plugin("plugins/junk", "plugin:\n  name: junk\n  version: 1.0.0\n  api: 1\n  tools: ./tools.ts\ntaxonomies:\n  topic: { attaches: [post] }\n");
    writeFileSync(join(R, "plugins/junk/tools.ts"), "export default \"not a module\";\n");
    plugin("plugins/dupe", "plugin:\n  name: dupe\n  version: 1.0.0\n  api: 1\n  tools: ./tools.ts\n");
    writeFileSync(join(R, "plugins/dupe/tools.ts"), "const a = { name: \"go\", description: \"d\", run: () => \"ok\" };\nexport default { actions: [a, a] };\n");
    plugin("plugins/speaker", "plugin:\n  name: speaker\n  version: 1.0.0\n  api: 1\n  description: Says things.\n  tools: ./tools.ts\n  prompts: ./prompts.ts\n");
    writeFileSync(join(R, "plugins/speaker/tools.ts"),
      "export default { description: \"Two verbs.\", keywords: [\"shout\"], actions: [\n" +
      "  { name: \"say\", description: \"says it\", input: { what: { type: \"string\" } }, required: [\"what\"], run: (a) => `said ${a.what}` },\n" +
      "  { name: \"count\", description: \"counts the pages\", run: (_a, ctx) => ({ ok: true, message: `${ctx.pages().length} pages`, data: { n: ctx.pages().length } }) },\n" +
      "  { name: \"boom\", description: \"throws\", run: () => { throw new Error(\"handler broke\") } },\n] };\n");
    writeFileSync(join(R, "plugins/speaker/prompts.ts"),
      "export default { prompts: [{ name: \"walk\", description: \"Walks through it.\", arguments: [{ name: \"topic\" }], render: (a, ctx) => `walk ${a.topic ?? \"?\"} on ${ctx.site.name}` }] };\n");

    const c = loadConfig(R);
    const e = errors(c);
    expect(e).toContainEqual("plugins[notool].plugin.tools: ./tools.ts is missing from plugins/notool — `tools` names one module relative to the plugin's own directory (plugins/notool/snypd.yaml:5 (plugin notool))");
    expect(e).toContainEqual("plugins[noprompt].plugin.prompts: ./prompts.ts is missing from plugins/noprompt — `prompts` names one module relative to the plugin's own directory (plugins/noprompt/snypd.yaml:5 (plugin noprompt))");
    expect(c.plugins[0]).toMatchObject({ found: true, loaded: false, why: "a hook module is missing (tools)" });
    expect(c.plugins[1]).toMatchObject({ found: true, loaded: false, why: "a hook module is missing (prompts)" });
    // `junk` loads — the module exists, so the manifest is honest; what is wrong with it is found when
    // the tool is asked for, and it costs `junk` its tool and not its taxonomy
    expect(c.plugins[2]).toMatchObject({ loaded: true, tiers: ["declares", "speaks"] });
    expect(c.config.taxonomies.topic).toBeDefined();
    expect(c.plugins[4]).toMatchObject({ loaded: true, tiers: ["speaks"], tools: "./tools.ts", prompts: "./prompts.ts" });

    const { sets, diagnostics } = await loadPluginTools(R, c);
    expect(diagnostics.map((d) => `${d.plugin}: ${d.message}`)).toEqual([
      expect.stringContaining("junk: ./tools.ts default-exports a string where a tools module exports { description?, keywords?, actions }"),
      expect.stringContaining("dupe: ./tools.ts declares the action `go` twice"),
    ]);
    // every diagnostic says the same thing about blast radius: one tier lost, the rest untouched
    for (const d of diagnostics) expect(d.message).toContain("every other tier of this plugin still runs");
    // `dupe` keeps the first `go` rather than losing the tool: a duplicate is a mistake in the second one
    expect(sets.map((x) => x.name)).toEqual(["dupe", "speaker"]);
    const speaker = sets.find((x) => x.name === "speaker")!;
    expect(speaker).toMatchObject({ plugin: "speaker", description: "Two verbs.", keywords: ["shout"] });
    expect(speaker.actions.map((a) => a.name)).toEqual(["say", "count", "boom"]);

    // the call: a string reply, a structured one, a required argument, and a handler that throws
    expect(await callPluginTool(speaker, "say", { what: "hi" })).toEqual({ ok: true, message: "said hi" });
    expect(await callPluginTool(speaker, "say", {})).toMatchObject({ ok: false, message: "what required for speaker › say" });
    expect(await callPluginTool(speaker, "count", {})).toMatchObject({ ok: true, message: "0 pages", data: { n: 0 } });
    expect(await callPluginTool(speaker, "boom", {})).toEqual({ ok: false, message: "handler broke" });
    expect(await callPluginTool(speaker, "nope", {})).toMatchObject({ ok: false, message: expect.stringContaining('unknown action "nope"') });

    // prompts are namespaced, so a plugin cannot shadow `get-started`
    const p = await loadPluginPrompts(R, c);
    expect(p.diagnostics).toEqual([]);
    expect(p.sets.map((x) => x.name)).toEqual(["speaker.walk"]);
    expect(p.sets[0]!.render({ topic: "tiers" })).toBe("walk tiers on P");
  });

  test("P3: a stage or event module that is not there refuses the plugin; emit prefixes default to the plugin's name, are normalised, and cannot be `/`", () => {
    rmSync(R, { recursive: true, force: true });
    site("  - nostage\n  - noevent\n  - emitter\n  - greedy\n  - mute\n");
    plugin("plugins/nostage", "plugin: { name: nostage, version: 0.0.1, api: 1, stages: { transform: ./t.ts } }\n");
    plugin("plugins/noevent", "plugin: { name: noevent, version: 0.0.1, api: 1, events: { publish: ./p.ts, push: ./q.ts } }\n");
    writeFileSync(join(R, "plugins/noevent/p.ts"), "export default () => 'ok';\n");
    // `emitter` declares two prefixes, spelt three ways; `greedy` asks for the root of dist/, which is what a prefix exists to refuse
    plugin("plugins/emitter", "plugin:\n  name: emitter\n  version: 0.0.1\n  api: 1\n  capabilities: { emit: [\"./og\", \"feeds/\", \"og\"] }\n  stages: { emit: ./e.ts }\n");
    writeFileSync(join(R, "plugins/emitter/e.ts"), "export default () => [];\n");
    plugin("plugins/greedy", "plugin:\n  name: greedy\n  version: 0.0.1\n  api: 1\n  capabilities: { emit: [\"/\", \"../\"] }\n  stages: { emit: ./e.ts }\n");
    writeFileSync(join(R, "plugins/greedy/e.ts"), "export default () => [];\n");
    // `mute` listens with no network: loaded, and its ctx.fetch will refuse every host (events.test.ts)
    plugin("plugins/mute", "plugin: { name: mute, version: 0.0.1, api: 1, events: { push: ./p.ts } }\n");
    writeFileSync(join(R, "plugins/mute/p.ts"), "export default () => 'ok';\n");
    const c = loadConfig(R);
    expect(c.ok).toBe(true);
    const e = errors(c);
    expect(e).toContainEqual("plugins[nostage].plugin.stages.transform: ./t.ts is missing from plugins/nostage — a stage names a module relative to the plugin's own directory (plugins/nostage/snypd.yaml:1 (plugin nostage))");
    expect(e).toContainEqual("plugins[nostage].plugin: a hook module is missing (stages.transform) — not loaded (plugins/nostage/snypd.yaml:1 (plugin nostage))");
    expect(e).toContainEqual("plugins[noevent].plugin.events.push: ./q.ts is missing from plugins/noevent — an event names a module relative to the plugin's own directory (plugins/noevent/snypd.yaml:1 (plugin noevent))");
    expect(c.plugins.map((p) => `${p.name}:${p.loaded}`)).toEqual(["nostage:false", "noevent:false", "emitter:true", "greedy:true", "mute:true"]);
    expect(c.plugins[2]!.emitPrefixes).toEqual(["og/", "feeds/", "og/"]);
    expect(c.plugins[3]!.emitPrefixes).toEqual(["greedy/"]);
    expect(warnings(c).filter((x) => x.startsWith("plugins[greedy]"))).toEqual([
      'plugins[greedy].plugin.capabilities.emit[0]: emit prefix "/" would allow writing anywhere in dist/ — ignored; a prefix is a directory the plugin owns, like `greedy/` (plugins/greedy/snypd.yaml:5 (plugin greedy))',
      'plugins[greedy].plugin.capabilities.emit[1]: emit prefix "../" would allow writing anywhere in dist/ — ignored; a prefix is a directory the plugin owns, like `greedy/` (plugins/greedy/snypd.yaml:5 (plugin greedy))',
    ]);
    expect(c.plugins[4]).toMatchObject({ tiers: ["reacts"], network: [], events: { push: "./p.ts" } });
    const text = renderPlugins(c.plugins);
    expect(text).toContain("    stages: { emit: ./e.ts }   # writes under og/, feeds/, og/");
    expect(text).toContain("    events: { push: ./p.ts }   # no network: its ctx.fetch refuses every host");
    expect(text).toContain("bundled: [analytics, autolink, changelog, indexnow]");
  });

  test("P2: a slot or filter that names a module that is not there refuses the plugin at load, naming the file and the line", () => {
    rmSync(R, { recursive: true, force: true });
    site("  - gone\n");
    plugin("plugins/gone", "plugin:\n  name: gone\n  version: 1.0.0\n  api: 1\n  slots: { head: ./slots/head.tsx }\n  filters: { title: ./title.ts, route: ./route.ts }\ntaxonomies:\n  topic: { attaches: [post] }\n");
    writeFileSync(join(R, "plugins/gone/title.ts"), "export default (v: string) => v;\n");
    const c = loadConfig(R);
    expect(c.ok).toBe(true);
    expect(c.plugins[0]).toMatchObject({ loaded: false, why: "2 hook modules are missing (slots.head, filters.route)" });
    expect(errors(c)).toEqual([
      "plugins[gone].plugin.slots.head: ./slots/head.tsx is missing from plugins/gone — a slot names a module relative to the plugin's own directory (plugins/gone/snypd.yaml:5 (plugin gone))",
      "plugins[gone].plugin.filters.route: ./route.ts is missing from plugins/gone — a filter names a module relative to the plugin's own directory (plugins/gone/snypd.yaml:6 (plugin gone))",
      "plugins[gone].plugin: 2 hook modules are missing (slots.head, filters.route) — not loaded (plugins/gone/snypd.yaml:1 (plugin gone))",
    ]);
    expect(c.config.taxonomies).not.toHaveProperty("topic");   // refused: root keys did not merge
    expect(hooksOf(c.plugins).any).toBe(false);
  });

  test("P2: client JS is a budget line (decision 84) — declared, summed in order, refused over budget with the remedy, and the site's number is the only one that counts", () => {
    rmSync(R, { recursive: true, force: true });
    const decl = (name: string, kb: string) => { plugin(`plugins/${name}`, `plugin:\n  name: ${name}\n  version: 1.0.0\n  api: 1\n  capabilities: { client: ${kb} }\n  slots: { body-end: ./b.ts }\n`); writeFileSync(join(R, `plugins/${name}/b.ts`), "export default () => '<script></script>';\n"); };
    decl("one", "1kb"); decl("two", "1.5 KB"); decl("three", "2");
    // budget 0 (the spec default): the first plugin that asks for bytes is refused, and the remedy names the number that would afford it
    site("  - one\n");
    let c = loadConfig(R);
    expect(c.ok).toBe(true);
    expect(c.plugins[0]).toMatchObject({ loaded: false, clientKb: 1, why: "over the client JS budget (1 KB asked, 0 KB left)" });
    expect(errors(c)).toEqual([
      "plugins[one].plugin.capabilities.client: asks for 1 KB of client JS; this site's jsKb budget is 0 KB. Set bench.budgets.jsKb: 1 to afford it, or remove the plugin (snypd.yaml:4)",
      "plugins[one]: over the client JS budget (1 KB asked, 0 KB left) — not loaded (snypd.yaml:4)",
    ]);
    expect(clientKbDeclared(c.plugins)).toBe(0);
    // afforded: the budget covers it, and the resource says what was declared against what
    site("  - one\n", "bench: { budgets: { jsKb: 2 } }\n");
    c = loadConfig(R);
    expect(c.plugins[0]).toMatchObject({ loaded: true, clientKb: 1 });
    expect(errors(c)).toEqual([]);
    expect(renderPlugins(c.plugins, { jsKb: c.config.bench.budgets.jsKb as number })).toContain("client: { declared: 1, budget: 2 }");
    // summed in `plugins:` order: 1 + 1.5 fits in 3, and the third (2 KB) is the one over — the diagnostic says what the others already took and is attributed to the budget's own line
    site("  - one\n  - two\n  - three\n", "bench:\n  budgets:\n    jsKb: 3\n");
    c = loadConfig(R);
    expect(c.plugins.map((p) => p.loaded)).toEqual([true, true, false]);
    expect(errors(c)[0]).toBe("plugins[three].plugin.capabilities.client: asks for 2 KB of client JS; this site's jsKb budget is 3 KB and 2.5 KB of it is already declared by the plugins before it. Set bench.budgets.jsKb: 5 to afford it, or remove the plugin (snypd.yaml:9)");
    expect(clientKbDeclared(c.plugins)).toBe(2.5);
    // reorder the list and a different plugin is the one refused: no priorities, one list (docs/09 §4.4 rule 2)
    site("  - three\n  - one\n  - two\n", "bench: { budgets: { jsKb: 3 } }\n");
    c = loadConfig(R);
    expect(c.plugins.map((p) => `${p.name}:${p.loaded}`)).toEqual(["three:true", "one:true", "two:false"]);
    // the env layer's budget wins over the site's, as every env value does
    writeFileSync(join(R, "snypd.prod.yaml"), "bench: { budgets: { jsKb: 10 } }\n");
    expect(loadConfig(R, { env: "prod" }).plugins.every((p) => p.loaded)).toBe(true);
    rmSync(join(R, "snypd.prod.yaml"));
    // a plugin cannot raise the budget for itself: `bench.budgets.jsKb` in a plugin's root keys merges like any root key, and the check still reads the site's number
    plugin("plugins/greedy", "plugin:\n  name: greedy\n  version: 1.0.0\n  api: 1\n  capabilities: { client: 4kb }\n  slots: { body-end: ./b.ts }\nbench: { budgets: { jsKb: 99 } }\n");
    writeFileSync(join(R, "plugins/greedy/b.ts"), "export default () => '';\n");
    site("  - greedy\n");
    c = loadConfig(R);
    expect(c.plugins[0]!.loaded).toBe(false);
    expect(errors(c)[0]).toContain("this site's jsKb budget is 0 KB");
    expect(c.config.bench.budgets.jsKb).toBe(0);   // refused, so its root keys did not merge either
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

// ── U3: the settings schema (docs/09 §4.2) ───────────────────────────────────────────────────────
describe("theme settings (U3)", () => {
  const R = "corpora/_test/settings";
  const site = (theme: string, extra = "") => { mkdirSync(R, { recursive: true }); writeFileSync(join(R, "snypd.yaml"), `snypd: 1\nsite: { name: S, url: https://s.example }\ntheme:\n  use: ${theme}\n${extra}`); };
  const theme = (name: string, text: string) => { mkdirSync(join(R, "themes", name), { recursive: true }); writeFileSync(join(R, "themes", name, "theme.yaml"), text); };
  const errors = (c: ReturnType<typeof loadConfig>) => c.diagnostics.filter((d) => d.level === "error").map((d) => `${d.path}: ${d.message}`);
  const warnings = (c: ReturnType<typeof loadConfig>) => c.diagnostics.filter((d) => d.level === "warning").map((d) => `${d.path}: ${d.message}`);
  const SIX = `settings:
  - { id: logo,       type: image,     label: Logo, group: Identity }
  - { id: tagline,    type: text,      label: Tagline, group: Identity }
  - { id: showDates,  type: boolean,   label: Dates, group: Posts, default: true }
  - { id: dateFormat, type: select,    label: Format, group: Posts, default: iso, options: [iso, long, short] }
  - { id: footerNote, type: richtext,  label: Note, group: Footer }
  - { id: social,     type: link_list, label: Social, group: Footer }
`;
  beforeAll(() => rmSync(R, { recursive: true, force: true }));
  afterAll(() => rmSync(R, { recursive: true, force: true }));

  test("declared in theme.yaml, never merged into the config", () => {
    theme("six", `theme: six\nlayouts: [post]\n${SIX}`);
    site("six");
    const c = loadConfig(R);
    expect(c.ok).toBe(true);
    expect(c.settingDecls.map((d) => d.id)).toEqual(["logo", "tagline", "showDates", "dateFormat", "footerNote", "social"]);
    // The one rule this key has that no other theme.yaml key has: it does not merge. `theme.settings` is
    // the value map and nothing else, so a site that has answered nothing has an empty one.
    expect(c.config.theme.settings).toEqual({});
    expect(JSON.stringify(c.raw)).not.toContain("footerNote");
    // Free of charge: the declarations come off the parse the chain walk already did.
    expect(themeSettings(c).map((s) => `${s.id}:${s.type}`)).toEqual(["logo:image", "tagline:text", "showDates:boolean", "dateFormat:select", "footerNote:richtext", "social:link_list"]);
    expect(settingValues(c)).toEqual({ showDates: true, dateFormat: "iso" });   // the two with defaults
  });

  test("a declaration is strict, and a select declares its options", () => {
    theme("bad", `theme: bad\nsettings:\n  - { id: logo, type: image, label: Logo, lable: typo }\n  - { id: pick, type: select, label: Pick }\n  - { id: n, type: number, label: N, options: [a] }\n  - { id: fine, type: text, label: Fine }\n`);
    site("bad");
    const c = loadConfig(R);
    const e = errors(c).join("\n");
    expect(e).toContain(`unknown key "lable" in theme.yaml`);
    expect(e).toContain("a select declares its options");
    expect(e).toContain("options belong to a select, not a number");
    // An entry that does not validate is refused whole — a declaration with a key the loader does not
    // understand is a declaration nobody can rely on — and the sound ones around it still load.
    expect(c.settingDecls.map((d) => d.id)).toEqual(["fine"]);
  });

  test("a child appends to its parent's list and replaces an id where it stands", () => {
    theme("parent", `theme: parent\nlayouts: [post]\n${SIX}`);
    theme("child", `theme: child\nextends: parent\nsettings:\n  - { id: dateFormat, type: select, label: Format, default: long, options: [long, short] }\n  - { id: accentWords, type: boolean, label: Accent, default: false }\n`);
    site("child");
    const c = loadConfig(R);
    expect(c.settingDecls.map((d) => d.id)).toEqual(["logo", "tagline", "showDates", "dateFormat", "footerNote", "social", "accentWords"]);
    const rows = themeSettings(c);
    const fmt = rows.find((s) => s.id === "dateFormat")!;
    expect([fmt.default, fmt.options, fmt.declaredBy]).toEqual(["long", ["long", "short"], "child"]);
    expect(rows.find((s) => s.id === "showDates")!.declaredBy).toBe("parent");
  });

  test("a value is checked against the declaration: wrong shape is an error, unknown id a warning", () => {
    theme("six", `theme: six\nlayouts: [post]\n${SIX}`);
    site("six", `  settings:\n    showDates: "yes"\n    dateFormat: medium\n    social: [{ label: Mastodon, url: "https://m.example/@s" }]\n    leftover: 3\n`);
    const c = loadConfig(R);
    expect(errors(c)).toEqual([
      `theme.settings.showDates: expected true or false, got "yes" (boolean)`,
      `theme.settings.dateFormat: expected one of iso | long | short, got "medium" (select: iso | long | short)`,
    ]);
    // A theme switch leaves values behind exactly as it leaves token overrides behind: a warning, never
    // a reason a site stops building.
    expect(warnings(c).join("\n")).toContain(`theme \`six\` declares no setting "leftover"`);
    expect(strandedSettings(c)).toEqual(["leftover"]);
    expect(c.ok).toBe(false);   // and `setConfig` rolls back on that, which is why a hand edit is caught
    const rows = themeSettings(c);
    expect(rows.find((s) => s.id === "showDates")!.invalid).toBe(`expected true or false, got "yes"`);
    expect(rows.find((s) => s.id === "showDates")!.value).toBe(true);        // the refused value reads the default
    expect(rows.find((s) => s.id === "social")!.value).toEqual([{ label: "Mastodon", url: "https://m.example/@s" }]);
    expect(rows.find((s) => s.id === "social")!.set).toBe(true);
  });

  test("a theme with no settings is unaffected", () => {
    theme("plain", `theme: plain\nlayouts: [post]\ntokens: { color.accent: "#000" }\n`);
    site("plain");
    const c = loadConfig(R);
    expect(c.ok).toBe(true);
    expect(c.settingDecls).toEqual([]);
    expect(themeSettings(c)).toEqual([]);
    expect(settingValues(c)).toEqual({});
    expect(strandedSettings(c)).toEqual([]);
  });

  test("every type refuses what it is not", () => {
    const decl = (type: string, extra: object = {}) => ({ id: "x", type, label: "X", ...extra }) as Parameters<typeof settingValue>[0];
    expect(settingValue(decl("text"), 3)).toEqual({ ok: false, why: "expected a string, got number" });
    expect(settingValue(decl("url"), "example.com").ok).toBe(false);
    expect(settingValue(decl("url"), "/contact")).toEqual({ ok: true, value: "/contact" });
    expect(settingValue(decl("image"), "logo.svg").ok).toBe(false);       // site-relative, or a host: never a bare filename
    expect(settingValue(decl("number", { min: 1, max: 3 }), 4)).toEqual({ ok: false, why: "4 is above the maximum 3" });
    expect(settingValue(decl("number"), "2").ok).toBe(false);             // a string that looks like one is not one
    expect(settingValue(decl("boolean"), "true").ok).toBe(false);
    expect(settingValue(decl("link_list"), [{ label: "X" }]).ok).toBe(false);
    expect(settingValue(decl("link_list"), [{ label: "X", url: "https://x.example", rel: "me" }]).ok).toBe(true);
    // H0 / finding 10: the item in a list of links is a link, and gets the `url` setting's scheme rule.
    expect(settingValue(decl("link_list"), [{ label: "X", url: "javascript:fetch(1)" }]).ok).toBe(false);
    expect(settingValue(decl("link_list"), [{ label: "X", url: "mailto:a@b.example" }]).ok).toBe(true);
  });

  // ── H0 / E5 (decision 120) ──────────────────────────────────────────────────────────────────────
  test("E5 a value may not change the meaning of the sheet", () => {
    const decl = (type: string) => ({ id: "x", type, label: "X" }) as Parameters<typeof settingValue>[0];
    // Everything `editorial` actually ships passes — the grammar is a floor, not a taste.
    for (const v of ["light-dark(#fdfcfa, #12110f)", "clamp(1.0625rem, 0.98rem + 0.42vw, 1.1875rem)",
                     "'Iowan Old Style', 'Palatino Linotype', Palatino, Charter, Georgia, ui-serif, serif",
                     "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
                     "0.8125rem", "34rem", "4px", "oklch(from var(--color-accent) calc(l - .08) c h)",
                     "color-mix(in oklab, var(--a) 40%, white)", "Söhne, sans-serif"])
      expect(cssValue(v)).toEqual({ ok: true, value: v });
    expect(cssValue(1.65)).toEqual({ ok: true, value: "1.65" });

    // …and the six shapes that would close the block, comment out what follows, or reach the network.
    const why = (v: unknown) => { const r = cssValue(v); expect(r.ok).toBe(false); return (r as { why: string }).why; };
    expect(why("red } body { display: none } :root { --x: red")).toContain("would end the declaration");
    expect(why("red; background: black")).toContain("would end the declaration");
    expect(why("red</style>")).toContain("would end the declaration");     // the sheet is inlined in the preview
    expect(why("red /* ")).toContain("comment out what follows");
    expect(why("light-dark(#fff, #000")).toContain("unbalanced `(`");
    expect(why("url(/media/x.png)")).toContain("a value is not where a site reaches the network");
    expect(why("url(https://evil.example/?leak)")).toContain("`url()` is not a CSS function");
    expect(why("")).toContain("empty string");
    expect(why("a".repeat(300))).toContain("stops at 256");
    // The three kinds that reach a stylesheet go through it; the three that are prose do not.
    expect(settingValue(decl("color"), "red } body {").ok).toBe(false);
    expect(settingValue(decl("size"), "url(x)").ok).toBe(false);
    expect(settingValue(decl("font"), "'Iowan Old Style', serif").ok).toBe(true);
    expect(settingValue(decl("richtext"), "a } b {").ok).toBe(true);      // markdown, not CSS
  });

  test("E5 a refused token names the token and the line that wrote it", () => {
    const root = "corpora/_test/token-guard";
    rmSync(root, { recursive: true, force: true });
    mkdirSync(join(root, "themes/t"), { recursive: true });
    writeFileSync(join(root, "themes/t/theme.yaml"), "theme: t\ntokens:\n  color.accent: { default: \"#8a3324\" }\n  size.body: { default: 1rem }\n");
    writeFileSync(join(root, "snypd.yaml"), "snypd: 1\nsite: { name: T, url: https://t.example }\ntheme:\n  use: t\n  tokens:\n    color.accent: \"red } body { display: none\"\n");
    const c = loadConfig(root);
    expect(c.ok).toBe(false);
    const d = c.diagnostics.find((x) => x.path === "theme.tokens[color.accent]")!;
    expect(d.level).toBe("error");
    expect(d.message).toContain("token `color.accent`");
    expect(d.where).toContain("snypd.yaml:6");                            // the site's line, not the theme's
    expect(d.where).toContain("overrides themes/t/theme.yaml:3");         // and the default it displaced
    // A theme's own default is checked on the same pass, and then the theme's file is the one named.
    writeFileSync(join(root, "themes/t/theme.yaml"), "theme: t\ntokens:\n  color.accent: { default: \"#8a3324\" }\n  size.body: { default: \"1rem; } html { display: none\" }\n");
    writeFileSync(join(root, "snypd.yaml"), "snypd: 1\nsite: { name: T, url: https://t.example }\ntheme: { use: t }\n");
    const c2 = loadConfig(root);
    expect(c2.ok).toBe(false);
    expect(c2.diagnostics.find((x) => x.path === "theme.tokens[size.body]")!.where).toContain("theme.yaml:4");
  });
});

// ── U6a: style variations (docs/10 §5.2, decision 91) ────────────────────────────────────────────
/**
 * B1, decision 118 — the half of the webfont contract that lives in the config layer. What reaches `dist/`
 * is `render.test.ts`'s "the webfont (B1)"; what a bad declaration does before anything reaches anywhere
 * is here, because `theme.yaml` is validated strictly with file:line (decision 73) and a font is now one
 * of the things it can get wrong.
 */
describe("the webfont declaration (B1)", () => {
  const R = "corpora/_test/font-decl-core";
  const site = (theme: string, extra = "") => { mkdirSync(R, { recursive: true }); writeFileSync(join(R, "snypd.yaml"), `snypd: 1\nsite: { name: S, url: https://s.example }\ntheme:\n  use: ${theme}\n${extra}`); };
  const theme = (name: string, text: string) => { mkdirSync(join(R, "themes", name), { recursive: true }); writeFileSync(join(R, "themes", name, "theme.yaml"), text); };
  const errors = (c: ReturnType<typeof loadConfig>) => c.diagnostics.filter((d) => d.level === "error").map((d) => `${d.path}: ${d.message}`);
  const FONT = (extra: string) => `font:
  family: T
  file: ./fonts/t.woff2
  ${extra}
  fallback: { local: Georgia, size-adjust: 100%, ascent-override: 100%, descent-override: 30%, line-gap-override: 0% }
`;
  beforeEach(() => rmSync(R, { recursive: true, force: true }));

  test("a face over decision 118's ceiling is an error, named and placed", () => {
    theme("f", `theme: f\n${FONT("kb: 64")}`);
    site("f");
    const c = loadConfig(R);
    expect(c.ok).toBe(false);
    expect(errors(c).join("\n")).toMatch(/theme\.font\.kb: at most 40/);
    // MAX_FONT_KB is the one place the ceiling is written, so the message and the loader cannot disagree.
    expect(MAX_FONT_KB).toBe(40);
  });

  test("one format, and it is the one every browser has read since 2020", () => {
    theme("f", `theme: f\n${FONT("kb: 30").replace("t.woff2", "t.ttf")}`);
    site("f");
    expect(errors(loadConfig(R)).join("\n")).toMatch(/theme\.font\.file: a \.woff2/);
  });

  test("the fallback's overrides are required, because a face without them is the shift the budget bought off", () => {
    theme("f", "theme: f\nfont: { family: T, file: ./fonts/t.woff2, kb: 30 }\n");
    site("f");
    expect(errors(loadConfig(R)).join("\n")).toMatch(/theme\.font\.fallback/);
  });

  test("decision 131: a declaration, so it does not merge — and a site cannot write one", () => {
    theme("f", `theme: f\n${FONT("kb: 30")}`);
    site("f");
    const c = loadConfig(R);
    // Nothing under `theme.font` in the merged config: `snypd://config` is what a site answered, and
    // there is no question here for it to have answered.
    expect((c.config.theme as Record<string, unknown>).font).toBeUndefined();
    expect(c.ok).toBe(true);
    // And the key has no meaning in snypd.yaml either, which is the other half of decision 128's rule:
    // better to not have the key than to have to warn about one that could never be applied.
    site("f", "  font: { family: Other }\n");
    const c2 = loadConfig(R);
    expect(c2.ok).toBe(true);                                          // inert, never fatal
    expect(c2.diagnostics.map((d) => `${d.path}: ${d.message}`).join("\n"))
      .toMatch(/theme\.font does nothing here/);
  });
});

describe("theme variations (U6a)", () => {
  const R = "corpora/_test/variations";
  const site = (theme: string, extra = "") => { mkdirSync(R, { recursive: true }); writeFileSync(join(R, "snypd.yaml"), `snypd: 1\nsite: { name: S, url: https://s.example }\ntheme:\n  use: ${theme}\n${extra}`); };
  const theme = (name: string, text: string) => { mkdirSync(join(R, "themes", name), { recursive: true }); writeFileSync(join(R, "themes", name, "theme.yaml"), text); };
  const errors = (c: ReturnType<typeof loadConfig>) => c.diagnostics.filter((d) => d.level === "error").map((d) => `${d.path}: ${d.message}`);
  const warnings = (c: ReturnType<typeof loadConfig>) => c.diagnostics.filter((d) => d.level === "warning").map((d) => `${d.path}: ${d.message}`);
  /** The five tokens every fixture below declares, so "exactly the ones it names" has something to be exact about. */
  const FIVE = `tokens:
  color.bg:     { default: "#fff", customisable: true, kind: color }
  color.text:   { default: "#111", customisable: true, kind: color }
  color.accent: { default: "#8a3324", customisable: true, kind: color }
  measure:      { default: "34rem", customisable: true, kind: size }
  radius:       { default: "4px", customisable: false, kind: size }
variations:
  paper: { description: "The defaults." }
  ink:   { description: "Dark.", tokens: { color.bg: "#12110f", color.text: "#e8e4dc" } }
`;
  /** Flattened token values, which is what the renderer actually emits — the level "exactly" is measured at. */
  const values = (c: ReturnType<typeof loadConfig>) =>
    Object.fromEntries(Object.entries(c.config.theme.tokens as Record<string, unknown>)
      .map(([k, v]) => [k, String(typeof v === "object" && v !== null ? (v as { default: unknown }).default : v)]));
  beforeAll(() => rmSync(R, { recursive: true, force: true }));
  afterAll(() => rmSync(R, { recursive: true, force: true }));

  test("declared in theme.yaml, never merged into the config", () => {
    theme("five", `theme: five\nlayouts: [post]\n${FIVE}`);
    site("five");
    const c = loadConfig(R);
    expect(c.ok).toBe(true);
    expect(c.variations.map((v) => v.name)).toEqual(["paper", "ink"]);
    // `variations:` follows `settings:`: a declaration, so it does not become a config key. A site that
    // could write `theme.variations` in snypd.yaml would be writing one nothing could ever apply — the
    // site layer merges after the chosen variation has already landed.
    expect(JSON.stringify(c.raw)).not.toContain("variations");
    expect((c.config.theme as Record<string, unknown>).variations).toBeUndefined();
    // Unset: the first variation is the active one, because a theme lists its own defaults first.
    expect(themeVariations(c).map((v) => [v.name, v.active, v.tokenCount])).toEqual([["paper", true, 0], ["ink", false, 2]]);
  });

  test("switching changes exactly the tokens the variation names — the session's exit criterion", () => {
    theme("five", `theme: five\nlayouts: [post]\n${FIVE}`);
    site("five");
    const before = values(loadConfig(R));
    site("five", "  variation: ink\n");
    const c = loadConfig(R);
    const after = values(c);
    expect(c.ok).toBe(true);
    // Exactly: the set of keys whose value moved is the set of keys `ink` declares, and no token appeared
    // or vanished. A variation that recoloured something it had not named would fail here, and so would
    // one that added a token — which is why `VariationSchema` takes values and not declarations.
    const moved = Object.keys(after).filter((k) => after[k] !== before[k]).sort();
    expect(moved).toEqual(["color.bg", "color.text"]);
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    expect([after["color.bg"], after["color.text"]]).toEqual(["#12110f", "#e8e4dc"]);
    expect(after["color.accent"]).toBe("#8a3324");
    // And it is the theme's own look, not this site's: `overridden` is what a theme switch reports as
    // stranded, and eleven of `ink`'s tokens being called site overrides is the bug this asserts against.
    const rows = themeTokens(c);
    expect(rows.filter((t) => t.overridden)).toEqual([]);
    expect(rows.find((t) => t.name === "color.bg")).toMatchObject({ variation: "ink", value: "#12110f", default: "#fff" });
    expect(rows.find((t) => t.name === "color.accent")!.variation).toBeUndefined();
    expect(themeVariations(c).map((v) => v.active)).toEqual([false, true]);
  });

  test("precedence: theme defaults ← variation ← the site's own tokens", () => {
    theme("five", `theme: five\nlayouts: [post]\n${FIVE}`);
    site("five", `  variation: ink\n  tokens:\n    color.bg: "#000000"\n`);
    const c = loadConfig(R);
    expect(c.ok).toBe(true);
    expect(values(c)["color.bg"]).toBe("#000000");        // the site wins over the variation
    expect(values(c)["color.text"]).toBe("#e8e4dc");      // which it did not name, so the variation stands
    const rows = themeTokens(c);
    expect(rows.find((t) => t.name === "color.bg")).toMatchObject({ overridden: true, variation: undefined });
    expect(rows.find((t) => t.name === "color.text")).toMatchObject({ overridden: false, variation: "ink" });
    // Provenance names the line in the theme's own file that wrote the variation's value, and what it
    // overrode — which is the whole reason the variation is a layer and not a mutation of the map.
    expect(c.explain("theme.tokens[color.text]")).toContain("five/theme.yaml:");
    expect(c.explain("theme.tokens[color.text]")).toContain("five › ink");
    expect(c.explain("theme.tokens[color.bg]")).toContain("snypd.yaml:");
  });

  test("a name the theme does not ship is a warning, and its own tokens render", () => {
    theme("five", `theme: five\nlayouts: [post]\n${FIVE}`);
    site("five", "  variation: nope\n");
    const c = loadConfig(R);
    // A theme switch strands a variation exactly as it strands a token override, and neither is a reason
    // a site stops building.
    expect(c.ok).toBe(true);
    expect(warnings(c).join("\n")).toContain(`theme \`five\` declares no variation "nope" — it ships paper, ink`);
    expect(values(c)["color.bg"]).toBe("#fff");
    expect(strandedVariation(c)).toBe("nope");
    expect(themeVariations(c).some((v) => v.active)).toBe(false);
  });

  test("a variation may retune a token; it may not invent one, and its values are checked like any other", () => {
    theme("odd", `theme: odd\nlayouts: [post]\ntokens:\n  color.bg: { default: "#fff", customisable: true, kind: color }\nvariations:\n  a: { description: "Invents.", tokens: { color.nope: "#000" } }\n  b: { description: "Closes the block.", tokens: { color.bg: "#fff } html { display: none" } }\n  c: { description: "Fetches.", tokens: { color.bg: "url(https://e.example/x.png)" } }\n`);
    site("odd", "  variation: a\n");
    const a = loadConfig(R);
    // An invented token has no kind, no description and nothing for `theme` › set_tokens to check against
    // — a custom property the theme's own stylesheet never reads. Warned with the line; X1's `theme check`
    // is where the same finding stops a theme reaching the shelf.
    expect(a.ok).toBe(true);
    const w = a.diagnostics.find((d) => d.level === "warning" && d.path.includes("color.nope"))!;
    expect(w.message).toContain("variation `a` sets `color.nope`, which theme `odd` does not declare");
    expect(w.where).toMatch(/odd\/theme\.yaml:\d+/);
    // Decision 120 covers a variation for free: its tokens land in `theme.tokens` like any other, so the
    // one gate between a value and `:root { … }` is the one gate for these too.
    site("odd", "  variation: b\n");
    expect(errors(loadConfig(R)).join("\n")).toContain("cannot appear in a CSS value");
    site("odd", "  variation: c\n");
    expect(errors(loadConfig(R)).join("\n")).toContain("it would fetch");
  });

  test("a child inherits its parent's variations and replaces one where it stands", () => {
    theme("parent", `theme: parent\nlayouts: [post]\n${FIVE}`);
    theme("child", `theme: child\nextends: parent\nvariations:\n  ink:  { description: "Cooler.", tokens: { color.bg: "#0b0d10" } }\n  wide: { description: "Roomier.", tokens: { measure: "42rem" } }\n`);
    site("child", "  variation: ink\n");
    const c = loadConfig(R);
    expect(c.ok).toBe(true);
    // Nearest declarer wins, and the parent's order is kept — the rule a part, a primitive and a setting
    // already follow (U1 decision 72, U3).
    expect(c.variations.map((v) => [v.name, v.declaredBy])).toEqual([["paper", "parent"], ["ink", "child"], ["wide", "child"]]);
    expect(values(c)["color.bg"]).toBe("#0b0d10");
    // Replaced *whole*: the child's `ink` does not inherit the parent's `color.text`.
    expect(values(c)["color.text"]).toBe("#111");
  });

  test("a theme with no variations is unaffected", () => {
    theme("plain", `theme: plain\nlayouts: [post]\ntokens: { color.accent: "#000" }\n`);
    site("plain");
    const c = loadConfig(R);
    expect(c.ok).toBe(true);
    expect(c.variations).toEqual([]);
    expect(themeVariations(c)).toEqual([]);
    expect(strandedVariation(c)).toBeUndefined();
  });
});

/**
 * X1 — colour, only as far as the contrast gate needs it (color.ts).
 *
 * The reason this is arithmetic and not a browser is in the module's header. The reason it is tested
 * against numbers taken from elsewhere is here: a converter checked only against itself is a converter
 * that is consistently wrong. White on black is 21:1 by definition, `oklch(1 0 0)` is white by
 * definition, and the two relative-colour derivations below are the ones `editorial` and `technical`
 * actually ship, so a regression in the matrices moves a ratio the other tests assert.
 */
describe("colour, far enough to answer `is this readable` (X1)", () => {
  const v = tokenVars({ "color.bg": "oklch(0.17 0.012 250)", "color.text": "oklch(0.91 0.008 250)" });
  const r = (s: string, m: "light" | "dark" = "light") => resolveColor(s, m, v);
  const ratio = (a: string, b: string, m: "light" | "dark" = "light") => +contrastRatio(r(a, m)!, r(b, m)!).toFixed(2);

  test("the ends of the scale are exact, and every spelling of a colour reaches the same place", () => {
    expect(ratio("#fff", "#000")).toBe(21);
    expect(ratio("#ffffff", "white")).toBe(1);
    expect(r("oklch(1 0 0)")!.r).toBeCloseTo(1, 5);
    expect(r("rgb(255 128 0)")).toEqual(r("#ff8000"));
    expect(r("rgb(100%, 50.2%, 0%)")!.g).toBeCloseTo(0.502, 3);
    expect(r("hsl(0 100% 50%)")).toEqual({ r: 1, g: 0, b: 0 });
    // OKLab's midpoint is perceptual, not arithmetic: half way from white to black is #636363, not #808080.
    expect(Math.round(r("color-mix(in oklab, #ffffff 50%, #000000)")!.r * 255)).toBe(99);
  });

  test("`light-dark()` has two answers and the mode picks one, all the way down a var chain", () => {
    expect(r("light-dark(#fdfcfa, #12110f)")).toEqual(r("#fdfcfa"));
    expect(r("light-dark(#fdfcfa, #12110f)", "dark")).toEqual(r("#12110f"));
    // The nested case is the one that matters: a var() inside a pair resolves on the side it was reached from.
    const nested = tokenVars({ "a": "light-dark(#ffffff, #000000)", "b": "var(--a)" });
    expect(resolveColor("var(--b)", "light", nested)).toEqual({ r: 1, g: 1, b: 1 });
    expect(resolveColor("var(--b)", "dark", nested)).toEqual({ r: 0, g: 0, b: 0 });
  });

  test("relative colour derives from the token it names, calc and all", () => {
    // `editorial`'s dark surface: the background, four and a half hundredths lighter. Lighter, and only just.
    const bg = r("oklch(0.17 0.012 250)")!, surface = r("oklch(from var(--color-bg) calc(l + 0.045) c h)")!;
    expect(luminance(surface)).toBeGreaterThan(luminance(bg));
    expect(contrastRatio(surface, bg)).toBeLessThan(1.5);
    // …and its muted text: the body colour, a quarter of a lightness step down, still over 4.5:1 on it.
    expect(ratio("oklch(from var(--color-text) calc(l - 0.24) calc(c + 0.004) h)", "oklch(0.17 0.012 250)")).toBeGreaterThan(4.5);
    expect(ratio("oklch(0.91 0.008 250)", "oklch(0.17 0.012 250)")).toBe(14.64);
  });

  test("what it cannot resolve is `undefined`, and never a colour it guessed", () => {
    // Each of these has a defined rendering that depends on something this function does not have: the
    // element's inherited colour, a token nobody declared, and whatever is painted behind the alpha.
    for (const bad of ["currentColor", "var(--never-declared)", "#ffffff80", "rgb(0 0 0 / 50%)", "lch(50% 40 30)", "lightgoldenrodyellow", ""])
      expect({ bad, got: r(bad) }).toEqual({ bad, got: undefined });
    // A var() cycle is legal YAML, ignored by CSS, and would be a stack overflow here without the depth cap.
    const loop = tokenVars({ "a": "var(--b)", "b": "var(--a)" });
    expect(resolveColor("var(--a)", "light", loop)).toBeUndefined();
  });
});
