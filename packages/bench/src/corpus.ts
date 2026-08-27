/**
 * Deterministic synthetic corpus generator.
 * `bun run packages/bench/src/corpus.ts 100` → corpora/100/content/posts/*.md
 * Seeded PRNG so the corpus is identical on every machine (never depends on Math.random).
 */
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

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
      const steps = Array.from({ length: 15 }, () => `  - ${sentence()}`).join("\n");
      body.push(`:::flow{caption="${sentence()}"}\nsteps:\n${steps}\n:::\n`);
    }
    body.push(`:::faq\n### ${words(4)}?\n${sentence()}\n### ${words(4)}?\n${sentence()}\n:::\n`);
    body.push(`::cta{title="${words(3)}" button="Read the spec" href="https://snypd.rocks/spec"}\n`);
    writeFileSync(join(dir, `${slug}.md`), body.join("\n"));
  }
  writeFileSync(join(root, "snypd.yaml"), `snypd: 1\nsite:\n  name: corpus-${n}\n  url: https://corpus-${n}.snypd.rocks\ntheme:\n  use: base\n`);
  return dir;
}

if (import.meta.main) {
  const n = Number(process.argv[2] ?? 100);
  console.log(generate(n));
}
