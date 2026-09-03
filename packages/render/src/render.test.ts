import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseMarkdown, buildTree, type Block } from "@snypd/core";
import { build, toHtml, inline, minifyCss, slugify, excerpt, jsx, raw, Html, loadTheme, flowSteps, tokensCss, resolveTokens } from "./index";
import { loadConfig, initRepo, LIVE_ROUTE } from "@snypd/core";
import { preview } from "./preview";
import { deskPage, type DeskOnboarding } from "./desk";
import { imageSize, svgSize } from "./media";
import { png } from "../../bench/src/corpus";

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
    // S14: no `site.icon` declared, so no link — and with one, the 404 every browser asks for goes away.
    expect(a).not.toContain('rel="icon"');
    expect(a).toContain('<meta name="description" content="Body of Post A.">');   // excerpt: first paragraph, not the tldr
    expect(a).toContain('<section class="snypd-tldr"');
    expect(a).toContain('<div class="snypd-stat-row" data-count="2"><div class="snypd-stat">');
    expect(a).toContain('<a href="/tag/mcp/" rel="tag">Model Context Protocol</a>');
    expect(a).toContain('by <a href="/authors/sunny/" rel="author">Sunny</a>');
    // S14: one cover, and the tag row and the twin link are one footer instead of two loose lines.
    expect(a).toContain('<header class="snypd-cover"><h1>Post A</h1></header><p class="snypd-byline">');
    expect(a).toContain('<footer class="snypd-post-footer"><ul class="snypd-terms">');
    expect(a).toContain('<p class="snypd-twin"><a href="/posts/a/index.md" type="text/markdown">Markdown twin</a></p></footer>');
    expect(read("posts/a", "index.md")).toBe(readFileSync(join(root, "content/posts/a.md"), "utf8"));
    expect(read("")).toMatch(/Post A[\s\S]*Post B/);   // a is newer
    expect(read("")).not.toContain("About");
    expect(read("tag/mcp")).toContain("<p>The protocol.</p>");
    expect(read("authors/sunny")).toContain('<a href="/posts/a/">Post A</a>');
    expect(read("about")).toContain("<h1>About</h1>");
    // S14: the index and the feed list types that have a `date` field. The author has a layout and a page
    // of its own, and belongs in neither — an item with no date has nothing to be newest-first about.
    expect(read("")).not.toContain("Sunny");
    expect(readFileSync(join(dist, "feed.xml"), "utf8")).not.toContain("<title>Sunny</title>");
    expect(read("authors/sunny")).toContain("<h1>Sunny</h1>");
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
    expect(read("assets", "theme.css")).toBe(":root{--color-accent: #f00;--content-width: 64ch}a{color: var(--color-accent)}");   // S14: minified on the way out
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
  test("S8/S9/S10: chart, diagram and flow draw svgs through the build, each with its spec fallback behind it", async () => {
    writeFileSync(join(root, "content/posts/v.md"), `---\ntitle: Viz\ndate: 2026-01-01\nstatus: published\n---\n\n:::chart{type="bar" source="https://x.y" caption="Cap" unit="ms"}\n- { label: a, value: 1 }\n- { label: b, value: 2 }\n:::\n\n:::diagram{caption="D"}\nnodes:\n  - { id: p, label: Parse }\n  - { id: r }\nedges:\n  - { from: p, to: r, label: then }\n:::\n\n:::flow{caption="F"}\nsteps:\n  - One\n  - { ask: Ok?, yes: Done, no: [Retry, { then: one }] }\n:::\n`);
    await build(root);
    const v = read("posts/v");
    expect(v).toContain('<figure class="snypd-chart" data-type="bar"><div class="snypd-scroll" tabindex="0"><svg xmlns="http://www.w3.org/2000/svg"');
    expect(v).toContain('data-chart="bar" role="img"');
    expect(v).toContain("<title>Cap</title><desc>bar chart. a 1 ms, b 2 ms.</desc>");
    expect(v).toContain('<figcaption>Cap (<a href="https://x.y" rel="external">source</a>)</figcaption>');
    expect(v).toContain('var(--color-viz-1, #3d5a80)');   // base declares no tokens: the literal inside the var paints
    expect(v.slice(v.indexOf('<figure class="snypd-chart"'), v.indexOf("</figure>"))).not.toContain("<script");
    // the spec's fallback is still reachable — rows the renderer cannot read show as the data, not a picture
    writeFileSync(join(root, "content/posts/w.md"), `---\ntitle: Broken\ndate: 2026-01-01\nstatus: published\n---\n\n:::chart{type="bar" source="https://x.y" caption="Cap" unit="ms"}\n- { label: a }\n:::\n\n::chart{type="bar" source="https://x.y" caption="Later" src="./d.yaml"}\n`);
    await build(root);
    const w = read("posts/w");
    expect(w).toContain('<figure class="snypd-chart" data-type="bar"><table><thead><tr><th>label</th><th>value (ms)</th></tr></thead><tbody><tr><td>a</td><td>—</td></tr></tbody></table>');
    expect(w).toContain('<figure class="snypd-chart" data-type="bar"><figcaption>Later');   // src= is not read in v0.1: caption only, never an empty table
    // S9: the diagram is laid out and drawn; a body with no nodes still falls back to the spec's edge list
    expect(v).toContain('<figure class="snypd-diagram" data-direction="lr"><div class="snypd-scroll" tabindex="0"><svg xmlns="http://www.w3.org/2000/svg"');
    expect(v).toContain("<desc>Diagram, 2 nodes, 1 connection. Parse to r (then).</desc>");
    expect(v).toContain('var(--color-viz-node, rgba(128,128,128,.09))');
    expect(v).not.toContain('class="snypd-diagram-edges"');
    writeFileSync(join(root, "content/posts/x.md"), `---\ntitle: NoNodes\ndate: 2026-01-01\nstatus: published\n---\n\n:::diagram{caption="E"}\nedges:\n  - { from: a, to: b }\n:::\n`);
    await build(root);
    expect(read("posts/x")).toContain('<ol class="snypd-diagram-edges"><li>a -&gt; b</li></ol>');
    // S10: the flow desugars to a graph and goes through the same painter — a decision is a diamond, its
    // branches are labelled edges, and the sugar's `then:` is an edge back to the step it names.
    expect(v).toContain('<figure class="snypd-flow" data-direction="tb"><div class="snypd-scroll" tabindex="0"><svg xmlns="http://www.w3.org/2000/svg"');
    expect(v).toContain('class="snypd-flow-svg" data-direction="tb"');
    expect(v).toContain("<desc>Flowchart, 3 steps and 1 decision. One, then Ok?. Ok? — yes: Done; no: Retry.</desc>");
    expect(v).toMatch(/<path d="M83 97\.5L137 125L83 152\.5L29 125Z"\/>/);   // the decision, as a rhombus
    expect(v).toContain(">yes<");
    expect(v).not.toContain("<li>yes: ");
    writeFileSync(join(root, "content/posts/y.md"), `---\ntitle: NoSteps\ndate: 2026-01-01\nstatus: published\n---\n\n:::flow{caption="G"}\nnope: true\n:::\n`);
    await build(root);
    expect(read("posts/y")).toContain('<figure class="snypd-flow" data-direction="tb"><figcaption>G</figcaption></figure>');   // no steps at all: the caption, never an empty list
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

  test("extends: a child inherits every slot it does not declare, and its own wins", async () => {
    const root = "corpora/_test/theme-extends";
    rmSync(root, { recursive: true, force: true });
    mkdirSync(join(root, "themes/parent/layouts"), { recursive: true });
    mkdirSync(join(root, "themes/child"), { recursive: true });
    writeFileSync(join(root, "snypd.yaml"), "snypd: 1\nsite: { name: T, url: https://t.example }\ntheme: { use: child }\n");
    writeFileSync(join(root, "themes/parent/theme.yaml"),
      "theme: parent\nlayouts: [post, page]\nprimitives: { tldr: ./tldr.tsx, callout: ./callout.tsx, cta: { fallback: callout } }\ntokens: { color.accent: red, size.body: 1rem }\ncss: ./p.css\n");
    writeFileSync(join(root, "themes/parent/layouts/post.tsx"), 'export default () => "parent-post";');
    writeFileSync(join(root, "themes/parent/layouts/page.tsx"), 'export default () => "parent-page";');
    writeFileSync(join(root, "themes/parent/tldr.tsx"), 'export default () => "parent-tldr";');
    writeFileSync(join(root, "themes/parent/callout.tsx"), 'export default () => "parent-callout";');
    writeFileSync(join(root, "themes/parent/p.css"), ".p{}");
    // The child declares one layout file, one primitive and one token. Everything else must come from parent.
    mkdirSync(join(root, "themes/child/layouts"), { recursive: true });
    writeFileSync(join(root, "themes/child/theme.yaml"),
      "theme: child\nextends: parent\nlayouts: [post, page]\nprimitives: { tldr: ./tldr.tsx }\ntokens: { color.accent: blue }\ncss: ./c.css\n");
    writeFileSync(join(root, "themes/child/layouts/post.tsx"), 'export default () => "child-post";');
    writeFileSync(join(root, "themes/child/tldr.tsx"), 'export default () => "child-tldr";');
    writeFileSync(join(root, "themes/child/c.css"), ".c{}");

    const cfg = loadConfig(root);
    const t = await loadTheme(cfg);
    expect(t.chain.map((c) => c.name)).toEqual(["child", "parent"]);
    // own beats inherited; a layout the child does not ship resolves up the chain
    expect(String((t.layouts.post as (p: never) => unknown)(undefined as never))).toBe("child-post");
    expect(String((t.layouts.page as (p: never) => unknown)(undefined as never))).toBe("parent-page");
    const cov = (n: string) => t.coverage.find((c) => c.name === n)!;
    expect(cov("tldr").status).toBe("own");
    expect(cov("callout")).toMatchObject({ status: "inherited", via: "parent" });
    expect(cov("cta")).toMatchObject({ status: "fallback", via: "callout" });   // fallback declared by the parent, followed in the parent
    expect(cov("chart").status).toBe("missing");
    // tokens merge, child overriding; both stylesheets emit, parent first so the child cascades over it
    const tok = resolveTokens(cfg.config.theme.tokens as Parameters<typeof resolveTokens>[0]);
    expect(tok["color.accent"]).toBe("blue");
    expect(tok["size.body"]).toBe("1rem");
    expect(t.css!.indexOf(".p{}")).toBeLessThan(t.css!.indexOf(".c{}"));
  });
  test("extends: the parent's bytes are in the child's hash, and a cycle is reported not thrown", async () => {
    const root = "corpora/_test/theme-extends";
    const before = (await loadTheme(loadConfig(root))).hash;
    writeFileSync(join(root, "themes/parent/callout.tsx"), 'export default () => "parent-callout-2";');
    expect((await loadTheme(loadConfig(root))).hash).not.toBe(before);   // else a child never re-renders when its parent changes

    const loop = "corpora/_test/theme-cycle";
    rmSync(loop, { recursive: true, force: true });
    mkdirSync(join(loop, "themes/a"), { recursive: true }); mkdirSync(join(loop, "themes/b"), { recursive: true });
    writeFileSync(join(loop, "snypd.yaml"), "snypd: 1\nsite: { name: T, url: https://t.example }\ntheme: { use: a }\n");
    writeFileSync(join(loop, "themes/a/theme.yaml"), "theme: a\nextends: b\n");
    writeFileSync(join(loop, "themes/b/theme.yaml"), "theme: b\nextends: a\n");
    const cfg = loadConfig(loop);
    expect(cfg.diagnostics.map((d) => d.message).join(" ")).toContain("extends cycle");
    expect(cfg.layers.find((l) => l.name === "theme")!.chain!.map((c) => c.name)).toEqual(["a", "b"]);
  });
  test("editorial: the shipped child theme covers all 13 primitives without a single .tsx of its own", async () => {
    const root = "corpora/_test/theme-editorial";
    rmSync(root, { recursive: true, force: true }); mkdirSync(join(root, "content/posts"), { recursive: true });
    writeFileSync(join(root, "snypd.yaml"), "snypd: 1\nsite: { name: E, url: https://e.example }\ntheme: { use: editorial }\n");
    const t = await loadTheme(loadConfig(root));
    expect(t.chain.map((c) => c.name)).toEqual(["editorial", "base"]);
    expect(t.coverage.filter((c) => c.status === "inherited").length).toBe(13);
    expect(t.coverage.some((c) => c.status === "missing")).toBe(false);
    expect(Object.keys(t.layouts).sort()).toEqual(["author", "index", "page", "post", "term"]);
    expect(t.css).toContain("color-scheme: light dark");
  });
});

