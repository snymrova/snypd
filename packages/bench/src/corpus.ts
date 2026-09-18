/**
 * Deterministic synthetic corpus generator.
 * `bun run packages/bench/src/corpus.ts 100` → corpora/100/content/posts/*.md
 * Seeded PRNG so the corpus is identical on every machine (never depends on Math.random).
 */
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
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
      // A step is a phrase, not a sentence: a box wraps three lines and clips past ~45 characters, and
      // lint rule 2 says so since H1. `label()` makes the same draws `sentence()` did and prints the first
      // four words, so every post after a flow keeps the words it had when the corpus was first cut.
      const label = () => sentence().replace(/\.$/, "").split(" ").slice(0, 4).join(" ");
      const steps = [
        `  - { id: start, do: ${label()} }`,
        `  - ${label()}`,
        `  - ask: ${words(3)}?`,
        `    yes: ${label()}`,
        `    no: { then: start }`,
        `  - ${label()}`,
        `  - ask: ${words(3)}?`,
        `    yes:`,
        `      - ${label()}`,
        `      - ${label()}`,
        `    no: { then: fix }`,
        `  - { id: fix, do: ${label()} }`,
        `  - ${label()}`,
        `  - ${label()}`,
      ].join("\n");
      body.push(`:::flow{caption="${sentence()}"}\nsteps:\n${steps}\n:::\n`);
    }
    body.push(`:::faq\n### ${words(4)}?\n${sentence()}\n### ${words(4)}?\n${sentence()}\n:::\n`);
    body.push(`::cta{title="${words(3)}" button="Read the spec" href="https://snypd.rocks/spec"}\n`);
    writeFileSync(join(dir, `${slug}.md`), body.join("\n"));
  }
  writeFileSync(join(root, "snypd.yaml"), `snypd: 1\nsite:\n  name: corpus-${n}\n  url: https://corpus-${n}.snypd.rocks\ntheme:\n  use: base\n`);
  // The editorial lane's env layer (S13) was added to corpora/100 by hand, and `rmSync` above threw it
  // away on every regeneration since — found when H1 regenerated the corpus (docs/07 §5). It is part
  // of the corpus, so the generator writes it.
  writeFileSync(join(root, "snypd.editorial.yaml"), "# The editorial lane (S13). `SNYPD_ENV=editorial` layers this over snypd.yaml so the *same* content is\n# rendered by a styled theme. docs/07 decision 15: the md-reduction budget is measured on a real theme,\n# not on `base`, whose HTML is the content twice over.\ntheme:\n  use: editorial\n");
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
 * Two seconds of one flat colour, 320 × 180 at 12 fps, H.264 in an MP4 — 2.1 KB, made once with
 * `ffmpeg -f lavfi -i color=c=0x8a3324:s=320x180:d=2:r=12 -c:v libx264 -preset veryslow -crf 45
 * -pix_fmt yuv420p -movflags +faststart -an` and kept here as text for the same reason `png()` above
 * draws its rasters: the fixture needs a real clip a browser will decode, and a flat colour is honest
 * about what the bytes are — a duration and a size, not a film.
 */
