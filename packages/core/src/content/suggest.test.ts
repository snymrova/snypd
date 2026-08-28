import { describe, expect, test } from "bun:test";
import { suggestBlocks, applySuggestions, candidates, score, toNumber, readTable, NEED } from "./suggest";
import { parseMarkdown } from "./parse";
import { lintMarkdown } from "./index";
import { detector, detectors, primitiveNames, SHAPES, DETECT_DIR } from "@snypd/spec";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Table } from "mdast";

const FM = `---\ntitle: T\ndate: 2026-01-02\n---\n\n`;
const POST_TYPE = { fields: { title: { type: "string", required: true }, date: { type: "date", required: true }, status: { type: "ref", to: "status" }, tags: { type: "list", of: { type: "ref", to: "tag" } } } } as const;
const ctx = { type: POST_TYPE as never, statuses: ["draft", "published", "trashed"] };
const names = (md: string, opts = {}) => suggestBlocks(md, { ...ctx, ...opts }).map((s) => s.primitive);
const one = (md: string, opts = {}) => suggestBlocks(md, { ...ctx, ...opts })[0];

const TABLE = `| Format | Tokens |\n| --- | --- |\n| HTML | 6120 |\n| Twin | 504 |\n| llms.txt | 61 |\n`;

describe("detector table (spec/detect)", () => {
  test("every primitive has a detector, and one that opts out says why", () => {
    const all = detectors();
    expect(Object.keys(all).sort()).toEqual(primitiveNames());
    for (const d of Object.values(all)) {
      if (d.shape === "none") { expect(d.because, `${d.name} opts out with no reason`).toBeTruthy(); continue; }
      expect(SHAPES, `${d.name} names an unknown shape "${d.shape}"`).toContain(d.shape);
      expect(d.min).toBeGreaterThan(0);
      for (const s of d.signals) {
        expect(s.because, `${d.name} has a signal with no because`).toBeTruthy();
        const ops = ["equals", "atLeast", "atMost", "matches", "isTrue", "isFalse", "oneOf"].filter((k) => s[k as keyof typeof s] !== undefined);
        expect(ops, `${d.name} signal on ${s.fact} names ${ops.length} operators`).toHaveLength(1);
      }
    }
  });
  test("the detector table actually shipped — an absent one reads as an opt-out and finds nothing", () => {
    for (const n of primitiveNames()) expect(existsSync(join(DETECT_DIR, `${n}.yaml`)), `no detector file for ${n}`).toBe(true);
    for (const d of Object.values(detectors())) expect(d.because ?? "").not.toContain("did not ship");
  });
  test("`stat` and `diagram` opt out, because prose does not carry a source or a graph", () => {
    expect(detector("stat")!.shape).toBe("none");
    expect(detector("diagram")!.shape).toBe("none");
    expect(names(`${FM}Alpha connects to beta, which feeds gamma and then delta.\n`)).not.toContain("diagram");
  });
  test("a signal fires only when its fact says so", () => {
    const d = { name: "x", shape: "table" as const, base: 0.5, require: { rows: [2, 12] as [number, number] }, min: 0.4,
      signals: [{ fact: "rows", atMost: 3, weight: 0.2, because: "b" }, { fact: "hasLinks", isTrue: true, weight: -0.9, because: "c" }] };
    expect(score(d, { rows: 3, hasLinks: false })!.confidence).toBe(0.7);
    expect(score(d, { rows: 9, hasLinks: false })!.confidence).toBe(0.5);
    expect(score(d, { rows: 3, hasLinks: true })).toBeUndefined();   // below min
    expect(score(d, { rows: 40, hasLinks: false })).toBeUndefined(); // outside require
  });
});

