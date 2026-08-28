/**
 * Deterministic synthetic corpus generator.
 * `bun run packages/bench/src/corpus.ts 100` → corpora/100/content/posts/*.md
 * Seeded PRNG so the corpus is identical on every machine (never depends on Math.random).
 */
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { primitives } from "@snypd/spec";

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ("agent markdown content theme primitive render build cache token spec lint publish draft "
  + "site static fast yaml git commit review evidence source chart diagram flow schema feed twin").split(" ");
const CATS = ["engineering", "product", "design", "ops"];
const CHART_TYPES = ["bar", "line", "area", "donut", "lollipop"];   // @snypd/viz owns the list; repeated here to keep the generator dependency-free
const TAGS = ["ai", "agents", "mcp", "bun", "cms", "seo", "speed", "markdown"];

export function generate(n: number, root = `corpora/${n}`) {
  const rnd = mulberry32(n * 7919);
  const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)]!;
  const words = (k: number) => Array.from({ length: k }, () => pick(WORDS)).join(" ");
  const sentence = () => { const s = words(8 + Math.floor(rnd() * 12)); return s[0]!.toUpperCase() + s.slice(1) + "."; };
  const para = () => Array.from({ length: 3 + Math.floor(rnd() * 4) }, sentence).join(" ");

  const dir = join(root, "content", "posts");
  rmSync(root, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  for (let i = 0; i < n; i++) {
    const slug = `post-${String(i).padStart(5, "0")}`;
    const title = words(5).replace(/\b\w/g, (c) => c.toUpperCase());
    const date = new Date(Date.UTC(2026, 0, 1 + (i % 240))).toISOString().slice(0, 10);
    const body: string[] = [];
    body.push(`---\ntitle: ${title}\nslug: ${slug}\ndate: ${date}\nstatus: published\ncategory: ${pick(CATS)}\ntags: [${pick(TAGS)}, ${pick(TAGS)}]\n---\n`);
    body.push(`:::tldr\n${sentence()}\n:::\n`);
    for (let s = 0; s < 4; s++) {
      body.push(`## ${words(3)}\n\n${para()}\n`);
      if (s === 1) body.push(`:::callout{kind="note" title="${words(2)}"}\n${sentence()}\n:::\n`);
      if (s === 2) body.push(`:::stat-row\n::stat{value="${Math.floor(rnd()*100)}%" label="${words(2)}" source="https://snypd.rocks/bench"}\n::stat{value="${Math.floor(rnd()*900)}ms" label="${words(2)}" source="https://snypd.rocks/bench"}\n:::\n`);
    }
    // every 5th a chart, every 10th a diagram, every 20th a flow with ≥ 15 nodes (docs/07 §3) — all lint-clean
    // every chart type in rotation, so a build exercises all five renderers (S8) and not just `bar`
    if (i % 5 === 0) {
      const type = CHART_TYPES[(i / 5) % CHART_TYPES.length]!;
      body.push(`:::chart{type="${type}" source="https://snypd.rocks/bench" caption="${sentence()}" unit="ms"}\n` +
        ["a", "b", "c", "d"].map((l) => `- { label: ${l}, value: ${Math.floor(rnd()*100)} }`).join("\n") + `\n:::\n`);
    }
    if (i % 10 === 0) {
      // A branching graph, not a chain: a chain exercises none of the layout (one node per rank, no
      // crossings, no dummies), so a build of the corpus would say nothing about the S9 budget.
      const ids = ["md", "parse", "validate", "transform", "render", "emit", "html", "twin"];
      const edges = [["md","parse"],["parse","validate"],["parse","transform"],["validate","render"],["transform","render"],
        ["render","emit"],["emit","html"],["emit","twin"],["md","twin"],["validate","md"]];
      body.push(`:::diagram{direction="lr" caption="${sentence()}"}\nnodes:\n` + ids.map((id) => `  - { id: ${id}, label: ${id} ${pick(WORDS)} }`).join("\n") +
        `\nedges:\n` + edges.map(([from, to], k) => `  - { from: ${from}, to: ${to}${k % 4 === 0 ? `, label: ${pick(WORDS)} }` : " }"}`).join("\n") + `\n:::\n`);
    }
    if (i % 20 === 0) {
      // Decisions, a branch that rejoins and a jump back: a straight list of 15 steps is a `steps` block
      // (lint says so from S10) and exercises none of the desugar — no join edges, no cycle to break.
      const steps = [
        `  - { id: start, do: ${sentence()} }`,
        `  - ${sentence()}`,
        `  - ask: ${words(3)}?`,
        `    yes: ${sentence()}`,
        `    no: { then: start }`,
        `  - ${sentence()}`,
        `  - ask: ${words(3)}?`,
        `    yes:`,
        `      - ${sentence()}`,
        `      - ${sentence()}`,
        `    no: { then: fix }`,
        `  - { id: fix, do: ${sentence()} }`,
        `  - ${sentence()}`,
        `  - ${sentence()}`,
      ].join("\n");
      body.push(`:::flow{caption="${sentence()}"}\nsteps:\n${steps}\n:::\n`);
    }
    body.push(`:::faq\n### ${words(4)}?\n${sentence()}\n### ${words(4)}?\n${sentence()}\n:::\n`);
    body.push(`::cta{title="${words(3)}" button="Read the spec" href="https://snypd.rocks/spec"}\n`);
    writeFileSync(join(dir, `${slug}.md`), body.join("\n"));
  }
  writeFileSync(join(root, "snypd.yaml"), `snypd: 1\nsite:\n  name: corpus-${n}\n  url: https://corpus-${n}.snypd.rocks\ntheme:\n  use: base\n`);
  return dir;
}



