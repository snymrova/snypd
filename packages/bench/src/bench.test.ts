import { test, expect, afterAll } from "bun:test";
import { compare, breaches, toMarkdown, status, runTokensPerPage, runTokensToLearn, learnSurface, type Report, type Metric } from "./index";
import { generate } from "./corpus";
import { countTokens } from "./tokens";
import { build } from "@snypd/render";
import { serve } from "@snypd/runtime";
import { readdirSync, readFileSync, rmSync } from "node:fs";

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
