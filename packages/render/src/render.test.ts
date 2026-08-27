import { describe, expect, test, beforeAll } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseMarkdown, buildTree, type Block } from "@snypd/core";
import { build, toHtml, slugify, excerpt, jsx, raw, Html, loadTheme } from "./index";
import { loadConfig } from "@snypd/core";

describe("jsx runtime", () => {
  test("escapes strings, passes Html through, drops false/null attrs, renders void tags", () => {
    const el = jsx("a", { href: "/x?a=1&b=2", hidden: false, title: null, download: true, children: ["<b>", raw("<i>ok</i>"), 3] });
    expect(el.html).toBe('<a href="/x?a=1&amp;b=2" download>&lt;b&gt;<i>ok</i>3</a>');
    expect(jsx("img", { src: 'a"b', alt: "" }).html).toBe('<img src="a&quot;b" alt="">');
    expect(jsx("p", { className: "c", children: undefined }).html).toBe('<p class="c"></p>');
    const C = ({ n }: { n: number }) => raw(`<b>${n}</b>`);
    expect(jsx(C as never, { n: 2 }).html).toBe("<b>2</b>");
  });
});

describe("mdast → html", () => {
  const html = (md: string) => toHtml(parseMarkdown(md).tree).html;
  test("commonmark + gfm", () => {
    expect(html("# A b!\n\nx *y* **z** `c` ~~d~~\n")).toBe('<h1 id="a-b">A b!</h1>\n<p>x <em>y</em> <strong>z</strong> <code>c</code> <del>d</del></p>\n');
    expect(html("- a\n- [x] b\n\n1. c\n")).toBe('<ul>\n<li>a</li>\n<li><input type="checkbox" disabled checked> b</li>\n</ul>\n<ol>\n<li>c</li>\n</ol>\n');
    expect(html("| h | i |\n|---|--:|\n| 1 | 2 |\n")).toBe('<table>\n<thead><tr><th>h</th><th align="right">i</th></tr></thead>\n<tbody>\n<tr><td>1</td><td align="right">2</td></tr>\n</tbody>\n</table>\n');
    expect(html("```ts\nlet a = 1 < 2;\n```\n")).toBe('<pre><code class="language-ts">let a = 1 &lt; 2;\n</code></pre>\n');
    expect(html("a[^1]\n\n[^1]: note\n")).toContain('<section class="footnotes">');
    expect(html("[l][r]\n\n[r]: /u \"t\"\n")).toBe('<p><a href="/u" title="t">l</a></p>\n');
    expect(html("## Same\n\n## Same\n")).toBe('<h2 id="same">Same</h2>\n<h2 id="same-1">Same</h2>\n');
    expect(slugify("Héllo, Wörld!")).toBe("héllo-wörld");
    expect(excerpt(parseMarkdown("---\nt: 1\n---\n\n## H\n\nFirst para here. More.\n").tree, 12)).toBe("First para…");
  });
  test("directives go to onBlock with the typed block; without a handler they get a labelled wrapper", () => {
    const md = ":::callout{kind=\"tip\" title=\"T\"}\nbody *x*\n:::\n";
    const doc = parseMarkdown(md); const tree = buildTree(doc, md);
    const blocks = new Map(tree.all.map((b) => [b.node, b]));
    const seen: Block[] = [];
    const out = toHtml(doc.tree, { blocks, onBlock: (b, body) => { seen.push(b); return raw(`[${b.name}:${b.props.kind}]${body().html}[/]`); } }).html;
    expect(out).toBe("[callout:tip]<p>body <em>x</em></p>\n[/]");
    expect(seen[0]!.props.title).toBe("T");
    expect(toHtml(doc.tree).html).toBe('<div class="snypd-block" data-block="callout"><p>body <em>x</em></p>\n</div>\n');
  });
});

