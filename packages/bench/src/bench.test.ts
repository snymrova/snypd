import { test, expect, afterAll } from "bun:test";
import { compare, breaches, toMarkdown, status, runTokensPerPage, runTokensToLearn, learnSurface, type Report, type Metric } from "./index";
import { pickRoutes } from "./page";
import { imageSize } from "@snypd/render/media";
import { primitiveNames } from "@snypd/spec";
import { generate, generateTheme } from "./corpus";
import { countTokens } from "./tokens";
import { build } from "@snypd/render";
import { serve } from "@snypd/runtime";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const rep = (v: number, extra: Partial<Metric> = {}): Report => ({ version: "t", bun: "t", date: "t", tokenizer: "t",
  metrics: [{ name: "build.cold.100", value: v, unit: "ms", budget: 2000, ...extra }] });

afterAll(() => rmSync("corpora/_test", { recursive: true, force: true }));

test("corpus is deterministic", () => {
  const d = generate(10, "corpora/_test");
  expect(readdirSync(d).length).toBe(10);
  const first = readFileSync(`${d}/post-00000.md`, "utf8");
  generate(10, "corpora/_test");
  expect(readFileSync(`${d}/post-00000.md`, "utf8")).toBe(first);
  expect(first).toContain("::chart");
});

test("breach at 80 % of budget", () => {
  expect(breaches(rep(1600))).toEqual([]);
  expect(breaches(rep(1601))).toEqual(["build.cold.100"]);
  expect(status(rep(1601).metrics[0]!)).toBe("ci");
  expect(status(rep(2001).metrics[0]!)).toBe("budget");
});

test("higherIsBetter metrics breach below budget, no margin", () => {
  expect(breaches(rep(85, { higherIsBetter: true, budget: 85 }))).toEqual([]);
  expect(breaches(rep(84, { higherIsBetter: true, budget: 85 }))).toEqual(["build.cold.100"]);
});

test("compare flags >10 % regression (direction-aware)", () => {
  expect(compare(rep(100), rep(110))[0]!.regressed).toBe(false);
  expect(compare(rep(100), rep(111))[0]!.regressed).toBe(true);
  expect(compare(rep(100, { higherIsBetter: true }), rep(89, { higherIsBetter: true }))[0]!.regressed).toBe(true);
});

test("markdown report renders", () => {
  expect(toMarkdown(rep(1000))).toContain("✅");
});

test("tokenizer counts", () => {
  expect(countTokens("")).toBe(0);
  expect(countTokens("hello world")).toBe(2);
});

test("tokens/page + tokens-to-learn on the built test corpus", async () => {
  generate(10, "corpora/_test");
  await build("corpora/_test");
  const [md, html, red] = runTokensPerPage("_test");
  expect(md!.value).toBeGreaterThan(100);
  expect(html!.value).toBeGreaterThanOrEqual(md!.value);
  expect(red!.higherIsBetter).toBe(true);
  expect(Object.keys(learnSurface("corpora/_test"))).toContain("snypd://config");
  expect(runTokensToLearn("_test").value).toBeGreaterThan(0);
});

test("static serve answers HTML and negotiates .md twin", async () => {
  await build("corpora/_test");
  const s = serve("corpora/_test");
  try {
    const html = await fetch(`${s.url}/posts/post-00001/`);
    expect(html.status).toBe(200);
    expect(await html.text()).toContain("<!doctype html>");
    const md = await fetch(`${s.url}/posts/post-00001/`, { headers: { accept: "text/markdown" } });
    expect((await md.text()).startsWith("---")).toBe(true);
    expect((await fetch(`${s.url}/nope`)).status).toBe(404);
    expect((await fetch(`${s.url}/../etc/passwd`)).status).not.toBe(200);
  } finally { s.stop(); }
});

