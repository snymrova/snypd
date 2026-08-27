import { describe, expect, test, beforeAll } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseMarkdown, buildTree, type Block } from "@snypd/core";
import { build, toHtml, slugify, excerpt, jsx, raw, Html, loadTheme, flowSteps, tokensCss, resolveTokens } from "./index";
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

describe("build (S6/S7): incremental, route cache, base theme, agent-read surface", () => {
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
    expect(r.rendered).toBe(r.routes + r.artefacts); expect(r.cached).toBe(0);
    // 2 posts + about + author + index + category/eng + tag/ai + tag/mcp = 8; the draft is not built
    expect(r.routes).toBe(8);
    // llms.txt feed.xml sitemap.xml robots.txt api/site.json api/{post,page,author}.json api/{category,tag}.json; no css (base has no tokens)
    expect(r.artefacts).toBe(10);
    expect(existsSync(join(dist, "posts/d"))).toBe(false);
    expect(r.theme.coverage.every((c) => c.status === "own")).toBe(true); expect(r.theme.coverage.length).toBe(13);
    const w = await build(root);
    expect(w.rendered).toBe(0); expect(w.cached).toBe(18);
  });
  test("S7 surface: llms.txt, feed, sitemap, robots, JSON API, JSON-LD", () => {
    const llms = read("", "llms.txt");
    expect(llms.startsWith("# T\n\nEvery page has a markdown twin")).toBe(true);
    expect(llms).toContain("## Posts\n\n- [Post A](https://t.example/posts/a/index.md)\n- [Post B](https://t.example/posts/b/index.md)\n");
    expect(llms).toContain("## Pages\n\n- [About](https://t.example/about/index.md)\n");
    expect(llms).toContain("## Tags\n\n- [ai](https://t.example/tag/ai/) (2)\n- [Model Context Protocol](https://t.example/tag/mcp/) (1)\n");
    const feed = read("", "feed.xml");
    expect(feed).toContain('<rss version="2.0"');
    expect(feed).toContain('<atom:link href="https://t.example/feed.xml" rel="self" type="application/rss+xml"/>');
    expect(feed).toMatch(/<item>\n<title>Post A<\/title>\n<link>https:\/\/t.example\/posts\/a\/<\/link>\n<guid isPermaLink="true">https:\/\/t.example\/posts\/a\/<\/guid>\n<pubDate>Mon, 02 Mar 2026 00:00:00 GMT<\/pubDate>/);
    expect(feed).toContain("<dc:creator>Sunny</dc:creator>");
    expect(feed).toContain('<atom:link rel="alternate" type="text/markdown" href="https://t.example/posts/a/index.md"/>');
    expect(feed).toContain('<category domain="https://t.example/tag/mcp/">Model Context Protocol</category>');
    expect(feed).not.toContain("About");   // pages are not feed items
    const map = read("", "sitemap.xml");
    expect(map).toContain("<url><loc>https://t.example/</loc><lastmod>2026-03-02</lastmod></url>");
    expect(map).toContain("<url><loc>https://t.example/posts/b/</loc><lastmod>2026-03-01</lastmod></url>");
    expect(map).toContain("<url><loc>https://t.example/tag/mcp/</loc><lastmod>2026-03-02</lastmod></url>");
    expect(map).not.toContain("/posts/d/");
    expect(read("", "robots.txt")).toBe("User-agent: *\nAllow: /\n\nSitemap: https://t.example/sitemap.xml\n");
    const site = JSON.parse(read("api", "site.json"));
    expect(site.types.post).toEqual({ count: 2, list: "https://t.example/api/post.json" });
    expect(site.taxonomies.tag.count).toBe(2);
    const posts = JSON.parse(read("api", "post.json"));
    expect(posts.items.map((i: { slug: string }) => i.slug)).toEqual(["a", "b"]);
    expect(posts.items[0].terms).toEqual([{ taxonomy: "category", term: "eng" }, { taxonomy: "tag", term: "ai" }, { taxonomy: "tag", term: "mcp" }]);
    const a = JSON.parse(read("api/post", "a.json"));
    expect(a.markdown).toBe("https://t.example/posts/a/index.md");
    expect(a.author).toEqual({ name: "Sunny", route: "/authors/sunny", url: "https://t.example/authors/sunny/" });
    expect(a.frontmatter.tags).toEqual(["ai", "mcp"]);
    expect(a.schema[0]["@type"]).toBe("BlogPosting");
    expect(a.schema[0].description).toBe("Summary of Post A.");   // schema-emit: tldr body → description (docs/01)
    expect(JSON.parse(read("api", "tag.json")).terms[1]).toEqual({ term: "mcp", title: "Model Context Protocol", route: "/tag/mcp", url: "https://t.example/tag/mcp/", count: 1 });
    const html = read("posts/a");
    expect(html).toContain('<link rel="alternate" type="application/rss+xml" title="T" href="/feed.xml">');
    expect(html).not.toContain('rel="stylesheet"');
    const ld = /<script type="application\/ld\+json">([^]*?)<\/script>/.exec(html)![1]!;
    const obj = JSON.parse(ld);
    expect(obj).toMatchObject({ "@type": "BlogPosting", headline: "Post A", datePublished: "2026-03-02", dateModified: "2026-03-02", author: { "@type": "Person", name: "Sunny" }, keywords: "eng, ai, Model Context Protocol" });
    expect(JSON.parse(/ld\+json">([^]*?)<\/script>/.exec(read(""))![1]!)["@type"]).toBe("WebSite");
    expect(JSON.parse(/ld\+json">([^]*?)<\/script>/.exec(read("tag/mcp"))![1]!).name).toBe("Model Context Protocol");
    expect(JSON.parse(/ld\+json">([^]*?)<\/script>/.exec(read("authors/sunny"))![1]!)["@type"]).toBe("Person");
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
    expect([r.rendered, r.cached]).toEqual([1, 17]);   // the surface did not change: no artefact rewritten
    expect(read("posts/b")).toContain("Changed body.");
  });
  test("a title edit re-renders the post and every list that shows it", async () => {
    writeFileSync(join(root, "content/posts/b.md"), post("b", "Post B2", { body: "Changed body." }));
    const r = await build(root);
    expect(r.rendered).toBe(13);   // post, index, category/eng, tag/ai + the 9 artefacts that list titles (robots.txt does not)
    expect(read("")).toContain("Post B2");
  });
  test("a theme edit re-renders everything (in a fresh process — see loadTheme); a config edit too", async () => {
    const f = join(root, "themes/base/layouts/shell.tsx");
    writeFileSync(f, readFileSync(f, "utf8").replace("<footer><p>{ctx.site.name}</p></footer>", "<footer><p>{ctx.site.name} · edited</p></footer>"));
    const cli = Bun.spawnSync([process.execPath, "packages/cli/src/index.ts", "build", root]);   // `snypd build`: the real path, no module cache
    expect(cli.stdout.toString()).toContain("built 8 routes + 10 artefacts (18 rendered, 0 cached");
    expect(read("about")).toContain("T · edited");
    let r = await build(root);
    expect(r.rendered).toBe(0);
    writeFileSync(join(root, "snypd.yaml"), "snypd: 1\nsite: { name: T2, url: https://t.example }\ntheme: { use: base }\ntypes: { author: { layout: author } }\n");
    r = await build(root);
    expect(r.rendered).toBe(18); expect(read("about")).toContain("<title>About - T2</title>");
  });
  test("S7 schema-emit from blocks: FAQPage from faq, HowTo from steps and flow", async () => {
    writeFileSync(join(root, "content/posts/s.md"), `---\ntitle: Schema\ndate: 2026-01-02\nstatus: published\n---\n\nIntro.\n\n:::faq\n### Does it help?\nNo. Not yet.\n\nSecond paragraph.\n\n### What does?\nA twin.\n:::\n\n:::steps{title="Ship" time="5 min"}\n1. **Build** — run it.\n2. Serve.\n:::\n\n:::flow{caption="Publish"}\nsteps:\n  - Draft\n  - ask: Clean?\n    yes: Preview\n    no: { then: fix }\n  - id: fix\n    do: Fix it\n:::\n`);
    await build(root);
    const schemas = JSON.parse(read("api/post", "s.json")).schema;
    expect(schemas.map((s: { "@type": string }) => s["@type"])).toEqual(["BlogPosting", "FAQPage", "HowTo", "HowTo"]);
    expect(schemas[0].description).toBe("Intro.");
    expect(schemas[1].mainEntity).toEqual([
      { "@type": "Question", name: "Does it help?", acceptedAnswer: { "@type": "Answer", text: "No. Not yet.\n\nSecond paragraph." } },
      { "@type": "Question", name: "What does?", acceptedAnswer: { "@type": "Answer", text: "A twin." } }]);
    expect(schemas[2]).toMatchObject({ name: "Ship", totalTime: "5 min", step: [{ "@type": "HowToStep", text: "Build — run it." }, { "@type": "HowToStep", text: "Serve." }] });
    expect(schemas[3]).toMatchObject({ name: "Publish", step: [{ text: "Draft" }, { text: "Clean?" }, { text: "Preview" }, { text: "Fix it" }] });
    expect(flowSteps({ steps: ["a", { ask: "q", yes: ["b", "c"], no: { then: "x" } }, { id: "x", do: "d" }] })).toEqual(["a", "q", "b", "c", "d"]);
    const html = read("posts/s");
    expect(html.match(/ld\+json/g)!.length).toBe(1);   // one script, four objects
    rmSync(join(root, "content/posts/s.md"));
  });
  test("S7 tokens → CSS vars: theme.yaml declares, snypd.yaml overrides, assets/theme.css is emitted and linked", async () => {
    expect(resolveTokens({ "color.accent": { default: "#111" }, "content.width": "64ch", n: 3 })).toEqual({ "color.accent": "#111", "content.width": "64ch", n: "3" });
    expect(tokensCss({ "color.accent": "#111", "font.heading": "Newsreader, serif" })).toBe(":root {\n  --color-accent: #111;\n  --font-heading: Newsreader, serif;\n}\n");
    expect(tokensCss({})).toBe("");
    const ty = join(root, "themes/base/theme.yaml");
    writeFileSync(ty, readFileSync(ty, "utf8") + 'css: ./styles.css\ntokens:\n  color.accent: { default: "#1a1a1a", customisable: true, description: Links }\n  content.width: { default: 64ch }\n');
    writeFileSync(join(root, "themes/base/styles.css"), "a { color: var(--color-accent) }\n");
    writeFileSync(join(root, "snypd.yaml"), "snypd: 1\nsite: { name: T2, url: https://t.example, description: A test site }\ntheme: { use: base, tokens: { color.accent: \"#f00\" } }\ntypes: { author: { layout: author } }\n");
    const r = await build(root);
    expect(r.artefacts).toBe(11);
    expect(read("assets", "theme.css")).toBe(":root {\n  --color-accent: #f00;\n  --content-width: 64ch;\n}\na { color: var(--color-accent) }\n");
    expect(read("about")).toContain('<link rel="stylesheet" href="/assets/theme.css">');
    expect(read("", "llms.txt")).toContain("# T2\n\n> A test site\n");
    expect(JSON.parse(read("api", "site.json")).description).toBe("A test site");
    const w = await build(root);
    expect(w.rendered).toBe(0);
  });
  test("S7 an index from an older output format is reset, not pruned", async () => {
    const { SiteIndex } = await import("@snypd/core");
    const idx = await SiteIndex.open(root);
    idx.setMeta("output.format", "s6"); idx.setRoute("/posts/a", "stale", ["index.html"]); idx.close();
    const r = await build(root);
    expect(r.cached).toBe(0); expect(r.rendered).toBe(r.routes + r.artefacts);
    expect(existsSync(join(dist, "index.html"))).toBe(true);   // a stale route-relative "index.html" was not deleted from the dist root
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