// ───────────────────────────────────────────────────────────────────────────────────────────────────────
// The theme fixture (S13).
// ───────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A minimal, valid PNG of a single colour — signature, IHDR, one IDAT, IEND, each with its CRC.
 * The theme fixture needs *real* rasters, because `width`/`height`, the LCP element and layout shift are
 * all properties of a decoded image and none of them can be demonstrated with a placeholder. A flat colour
 * compresses to almost nothing, so the bytes in git stay honest about what they are: dimensions, not art.
 */
export function png(width: number, height: number, rgb: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const byte of b) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8-bit truecolour, no interlace
  const row = Buffer.concat([Buffer.from([0]), Buffer.concat(Array.from({ length: width }, () => Buffer.from(rgb)))]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

/**
 * `corpora/theme` — the fixture `snypd bench page` runs against: every one of the 13 primitives and all
 * five layouts on a site small enough to read. The 100-post corpus cannot do this job — it is generated
 * from a word list to exercise the *build*, uses eight primitives, and has no page, author or media — and
 * a theme that is only ever seen rendering the same eight blocks is a theme with five untested holes.
 *
 * Every block below is the primitive's own `example:` from `packages/spec/primitives/*.yaml`, copied at
 * generation time rather than paraphrased. If an example drifts from what the renderer accepts, this
 * fixture stops lint-passing and the spec is what gets fixed — which is the right way round.
 */
export function generateTheme(root = "corpora/theme") {
  const example = (name: string) => primitives().find((p) => p.name === name)!.example.trimEnd();
  rmSync(root, { recursive: true, force: true });
  for (const d of ["content/posts", "content/pages", "content/authors", "content/media", "content/taxonomies/category", "content/taxonomies/tag"]) mkdirSync(join(root, d), { recursive: true });

  writeFileSync(join(root, "content/media/cover.png"), png(1200, 630, [0x8a, 0x33, 0x24]));
  writeFileSync(join(root, "content/media/twin.png"), png(960, 540, [0x2f, 0x5d, 0x62]));
  writeFileSync(join(root, "content/media/icon.png"), png(32, 32, [0x8a, 0x33, 0x24]));

  const post = [
    "---",
    "title: Every primitive, once",
    "date: 2026-08-28",
    "status: published",
    "description: One post that uses all thirteen primitives, so a theme can be reviewed in a single page.",
    "author: sunny",
    "category: engineering",
    "tags: [markdown, agents]",
    "---",
    "",
    // `cover` opens the body because that is the only place the spec allows one ("at most one, first in
    // the body") — and since S14 the renderer lifts a leading cover out and hands it to the layout as the
    // page's header. Written anywhere else it is a second title block halfway down the page.
    example("cover"),
    "",
    example("tldr"),
    "",
    "## What this page is for",
    "",
    "Thirteen primitives and five layouts is the whole vocabulary. A theme is finished when every one of",
    "them has been looked at, in both colour schemes, at a phone width and a desktop one — so they are all",
    "here, in one route, exactly as the spec writes them.",
    "",
    example("callout"),
    "",
    example("pullquote"),
    "",
    "## Blocks that carry data",
    "",
    example("stat-row"),
    "",
    example("chart"),
    "",
    example("diagram"),
    "",
    example("flow"),
    "",
    "## Blocks that carry instructions",
    "",
    example("steps"),
    "",
    example("faq"),
    "",
    "## Blocks that carry a thing to look at",
    "",
    example("figure"),
    "",
    example("cta"),
    "",
  ].join("\n");
  // `stat` is not given a block of its own: it is an inline primitive whose only legal home is `stat-row`
  // (docs/01), and the row above contains two of them, so the component is exercised where it is meant to live.
  writeFileSync(join(root, "content/posts/every-primitive-once.md"), post);

  // A second post: an index, a term page and an author page with one row each show nothing about how a
  // list was designed, and a tag used once is a lint warning (`tag-once`) for exactly that reason.
  writeFileSync(join(root, "content/posts/prose-only.md"),
    "---\ntitle: A post with nothing in it but prose\ndate: 2026-08-27\nstatus: published\n"
    + "description: The other half of a theme review — what a post looks like when it uses no blocks at all.\n"
    + "author: sunny\ncategory: engineering\ntags: [markdown, agents]\n"
    // The two cover paths, one post each: this one is the cover a layout builds from frontmatter,
    // `every-primitive-once` is the `::cover` an author writes. A fixture that only had one of them
    // would have let the layout draw its header above the author's for a whole session (S14).
    + "cover: { image: /media/cover.png, alt: A flat block of colour standing in for a cover photograph, eyebrow: Notes }\n---\n\n"
    + "Most posts are not a tour of the vocabulary. They are headings, paragraphs, a list, a link and a code\n"
    + "span, and a theme that only looks right when a post is full of blocks is a theme that looks wrong most\n"
    + "of the time.\n\n"
    + "## Body copy\n\nThe measure, the leading and the space between a heading and the paragraph under it are\n"
    + "the whole design at this size. Everything else is decoration on top of a column of text.\n\n"
    + "- A list item, because lists are half of technical writing\n- A second one, to show the gap between them\n"
    + "- A [link](/about/) and a `code span`, which are the two things prose does that plain text cannot\n\n"
    + "## A quote\n\n> Long-form reading. One serif column at a comfortable measure, generous leading, a single\n"
    + "> accent used sparingly.\n\n"
    + "```sh\nsnypd build\n```\n");

  writeFileSync(join(root, "content/pages/about.md"),
    "---\ntitle: About this fixture\nstatus: published\ndescription: The `page` layout, with the prose a real page carries and nothing else.\n---\n\n"
    + "This site exists to be looked at. It is the smallest site that still renders every layout the base\ntheme declares, which makes it the right place to review a theme and the wrong place to measure a build.\n\n"
    + ":::callout{kind=\"note\" title=\"Not a benchmark\"}\nBuild and lint timings come from `corpora/100`; this fixture is four routes and would say nothing.\n:::\n");

  // The `author` type declares no `status` or `description` field (spec defaults), and lint says so about
  // any frontmatter that invents one; an author is visible because its type has a layout, not because it
  // carries a status. `bio` is the field the type does declare.
  writeFileSync(join(root, "content/authors/sunny.md"),
    "---\nname: Sunny\nbio: Writes the CMS and the posts.\n---\n\n"
    + "Writes the CMS and the posts. The author layout lists the entries below the bio, so a fixture with one\nauthor and one post is enough to see whether that list has been designed or merely emitted.\n");

  writeFileSync(join(root, "content/taxonomies/category/engineering.md"),
    "---\ntitle: Engineering\nstatus: published\ndescription: How the thing is built, and what it cost.\n---\n\nThe term page carries its own prose above the list of entries.\n");
  writeFileSync(join(root, "content/taxonomies/tag/markdown.md"),
    "---\ntitle: Markdown\nstatus: published\ndescription: The source format, and the twin served beside every page.\n---\n\nA tag with a description reads as a page; one without reads as a filter.\n");

  // `author` ships with `layout: null` (spec defaults), so a site that wants author pages asks for them.
  writeFileSync(join(root, "snypd.yaml"),
    "snypd: 1\nsite:\n  name: Theme fixture\n  url: https://fixture.snypd.rocks\n  description: Every primitive and every layout, once.\n"
    + "  icon: /media/icon.png\ntheme:\n  use: editorial\ntypes:\n  author:\n    layout: author\n");
  return root;
}

if (import.meta.main) {
  const arg = process.argv[2] ?? "100";
  console.log(arg === "theme" ? generateTheme() : generate(Number(arg)));
}