test("bench page picks one route per url shape, and always the home page (S13)", () => {
  const dist = "corpora/_test/pick";
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  const loc = (p: string) => `<url><loc>https://x.example${p}</loc></url>`;
  writeFileSync(join(dist, "sitemap.xml"),
    `<urlset>${["/posts/a/", "/posts/b/", "/", "/about/", "/category/eng/", "/tag/ai/", "/tag/mcp/", "/authors/s/"].map(loc).join("")}</urlset>`);
  expect(pickRoutes(dist)).toEqual(["/posts/a/", "/", "/about/", "/category/eng/", "/tag/ai/", "/authors/s/"]);
  expect(pickRoutes(dist, 3)).toEqual(["/posts/a/", "/", "/about/"]);
  // A sitemap whose home page sorts past the cap still gets it: the index is the one route every site has.
  writeFileSync(join(dist, "sitemap.xml"),
    `<urlset>${["/posts/a/", "/about/", "/category/eng/", "/tag/ai/", "/"].map(loc).join("")}</urlset>`);
  expect(pickRoutes(dist, 3)).toEqual(["/", "/posts/a/", "/about/"]);
  expect(pickRoutes("corpora/_test/does-not-exist")).toEqual(["/"]);
  // S25: the list at `/posts/` and a post under it are two shapes, so a site with a front page measures both.
  writeFileSync(join(dist, "sitemap.xml"),
    `<urlset>${["/", "/posts/a/", "/posts/b/", "/posts/", "/tag/ai/"].map(loc).join("")}</urlset>`);
  expect(pickRoutes(dist)).toEqual(["/", "/posts/a/", "/posts/", "/tag/ai/"]);
  rmSync(dist, { recursive: true, force: true });
});