/**
 * S18b: the Desk. Two things are being pinned here beyond "it renders".
 *
 * **It must not need git.** `deskFacts` reads the index and the working tree, and the budget it inherits
 * (`preview.ttfb ≤ 50 ms`, D2) is only survivable while that stays true — so one fixture below is not a
 * repo at all. A `git status` added to this path fails that test rather than quietly costing 30 ms.
 *
 * **It must not grow an authoring affordance** (decision 44). The Desk carries no `<form>` and no
 * `<script>` at all: approval stays on the review page, where the reviewer has read the diff they are
 * signing. Both are asserted, because "we decided not to" is not a constraint until something checks.
 */
/**
 * S19a: the push card and the Desk's one button (decision 44).
 *
 * The fixture is a site with a bare repo beside it standing in for a host — which is the only honest way
 * to test this, because the thing being asserted is that clicking the button moves a branch onto a remote
 * and that nothing else goes with it. Three properties, in the order somebody would be hurt by losing them:
 *
 *  - **A `GET` cannot deploy anything**, and neither can a form on a page in another origin. A prefetch,
 *    a crawler and a cross-site POST all get a refusal.
 *  - **The button appears only when a push would mean something**, and says what is not going with it.
 *  - **The drafts branch stays home**, asserted on the remote's ref list rather than on our own words.
 */