const SHOWREEL_MP4 = "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAQGbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAzB0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAUAAAAC0AAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAIAAABAAAAAAKobWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAwAAAAYABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAACU21pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAhNzdGJsAAAAw3N0c2QAAAAAAAAAAQAAALNhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAUAAtABIAAAASAAAAAAAAAABFUxhdmM2MC4zMS4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAAOWF2Y0MBZAAV/+EAG2dkABWscgRBQZ+fARAAAAMAEAAAAwGA8WLYRgEAB2joQ4E0siz9+PgAAAAAEHBhc3AAAAABAAAAAQAAABRidHJ0AAAAAAAAEOwAABDsAAAAGHN0dHMAAAAAAAAAAQAAABgAAAQAAAAAFHN0c3MAAAAAAAAAAQAAAAEAAAB4Y3R0cwAAAAAAAAANAAAAAQAACAAAAAABAAAoAAAAAAEAABAAAAAAAwAAAAAAAAAEAAAEAAAAAAEAACgAAAAAAQAAEAAAAAADAAAAAAAAAAQAAAQAAAAAAQAAGAAAAAABAAAIAAAAAAEAAAAAAAAAAgAABAAAAAAcc3RzYwAAAAAAAAABAAAAAQAAABgAAAABAAAAdHN0c3oAAAAAAAAAAAAAABgAAALtAAAADwAAAA0AAAAOAAAADgAAAA4AAAAOAAAADgAAAA4AAAAOAAAAEwAAAA4AAAAOAAAADgAAAA4AAAAOAAAADgAAAA4AAAAOAAAAFQAAAA4AAAAOAAAADgAAAA4AAAAUc3RjbwAAAAAAAAABAAAENgAAAGJ1ZHRhAAAAWm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALWlsc3QAAAAlqXRvbwAAAB1kYXRhAAAAAQAAAABMYXZmNjAuMTYuMTAwAAAACGZyZWUAAARDbWRhdAAAArAGBf//rNxF6b3m2Ui3lizYINkj7u94MjY0IC0gY29yZSAxNjQgcjMxMDggMzFlMTlmOSAtIEguMjY0L01QRUctNCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMjMgLSBodHRwOi8vd3d3LnZpZGVvbGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0xIHJlZj0xNiBkZWJsb2NrPTE6MDowIGFuYWx5c2U9MHgzOjB4MTMzIG1lPXVtaCBzdWJtZT0xMCBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTI0IGNocm9tYV9tZT0xIHRyZWxsaXM9MiA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTYgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz04IGJfcHlyYW1pZD0yIGJfYWRhcHQ9MiBiX2JpYXM9MCBkaXJlY3Q9MyB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTEyIHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NjAgcmM9Y3JmIG1idHJlZT0xIGNyZj00NS4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAANWWIgQACX/1CZ4FFAg5qJxsQI+Uf9sM0yA7QapfAAEnbT/islYG14ARsAAK8PfXSGlOIyV6BAAAAC0GaCS2II/8AALuAAAAACUGeEIcQ/wA6YQAAAAoBnhgmiGf/AFBAAAAACgGeGEaIZ/8AUEEAAAAKAZ4YZohn/wBQQQAAAAoBnhitSGf/AFBBAAAACgGeGM1IZ/8AUEEAAAAKAZ4Y7Uhn/wBQQAAAAAoBnhkNSGf/AFBAAAAAD0GaGkk1AgLRMpgQ/wABxwAAAApBniGlxD//ADpgAAAACgGeKUWiGf8AUEAAAAAKAZ4pZaIZ/wBQQQAAAAoBnimFohn/AFBBAAAACgGeKcySGf8AUEEAAAAKAZ4p7JIZ/wBQQAAAAAoBnioMkhn/AFBAAAAACgGeKiySGf8AUEEAAAARQZoq6bUCAtrRMpgBDP8ABSQAAAAKQZ4yhLEO/wA/wAAAAAoBnjpkqIZ/AFBBAAAACgGeOqzSGf8AUEAAAAAKAZ46zNIZ/wBQQQ==";

