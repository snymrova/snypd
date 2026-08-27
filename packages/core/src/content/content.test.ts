import { describe, expect, test } from "bun:test";
import { lintMarkdown, parseMarkdown, buildTree, countNodes, MdastCache, lintSite, hashSource, type Diagnostic } from "./index";
import { mkdirSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";

const FM = `---\ntitle: T\ndate: 2026-01-02\nstatus: draft\n---\n\n`;
const POST_TYPE = { fields: { title: { type: "string", required: true }, date: { type: "date", required: true }, updated: { type: "date" }, status: { type: "ref", to: "status" }, slug: { type: "string", pattern: "^[a-z0-9-]+$" }, tags: { type: "list", of: { type: "ref", to: "tag" } }, cover: { type: "object", fields: { image: { type: "image" }, alt: { type: "string" } } } } } as const;
const LINT_CTX = { type: POST_TYPE as never, statuses: ["draft", "published", "trashed"], routes: new Set(["/", "/posts/a"]) };
const rules = (md: string, opts = {}) => lintMarkdown(md, { ...LINT_CTX, ...opts }).diagnostics.map((d) => d.rule);
const find = (md: string, rule: string, opts = {}): Diagnostic | undefined => lintMarkdown(md, { type: POST_TYPE as never, statuses: ["draft", "published"], routes: new Set(["/", "/posts/a"]), ...opts }).diagnostics.find((d) => d.rule === rule);

describe("parse → typed tree", () => {
  test("directives become blocks with spec, coerced props, yaml bodies", () => {
    const md = `${FM}:::chart{type="bar" source="https://x.y/z" caption="C" unit="ms"}\n- { label: a, value: 1 }\n- { label: b, value: 2 }\n:::\n\n::stat{value="1" label="l" source="https://x.y"}\n`;
    const doc = parseMarkdown(md);
    expect(doc.frontmatter).toEqual({ title: "T", date: "2026-01-02", status: "draft" });
    expect(doc.frontmatterLine).toBe(2);
    const t = buildTree(doc, md);
    expect(t.blocks.map((b) => [b.name, b.kind])).toEqual([["chart", "container"], ["stat", "leaf"]]);
    expect(t.blocks[0]!.data).toEqual([{ label: "a", value: 1 }, { label: "b", value: 2 }]);
    expect(t.blocks[0]!.props).toEqual({ type: "bar", source: "https://x.y/z", caption: "C", unit: "ms" });
    expect(t.issues).toEqual([]);
  });
  test("plain markdown with zero directives is a valid post", () => {
    const r = lintMarkdown(`${FM}## Hi\n\nSome words here.\n`, { type: POST_TYPE as never, routes: new Set() });
    expect(r.diagnostics).toEqual([]); expect(r.words).toBe(4); expect(r.skipped).toEqual([]);
  });
  test("flow node counting: strings, {id,do}, decisions; {then} is an edge", () => {
    expect(countNodes("flow", { steps: ["a", { id: "b", do: "x" }, { ask: "q?", yes: "y", no: { then: "b" } }, "c"] })).toBe(5);
    expect(countNodes("diagram", { nodes: [{ id: 1 }, { id: 2 }], edges: [] })).toBe(2);
  });
});

describe("lint rules", () => {
  test("0 frontmatter: required, unknown, type, pattern, status, invalid yaml", () => {
    expect(find(`---\ndate: 2026-01-01\n---\n`, "frontmatter")!.message).toContain("`title`");
    expect(find(`${FM.replace("status: draft", "status: draft\nfoo: 1")}`, "frontmatter")!.severity).toBe("warning");
    expect(find(`---\ntitle: T\ndate: yesterday\n---\n`, "frontmatter")!.message).toContain("`date`");
    expect(find(`---\ntitle: T\ndate: 2026-01-01\nslug: Not_OK\n---\n`, "frontmatter")!.message).toContain("`slug`");
    const st = find(`---\ntitle: T\ndate: 2026-01-01\nstatus: live\n---\n`, "frontmatter")!;
    expect(st.message).toBe("Unknown status `live`"); expect(st.line).toBe(4);
    expect(find(`---\ntitle: [\n---\n`, "frontmatter")!.message).toContain("not valid YAML");
    expect(lintMarkdown(`${FM}x`).skipped).toEqual(["frontmatter", "dead-internal-link"]);
  });
  test("1 unknown block, never silent", () => {
    const d = find(`${FM}::hero{title="x"}\n`, "unknown-block")!;
    expect(d.severity).toBe("error"); expect(d.line).toBe(7); expect(d.hint).toContain("snypd://spec/primitives");
    expect(rules(`${FM}:::grid\nx\n:::\n`)).toEqual(["unknown-block"]);
  });
  test("2 props: required, enum, url, unknown; kind mismatch; slot limits", () => {
    expect(find(`${FM}::cta{title="t" button="b"}\n`, "required-prop")!.message).toContain("`href`");
    expect(find(`${FM}:::callout{kind="loud"}\nx\n:::\n`, "invalid-prop")!.message).toContain("note|tip|warning|danger|quote-me");
    expect(find(`${FM}::cta{title="t" button="b" href="not a url"}\n`, "invalid-prop")!.message).toContain("`href`");
    expect(find(`${FM}:::tldr{color="red"}\nx\n:::\n`, "unknown-prop")!.severity).toBe("warning");
    expect(find(`${FM}::tldr\n`, "invalid-prop")!.hint).toBe("Write it as :::tldr … :::");
    const one = `${FM}:::stat-row\n::stat{value="1" label="l" source="https://x.y"}\n:::\n`;
    expect(find(one, "slot-limit")!.message).toContain("at least 2");
    const five = `${FM}:::stat-row\n${'::stat{value="1" label="l" source="https://x.y"}\n'.repeat(5)}:::\n`;
    expect(find(five, "slot-limit")!.message).toContain("at most 4");
    expect(find(`${FM}:::stat-row\n::stat{value="1" label="l" source="https://x.y"}\n::cta{title="t" button="b" href="/posts/a"}\n:::\n`, "invalid-prop")!.message).toContain("may only contain `stat`");
    const nodes = Array.from({ length: 41 }, (_, i) => `  - { id: n${i} }`).join("\n");
    expect(find(`${FM}:::diagram{caption="c"}\nnodes:\n${nodes}\n:::\n`, "slot-limit")!.message).toContain("41 nodes; the limit is 40");
    expect(find(`${FM}:::flow{caption="c"}\nsteps: [\n:::\n`, "invalid-prop")!.message).toContain("not valid YAML");
    expect(find(`${FM}:::chart{type="bar" source="https://x" caption="c"}\n:::\n`, "required-prop")!.message).toBe("`chart` has no data");
  });
  test("2 chart rows: the three data forms, the shapes that break, and the point count (S8)", () => {
    const chart = (body: string, attrs = "") => `${FM}:::chart{type="bar" source="https://x" caption="c"${attrs}}\n${body}\n:::\n`;
    const rows = (n: number) => Array.from({ length: n }, (_, i) => `- { label: r${i}, value: ${i} }`).join("\n");
    expect(rules(chart(rows(3)))).toEqual([]);
    expect(rules(chart(`- { label: a, value: "2" }`))).toEqual([]);                       // a quoted number is a number
    expect(rules(chart(`rows:\n  - { label: a, value: 1 }`))).toEqual([]);                // the wrapped form
    // `data=` is parsed into the block, so the leaf form carries rows without a body
    const leaf = `${FM}::chart{type="bar" source="https://x" caption="c" data="[{label: a, value: 1}]"}\n`;
    expect(rules(leaf)).toEqual([]);
    expect(buildTree(parseMarkdown(leaf), leaf).blocks[0]!.data).toEqual([{ label: "a", value: 1 }]);
    // `src=` parses but is not read in v0.1: a warning, and no "has no data" error on top of it
    expect(rules(`${FM}::chart{type="bar" source="https://x" caption="c" src="./d.yaml"}\n`)).toEqual(["invalid-prop"]);
    expect(find(`${FM}::chart{type="bar" source="https://x" caption="c" src="./d.yaml"}\n`, "invalid-prop")!.severity).toBe("warning");
    expect(find(chart(`- { label: a }\n- 12\n- { value: 3 }`), "invalid-prop")!.message).toBe("`chart` row 1 is not `{ label, value }`");
    expect(lintMarkdown(chart(`- { label: a }\n- 12\n- { value: 3 }`), LINT_CTX).diagnostics.filter((d) => d.rule === "invalid-prop").length).toBe(3);
    expect(find(chart(`- { label: a, value: x }\n`.repeat(6)), "invalid-prop", {})!.message).toContain("row 1");
    expect(lintMarkdown(chart(`- { label: a, value: x }\n`.repeat(6)), LINT_CTX).diagnostics.at(-1)!.message).toBe("`chart` has 6 malformed rows");
    expect(find(chart(`totals: { a: 1 }`), "invalid-prop")!.message).toBe("`chart` data is not a list of rows");
    expect(find(chart(`[]`), "required-prop")!.message).toBe("`chart` has no rows");
    expect(find(chart(rows(12)), "slot-limit")).toBeUndefined();
    expect(find(chart(rows(13)), "slot-limit")!.severity).toBe("warning");
    expect(find(chart(rows(13)), "slot-limit")!.message).toContain("13 points; the spec's intent is ≤ 12");
  });
  test("2 flow steps: the sugar's shapes, the jumps that go nowhere, and the flow that is a list (S10)", () => {
    const flow = (body: string) => `${FM}:::flow{caption="c"}\n${body}\n:::\n`;
    const msgs = (body: string) => lintMarkdown(flow(body), LINT_CTX).diagnostics.map((d) => d.message);
    const ok = "steps:\n  - Run lint\n  - { ask: Clean?, yes: Ship, no: { then: fix } }\n  - { id: fix, do: Fix it }";
    expect(rules(flow(ok))).toEqual([]);
    expect(msgs("steps:\n  - Run lint\n  - Ship")).toEqual(["`flow` has no decisions"]);   // anti-intent: that is a `steps` list
    expect(find(flow("steps:\n  - Run lint"), "invalid-prop")!.hint).toContain("`:::steps`");
    expect(msgs("nope: true")).toEqual(["`flow` has no `steps:` list"]);
    expect(msgs("- Run lint")).toEqual(["`flow` body is not `steps:`"]);
    expect(msgs("steps: []")).toEqual(["`flow` has no steps"]);
    expect(msgs(`steps:\n  - { ask: Clean?, yes: Ship, no: { then: ghost } }`)).toEqual(["`flow` jumps to `ghost`, which is not a step id"]);
    expect(msgs(`steps:\n  - { do: "" }\n  - { ask: Clean?, yes: Ship }`)[0]).toBe("`flow` step 1 has no `do:`");
    expect(msgs(`steps:\n  - { id: a, do: A }\n  - { id: a, do: B }\n  - { ask: Q?, yes: Y }`)[0]).toBe("`flow` declares step `a` twice");
    expect(msgs(`steps:\n  - { do: A, when: later }\n  - { ask: Q?, yes: Y }`)[0]).toBe("`flow` step 1 has no key `when`");
    expect(msgs(`steps:\n  - { ask: Clean? }`)[0]).toContain("neither `yes:` nor `no:`");
    expect(msgs(`steps:\n  - [a, b]\n  - { ask: Q?, no: N }`)[0]).toContain("not a step, a decision or a jump");
    // a branch is linted like the list it is: `yes:` and `no:` name where the problem is
    expect(msgs(`steps:\n  - { ask: Q?, yes: [Ship, { id: x }] }`)[0]).toBe("`flow` step 1 `yes:` step 2 has no `do:`");
  });
  test("3 unsourced stat / chart is an error with a hint; site paths do not count", () => {
    expect(find(`${FM}::stat{value="1" label="l"}\n`, "unsourced-evidence")!.hint).toContain("source=\"https://…\"");
    expect(find(`${FM}::stat{value="1" label="l" source="/bench"}\n`, "unsourced-evidence")).toBeDefined();
    expect(rules(`${FM}::stat{value="1" label="l"}\n`)).toEqual(["unsourced-evidence"]);   // not double-reported as required-prop
  });
  test("4 alt: figure, markdown image, cover", () => {
    expect(rules(`${FM}::figure{src="/a.png"}\n`)).toEqual(["image-alt"]);
    expect(rules(`${FM}::figure{src="/a.png" alt=" "}\n`)).toEqual(["image-alt"]);
    expect(rules(`${FM}::figure{src="/a.png" alt="A cat"}\n`)).toEqual([]);
    expect(find(`${FM}![](/a.png)\n`, "image-alt")!.line).toBe(7);
    expect(find(`---\ntitle: T\ndate: 2026-01-01\ncover: { image: /c.png }\n---\n`, "image-alt")!.line).toBe(4);
  });
  test("5 dead internal links: markdown links and cta href; skipped without routes", () => {
    expect(find(`${FM}[x](/posts/b)\n`, "dead-internal-link")!.message).toContain("/posts/b");
    expect(rules(`${FM}[x](/posts/a#frag) [y](/) [z](https://e.com/) [w](../local.md)\n`)).toEqual([]);
    expect(find(`${FM}::cta{title="t" button="b" href="/spec"}\n`, "dead-internal-link")).toBeDefined();
    expect(lintMarkdown(`${FM}[x](/nope)\n`, { type: POST_TYPE as never }).skipped).toEqual(["dead-internal-link"]);
  });
  test("6 headings: h1 in body, level jumps", () => {
    expect(find(`${FM}# Title again\n`, "heading-skip")!.message).toContain("`#` heading");
    expect(find(`${FM}## A\n\n#### B\n`, "heading-skip")!.hint).toBe("Use h3, or promote this heading");
    expect(rules(`${FM}## A\n\n### B\n\n## C\n`)).toEqual([]);
  });
  test("7 stale updated", () => {
    expect(find(`---\ntitle: T\ndate: 2026-02-01\nupdated: 2026-01-01\n---\n`, "stale-updated")!.line).toBe(4);
    expect(find(`---\ntitle: T\ndate: 2026-02-01\nupdatedNote: fixed\n---\n`, "stale-updated")!.message).toContain("`updatedNote` without `updated`");
    expect(rules(`---\ntitle: T\ndate: 2026-02-01\nupdated: 2026-03-01\n---\n`).filter((r) => r === "stale-updated")).toEqual([]);
  });
  test("8 slop phrases: once per phrase, prose only", () => {
    const r = lintMarkdown(`${FM}Let's delve into it. We delve again.\n\n\`\`\`\ndelve in code\n\`\`\`\n\nA game-changer, in today's fast-paced world.\n`, { type: POST_TYPE as never, routes: new Set() });
    expect(r.diagnostics.map((d) => d.message)).toEqual(["Slop phrase “delve”", "Slop phrase “game-changer”"]);
    expect(rules(`${FM}Robustness is a property.\n`)).toEqual([]);   // word boundary: "robust" inside "Robustness" does not match
  });
  test("9 callout density: > 3 per 1,000 words", () => {
    const c = `:::callout{kind="note"}\nx\n:::\n`;
    expect(find(`${FM}${c.repeat(4)}`, "callout-density")!.message).toContain("4 callouts");
    expect(rules(`${FM}${c.repeat(3)}`)).toEqual([]);
    expect(rules(`${FM}${c.repeat(4)}`, { maxCalloutsPer1000: 4 })).toEqual([]);
  });
  test("diagnostics are sorted by line, carry file and fix hints", () => {
    const r = lintMarkdown(`${FM}::hero\n\n::stat{value="1" label="l"}\n`, { file: "p.md", type: POST_TYPE as never, routes: new Set() });
    expect(r.diagnostics.map((d) => [d.file, d.line, d.n])).toEqual([["p.md", 7, 1], ["p.md", 9, 3]]);
    expect(r.diagnostics.every((d) => d.hint.length > 10)).toBe(true);
    expect(r.errors).toBe(2); expect(r.warnings).toBe(0);
  });
});

describe("mdast cache", () => {
  test("hash-keyed, hits on identical content, persists to disk", () => {
    const dir = "corpora/_test/mdast";
    rmSync(dir, { recursive: true, force: true });
    const c = new MdastCache(dir);
    const md = `${FM}## A\n\ntext\n`;
    const a = c.get(md), b = c.get(md);
    expect(a).toBe(b); expect(c.hits).toBe(1); expect(c.misses).toBe(1);
    expect(existsSync(`${dir}/${hashSource(md)}.json`)).toBe(true);
    const c2 = new MdastCache(dir);
    const d = c2.get(md);
    expect(c2.hits).toBe(1); expect(c2.misses).toBe(0);
    expect(d.doc.frontmatter).toEqual(a.doc.frontmatter); expect(d.tree.blocks.length).toBe(0);
    expect(c.get(md + "\nmore").hash).not.toBe(a.hash);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("lintSite", () => {
  test("corpus is lint-clean; routes come from type urlPatterns; cache warms", () => {
    const cache = new MdastCache();
    const a = lintSite("corpora/100", { cache });
    expect(a.files.length).toBe(100); expect(a.errors).toBe(0); expect(a.warnings).toBe(0);
    expect(a.files[0]!.file).toBe("content/posts/post-00000.md");
    expect(a.files.every((f) => f.skipped.length === 0)).toBe(true);
    const b = lintSite("corpora/100", { cache });
    expect(b.cache.hits).toBe(100);
  });
  test("a broken post in a site reports with file:line", () => {
    const root = "corpora/_test/site";
    rmSync(root, { recursive: true, force: true });
    mkdirSync(`${root}/content/posts`, { recursive: true }); mkdirSync(`${root}/content/pages`, { recursive: true });
    writeFileSync(`${root}/snypd.yaml`, "snypd: 1\nsite: { name: t, url: https://t.example }\n");
    writeFileSync(`${root}/content/pages/about.md`, "---\ntitle: About\n---\n\nHi\n");
    writeFileSync(`${root}/content/posts/bad.md`, `${FM}[ok](/about) [dead](/aboot)\n\n::stat{value="1" label="l"}\n`);
    const s = lintSite(root);
    expect(s.files.map((f) => f.file).sort()).toEqual(["content/pages/about.md", "content/posts/bad.md"]);
    const bad = s.files.find((f) => f.file === "content/posts/bad.md")!;
    expect(bad.diagnostics.map((d) => `${d.line} ${d.rule}`)).toEqual(["7 dead-internal-link", "9 unsourced-evidence"]);
    expect(s.errors).toBe(2);
    rmSync("corpora/_test/site", { recursive: true, force: true });
  });
});

describe("site rules 10–11 (S6)", () => {
  const root = "corpora/_test/lint-site";
  const site = (posts: Record<string, string>) => {
    rmSync(root, { recursive: true, force: true }); mkdirSync(`${root}/content/posts`, { recursive: true });
    writeFileSync(`${root}/snypd.yaml`, "snypd: 1\nsite: { name: t, url: https://t.example }\n");
    for (const [slug, body] of Object.entries(posts)) writeFileSync(`${root}/content/posts/${slug}.md`, body);
  };
  const post = (tags: string, extra = "") => `---\ntitle: T\ndate: 2026-01-01\nstatus: published\ntags: [${tags}]\n${extra}---\n\nWords here.\n`;
  test("11 tag-once: a tag no other post uses warns at the tags line and names reusable ones", () => {
    site({ a: post("ai, mcp"), b: post("ai"), c: post("solo, ai") });
    const s = lintSite(root);
    const d = s.files.flatMap((f) => f.diagnostics.map((x) => ({ file: f.file, ...x })));
    expect(d.map((x) => [x.file, x.rule, x.line])).toEqual([["content/posts/a.md", "tag-once", 5], ["content/posts/c.md", "tag-once", 5]]);
    expect(d[0]!.message).toBe("tag `mcp` is used only here");
    expect(d[0]!.hint).toContain("reuse one of `ai`");
    expect(s.warnings).toBe(2); expect(s.errors).toBe(0);
  });
  test("10 slug-change: a move the index recorded warns until the route is restored", () => {
    site({ a: post("ai"), b: post("ai") });
    const d = lintSite(root, { moves: [{ path: "content/posts/a.md", from: "/posts/old", to: "/posts/a" }] }).files[0]!.diagnostics;
    expect(d.map((x) => x.rule)).toEqual(["slug-change"]);
    expect(d[0]!.message).toBe("Route changed from /posts/old to /posts/a; nothing redirects the old URL");
    expect(lintSite(root).warnings).toBe(0);
  });
});