describe("the push card (S19a)", () => {
  const site = "corpora/_test/desk-push";
  const remote = "corpora/_test/desk-push-remote.git";
  let server: Awaited<ReturnType<typeof preview>>;
  const refs = () => {
    const { git } = require("@snypd/core") as typeof import("@snypd/core");
    return git(remote, "for-each-ref", "--format=%(refname)").stdout.split("\n").filter(Boolean);
  };

  beforeAll(async () => {
    const c = await import("@snypd/core");
    for (const d of [site, remote]) rmSync(d, { recursive: true, force: true });
    mkdirSync(`${site}/content/posts`, { recursive: true });
    writeFileSync(`${site}/snypd.yaml`, "snypd: 1\nsite: { name: Push desk, url: https://push-desk.example }\n");
    initRepo(site, { name: "T", email: "t@example.com" });
    c.git(site, "add", "-A"); c.git(site, "commit", "-q", "-m", "init");
    mkdirSync(remote, { recursive: true });
    c.git(remote, "init", "-q", "--bare", "-b", "main");
    c.git(site, "remote", "add", "origin", `${process.cwd()}/${remote}`);

    const cfg = c.loadConfig(site);
    const repo = c.Repo.open(site)!;
    const made = c.createContent(site, { type: "post", slug: "live-one", frontmatter: { title: "Live one", date: "2026-09-01" }, body: "Published words.", cfg });
    repo.useDrafts(made.paths); repo.commit(made.paths, "content: create post/live-one");
    const pub = c.setStatus(site, { type: "post", slug: "live-one", status: "published", cfg });
    repo.commit(pub.paths, "content: publish post/live-one");
    repo.land(pub.paths, "content: publish post/live-one");
    // One draft in flight, so the card can say what a push leaves behind.
    const draft = c.createContent(site, { type: "post", slug: "still-drafting", frontmatter: { title: "Still drafting", date: "2026-09-02" }, body: "Not yet.", cfg });
    repo.commit(draft.paths, "content: create post/still-drafting");

    server = await preview(site, { port: 0, watch: false });
  });
  afterAll(() => server?.stop());

  test("shows where the site goes, what would go, and what is staying here", async () => {
    const page = await (await fetch(`${server.url}/_snypd`)).text();
    expect(page).toContain(">Push<");
    expect(page).toContain("origin");
    expect(page).toContain("never pushed");
    expect(page).toContain("content: publish post/live-one");     // the commit that would go, by subject
    expect(page).toContain("1 draft in flight");                  // and the one that would not…
    // …including the word that carries the whole meaning. The first fix of this sentence rendered
    // "3 drafts in flight — a push sends main, and they are on it" on the real site: the negation was
    // dropped, so the row said the exact opposite of what it exists to say.
    expect(page).toContain("it is not on it");
    expect(page).not.toMatch(/and (they are|it is) on it/);
    expect(page).toContain("<form");
    expect(page).toContain("<button");
    expect(page).toContain('action="/_snypd/push"');
    expect(page).not.toContain("<input");                          // still nothing a person can type into
    expect(page).not.toContain("<script");
  });

  test("a GET cannot push, and neither can a form in another origin", async () => {
    expect((await fetch(`${server.url}/_snypd/push`)).status).toBe(405);
    const cross = await fetch(`${server.url}/_snypd/push`, { method: "POST", headers: { "sec-fetch-site": "cross-site" }, redirect: "manual" });
    expect(cross.status).toBe(403);
    expect(refs()).toEqual([]);                                    // neither of those moved a byte
  });

  test("the button pushes the base branch, and only the base branch", async () => {
    const res = await fetch(`${server.url}/_snypd/push`, { method: "POST", redirect: "manual", headers: { "sec-fetch-site": "same-origin", "x-snypd-reviewer": "sunny" } });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/_snypd");
    // The whole point, asserted on the remote rather than on the page: `snypd/drafts` did not go.
    expect(refs()).toEqual(["refs/heads/main"]);

    const page = await (await fetch(`${server.url}/_snypd`)).text();
    expect(page).toContain("Pushed");
    expect(page).toContain("sunny");
    expect(page).toContain("up to date");
    expect(page).not.toContain("never pushed");
  });
});