/**
 * `corpora/theme` — the fixture `snypd bench page` runs against: every one of the 14 primitives and all
 * six layouts on a site small enough to read. The 100-post corpus cannot do this job — it is generated
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
  // The front page's showreel (S29, docs/17 §4.1–4.2): a real clip, because `autoplay`, the poster under
  // reduced motion and `page.media.kb` are all properties of bytes a browser fetches, and a poster the
  // same shape as the clip so the box is reserved before either arrives.
  writeFileSync(join(root, "content/media/showreel.mp4"), Buffer.from(SHOWREEL_MP4, "base64"));
  writeFileSync(join(root, "content/media/showreel.png"), png(1280, 720, [0x8a, 0x33, 0x24]));
  // Four marks for the wall (§4.3): flat rasters the size a logo is, in the viz palette's colours.
  for (const [name, rgb] of [["acme", [0x2f, 0x5d, 0x62]], ["globex", [0x96, 0x70, 0x2a]], ["initech", [0x4a, 0x45, 0x60]], ["umbrella", [0x5c, 0x6b, 0x3f]]] as const)
    writeFileSync(join(root, `content/media/logo-${name}.png`), png(240, 80, [...rgb]));
  writeFileSync(join(root, "content/media/twin.png"), png(960, 540, [0x2f, 0x5d, 0x62]));
  writeFileSync(join(root, "content/media/icon.png"), png(32, 32, [0x8a, 0x33, 0x24]));

  const post = [
    "---",
    "title: Every primitive, once",
    "date: 2026-08-28",
    "status: published",
    "description: One post that uses all fourteen primitives, so a theme can be reviewed in a single page.",
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
    "Fourteen primitives and six layouts is the whole vocabulary. A theme is finished when every one of",
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
    // The fourteenth (S29): its example names marks this fixture does not have, so the wall is written
    // here over the four rasters above — the same shape, real bytes.
    ":::logo-wall{title=\"Runs on it\"}\n- [![Acme](/media/logo-acme.png)](https://acme.example)\n- ![Globex](/media/logo-globex.png)\n- [![Initech](/media/logo-initech.png)](https://initech.example) — since 2024\n- ![Umbrella](/media/logo-umbrella.png)\n:::",
    "",
    example("figure"),
    "",
    example("cta"),
    "",
  ].join("\n");
  // `stat` is not given a block of its own: it is an inline primitive whose only legal home is `stat-row`
  // (docs/01), and the row above contains two of them, so the component is exercised where it is meant to live.
  writeFileSync(join(root, "content/posts/every-primitive-once.md"), post);

  // A third post, left in `draft`: the Desk is measured with something on it (S18b), and an empty
  // "In flight" card is not the page anybody sees. It stays out of `dist` by being a draft, so the
  // editorial lane's route list is unchanged — drafts exist only in the preview.
  writeFileSync(join(root, "content/posts/a-draft-in-flight.md"),
    "---\ntitle: A draft in flight\ndate: 2026-08-28\nstatus: draft\n"
    + "description: An unpublished post, so the Desk has an item to list and a review page to render.\n"
    + "author: sunny\ncategory: engineering\ntags: [markdown]\n---\n\n"
    + "A draft is the only state in which a post is visible to the preview and invisible to the build, which\n"
    + "is the whole of what `snypd serve --preview` is for.\n");

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
    + "of the time.[^1]\n\n"
    + "## Body copy\n\nThe measure, the leading and the space between a heading and the paragraph under it are\n"
    + "the whole design at this size. Everything else is decoration on top of a column of text.\n\n"
    + "- A list item, because lists are half of technical writing\n- A second one, to show the gap between them\n"
    + "- A [link](/about/) and a `code span`, which are the two things prose does that plain text cannot\n\n"
    + "## A quote\n\n> Long-form reading. One serif column at a comfortable measure, generous leading, a single\n"
    + "> accent used sparingly.\n\n"
    // A footnote, because prose has them and a theme has to decide where one goes (U7, docs/14 §4.1):
    // a sidenote in the margin, a card over the mark, or the list at the end — this post is where to look.
    + "```sh\nsnypd build\n```\n\n"
    + "[^1]: Which is why the fixture has this post as well as the one with every block in it.\n");

  writeFileSync(join(root, "content/pages/about.md"),
    "---\ntitle: About this fixture\nstatus: published\ndescription: The `page` layout, with the prose a real page carries and nothing else.\n---\n\n"
    + "This site exists to be looked at. It is the smallest site that still renders every layout the base\ntheme declares, which makes it the right place to review a theme and the wrong place to measure a build.\n\n"
    + ":::callout{kind=\"note\" title=\"Not a benchmark\"}\nBuild and lint timings come from `corpora/100`; this fixture is four routes and would say nothing.\n:::\n");

  // The front page (S25, docs/16 §2): a page with `home: true` holds `/` under the `home` layout — the body a
  // product page carries, the newest posts under it — and the list the index layout draws is at `/posts/`.
  // This is the sixth layout, and the shape snypd.rocks' own front page takes; a theme is reviewed on it too.
  writeFileSync(join(root, "content/pages/home.md"),
    "---\ntitle: A CMS whose only interface is your agent\nstatus: published\nhome: true\n"
    + "description: The front page, under the home layout — a page's body, then the latest posts.\n---\n\n"
    // The one autoplay a page gets (lint rule 15), with its poster — the reference's showreel behind the headline.
    + "::cover{subtitle=\"Publish a website from the harness you already have open.\" media=\"/media/showreel.mp4\" poster=\"/media/showreel.png\" autoplay=true}\n\n"
    + ":::tldr\nWrite in the harness you already have open. The site is markdown in git, built to static HTML with no script on the page.\n:::\n\n"
    // The numbers sit in the first section, not the hero: a hero is a cover and one block (lint rule 17, docs/18).
    + "## How it starts\n\n"
    + ":::stat-row\n::stat{value=\"13\" label=\"primitives\" source=\"https://snypd.rocks/posts/every-primitive-once/\"}\n::stat{value=\"6\" label=\"layouts\" source=\"https://snypd.rocks/themes/\"}\n::stat{value=\"0 KB\" label=\"JavaScript\" source=\"https://snypd.rocks/bench/\"}\n:::\n\n"
    + ":::steps{title=\"Four lines\"}\n1. `mkdir site && cd site`\n2. `bunx @snypd/cli init`\n3. `claude`\n4. *Write me a first post.*\n:::\n\n"
    + "::figure{src=\"/media/twin.png\" alt=\"Side-by-side HTML and markdown of the same post\" caption=\"Every page ships its markdown twin.\" width=\"wide\"}\n\n"
    // The marquee (S29, docs/17 §3): the wall as a moving strip, which a theme with a marquee animates and
    // every other theme lays out as the grid — the duplicate row is markup either way.
    + "## Runs on it\n\n"
    + ":::logo-wall{layout=\"marquee\"}\n- [![Acme](/media/logo-acme.png)](https://acme.example)\n- ![Globex](/media/logo-globex.png)\n- [![Initech](/media/logo-initech.png)](https://initech.example)\n- ![Umbrella](/media/logo-umbrella.png)\n:::\n\n"
    + "::cta{title=\"Read the posts\" button=\"All posts\" href=\"/posts/\"}\n");

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

  // The two menus (U2): what a theme reviewer looks at first, and the `ref` forms a real site uses —
  // the index, a page by type/slug, a post by route, and one link off the site.
  mkdirSync(join(root, "content/nav"), { recursive: true });
  writeFileSync(join(root, "content/nav/header.yaml"),
    "# The header menu (docs/09 §4.3). `ref` is a route or type/slug, resolved at build; `url` is verbatim.\n"
    + '- { label: "Posts", ref: "/posts" }\n- { label: "About", ref: "page/about" }\n- { label: "Engineering", ref: "/category/engineering" }\n- { label: "GitHub", url: "https://github.com/snymrova/snypd", rel: "external" }\n');
  writeFileSync(join(root, "content/nav/footer.yaml"),
    "# The footer menu (docs/09 §4.3).\n"
    + '- { label: "Feed", url: "/feed.xml" }\n- { label: "llms.txt", url: "/llms.txt" }\n- { label: "Every primitive, once", ref: "post/every-primitive-once" }\n');

  // `author` ships with `layout: null` (spec defaults), so a site that wants author pages asks for them.
  writeFileSync(join(root, "snypd.yaml"),
    "snypd: 1\nsite:\n  name: Theme fixture\n  url: https://fixture.snypd.rocks\n  description: Every primitive and every layout, once.\n"
    + "  icon: /media/icon.png\ntheme:\n  use: editorial\ntypes:\n  author:\n    layout: author\n");
  return root;
}

// ───────────────────────────────────────────────────────────────────────────────────────────────────────
// The README fixture (R0, docs/15 §3.1).
// ───────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A typographic plate as SVG: a ground, one rule, a title, a line beneath. The theme fixture's cover is a
 * flat raster on purpose ("dimensions, not art"), which makes 40 % of every gallery picture a rectangle.
 * The README cannot show that, and a photograph would be somebody else's. A plate is neither: a few
 * hundred bytes, deterministic, drawn from the same three colours the fixture's theme uses, and it says
 * what it is. Numeric `width`/`height` on the root so `svgSize` reads the box without a viewBox.
 */