describe("shapes", () => {
  test("a table publishes its facts; a numeric first column under an axis header is still the label", () => {
    const md = `${FM}${TABLE}`;
    const c = candidates(parseMarkdown(md), md).find((x) => x.shape === "table")!;
    expect(c.facts).toMatchObject({ rows: 3, columns: 2, numericColumns: 1, labelColumn: true, hasLinks: false });
    const years = `${FM}| Year | Kilobytes |\n| --- | --- |\n| 2016 | 890 |\n| 2020 | 1810 |\n| 2024 | 2390 |\n`;
    const t = parseMarkdown(years).tree.children.find((n) => n.type === "table") as Table;
    expect(readTable(t)).toMatchObject({ numericAt: [1], labelAt: 0 });
  });
  test("toNumber reads what a table cell actually holds", () => {
    expect([toNumber("1,240 ms"), toNumber("$4.2k"), toNumber("92 %"), toNumber("—"), toNumber("v2")]).toEqual([1240, 4200, 92, NaN, NaN]);
  });
  test("a heading run stops at the first non-paragraph, so it cannot swallow the block after it", () => {
    const md = `${FM}## A?\n\nYes.\n\n## B?\n\nNo.\n\n> A quote that follows the run.\n> — Someone\n`;
    const run = candidates(parseMarkdown(md), md).find((c) => c.shape === "heading-run")!;
    expect(run.facts.headings).toBe(2);
    expect(run.source).not.toContain("A quote that follows");
  });
  test("only top-level candidates: a container body is a slice of the source, not a re-render", () => {
    const md = `${FM}- outer\n  1. Run this.\n  2. Then that.\n`;
    expect(candidates(parseMarkdown(md), md).some((c) => c.shape === "ordered-list")).toBe(false);
  });
});

describe("suggestions", () => {
  test("a table of one measure is a chart, and says what it still needs", () => {
    const s = one(`${FM}${TABLE}`)!;
    expect(s.primitive).toBe("chart");
    expect(s.markdown).toContain('type="bar"');
    expect(s.markdown).toContain("- { label: HTML, value: 6120 }");
    expect(s.needs.map((n) => n.prop)).toEqual(["source"]);
    expect(s.because.length).toBeGreaterThan(0);
  });
  test("a year column makes it a line, not a bar", () => {
    expect(one(`${FM}| Year | KB |\n| --- | --- |\n| 2016 | 890 |\n| 2020 | 1810 |\n| 2024 | 2390 |\n`)!.markdown).toContain('type="line"');
  });
  test("a branching list is a flow with its decisions; a straight one is steps", () => {
    const flow = one(`${FM}## Deploying\n\n1. Run the tests.\n2. If the suite is red, stop and page the author. Otherwise tag it.\n3. Push the tag and watch the build.\n4. When the check fails, roll back and go back to step 1.\n`)!;
    expect(flow.primitive).toBe("flow");
    expect(flow.markdown).toContain("- ask: ");
    expect(flow.markdown).toContain("The suite is red?");
    expect(flow.markdown).toContain('caption="Deploying."');      // taken from the heading, never invented
    const steps = one(`${FM}1. Run \`snypd build\`.\n2. Serve the twin.\n3. Verify with curl.\n`)!;
    expect(steps.primitive).toBe("steps");
  });
  test("a labelled quote is a callout; an attributed one is a pullquote; a long one is neither", () => {
    expect(names(`${FM}> Warning: the numbers are ours, not Google's.\n`)).toEqual(["callout"]);
    expect(one(`${FM}> There is no ranking benefit.\n> — Search Central\n`)!.markdown).toContain('cite="Search Central"');
    expect(names(`${FM}> ${"A sentence about the cost of a document. ".repeat(6)}\n`)).toEqual([]);
  });
  test("stripping a label leaves a sentence, so it keeps its capital", () => {
    expect(one(`${FM}TL;DR: serving the twin cuts what an agent parses by nine tenths.\n`)!.markdown).toContain("Serving the twin");
  });
  test("the loser on the same range rides along as alsoConsidered", () => {
    const s = one(`${FM}## Deploying\n\n1. Run the tests.\n2. If red, stop. Otherwise tag it.\n3. Push the tag and watch it.\n4. When it fails, go back to step 1.\n`)!;
    expect(s.alsoConsidered).toBeUndefined();     // `steps` gates on conditionals: 0, so it is not even a candidate
    expect(s.primitive).toBe("flow");
  });
});