test("the theme fixture is every primitive and every layout, from the spec's own examples (S13)", () => {
  const root = generateTheme("corpora/_test/theme-fixture");
  const post = readFileSync(join(root, "content/posts/every-primitive-once.md"), "utf8");
  for (const p of primitiveNames()) {
    // `stat` lives inside `stat-row`, which is where the spec says it belongs; every other block is its own.
    expect(post.includes(`:::${p}`) || post.includes(`::${p}{`)).toBe(true);
  }
  // S14: the two cover paths, one post each. Both are real rendering paths and a fixture that exercised
  // only one of them is how the layout's header shipped stacked on top of the author's for a session.
  expect(post).toMatch(/^---\n[\s\S]*?\n---\n\n::cover\{/);          // written: first in the body, as the spec says
  expect(post).not.toContain("\ncover: {");                             // and not also declared in frontmatter
  const prose = readFileSync(join(root, "content/posts/prose-only.md"), "utf8");
  expect(prose).toContain("\ncover: { image: /media/cover.png");         // declared: the layout builds it
  expect(prose).not.toContain("::cover{");
  expect(existsSync(join(root, "content/media/cover.png"))).toBe(true);
  expect(imageSize(new Uint8Array(readFileSync(join(root, "content/media/cover.png"))))).toEqual({ width: 1200, height: 630 });
  rmSync(root, { recursive: true, force: true });
});

// ── S22 · L1: the bench page, and the gallery's list of looks ────────────────────────────────────
import { benchPage, parseRecord, HEADLINES, FAMILIES } from "./benchpage";
import { looks } from "./gallery";
import { lintSite } from "@snypd/core";

test("S22: the bench page is generated from the committed record, in the vocabulary, and lints clean", () => {
  const md = readFileSync("bench/latest.md", "utf8");
  const r = parseRecord(md);
  expect(r.version).toMatch(/^\d+\.\d+\.\d+/);
  expect(r.rows.length).toBeGreaterThan(30);
  expect(r.rows.find((x) => x.name === "build.cold.100")?.status).toBe("ok");
  expect(r.rows.find((x) => x.name === "build.noop.100")?.status).toBe("report");

  const page = benchPage(md);
  // Every row in the record is on the page, once, as its own code span; nothing is on the page that is not in the record.
  for (const x of r.rows) expect(page.split(`| \`${x.name}\` |`).length).toBe(2);
  expect((page.match(/^\| `[A-Za-z0-9.]+` \|/gm) ?? []).length).toBe(r.rows.length);
  // The vocabulary, not a table: a tldr, the three headline stats with a source each, one section per family that has rows.
  expect(page).toContain(":::tldr");
  expect((page.match(/^::stat\{/gm) ?? []).length).toBe(HEADLINES.filter((h) => r.rows.some((x) => x.name === h.name)).length);
  expect(page).not.toMatch(/::stat\{(?![^}]*source=)/);
  for (const f of FAMILIES) if (r.rows.some((x) => f.prefixes.some((p) => x.name.startsWith(p)))) expect(page).toContain(`## ${f.title}`);
  expect(page).not.toContain("## Everything else");
  // A note never lands in a table cell — at 390 px that is a twenty-line row — and every note is on the page as a list item.
  expect(page).not.toMatch(/^\| `[^`]+` \| [^|]+ \| [^|]+ \| [^|]+ \|/m);
  for (const x of r.rows.filter((y) => y.note)) expect(page).toContain(`- \`${x.name}\` — ${x.note}`);
  // And it lints as the page type it will be created as.
  const site = "corpora/_test/benchpage";
  rmSync(site, { recursive: true, force: true }); mkdirSync(join(site, "content/pages"), { recursive: true });
  writeFileSync(join(site, "snypd.yaml"), "snypd: 1\nsite: { name: T, url: https://t.example }\n");
  writeFileSync(join(site, "content/pages/bench.md"), page);
  const d = lintSite(site).files.flatMap((f) => f.diagnostics);
  expect(d.filter((x) => x.severity === "error").map((x) => `${x.rule}: ${x.message}`)).toEqual([]);
});

test("S22: parseRecord refuses what is not a record", () => {
  expect(() => parseRecord("# not a record\n")).toThrow(/is this a bench record/);
  expect(() => parseRecord("**Version** 1 · **Bun** 1 · **Date** d · **Tokenizer** t\n")).toThrow(/no metric rows/);
});

test("S22: the gallery lists every look every installed theme ships — seven since S29, dark-only ones marked", () => {
  const ls = looks("corpora/theme");
  expect(ls.map((l) => l.slug)).toEqual(["editorial-paper", "editorial-ink", "editorial-broadsheet", "base", "studio", "technical-graphite", "technical-phosphor"]);
  expect(ls.filter((l) => l.dark).map((l) => l.slug)).toEqual(["editorial-ink", "technical-phosphor"]);
  expect(ls.find((l) => l.slug === "base")!.variation).toBeUndefined();
  expect(ls.find((l) => l.slug === "base")!.description).toMatch(/^Unstyled/);
  expect(ls.find((l) => l.slug === "editorial-ink")!.description).toMatch(/^Dark only/);
  for (const l of ls) expect(l.personality.length).toBeGreaterThan(20);
});

// ── docs/29 TF2: the specimen and the camera's sheets ───────────────────────────────────────────────
import { SPECIMEN_ROUTES, routeSlug, contactHtml, sheetHtml, type Candidate, type ShootShot } from "./shoot";

test("TF2: the specimen builds every route the camera shoots, and is hard where it says it is", async () => {
  const out = join("corpora/specimen", "dist-test-specimen");
  try {
    await build("corpora/specimen", { out });
    for (const r of SPECIMEN_ROUTES) expect(existsSync(join(out, r === "/404" ? "404.html" : join(r, "index.html")))).toBe(true);
    const words = readFileSync("corpora/specimen/content/posts/long-read.md", "utf8").split(/\s+/).length;
    expect(words).toBeGreaterThanOrEqual(2500);
    const posts = readdirSync("corpora/specimen/content/posts").filter((f) => f.endsWith(".md"));
    expect(posts.length).toBeGreaterThanOrEqual(30);
    const d = lintSite("corpora/specimen").files.flatMap((f) => f.diagnostics);
    expect(d.filter((x) => x.severity === "error").map((x) => `${x.rule}: ${x.message}`)).toEqual([]);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test("TF2: the contact sheet is zero-JS, shows 390 and 1280, and keeps 768 and 1440 behind a details", () => {
  expect(routeSlug("/")).toBe("home");
  expect(routeSlug("/404")).toBe("404");
  expect(routeSlug("/posts/long-read/")).toBe("posts-long-read");
  const cands: Candidate[] = [{ theme: "a", slug: "a", line: "A <quiet> one", fontKb: 0 }, { theme: "b", slug: "b", line: "B", fontKb: 0 }];
  const shots: ShootShot[] = cands.flatMap((c) => [390, 768, 1280, 1440].map((width) =>
    ({ candidate: c.slug, route: "/", width, scheme: "light" as const, file: `${c.slug}/home-${width}-light.png`, height: 900, truncated: width === 390, cls: 0, status: 200 })));
  const html = contactHtml(cands, shots, ["/"], ["light"], [390, 768, 1280, 1440]);
  expect(html).not.toContain("<script");
  expect(html).toContain("A &lt;quiet&gt; one");
  const [open, hidden] = html.split("<details>");
  expect(open).toContain("a/home-390-light.png");
  expect(open).toContain("a/home-1280-light.png");
  expect(open).not.toContain("a/home-768-light.png");
  expect(hidden).toContain("a/home-1440-light.png");
  expect(html).toContain("truncated");
  const sheet = sheetHtml(cands, shots, "/", "light", [390, 768, 1280, 1440]);
  expect(sheet).not.toContain("<script");
  expect(sheet).toContain("b/home-1280-light.png");
  expect(sheet).not.toContain("home-768-light.png");
});
