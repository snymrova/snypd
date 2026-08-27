import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, parsePath, parseYaml, pathKey, REPLACE } from "./index";

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
  w("plugins/snypd-plugin-seo/snypd.yaml", `types:\n  post:\n    fields:\n      seoTitle: { type: string, max: 70 }\n    taxonomies: [seoTopic]\ntaxonomies:\n  seoTopic: { attaches: [post] }\njobs:\n  seoAudit: { every: 1d }\n`);
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
    expect(c.layers.map((l) => `${l.name}${l.from ? ":" + l.from : ""}${l.found ? "" : "!"}`)).toEqual(["spec", "theme:ink", "plugin:snypd-plugin-seo", "plugin:snypd-plugin-newsletter!", "site", "env:prod"]);
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
    expect(y).toContain("#   4. plugin snypd-plugin-newsletter — not found");
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
    expect(theme.found).toBe(true); expect(theme.file!.endsWith("themes/base/theme.yaml")).toBe(true); expect(theme.dir!.endsWith("themes/base")).toBe(true);
  });
});