describe("the property that makes it safe", () => {
  test("nothing is suggested that would introduce a lint error it did not declare", () => {
    const posts = [
      `${FM}${TABLE}`,
      `${FM}![](/media/x.png)\n\n*A caption.*\n`,
      `${FM}- 92 % fewer tokens\n- 504 tokens per page\n`,
      `${FM}## A?\n\nYes.\n\n## B?\n\nNo.\n`,
      `${FM}> Warning: mind the gap.\n`,
    ];
    for (const md of posts) {
      const before = lintMarkdown(md, ctx).diagnostics.filter((d) => d.severity === "error").length;
      for (const s of suggestBlocks(md, ctx)) {
        const after = md.slice(0, s.start) + s.markdown + md.slice(s.end);
        const errs = lintMarkdown(after, ctx).diagnostics.filter((d) => d.severity === "error");
        const undeclared = errs.filter((d) => !s.needs.some((n) => d.rule === "unsourced-evidence" && n.prop.startsWith("source") || d.rule === "image-alt" && n.prop === "alt" || d.message.includes(`\`${n.prop}\``)));
        expect(undeclared.map((d) => d.message), `${s.primitive} introduced an undeclared error`).toHaveLength(before ? undeclared.length : 0);
      }
    }
  });
  test("apply refuses an unmet need rather than writing a TODO into the post", () => {
    const md = `${FM}${TABLE}`;
    const list = suggestBlocks(md, ctx);
    const r = applySuggestions(md, list);
    expect(r.applied).toHaveLength(0);
    expect(r.skipped[0]!.why).toContain("source");
    expect(r.markdown).toBe(md);
    expect(r.markdown).not.toContain(NEED);
  });
  test("fill meets the need, and then it applies and lints clean", () => {
    const md = `${FM}${TABLE}`;
    const list = suggestBlocks(md, ctx);
    const r = applySuggestions(md, list, { fill: { "1": { source: "https://snypd.rocks/bench" } } });
    expect(r.applied).toHaveLength(1);
    expect(r.markdown).toContain('source="https://snypd.rocks/bench"');
    expect(r.markdown).not.toContain(NEED);
    expect(lintMarkdown(r.markdown, ctx).errors).toBe(0);
  });
  test("several suggestions apply without disturbing each other's offsets", () => {
    const md = `${FM}TL;DR: the twin is the file you already wrote.\n\n> Warning: measured on one box.\n\n## A?\n\nYes.\n\n## B?\n\nNo.\n`;
    const list = suggestBlocks(md, ctx);
    expect(list.map((s) => s.primitive)).toEqual(["tldr", "callout", "faq"]);
    const r = applySuggestions(md, list);
    expect(r.applied).toHaveLength(3);
    expect(r.markdown).toContain(":::tldr");
    expect(r.markdown).toContain(':::callout{kind="warning"}');
    expect(r.markdown).toContain(":::faq");
    expect(lintMarkdown(r.markdown, ctx).errors).toBe(0);
  });
  test("`only` and `minConfidence` narrow what comes back", () => {
    const md = `${FM}TL;DR: the twin is the file you already wrote, and it is a twelfth of the bytes.\n\n${TABLE}`;
    expect(names(md, { only: ["chart"] })).toEqual(["chart"]);
    expect(names(md, { minConfidence: 0.99 })).toEqual(["chart"]);   // raised: near-certainties only
    expect(names(md, { vocabulary: ["tldr"] })).toEqual(["tldr"]);
  });
});

describe("what it correctly leaves alone", () => {
  test("a lowered floor shows what was nearly suggested, and the safety pass still holds", () => {
    // One conditional in four steps is under `flow`'s floor and gates `steps` out entirely, so the
    // default answer is nothing. Lowering the line shows the call the tool declined to make.
    const md = `${FM}## Reproducing it\n\n1. Delete the dist directory.\n2. If the box is loaded, wait. Otherwise run the bench.\n3. Repeat five times and take the median.\n`;
    expect(names(md)).toEqual([]);
    const relaxed = suggestBlocks(md, { ...ctx, minConfidence: 0.4 });
    expect(relaxed.map((s) => s.primitive)).toEqual(["flow"]);
    expect(relaxed[0]!.confidence).toBeLessThan(0.6);
    expect(lintMarkdown(applySuggestions(md, relaxed).markdown, ctx).errors).toBe(0);   // still lint-clean
  });

  test("a reference table, a list of things, an essay and a code post get nothing", () => {
    expect(names(`${FM}| Release | Date | Notes |\n| --- | --- | --- |\n| 0.1 | 2026-01-01 | [notes](https://x.y/a) |\n| 0.2 | 2026-02-01 | [notes](https://x.y/b) |\n`)).toEqual([]);
    expect(names(`${FM}1. The HTTP content negotiation RFC.\n2. The schema.org HowTo vocabulary.\n3. A paper from 1981.\n`)).toEqual([]);
    expect(names(`${FM}The first metric we shipped rewarded us for making the HTML worse, which nobody did deliberately.\n`)).toEqual([]);
    expect(names(`${FM}Here is the interface.\n\n\`\`\`ts\nexport interface D { run(): void }\n\`\`\`\n`)).toEqual([]);
  });
});
