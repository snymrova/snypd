import { describe, expect, test } from "bun:test";
import { lintMarkdown, parseMarkdown, buildTree, countNodes, MdastCache, lintSite, hashSource, type Diagnostic } from "./index";
import { mkdirSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";

const FM = `---\ntitle: T\ndate: 2026-01-02\nstatus: draft\n---\n\n`;
const POST_TYPE = { fields: { title: { type: "string", required: true }, date: { type: "date", required: true }, updated: { type: "date" }, status: { type: "ref", to: "status" }, slug: { type: "string", pattern: "^[a-z0-9-]+$" }, tags: { type: "list", of: { type: "ref", to: "tag" } }, cover: { type: "object", fields: { image: { type: "image" }, alt: { type: "string" } } } } } as const;
const rules = (md: string, opts = {}) => lintMarkdown(md, { type: POST_TYPE as never, statuses: ["draft", "published", "trashed"], routes: new Set(["/", "/posts/a"]), ...opts }).diagnostics.map((d) => d.rule);
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
