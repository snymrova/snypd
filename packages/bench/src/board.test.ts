/**
 * W2 (docs/37 §5): the board's child themes and where a slot is best seen. The pictures themselves are
 * the MCP test's (`theme › look` › W2), which needs a browser; everything here runs without one.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "@snypd/core";
import { loadPieces } from "../../pieces/src/index";
import { routeFor, writeChildTheme } from "./board";

const REPO = join(import.meta.dir, "..", "..", "..");
const scratch = join(REPO, "corpora/_test/board");
const site = join(REPO, "corpora/specimen");
beforeAll(() => { rmSync(scratch, { recursive: true, force: true }); mkdirSync(scratch, { recursive: true }); });
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("a board cell is a child theme", () => {
  test("one slot swapped, the rest the parent's — and the parent's switches kept where nothing is swapped", () => {
    writeChildTheme(scratch, "cell-home", { parent: "editorial", pieces: { home: "split" } });
    const c = loadConfig(site, { theme: "cell-home", searchPaths: [scratch] });
    expect(c.ok).toBe(true);
    const parent = loadConfig(site, { theme: "editorial" });
    const others = (x: typeof c) => x.pieces.filter((p) => p.slot !== "home").map((p) => p.id);
    expect(others(c)).toEqual(others(parent));
    expect(c.pieces.find((p) => p.slot === "home")?.id).toBe("home/split");
    expect(c.pieces.find((p) => p.slot === "footer")?.switches).toEqual(parent.pieces.find((p) => p.slot === "footer")?.switches);
  });
  test("a token set lands over the parent's values, and its shelf face is installed with the role it was made for", () => {
    const m = loadPieces();
    const serif = m.board.sets.find((s) => s.name === "light-serif")!, display = m.board.sets.find((s) => s.name === "committed")!;
    writeChildTheme(scratch, "cell-serif", { parent: "technical", set: serif });
    writeChildTheme(scratch, "cell-display", { parent: "technical", set: display });
    const a = loadConfig(site, { theme: "cell-serif", searchPaths: [scratch] });
    const b = loadConfig(site, { theme: "cell-display", searchPaths: [scratch] });
    expect(a.ok && b.ok).toBe(true);
    const tok = (c: typeof a, k: string) => ((c.config.theme as any).tokens[k]?.default ?? (c.config.theme as any).tokens[k]) as string;
    expect(tok(a, "color.bg")).toBe(serif.tokens["color.bg"] as string);
    expect(tok(a, "font.body")).toContain("Source Serif 4");
    expect(tok(a, "font.heading")).toBe("var(--font-body)");
    expect(tok(b, "font.heading")).toContain("Young Serif");
    expect(tok(b, "font.body")).not.toContain("Young Serif");
    expect(existsSync(join(scratch, "themes", "cell-serif", "fonts", "OFL.txt"))).toBe(true);
    expect(readFileSync(join(scratch, "themes", "cell-display", "theme.yaml"), "utf8")).toContain("extends: technical");
  });
  test("a variation of the parent is folded into the child, under the set", () => {
    writeChildTheme(scratch, "cell-ink", { parent: "editorial", variationTokens: { "color.scheme": "dark", "color.accent": "#123456" }, set: { name: "x", line: "x", tokens: { "color.accent": "#abcdef" } } });
    const c = loadConfig(site, { theme: "cell-ink", searchPaths: [scratch] });
    const t = (c.config.theme as any).tokens;
    expect(t["color.scheme"].default ?? t["color.scheme"]).toBe("dark");
    expect(t["color.accent"].default ?? t["color.accent"]).toBe("#abcdef");
  });
});

describe("where a slot is best seen", () => {
  const dist = join(scratch, "dist");
  beforeAll(() => {
    const page = (route: string, html: string) => { mkdirSync(join(dist, route), { recursive: true }); writeFileSync(join(dist, route, "index.html"), html); };
    page("", `<main class="snypd-home"><p>front</p></main>`);
    page("posts/a", `<article><p>1</p><p>2</p><div class="snypd-callout"></div><div class="snypd-callout"></div><div class="snypd-callout"></div></article>`);
    page("posts/b", `<article><p>1</p><div class="snypd-callout"></div><div class="snypd-stat"></div><figure class="snypd-figure"></figure><ol class="footnotes"></ol></article>`);
    page("posts/long", `<article>${"<p>x</p>".repeat(40)}<pre>a</pre></article>`);
    page("posts", `<ul class="snypd-entries"><li class="snypd-entry"></li></ul>`);
  });
  test("the front page for the slots that are on every page or are the front page", () => {
    for (const slot of ["home", "masthead", "footer"]) expect(routeFor(dist, slot)).toBe("/");
  });
  test("otherwise the page with the most of what the slot styles — blocks by kinds, not count", () => {
    expect(routeFor(dist, "blocks")).toBe("/posts/b/");
    expect(routeFor(dist, "prose")).toBe("/posts/long/");
    expect(routeFor(dist, "notes")).toBe("/posts/b/");
    expect(routeFor(dist, "entries")).toBe("/posts/");
    // A variant's own classes count too: a ledger is found by the class it emits.
    writeFileSync(join(dist, "posts", "a", "index.html"), `<div class="snypd-ledger"></div><div class="snypd-ledger"></div>`);
    expect(routeFor(dist, "wall", ["snypd-ledger"])).toBe("/posts/a/");
  });
});