describe("Desk (S18b)", () => {
  const site = "corpora/_test/desk";
  const bare = "corpora/_test/desk-nogit";
  let server: Awaited<ReturnType<typeof preview>>;
  let bareServer: Awaited<ReturnType<typeof preview>>;
  const now = Date.UTC(2026, 7, 28, 12, 0, 0);

  beforeAll(async () => {
    const c = await import("@snypd/core");
    for (const dir of [site, bare]) {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(`${dir}/content/posts`, { recursive: true });
      writeFileSync(`${dir}/snypd.yaml`, "snypd: 1\nsite: { name: Desk test, url: https://desk.example }\n");
    }
    const { git } = await import("@snypd/core");
    initRepo(site, { name: "T", email: "t@example.com" });
    git(site, "add", "-A"); git(site, "commit", "-q", "-m", "init");

    const cfg = c.loadConfig(site);
    c.createContent(site, { type: "post", slug: "shipped", frontmatter: { title: "Shipped", date: "2026-08-01" }, body: "Public words.", cfg });
    c.setStatus(site, { type: "post", slug: "shipped", status: "published", cfg });
    c.createContent(site, { type: "post", slug: "in-progress", frontmatter: { title: "In progress", date: "2026-08-02" }, body: "Draft words.", cfg });
    server = await preview(site, { port: 0, watch: false, activity: () => ({ calls: 7, lastMethod: "tools/call", lastAt: Date.now() - 2000, since: Date.now() - 60000, client: "claude-code" }) });

    // No `initRepo` here on purpose — this is the fixture that proves the Desk never reaches for git.
    const bareCfg = c.loadConfig(bare);
    c.createContent(bare, { type: "post", slug: "orphan", frontmatter: { title: "Orphan", date: "2026-08-03" }, body: "No repo here.", cfg: bareCfg });
    bareServer = await preview(bare, { port: 0, watch: false });
  });
  afterAll(() => { server?.stop(); bareServer?.stop(); });

  test("lists what is in flight and leaves out what is already public", async () => {
    const res = await fetch(`${server.url}/_snypd`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const page = await res.text();
    expect(page).toContain("Snypd Desk");
    expect(page).toContain("In flight (1)");
    expect(page).toContain("In progress");
    expect(page).toContain("/_snypd/review/post/in-progress");
    expect(page).not.toContain("Shipped");            // published is not in flight
    expect(page).toContain("ready to publish");       // the default policy since S19c: no human in the loop
  });

  test("a trailing slash is the same page", async () => {
    expect((await fetch(`${server.url}/_snypd/`)).status).toBe(200);
  });

  test("the status card reports the harness that is actually talking to us", async () => {
    const page = await (await fetch(`${server.url}/_snypd`)).text();
    expect(page).toContain("connected");
    expect(page).toContain("claude-code");
    expect(page).toContain("tools/call");
    // A preview nobody started from a tool call says so, and names the step that fixes it (S18a).
    const alone = await (await fetch(`${bareServer.url}/_snypd`)).text();
    expect(alone).toContain("nothing has called this server yet");
    expect(alone).toContain(".mcp.json");
  });

  test("renders in a directory that is not a git repo — the Desk never shells out to git", async () => {
    const res = await fetch(`${bareServer.url}/_snypd`);
    expect(res.status).toBe(200);
    const page = await res.text();
    expect(page).toContain("In flight (1)");
    expect(page).toContain("Orphan");
  });

  /**
   * S19a narrows this, deliberately. Until now the Desk carried no `<form>` and no `<button>` at all, and
   * decision 44's push button is exactly the exception that rule was written to allow — "a human clicking
   * in a local browser is a stronger gate than a `destructiveHint` on a tool an agent can call". So what
   * is asserted is no longer "no controls" but **which** control: one form, one button, posting to one
   * route that pushes a branch. No field a person can type into, and still no script anywhere.
   *
   * Both fixtures here have no remote, so neither renders the button — the card draws a sentence instead.
   * The button's own test is the `push card` block below, against a bare repo it can actually push to.
   */
  test("carries no script and nothing a person can type into (decision 44)", async () => {
    for (const url of [`${server.url}/_snypd`, `${bareServer.url}/_snypd`]) {
      const page = await (await fetch(url)).text();
      expect(page).not.toContain("<script");
      expect(page).not.toContain("onclick");
      expect(page).not.toContain("<input");
      expect(page).not.toContain("<textarea");
      // No remote in either fixture ⇒ no push is possible ⇒ no button is drawn.
      expect(page).not.toContain("<form");
      expect(page).not.toContain("<button");
    }
    // And the one that is not a repo has no push card at all: nothing to say, so nothing said.
    expect(await (await fetch(`${bareServer.url}/_snypd`)).text()).not.toContain(">Push<");
  });

  test("under `draft` policy an approved draft reads as ready, and stops when it changes", async () => {
    const c = await import("@snypd/core");
    // The opt-in shape (S19c, decision 80). The Desk renders approval state only for a type that asks
    // for approval; the default is `publish`, which the test above covers.
    writeFileSync(`${site}/snypd.yaml`, "snypd: 1\nsite: { name: Desk test, url: https://desk.example }\ntypes: { post: { mcp: { write: draft } } }\n");
    await server.rebuild();
    const cfg = c.loadConfig(site);
    const store = c.approvals(site);
    const source = c.draftSource(site, cfg, "post", "in-progress")!;
    c.approve(store, { type: "post", slug: "in-progress", hash: c.contentHash(source), by: "a human", at: new Date().toISOString() });
    expect(await (await fetch(`${server.url}/_snypd`)).text()).toContain("ready to publish");

    c.updateContent(site, { type: "post", slug: "in-progress", body: "Different words entirely.", cfg });
    await server.rebuild();
    const after = await (await fetch(`${server.url}/_snypd`)).text();
    expect(after).toContain("changed after it was approved");
    expect(after).not.toContain("ready to publish");
  });

  test("the review page offers a way back, and its scroll regions are keyboard-reachable", async () => {
    const page = await (await fetch(`${server.url}/_snypd/review/post/in-progress`)).text();
    expect(page).toContain('href="/_snypd"');
    // Found by the Desk's own bench lane (S18b): a `pre` that scrolls and cannot be tabbed to is an axe
    // `scrollable-region-focusable` violation. The review page had shipped that way since S11, because
    // until this session no browser suite had ever loaded it.
    expect(page).toContain('<pre tabindex="0">');
    expect(page).not.toContain("<pre>");
  });

  test("deskPage is pure and its clock is a parameter", () => {
    const facts = {
      site: { name: "S", url: "https://s.example" },
      theme: { name: "base", chain: ["base"], coverage: [] },
      drafts: [],
      previewUrl: "http://localhost:1",
      activity: { calls: 3, lastMethod: "resources/read", lastAt: now - 90_000, since: now - 3_600_000 },
    };
    const html = deskPage(facts, now).html;
    expect(html).toContain("2 min ago");        // lastAt, rendered against the injected clock
    expect(html).toContain("1 h ago");          // since
    expect(html).toContain('http-equiv="refresh"');
    expect(html).toContain('content="noindex, nofollow"');   // an operator page is never indexed
    expect(html).toContain("Nothing in flight");
    // `refresh: 0` is how the bench measures a still page — a meta refresh mid-run would reload Chrome
    // out from under axe-core and make the a11y number a race.
    expect(deskPage({ ...facts, refresh: 0 }, now).html).not.toContain("http-equiv");
  });

  /**
   * S18f — the first-run checklist (`07` decision 52, docs/08 §9).
   *
   * The property worth a test is the *disappearance*: there is no dismiss button and no stored flag
   * anywhere in this codebase, so "the six are true" has to be the only thing that stops it rendering.
   * A checklist that could be turned off would be a seventh piece of state, and it would be wrong the
   * first time somebody deleted their only post.
   */
  test("the first-run checklist renders from the six facts, and vanishes when they are true", () => {
    const base = {
      site: { name: "S", url: "http://localhost:4321" },
      theme: { name: "base", chain: ["base"], coverage: [] },
      drafts: [], previewUrl: "http://localhost:1", refresh: 0,
    };
    const fresh: DeskOnboarding = {
      config: false, git: false, harness: "never", items: 0, placeholderUrl: true,
      registration: { present: true, names: true, missingCommand: false, command: "snypd" },
      mcpJson: '{\n  "mcpServers": { "snypd": { "command": "snypd", "args": ["serve"] } }\n}',
      prompts: [{ name: "get-started", description: "Start here." }],
      sentence: "Set up snypd here and write me a first post.",
    };
    const html = deskPage({ ...base, onboarding: fresh }, now).html;
    expect(html).toContain("First run — 1 of 6");
    // All three surfaces are named, because not knowing which one you are looking at is the whole of
    // onboarding confusion (decision 52).
    expect(html).toContain("do this in your harness");
    expect(html).toContain("say this to your agent");
    expect(html).toContain("type this");
    expect(html).toContain("Set up snypd here");                 // the sentence, passed in, not repeated here
    expect(html).toContain("mcpServers");                        // the block, verbatim (§9.4)
    expect(html).toContain("<code>get-started</code>");
    expect(html).toContain("<summary>What is snypd?</summary>");
    // Rows that cannot be reached yet are shown as later rather than hidden: a flow you can see the end
    // of is a flow people finish.
    expect(html).toContain(">later<");
    expect(html).toContain(">next<");
    // The placeholder is flagged on the status card rather than presented as the site's address.
    expect(html).toContain("placeholder — needed before publish");
    // Every `pre` on this page scrolls, so every one of them is keyboard-reachable (decision 50).
    expect(html).not.toContain("<pre>");

    const done: DeskOnboarding = { ...fresh, config: true, git: true, harness: "connected", items: 2, placeholderUrl: false };
    const settled = deskPage({ ...base, onboarding: done }, now).html;
    expect(settled).not.toContain("First run");
    expect(settled).not.toContain("mcpServers");
    expect(settled).not.toContain("placeholder — needed");
  });

  /**
   * docs/08 §10: *spawned and silent* and *never spawned* are two different instructions to a person,
   * and until S18f they rendered as the same grey line.
   */
  test("the four harness states each say something different", () => {
    const base = {
      site: { name: "S", url: "https://s.example" },
      theme: { name: "base", chain: ["base"], coverage: [] },
      drafts: [], previewUrl: "http://localhost:1", refresh: 0,
    };
    const o = (harness: DeskOnboarding["harness"]): DeskOnboarding => ({
      config: true, git: true, harness, items: 0, placeholderUrl: false,
      registration: { present: true, names: true, missingCommand: false, command: "snypd" }, sentence: "x",
    });
    expect(deskPage({ ...base, onboarding: o("never") }, now).html).toContain("has not seen");
    expect(deskPage({ ...base, onboarding: o("silent") }, now).html).toContain("spawned and then went unused");
    expect(deskPage({ ...base, onboarding: o("stale") }, now).html).toContain("had this server and let it go");
    expect(deskPage({ ...base, onboarding: o("connected") }, now).html).toContain("went green on its first call");
  });
});

/** S11: the preview server — drafts visible, the review page, and approval as the publish gate. */
/**
 * S18f — the empty state (`07` decision 52).
 *
 * Two claims, and the second is the one that matters: the index a brand-new site serves is *rendered*,
 * and `build()` never emits it. A welcome post would satisfy the first and fail the second — a file
 * every new site has to delete is a file that ships to production when somebody forgets.
 */
describe("the empty state (S18f)", () => {
  const site = "corpora/_test/empty";
  let server: Awaited<ReturnType<typeof preview>>;

  beforeAll(async () => {
    rmSync(site, { recursive: true, force: true });
    mkdirSync(`${site}/content/posts`, { recursive: true });
    writeFileSync(`${site}/snypd.yaml`, "snypd: 1\nsite: { name: brand new, url: https://n.example }\n");
    initRepo(site, { name: "T", email: "t@example.com" });
    server = await preview(site, { port: 0, watch: false });
  });
  afterAll(() => server?.stop());

  /**
   * docs/08 §12.9 — the defect this session exists for. A preview started by `snypd dev` is a different
   * process from the MCP server, so "is a harness connected" had to leave that process to be true here.
   * The test writes the record the way the server does and asserts the page changes.
   */
  test("the status card reads a harness that is in another process", async () => {
    const c = await import("@snypd/core");
    expect(await (await fetch(`${server.url}/_snypd`)).text()).toContain("nothing has called this server yet");
    c.writeHeartbeat(site, { startedAt: Date.now() - 5_000, calls: 7, lastMethod: "tools/call", lastAt: Date.now(), since: Date.now() - 5_000, client: "another-process" });
    const page = await (await fetch(`${server.url}/_snypd`)).text();
    expect(page).toContain("connected");
    expect(page).toContain("another-process");
    // A record whose process is gone is a claim that expired, not a connection.
    c.writeHeartbeat(site, { startedAt: Date.now(), calls: 7, pid: 4_194_304 });
    expect(await (await fetch(`${server.url}/_snypd`)).text()).toContain("nothing has called this server yet");
    c.clearHeartbeat(site, 4_194_304);
  });

  test("a site with nothing in it renders the vocabulary, and the build never emits it", async () => {
    const html = await (await fetch(`${server.url}/`)).text();
    expect(html).toContain("data-snypd-empty-state");
    expect(html).toContain("Only you can see this");
    // The theme rendering the vocabulary, not a splash page we wrote: these classes come from the
    // primitives, so a theme with real components produces real components here.
    expect(html).toMatch(/tldr|callout|steps|faq/);

    // The markdown twin is what an agent reads, and it gets the real (empty) index rather than a page
    // written at a person.
    const md = await fetch(`${server.url}/`, { headers: { accept: "text/markdown" } });
    expect(await md.text()).not.toContain("Only you can see this");

    await build(site);
    const index = `${site}/dist/index.html`;
    expect(existsSync(index)).toBe(true);
    expect(readFileSync(index, "utf8")).not.toContain("data-snypd-empty-state");

    // And it is gone the moment there is one real item — nothing to delete.
    const c = await import("@snypd/core");
    const cfg = c.loadConfig(site);
    c.createContent(site, { type: "post", slug: "first", frontmatter: { title: "First", date: "2026-08-01" }, body: "Words.", cfg });
    await server.rebuild();
    expect(await (await fetch(`${server.url}/`)).text()).not.toContain("data-snypd-empty-state");
  });
});

describe("preview (S11)", () => {
  const site = "corpora/_test/preview";
  let server: Awaited<ReturnType<typeof preview>>;

  beforeAll(async () => {
    rmSync(site, { recursive: true, force: true });
    mkdirSync(`${site}/content/posts`, { recursive: true });
    // `write: draft` declared, not inherited: since S19c the spec's default is `publish`, and this
    // describe exists to test the review-and-approve flow, which only a `draft`-policy type has.
    writeFileSync(`${site}/snypd.yaml`, "snypd: 1\nsite: { name: preview, url: https://p.example }\ntypes: { post: { mcp: { write: draft } } }\n");
    const { git } = await import("@snypd/core");
    initRepo(site, { name: "T", email: "t@example.com" });   // guarded: never inits into the enclosing repo
    git(site, "add", "-A"); git(site, "commit", "-q", "-m", "init");
    const c = await import("@snypd/core");
    const cfg = c.loadConfig(site);
    c.createContent(site, { type: "post", slug: "live", frontmatter: { title: "Live", date: "2026-08-01" }, body: "Published words.", cfg });
    c.setStatus(site, { type: "post", slug: "live", status: "published", cfg });
    c.createContent(site, { type: "post", slug: "hidden", frontmatter: { title: "Hidden", date: "2026-08-02" }, body: "Draft words.", cfg });
    server = await preview(site, { port: 0, watch: false });
  });
  afterAll(() => server?.stop());

  test("a draft is served by the preview and absent from the production build", async () => {
    expect((await fetch(`${server.url}/posts/hidden/`)).status).toBe(200);
    expect(await (await fetch(`${server.url}/posts/hidden/`)).text()).toContain("Draft words.");
    expect((await fetch(`${server.url}/posts/live/`)).status).toBe(200);
    expect((await fetch(`${server.url}/posts/nope/`)).status).toBe(404);
    expect(existsSync(`${site}/.snypd/preview/posts/hidden/index.html`)).toBe(true);
    await build(site);                                                   // the real build, same index-free path
    expect(existsSync(`${site}/dist/posts/live/index.html`)).toBe(true);
    expect(existsSync(`${site}/dist/posts/hidden/index.html`)).toBe(false);
  });

  test("the .md twin still answers content negotiation", async () => {
    const res = await fetch(`${server.url}/posts/hidden/`, { headers: { accept: "text/markdown" } });
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(await res.text()).toContain("title: Hidden");
  });

  test("the review page shows the version, and approving it unlocks publish for that version only", async () => {
    const c = await import("@snypd/core");
    const cfg = c.loadConfig(site);
    const page = await (await fetch(`${server.url}/_snypd/review/post/hidden`)).text();
    expect(page).toContain("Review: post/hidden");
    expect(page).toContain("needs a human");
    expect(page).toContain("Approve this version");

    expect((await fetch(`${server.url}/_snypd/approve/post/hidden`)).status).toBe(405);     // a GET can never approve
    const posted = await fetch(`${server.url}/_snypd/approve/post/hidden`, { method: "POST", redirect: "manual", headers: { "x-snypd-reviewer": "sunny" } });
    expect(posted.status).toBe(303);

    const store = c.approvals(site);                                    // the file both servers read, not either index
    expect(c.publishCheck(site, cfg, store, "post", "hidden")).toMatchObject({ ok: true });
    expect(c.approvalOf(store, "post", "hidden")!.by).toBe("sunny");
    c.updateContent(site, { type: "post", slug: "hidden", body: "Different words.", cfg });
    expect(c.publishCheck(site, cfg, store, "post", "hidden").reason).toContain("changed after it was approved");
    expect((await fetch(`${server.url}/_snypd/review/post/nope`)).status).toBe(404);
  });

  test("a content change is picked up by the next request, and nothing else rebuilds", async () => {
    const c = await import("@snypd/core");
    c.updateContent(site, { type: "post", slug: "hidden", body: "Rewritten in place.", cfg: c.loadConfig(site) });
    const r = await server.rebuild();
    expect(r.rendered).toBeGreaterThan(0);
    expect(r.cached).toBeGreaterThan(r.rendered);                        // one route re-rendered, the rest kept
    expect(await (await fetch(`${server.url}/posts/hidden/`)).text()).toContain("Rewritten in place.");
  });
});

describe("media (S13): copied verbatim, sized from its header, reserved in the markup", () => {
  const root = "corpora/_test/media";
  const dist = join(root, "dist");
  beforeAll(async () => {
    rmSync(root, { recursive: true, force: true });
    for (const d of ["content/posts", "content/media/nested"]) mkdirSync(join(root, d), { recursive: true });
    cpSync("themes/base", join(root, "themes/base"), { recursive: true, filter: (f) => !f.endsWith("package.json") });
    writeFileSync(join(root, "snypd.yaml"), "snypd: 1\nsite: { name: M, url: https://m.example }\ntheme: { use: base }\n");
    writeFileSync(join(root, "content/media/shot.png"), png(64, 48, [1, 2, 3]));
    writeFileSync(join(root, "content/media/nested/logo.svg"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"><rect width="30" height="20"/></svg>');
    writeFileSync(join(root, "content/posts/p.md"),
      "---\ntitle: P\ndate: 2026-01-01\nstatus: published\n---\n\n## S\n\nText.\n\n"
      + '::figure{src="/media/shot.png" alt="A shot" caption="Cap."}\n\n'
      + '::figure{src="https://elsewhere.example/x.png" alt="Off site"}\n');
    await build(root);
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  test("image headers give intrinsic size for the five formats a site actually uses", () => {
    expect(imageSize(png(7, 9, [0, 0, 0]))).toEqual({ width: 7, height: 9 });
    expect(imageSize(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x0a, 0x00, 0x14, 0x00, 0, 0]))).toEqual({ width: 10, height: 20 });
    // JPEG: SOI, a COM segment to be walked over, then SOF0 carrying height then width.
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xfe, 0x00, 0x04, 0x41, 0x42, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x40, 0x00, 0x80, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(imageSize(jpeg)).toEqual({ width: 128, height: 64 });
    expect(svgSize('<svg width="12px" height="8px">')).toEqual({ width: 12, height: 8 });
    expect(svgSize('<svg viewBox="0 0 40 25" fill="none">')).toEqual({ width: 40, height: 25 });
    expect(svgSize("<p>not an svg</p>")).toBeUndefined();
    expect(imageSize(new Uint8Array([1, 2, 3, 4]))).toBeUndefined();
  });

  test("content/media is copied byte for byte, nested paths included", () => {
    expect(readFileSync(join(dist, "media/shot.png"))).toEqual(readFileSync(join(root, "content/media/shot.png")));
    expect(existsSync(join(dist, "media/nested/logo.svg"))).toBe(true);
  });

  test("site.icon becomes the favicon link, which is the only thing between a page and Lighthouse 100 (S14)", async () => {
    const cfg = readFileSync(join(root, "snypd.yaml"), "utf8");
    writeFileSync(join(root, "snypd.yaml"), cfg.replace("site: {", "site: { icon: /media/shot.png,"));
    await build(root);
    expect(readFileSync(join(dist, "posts/p/index.html"), "utf8")).toContain('<link rel="icon" href="/media/shot.png">');
    writeFileSync(join(root, "snypd.yaml"), cfg);
    await build(root);
  });
  test("figure reserves the box for a local image and guesses nothing for a remote one", () => {
    const html = readFileSync(join(dist, "posts/p/index.html"), "utf8");
    expect(html).toContain('<img src="/media/shot.png" alt="A shot" loading="lazy" decoding="async" width="64" height="48">');
    expect(html).toContain('<img src="https://elsewhere.example/x.png" alt="Off site" loading="lazy" decoding="async">');
  });

  test("an unchanged media file is not recopied; a changed one is", async () => {
    const r1 = await build(root);
    expect(r1.media).toBe(2);
    expect(r1.rendered).toBe(0);
    writeFileSync(join(root, "content/media/shot.png"), png(10, 10, [9, 9, 9]));
    const r2 = await build(root);
    expect(r2.rendered).toBeGreaterThan(0);
    expect(readFileSync(join(dist, "posts/p/index.html"), "utf8")).toContain('width="10" height="10"');
  });
});

/**
 * S18e — the preview stops belonging to the agent's session and starts belonging to the person
 * (`07` decision 51). Three claims are testable and all three are here: nobody collides on a port any
 * more, a second process can *find* the server rather than guess at it, and the preview-only behaviour
 * lives in the response and never in the bytes.
 */
describe("snypd dev (S18e): one preview, findable, and the same bytes as dist/", () => {
  const site = "corpora/_test/dev";
  let server: Awaited<ReturnType<typeof preview>>;

  beforeAll(async () => {
    rmSync(site, { recursive: true, force: true });
    mkdirSync(`${site}/content/posts`, { recursive: true });
    writeFileSync(`${site}/snypd.yaml`, "snypd: 1\nsite: { name: dev, url: https://d.example }\n");
    const c = await import("@snypd/core");
    initRepo(site, { name: "T", email: "t@example.com" });
    c.git(site, "add", "-A"); c.git(site, "commit", "-q", "-m", "init");
    const cfg = c.loadConfig(site);
    c.createContent(site, { type: "post", slug: "out", frontmatter: { title: "Out", date: "2026-08-01" }, body: "Published words.", cfg });
    c.setStatus(site, { type: "post", slug: "out", status: "published", cfg });
    c.createContent(site, { type: "post", slug: "wip", frontmatter: { title: "Wip", date: "2026-08-02" }, body: "Draft words.", cfg });
    server = await preview(site, { port: 0, watch: false, reload: 2, deskLink: true });
  });
  afterAll(() => { server?.stop(); rmSync(site, { recursive: true, force: true }); });

  // docs/08 §12.3: the defect decision 51 predicted, live and red since S11. Both callers defaulted to
  // 4321 with no fallback, so a human with a preview open made every `render_preview` return no URL.
  test("a second server takes the next free port, and an explicitly typed one refuses to move", async () => {
    const a = await preview(site, { port: 0, watch: false });
    try {
      const b = await preview(site, { port: a.port, watch: false });
      try {
        expect(b.port).toBe(a.port + 1);
        expect((await fetch(`${b.url}/posts/out/`)).status).toBe(200);
      } finally { b.stop() }
      // Someone who types `--port=` has an opinion about which port; they get the error, not a second
      // address to be confused by. This is the shape `snypd dev --port=N` passes.
      await expect(preview(site, { port: a.port, watch: false, strictPort: true })).rejects.toThrow(/in use/);
    } finally { a.stop() }
  });

  test("/_snypd/alive says which snypd holds this port, and for which site", async () => {
    const j = await (await fetch(`${server.url}/_snypd/alive`)).json() as { snypd: boolean; pid: number; root: string };
    expect(j.snypd).toBe(true);
    expect(j.pid).toBe(process.pid);
    expect(j.root).toBe(resolve(site));
    // It answers without building anything: proving a server is there must cost less than starting one.
    expect(server.dirty()).toBe(false);
  });

  test("liveDev finds a running server, and refuses a record it cannot prove", async () => {
    const c = await import("@snypd/core");
    c.writeDev(site, { url: server.url, port: server.port, hostname: server.hostname, root: resolve(site), pid: process.pid, startedAt: new Date().toISOString() });
    expect((await c.liveDev(site))?.url).toBe(server.url);

    // A record is a claim. A port nobody is holding is the ordinary stale case — a `dev` that was killed
    // — and it is cleaned up on the way out rather than handed to an agent as a URL.
    c.writeDev(site, { url: "http://localhost:9", port: 9, hostname: "localhost", root: resolve(site), pid: process.pid, startedAt: new Date().toISOString() });
    expect(await c.liveDev(site)).toBeUndefined();
    expect(c.readDev(site)).toBeUndefined();

    // …and a record naming another site is not ours to use, however alive it is: two checkouts on one
    // box would otherwise hand each other's previews out.
    c.writeDev(site, { url: server.url, port: server.port, hostname: server.hostname, root: resolve(site, "..", "elsewhere"), pid: process.pid, startedAt: "" });
    expect(await c.liveDev(site)).toBeUndefined();
    c.clearDev(site);
  });

  test("clearDev leaves a record that is not ours alone", async () => {
    const c = await import("@snypd/core");
    c.writeDev(site, { url: server.url, port: server.port, hostname: server.hostname, root: resolve(site), pid: process.pid + 1, startedAt: "" });
    c.clearDev(site);                       // running as `process.pid`, so this record belongs to someone else
    expect(c.readDev(site)?.pid).toBe(process.pid + 1);
    c.clearDev(site, process.pid + 1);
    expect(c.readDev(site)).toBeUndefined();
  });

  // Decision 51's hard rule: live reload may not change a published byte. The whole claim of the preview
  // is that it is the same build that publishes, so everything preview-only lives in the response.
  test("the reload header and the Desk strip are in the response and never in the file", async () => {
    const res = await fetch(`${server.url}/posts/out/`);
    expect(res.headers.get("refresh")).toBe("2");
    const body = await res.text();
    expect(body).toContain('href="/_snypd"');
    expect(readFileSync(`${site}/.snypd/preview/posts/out/index.html`, "utf8")).not.toContain('href="/_snypd"');

    // Only HTML is decorated: the markdown twin is what an agent reads and the JSON API what a program
    // reads, and a strip in either would be a preview-only difference in the one surface that must not have any.
    const md = await fetch(`${server.url}/posts/out/`, { headers: { accept: "text/markdown" } });
    expect(await md.text()).not.toContain("_snypd");
    expect((await fetch(`${server.url}/api/site.json`)).headers.get("refresh")).toBeNull();

    // The Desk is not decorated either — a strip pointing at the page you are on is noise, and it
    // carries its own meta refresh, which a header would double.
    const desk = await fetch(`${server.url}/_snypd`);
    expect(desk.headers.get("refresh")).toBeNull();
  });

  test("every page the preview serves from disk is byte-identical to the one dist/ publishes", async () => {
    await build(site);
    const dist = join(site, "dist"), prev = join(site, ".snypd", "preview");
    const walk = (dir: string, base = dir): string[] => readdirSync(dir, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name), base) : [relative(base, join(dir, e.name))]));
    const files = walk(dist);
    expect(files.length).toBeGreaterThan(5);
    // Index and feed pages legitimately differ — the preview has a draft in them, which is what it is
    // for. Every *item* page must not: that is the sentence "what you see is what publishes".
    const items = files.filter((f) => f.startsWith("posts/out/"));
    expect(items.length).toBeGreaterThan(1);          // index.html and its .md twin at least
    for (const f of items) {
      expect(existsSync(join(prev, f))).toBe(true);
      expect(readFileSync(join(prev, f))).toEqual(readFileSync(join(dist, f)));
    }
  });
});