describe("build (S6): incremental, route cache, base theme", () => {
  const root = "corpora/_test/build";
  const dist = join(root, "dist");
  const read = (route: string, f = "index.html") => readFileSync(join(dist, route, f), "utf8");
  const post = (slug: string, title: string, o: { tags?: string; status?: string; body?: string; author?: string; date?: string } = {}) =>
    `---\ntitle: ${title}\nslug: ${slug}\ndate: ${o.date ?? "2026-03-01"}\nstatus: ${o.status ?? "published"}\ncategory: eng\ntags: [${o.tags ?? "ai"}]\n${o.author ? `author: ${o.author}\n` : ""}---\n\n:::tldr\nSummary of ${title}.\n:::\n\n## Section\n\n${o.body ?? `Body of ${title}.`}\n\n:::stat-row\n::stat{value="1" label="one" source="https://x.y/a"}\n::stat{value="2" label="two" source="https://x.y/b"}\n:::\n\n::cta{title="Go" button="Now" href="https://x.y"}\n`;
  beforeAll(() => {
    rmSync(root, { recursive: true, force: true });
    for (const d of ["content/posts", "content/pages", "content/authors", "content/taxonomies/tag"]) mkdirSync(join(root, d), { recursive: true });
    cpSync("themes/base", join(root, "themes/base"), { recursive: true, filter: (f) => !f.endsWith("package.json") });   // the site's own copy, so a theme edit is local to the test
    writeFileSync(join(root, "snypd.yaml"), "snypd: 1\nsite: { name: T, url: https://t.example }\ntheme: { use: base }\ntypes: { author: { layout: author } }\n");
    writeFileSync(join(root, "content/posts/a.md"), post("a", "Post A", { tags: "ai, mcp", author: "sunny", date: "2026-03-02" }));
    writeFileSync(join(root, "content/posts/b.md"), post("b", "Post B"));
    writeFileSync(join(root, "content/posts/d.md"), post("d", "Draft D", { status: "draft" }));
    writeFileSync(join(root, "content/pages/about.md"), "---\ntitle: About\nstatus: published\n---\n\nAbout us.\n");
    writeFileSync(join(root, "content/authors/sunny.md"), "---\nname: Sunny\nstatus: published\nurl: https://s.example\n---\n\nBio.\n");
    writeFileSync(join(root, "content/taxonomies/tag/mcp.md"), "---\ntitle: Model Context Protocol\ndescription: The protocol.\n---\n");
  });

  test("cold build renders every route; a second build renders nothing", async () => {
    const r = await build(root);
    expect(r.rendered).toBe(r.routes); expect(r.cached).toBe(0);
    // 2 posts + about + author + index + category/eng + tag/ai + tag/mcp = 8; the draft is not built
    expect(r.routes).toBe(8);
    expect(existsSync(join(dist, "posts/d"))).toBe(false);
    expect(r.theme.coverage.every((c) => c.status === "own")).toBe(true); expect(r.theme.coverage.length).toBe(13);
    const w = await build(root);
    expect(w.rendered).toBe(0); expect(w.cached).toBe(8);
  });
  test("output: shell, twin, primitives, terms, author, lists newest first", () => {
    const a = read("posts/a");
    expect(a.startsWith("<!doctype html>\n<html lang=\"en\">")).toBe(true);
    expect(a).toContain('<link rel="alternate" type="text/markdown" href="/posts/a/index.md">');
    expect(a).toContain('<link rel="canonical" href="https://t.example/posts/a/">');
    expect(a).toContain('<meta name="description" content="Body of Post A.">');   // excerpt: first paragraph, not the tldr
    expect(a).toContain('<section class="snypd-tldr"');
    expect(a).toContain('<div class="snypd-stat-row" data-count="2"><div class="snypd-stat">');
    expect(a).toContain('<a href="/tag/mcp/" rel="tag">Model Context Protocol</a>');
    expect(a).toContain('by <a href="/authors/sunny/">Sunny</a>');
    expect(read("posts/a", "index.md")).toBe(readFileSync(join(root, "content/posts/a.md"), "utf8"));
    expect(read("")).toMatch(/Post A[\s\S]*Post B/);   // a is newer
    expect(read("")).not.toContain("About");
    expect(read("tag/mcp")).toContain("<p>The protocol.</p>");
    expect(read("authors/sunny")).toContain('<a href="/posts/a/">Post A</a>');
    expect(read("about")).toContain("<h1>About</h1>");
  });
  test("a body edit re-renders exactly that route", async () => {
    writeFileSync(join(root, "content/posts/b.md"), post("b", "Post B", { body: "Changed body." }));
    const r = await build(root);
    expect([r.rendered, r.cached]).toEqual([1, 7]);
    expect(read("posts/b")).toContain("Changed body.");
  });
  test("a title edit re-renders the post and every list that shows it", async () => {
    writeFileSync(join(root, "content/posts/b.md"), post("b", "Post B2", { body: "Changed body." }));
    const r = await build(root);
    expect(r.rendered).toBe(4);   // post, index, category/eng, tag/ai
    expect(read("")).toContain("Post B2");
  });
  test("a theme edit re-renders everything (in a fresh process — see loadTheme); a config edit too", async () => {
    const f = join(root, "themes/base/layouts/shell.tsx");
    writeFileSync(f, readFileSync(f, "utf8").replace("<footer><p>{ctx.site.name}</p></footer>", "<footer><p>{ctx.site.name} · edited</p></footer>"));
    const cli = Bun.spawnSync([process.execPath, "packages/cli/src/index.ts", "build", root]);   // `snypd build`: the real path, no module cache
    expect(cli.stdout.toString()).toContain("built 8 routes (8 rendered, 0 cached");
    expect(read("about")).toContain("T · edited");
    let r = await build(root);
    expect(r.rendered).toBe(0);
    writeFileSync(join(root, "snypd.yaml"), "snypd: 1\nsite: { name: T2, url: https://t.example }\ntheme: { use: base }\ntypes: { author: { layout: author } }\n");
    r = await build(root);
    expect(r.rendered).toBe(8); expect(read("about")).toContain("<title>About - T2</title>");
  });
  test("a deleted post removes its outputs and the lists it was in; a published draft appears", async () => {
    rmSync(join(root, "content/posts/b.md"));
    let r = await build(root);
    expect(r.removed).toBe(1); expect(existsSync(join(dist, "posts/b/index.html"))).toBe(false); expect(existsSync(join(dist, "posts/b/index.md"))).toBe(false);
    expect(read("")).not.toContain("Post B2");
    writeFileSync(join(root, "content/posts/d.md"), post("d", "Draft D"));
    r = await build(root);
    expect(existsSync(join(dist, "posts/d/index.html"))).toBe(true); expect(read("")).toContain("Draft D");
  });
  test("chart / diagram / flow render their spec fallbacks (data, not pictures) until S8–S10", async () => {
    writeFileSync(join(root, "content/posts/v.md"), `---\ntitle: Viz\ndate: 2026-01-01\nstatus: published\n---\n\n:::chart{type="bar" source="https://x.y" caption="Cap" unit="ms"}\n- { label: a, value: 1 }\n- { label: b, value: 2 }\n:::\n\n:::diagram{caption="D"}\nnodes:\n  - { id: p, label: Parse }\n  - { id: r }\nedges:\n  - { from: p, to: r, label: then }\n:::\n\n:::flow{caption="F"}\nsteps:\n  - One\n  - { ask: Ok?, yes: Done, no: [Retry, { then: one }] }\n:::\n`);
    await build(root);
    const v = read("posts/v");
    expect(v).toContain('<figure class="snypd-chart" data-type="bar"><table><thead><tr><th>label</th><th>value (ms)</th></tr></thead><tbody><tr><td>a</td><td>1</td></tr>');
    expect(v).toContain('<ol class="snypd-diagram-edges"><li>Parse -&gt; r (then)</li></ol>');
    expect(v).toContain("<li>Ok?<ul><li>yes: <ol><li>Done</li></ol></li><li>no: <ol><li>Retry</li><li>then: one</li></ol></li></ul></li>");
  });
  test("loadTheme: missing layout file is an error, missing primitive is generic + reported", async () => {
    const bad = "corpora/_test/theme-bad";
    rmSync(bad, { recursive: true, force: true }); mkdirSync(join(bad, "themes/x/layouts"), { recursive: true });
    writeFileSync(join(bad, "snypd.yaml"), "snypd: 1\nsite: { name: T, url: https://t.example }\ntheme: { use: x }\n");
    writeFileSync(join(bad, "themes/x/theme.yaml"), "theme: x\nlayouts: [post]\nprimitives: { tldr: ./tldr.tsx, aside: { fallback: tldr } }\n");
    await expect(loadTheme(loadConfig(bad))).rejects.toThrow('layout "post" is declared');
    writeFileSync(join(bad, "themes/x/layouts/post.tsx"), 'export default () => "x";');
    writeFileSync(join(bad, "themes/x/tldr.tsx"), 'export default () => "t";');
    const t = await loadTheme(loadConfig(bad));
    expect(t.coverage.find((c) => c.name === "tldr")!.status).toBe("own");
    expect(t.coverage.filter((c) => c.status === "missing").length).toBe(12);
  });
});
