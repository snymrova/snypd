import { test, expect } from "bun:test";
import { compare, breaches, toMarkdown, type Report } from "./index";
import { generate } from "./corpus";
import { readdirSync, readFileSync } from "node:fs";

const rep = (v: number): Report => ({ version: "t", bun: "t", date: "t", metrics: [{ name: "build.cold.100", value: v, unit: "ms", budget: 2000 }] });

test("corpus is deterministic", () => {
  const d = generate(10, "corpora/_test");
  const files = readdirSync(d);
  expect(files.length).toBe(10);
  const first = readFileSync(`${d}/post-00000.md`, "utf8");
  generate(10, "corpora/_test");
  expect(readFileSync(`${d}/post-00000.md`, "utf8")).toBe(first);
  expect(first).toContain("::chart");
});

test("breach at 80 % of budget", () => {
  expect(breaches(rep(1600))).toEqual([]);
  expect(breaches(rep(1601))).toEqual(["build.cold.100"]);
});

test("compare flags >10 % regression", () => {
  expect(compare(rep(100), rep(110))[0]!.regressed).toBe(false);
  expect(compare(rep(100), rep(111))[0]!.regressed).toBe(true);
});

test("markdown report renders", () => {
  expect(toMarkdown(rep(1000))).toContain("✅");
});