/**
 * S18k — the reload stops being a clock. What has to hold: the listener reaches the *browser* and never a
 * file (decision 51's reason, which byte-equality above is the other half of), one save is one reload
 * however many events the filesystem reports for it, and the mode a caller does not ask for is off.
 */
describe("live reload (S18k): the page reloads because something changed, not every N seconds", () => {
  const site = "corpora/_test/live";
  const post = join(site, "content/posts/hello.md");

  beforeAll(async () => {
    rmSync(site, { recursive: true, force: true });
    mkdirSync(join(site, "content/posts"), { recursive: true });
    writeFileSync(join(site, "snypd.yaml"), "snypd: 1\nsite: { name: live, url: https://l.example }\n");
    const c = await import("@snypd/core");
    const cfg = c.loadConfig(site);
    c.createContent(site, { type: "post", slug: "hello", frontmatter: { title: "Hello", date: "2026-08-01" }, body: "First words.", cfg });
    c.setStatus(site, { type: "post", slug: "hello", status: "published", cfg });
  });
  afterAll(() => rmSync(site, { recursive: true, force: true }));

  /** Data events only: SSE comments are the heartbeat and the greeting, and neither reloads a page. */
  const collect = async (url: string, ms: number, during?: () => void): Promise<string[]> => {
    const res = await fetch(url);
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const events: string[] = [];
    const until = Date.now() + ms;
    const pump = (async () => {
      while (Date.now() < until) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        for (const line of buf.split("\n")) if (line.startsWith("data:")) events.push(line.slice(5).trim());
        buf = buf.slice(buf.lastIndexOf("\n") + 1);
      }
    })();
    await Bun.sleep(150);                       // the stream is open and registered before the edit lands
    during?.();
    await Promise.race([pump, Bun.sleep(ms)]);
    await reader.cancel().catch(() => {});
    return events;
  };

  test("the listener rides the response and never a file the preview wrote", async () => {
    const s = await preview(site, { port: 0, watch: false, reload: "watch", deskLink: true });
    try {
      const res = await fetch(`${s.url}/posts/hello/`);
      const html = await res.text();
      expect(html).toContain("data-snypd-live");
      expect(html).toContain(LIVE_ROUTE);
      // The whole of decision 51's reason: what publishes has none of this in it.
      expect(readFileSync(join(s.out, "posts/hello/index.html"), "utf8")).not.toContain("data-snypd-live");
      // A stream and a poll are alternatives, not layers — two of them would reload twice.
      expect(res.headers.has("refresh")).toBe(false);
    } finally { s.stop(); }
  });

  test("a numeric reload is still the S18e header, with no script in the page", async () => {
    const s = await preview(site, { port: 0, watch: false, reload: 2, deskLink: true });
    try {
      const res = await fetch(`${s.url}/posts/hello/`);
      expect(res.headers.get("refresh")).toBe("2");
      expect(await res.text()).not.toContain("data-snypd-live");
      expect((await fetch(`${s.url}${LIVE_ROUTE}`)).status).toBe(404);
    } finally { s.stop(); }
  });

  test("no reload asked for is no listener, no header, and no stream to open", async () => {
    const s = await preview(site, { port: 0, watch: false, deskLink: true });
    try {
      const res = await fetch(`${s.url}/posts/hello/`);
      expect(res.headers.has("refresh")).toBe(false);
      expect(await res.text()).not.toContain("data-snypd-live");
      expect((await fetch(`${s.url}${LIVE_ROUTE}`)).status).toBe(404);
    } finally { s.stop(); }
  });

  test("one save is one event, however many the filesystem reports, and the next page has the edit", async () => {
    const s = await preview(site, { port: 0, reload: "watch", deskLink: true });
    try {
      const events = await collect(`${s.url}${LIVE_ROUTE}`, 900, () => {
        writeFileSync(post, readFileSync(post, "utf8").replace("First words.", "Second words."));
      });
      // A single `writeFileSync` is routinely two inotify events; the settle window is what makes it
      // one reload. More than one here is a page that flickers twice per keystroke.
      expect(events).toEqual(["1"]);
      expect(await (await fetch(`${s.url}/posts/hello/`)).text()).toContain("Second words.");
    } finally { s.stop(); }
  });
});