export function plate(width: number, height: number, title: string, line: string, bg: string, fg: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  // The title is set as large as the plate allows: a serif at weight 600 runs about 0.52 em a glyph, so a
  // long title shrinks rather than clips — the theme fixture's cover clipped its own name on the first run.
  const pad = Math.round(width * 0.075);
  const size = Math.round(Math.min(height * 0.19, (width - pad * 2) / (0.52 * title.length)));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" role="img" aria-label="${esc(title)}">`
    + `<rect width="${width}" height="${height}" fill="${bg}"/>`
    + `<rect x="${pad}" y="${Math.round(height * 0.3)}" width="${Math.round(width * 0.09)}" height="4" fill="${fg}"/>`
    + `<text x="${pad}" y="${Math.round(height * 0.62)}" font-family="'Source Serif 4', Georgia, serif" font-size="${size}" font-weight="600" fill="${fg}" letter-spacing="-0.02em">${esc(title)}</text>`
    + `<text x="${pad}" y="${Math.round(height * 0.8)}" font-family="'Source Serif 4', Georgia, serif" font-size="${Math.round(size * 0.36)}" fill="${fg}" opacity="0.72">${esc(line)}</text>`
    + `</svg>\n`;
}

/**
 * `corpora/readme` — the site the README photographs (docs/15 §3.1). It is the theme fixture with three
 * differences, each because a README picture is read as a promise where a bench picture is read as a
 * measurement: the covers are plates rather than flat rasters; the site has a name a masthead can carry;
 * and two posts are added whose blocks the README lifts out whole — a `chart` of the build clock and a
 * `diagram` of the binary. The chart's rows come from `bench/latest.md`, which is CI's record, so the
 * picture in the README is the number in the record, or the fixture does not generate.
 */