describe("theme reload (S13): the preview bundles, so an edit to an inner file is not served stale", () => {
  const root = "corpora/_test/reload";
  const shell = join(root, "themes/base/layouts/shell.tsx");
  beforeAll(() => {
    rmSync(root, { recursive: true, force: true });
    mkdirSync(join(root, "content/posts"), { recursive: true });
    cpSync("themes/base", join(root, "themes/base"), { recursive: true, filter: (f) => !f.endsWith("package.json") });
    writeFileSync(join(root, "snypd.yaml"), "snypd: 1\nsite: { name: R, url: https://r.example }\ntheme: { use: base }\n");
    writeFileSync(join(root, "content/posts/p.md"), "---\ntitle: P\ndate: 2026-01-01\nstatus: published\n---\n\n## S\n\nText.\n");
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  test("editing shell.tsx — which the layouts import statically — shows up without a restart", async () => {
    const s = await preview(root, { port: 0, watch: false });
    try {
      expect(await (await fetch(`${s.url}/posts/p/`)).text()).not.toContain("RELOADED");
      writeFileSync(shell, readFileSync(shell, "utf8").replace("<footer>", '<footer data-x="RELOADED">'));
      await s.rebuild();
      expect(await (await fetch(`${s.url}/posts/p/`)).text()).toContain("RELOADED");
    } finally { s.stop(); }
  });
});

describe("markdown props and the stylesheet on the wire (S14)", () => {
  test("inline(): a `type: markdown` prop renders as markdown, without a <p> around it", () => {
    expect(inline("The `.md` twin is the source file.").html).toBe("The <code>.md</code> twin is the source file.");
    expect(inline("a [link](/x) and *emphasis*").html).toBe('a <a href="/x">link</a> and <em>emphasis</em>');
    expect(inline(undefined).html).toBe("");
    expect(inline("").html).toBe("");
  });
  test("inline(): the no-markdown fast path is byte-identical to the parse it skips", () => {
    // The whole point of the fast path is that it cannot be told apart from the slow one — a caption that
    // takes it must render exactly as if it had been parsed, or the optimisation is a rendering bug.
    const slow = (x: string) => toHtml(parseMarkdown(x).tree, { headingIds: false, inline: true }).html;
    for (const c of [
      "Plain prose caption.", "  padded  ", "Cost: $4.20 (about 3% of the run)", "Tom & Jerry", "See &copy; 2026",
      "Great!", "a *bold* claim", "- a list", "1. numbered", "# heading", "> quoted", "under_score_s",
      "~~struck~~", "an ![img](x.png)", "5 < 6 > 4", "back\\slash", "line\nbreak",
    ]) expect([c, inline(c).html]).toEqual([c, slow(c)]);
  });
  test("minifyCss: comments and whitespace go, meaning does not", () => {
    expect(minifyCss("/* c */\na {\n  color: red;\n}\n")).toBe("a{color: red}");
    expect(minifyCss('.x::before { content: "/* not a comment */" }')).toBe('.x::before{content: "/* not a comment */"}');
    expect(minifyCss("a { width: calc(100% - 2px) }")).toBe("a{width: calc(100% - 2px)}");   // calc needs its spaces
    expect(minifyCss("p :first-child { color: red }")).toBe("p :first-child{color: red}");   // NOT p:first-child
    expect(minifyCss("@media (min-width: 40rem) { a { color: red } }")).toBe("@media (min-width: 40rem){a{color: red}}");
    expect(minifyCss('a { background: url("x y.png") }')).toBe('a{background: url("x y.png")}');
  });
});

describe("the cover is the header, not the first paragraph (S14)", () => {
  const root = "corpora/_test/cover";
  const dist = join(root, "dist");
  const read = (r: string) => readFileSync(join(dist, r, "index.html"), "utf8");
  beforeAll(async () => {
    rmSync(root, { recursive: true, force: true });
    for (const d of ["content/posts", "content/media"]) mkdirSync(join(root, d), { recursive: true });
    cpSync("themes/base", join(root, "themes/base"), { recursive: true, filter: (f) => !f.endsWith("package.json") });
    writeFileSync(join(root, "snypd.yaml"), "snypd: 1\nsite: { name: C, url: https://c.example }\ntheme: { use: base }\n");
    writeFileSync(join(root, "content/media/c.png"), png(1200, 630, [1, 2, 3]));
    // one post writes its own cover, one leaves it to frontmatter, one writes it in the wrong place
    writeFileSync(join(root, "content/posts/own.md"),
      "---\ntitle: Own\ndate: 2026-01-01\nstatus: published\n---\n\n"
      + '::cover{eyebrow="Eng" subtitle="A `code` subtitle" image="/media/c.png" alt="Cover"}\n\nBody.\n');
    writeFileSync(join(root, "content/posts/fm.md"),
      "---\ntitle: Fm\ndate: 2026-01-02\nstatus: published\ncover: { image: /media/c.png, alt: Cover, eyebrow: Notes }\n---\n\nBody.\n");
    writeFileSync(join(root, "content/posts/late.md"),
      "---\ntitle: Late\ndate: 2026-01-03\nstatus: published\n---\n\nBody first.\n\n::cover{eyebrow=\"Eng\"}\n");
    await build(root);
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  test("a leading ::cover becomes the page header and the layout draws none of its own", () => {
    const h = read("posts/own");
    expect(h).toContain('<header class="snypd-cover"><p class="snypd-eyebrow">Eng</p><h1>Own</h1>'
      + '<p class="snypd-subtitle">A <code>code</code> subtitle</p>'
      + '<img src="/media/c.png" alt="Cover" decoding="async" fetchpriority="high" width="1200" height="630"></header>');
    expect(h.match(/<h1>/g)!.length).toBe(1);                     // exactly one, wherever it came from
    expect(h.match(/class="snypd-cover"/g)!.length).toBe(1);      // and exactly one cover: this was the S13 defect
    expect(h).toContain('</header><p class="snypd-byline">');     // the byline survives the author's cover
  });
  test("without one, the layout builds the cover from frontmatter — same markup, same single h1", () => {
    const h = read("posts/fm");
    expect(h).toContain('<header class="snypd-cover"><p class="snypd-eyebrow">Notes</p><h1>Fm</h1>'
      + '<img src="/media/c.png" alt="Cover" decoding="async" fetchpriority="high" width="1200" height="630"></header>');
    expect(h.match(/class="snypd-cover"/g)!.length).toBe(1);
  });
  test("a cover further down the body is left where the author put it, not silently promoted", () => {
    // The spec says "at most one, first in the body" and lint says so too; the renderer does not rewrite
    // the page to make it true. So this post keeps the layout's header *and* renders the block in place.
    const h = read("posts/late");
    expect(h).toContain("<header class=\"snypd-cover\"><h1>Late</h1></header>");
    expect(h).toContain("<p>Body first.</p>");
    expect(h.match(/class="snypd-cover"/g)!.length).toBe(2);
    expect(h.match(/<h1>/g)!.length).toBe(2);
  });
});

/**
 * S16: redirects as build output. Two forms because no single form is portable — `_redirects` for the hosts
 * that read it, a page for every other host — and a redirect must never shadow a route the site really has.
 */
describe("redirects (S16)", () => {
  const root = "corpora/_test/redirects";
  const dist = join(root, "dist");
  beforeAll(() => {
    rmSync(root, { recursive: true, force: true });
    mkdirSync(join(root, "content/posts"), { recursive: true });
    cpSync("themes/base", join(root, "themes/base"), { recursive: true, filter: (f) => !f.endsWith("package.json") });
    writeFileSync(join(root, "content/posts/new.md"), "---\ntitle: New\nslug: new\ndate: 2026-03-01\nstatus: published\n---\n\nWords.\n");
  });
  const config = (redirects: string) =>
    writeFileSync(join(root, "snypd.yaml"), `snypd: 1\nsite:\n  name: T\n  url: https://t.example\n${redirects}theme: { use: base }\n`);

  test("a declared redirect becomes _redirects and a page a crawler can follow", async () => {
    config("  redirects:\n    /posts/old: /posts/new\n");
    await build(root);
    expect(readFileSync(join(dist, "_redirects"), "utf8")).toBe("/posts/old /posts/new 301\n");
    const page = readFileSync(join(dist, "posts/old/index.html"), "utf8");
    expect(page).toContain('http-equiv="refresh"');
    expect(page).toContain('rel="canonical" href="https://t.example/posts/new/"');
    expect(page).toContain('name="robots" content="noindex"');
  });

  test("a redirect away from a route the site actually builds is dropped, not honoured", async () => {
    config("  redirects:\n    /posts/new: /posts/old\n");
    await build(root);
    // The real post still stands, and nothing was written that would send readers away from it.
    expect(readFileSync(join(dist, "posts/new/index.html"), "utf8")).toContain("New");
    expect(existsSync(join(dist, "_redirects"))).toBe(false);
  });

  test("removing the last redirect removes the files it produced", async () => {
    config("  redirects:\n    /posts/old: /posts/new\n");
    await build(root);
    expect(existsSync(join(dist, "posts/old/index.html"))).toBe(true);
    config("");
    await build(root);
    expect(existsSync(join(dist, "_redirects"))).toBe(false);
    expect(existsSync(join(dist, "posts/old/index.html"))).toBe(false);
  });
});