export function generateReadme(root = "corpora/readme", record = "bench/latest.md") {
  generateTheme(root);
  const BG = "#f7f3ea", INK = "#1d1a17", ACCENT = "#8a3324";
  writeFileSync(join(root, "content/media/cover.svg"), plate(1200, 630, "Every primitive, once", "The whole vocabulary on one page", ACCENT, BG));
  writeFileSync(join(root, "content/media/notes.svg"), plate(1200, 630, "Nothing but prose", "What most posts actually are", BG, INK));
  writeFileSync(join(root, "content/media/twin.svg"), plate(960, 540, "page.html · page.md", "The same post, served twice", INK, BG));
  for (const f of ["content/media/cover.png", "content/media/twin.png"]) rmSync(join(root, f), { force: true });

  const swap = (file: string, pairs: [string, string][]) => {
    let s = readFileSync(join(root, file), "utf8");
    for (const [a, b] of pairs) s = s.replaceAll(a, b);
    writeFileSync(join(root, file), s);
  };
  swap("content/posts/every-primitive-once.md", [["/media/cover.png", "/media/cover.svg"], ["/media/twin.png", "/media/twin.svg"]]);
  swap("content/posts/prose-only.md", [["/media/cover.png", "/media/notes.svg"], ["A flat block of colour standing in for a cover photograph", "A typographic plate standing in for a cover photograph"]]);
  swap("content/pages/about.md", [["About this fixture", "About"], ["This site exists to be looked at.", "This site exists to be photographed — it is the one in the README."]]);

  // The build clock, as the product draws it. `parseRecord` is not imported — the bench package's own
  // reader lives beside this file, but the generator stays dependency-free (see CHART_TYPES) and the
  // record's table is one regex wide.
  const md = readFileSync(record, "utf8");
  const row = (name: string) => {
    const m = new RegExp(`^\\| \`${name.replace(/\./g, "\\.")}\` \\| ([\\d.]+) (\\S+) \\|`, "m").exec(md);
    if (!m) throw new Error(`generateReadme: ${record} has no \`${name}\` row`);
    return { value: Number(m[1]), unit: m[2]! };
  };
  const cold = [100, 1000, 10000].map((n) => ({ n, ...row(`build.cold.${n}`) }));
  const incremental = row("build.incremental.100"), start = row("mcp.coldStart.binary");
  const src = "https://github.com/snymrova/snypd/blob/main/bench/latest.md";
  writeFileSync(join(root, "content/posts/how-fast.md"), [
    "---",
    "title: How fast, measured",
    "date: 2026-09-16",
    "status: published",
    "description: The build clock at three sizes, drawn by the chart primitive from the bench record.",
    "author: sunny",
    "category: engineering",
    "tags: [agents]",
    "---",
    "",
    ":::tldr",
    `A cold build renders about ${(cold[1]!.value / 1024).toFixed(1)} ms a page and an edit rebuilds one page in ${incremental.value} ms. Every number here is a row in the bench record.`,
    ":::",
    "",
    ":::stat-row",
    `::stat{value="${start.value} ${start.unit}" label="MCP cold start, release binary" source="${src}"}`,
    `::stat{value="${incremental.value} ${incremental.unit}" label="one edit, rebuilt" source="${src}"}`,
    `::stat{value="0 KB" label="JavaScript on the page" source="${src}"}`,
    ":::",
    "",
    `:::chart{type="bar" source="${src}" caption="A cold build — no \`dist/\`, no index — at 100, 1 000 and 10 000 posts. The clock is CI's, 4 vCPUs." unit="${cold[0]!.unit}"}`,
    ...cold.map((c) => `- { label: "${c.n.toLocaleString("en-US")} posts", value: ${c.value} }`),
    ":::",
    "",
    "The chart above is not an image file. It is the `chart` primitive rendered to inline SVG at build time from the",
    "rows under it, which came from `bench/latest.md` when this fixture was generated. Regenerate the fixture and",
    "the chart follows the record.",
    "",
  ].join("\n"));

  writeFileSync(join(root, "content/posts/one-binary.md"), [
    "---",
    "title: One binary, one interface",
    "date: 2026-09-16",
    "status: published",
    "description: What is inside the snypd binary and what comes out of it, drawn by the diagram primitive.",
    "author: sunny",
    "category: engineering",
    "tags: [agents]",
    "---",
    "",
    ':::diagram{direction="lr" caption="A harness speaks MCP over stdio to one binary; the binary writes markdown to a git repo you own and renders it to a static directory."}',
    "nodes:",
    '  - { id: harness, label: "Claude Code · Cursor · Codex", kind: pill }',
    '  - { id: mcp, label: "MCP server" }',
    '  - { id: content, label: "markdown + YAML in git" }',
    '  - { id: render, label: "renderer + spec + themes" }',
    '  - { id: index, label: "SQLite index" }',
    '  - { id: html, label: "HTML, 0 KB JS", kind: rounded }',
    '  - { id: twin, label: ".md twins · llms.txt · feeds · JSON", kind: rounded }',
    "edges:",
    '  - { from: harness, to: mcp, label: stdio }',
    '  - { from: mcp, to: content, label: writes }',
    '  - { from: content, to: render }',
    '  - { from: render, to: index }',
    '  - { from: render, to: html }',
    '  - { from: render, to: twin }',
    ":::",
    "",
    "The diagram is the `diagram` primitive: nodes and edges declared in YAML, laid out at build time,",
    "rendered to inline SVG. No coordinates were typed.",
    "",
  ].join("\n"));

  writeFileSync(join(root, "snypd.yaml"),
    "snypd: 1\nsite:\n  name: Field Notes\n  url: https://readme.snypd.rocks\n  description: Notes on building a CMS whose only interface is an agent.\n"
    + "  icon: /media/icon.png\ntheme:\n  use: editorial\ntypes:\n  author:\n    layout: author\n");
  return root;
}

if (import.meta.main) {
  const arg = process.argv[2] ?? "100";
  console.log(arg === "theme" ? generateTheme() : arg === "readme" ? generateReadme() : generate(Number(arg)));
}
