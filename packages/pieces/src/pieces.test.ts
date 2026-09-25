/**
 * P2 (docs/36 §4): the brick and the plate. The manifest is in sync with the pieces on disk; a theme's
 * `pieces:` resolves up the chain a slot at a time and is refused with a line when it names something the
 * shelf does not have; the pieces' CSS lands in `snypd.pieces.<slot>` between base and the theme; a
 * piece's part is found at the link that named it, nearer than an ancestor's file and farther than the
 * link's own; and a theme on no pieces is byte for byte what it was.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, pieceTokens, type ResolvedPiece } from "@snypd/core";
import { build, loadTheme } from "@snypd/render";
import { generate, render } from "./gen";
import { loadPieces } from "./index";

const REPO = join(import.meta.dir, "..", "..", "..");
const root = join(REPO, "corpora/_test/pieces");
const TOKENS = `tokens:
  color.bg: "#fff"
  color.text: "#111"
  color.muted: "#555"
  color.border: "#ddd"
  color.accent: "#05c"
  color.surface: "#f4f4f4"
  color.viz.3: "#c60"
  radius: 4px
`;
const theme = (name: string, yaml: string, files: Record<string, string> = {}) => {
  const dir = join(root, "themes", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "theme.yaml"), `theme: ${name}\n${yaml}`);
  for (const [f, src] of Object.entries(files)) { mkdirSync(join(dir, f, ".."), { recursive: true }); writeFileSync(join(dir, f), src); }
};
const load = (name: string) => loadConfig(root, { theme: name });

beforeAll(() => {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, "content/posts"), { recursive: true });
  writeFileSync(join(root, "snypd.yaml"), "snypd: 1\nsite: { name: P, url: https://p.example }\ntheme: { use: withtoc }\n");
  writeFileSync(join(root, "content/posts/a.md"), "---\ntitle: A\nslug: a\ndate: 2026-09-01\nstatus: published\n---\n\n## One\n\nx\n\n## Two\n\ny\n\n## Three\n\nz\n");
  theme("plain", `extends: base\ncss: ./t.css\n${TOKENS}`, { "t.css": ".plain { margin: 0 }\n" });
  theme("onpieces", `extends: base\npieces: {}\n${TOKENS}`);
  theme("withtoc", `extends: base\ncss: ./t.css\npieces:\n  toc: block\n${TOKENS}`, { "t.css": ".mine { margin: 0 }\n" });
  // Per-link precedence (docs/36 §4.3): a parent's own file, a child's piece; a parent's piece, a child's own file.
  const partSrc = (s: string) => `export default () => ${JSON.stringify(s)};`;
  theme("parentfile", `extends: base\nparts: { toc: ./toc.tsx }\n${TOKENS}`, { "toc.tsx": partSrc("parent-file-toc") });
  theme("childpiece", "extends: parentfile\npieces: { toc: block }\n");
  theme("parentpiece", `extends: base\npieces: { toc: block }\n${TOKENS}`);
  theme("childfile", "extends: parentpiece\nparts: { toc: ./toc.tsx }\n", { "toc.tsx": partSrc("child-file-toc") });
  theme("grandchild", "extends: parentpiece\n");
  // The refusals.
  theme("badslot", "extends: base\npieces:\n  sidebar: left\n");
  theme("badvariant", "extends: base\npieces:\n  toc: rail\n");
  theme("badswitch", "extends: base\npieces:\n  toc: { use: block, sticky: true }\n");
  theme("ownsetting", `extends: base\npieces: { toc: block }\nsettings:\n  - { id: tocDepth, type: select, label: Depth, default: "2", options: ["2", "3"] }\n${TOKENS}`);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("the manifest", () => {
  test("pieces.json is what the generator writes from the pieces on disk", () => {
    expect(readFileSync(join(import.meta.dir, "..", "pieces.json"), "utf8")).toBe(render(generate()));
  });
  test("every slot is listed once, house first and always on; every piece names its source", () => {
    const m = loadPieces();
    expect(m.slots[0]).toMatchObject({ slot: "house", always: true });
    expect(new Set(m.slots.map((s) => s.slot)).size).toBe(m.slots.length);
    for (const p of Object.values(m.pieces)) { expect(p.from.length).toBeGreaterThan(0); expect(p.kb).toBeGreaterThan(0); }
  });
  test("house is the nineteen rules every sheet shares, less the reduced-motion reset base now carries", () => {
    const css = readFileSync(join(import.meta.dir, "..", "house", "house", "piece.css"), "utf8");
    expect(css).not.toContain("prefers-reduced-motion");
    expect(css).toContain("*, *::before, *::after { box-sizing: border-box; }");
  });
});

describe("config: pieces: resolves up the chain", () => {
  test("a theme on no pieces has none, and a theme that says `pieces: {}` gets house", () => {
    expect(load("plain").pieces).toEqual([]);
    expect(load("onpieces").pieces.map((p) => p.id)).toEqual(["house/house"]);
  });
  test("slots come back in canonical order with every switch resolved", () => {
    const c = load("withtoc");
    expect(c.ok).toBe(true);
    expect(c.pieces.map((p) => [p.id, p.declaredBy, !!p.always])).toEqual([["house/house", "withtoc", true], ["toc/block", "withtoc", false]]);
  });
  test("`pieces:` is a declaration, so snypd://config does not carry it", () => {
    const c = load("withtoc");
    expect(c.render()).not.toContain("pieces");
    expect((c.config.theme as Record<string, unknown>).pieces).toBeUndefined();
  });
  test("a child names only the slots it changes — a grandchild inherits its grandparent's piece", () => {
    expect(load("grandchild").pieces.find((p) => p.slot === "toc")).toMatchObject({ id: "toc/block", declaredBy: "parentpiece" });
  });
  test("a slot, a variant or a switch the shelf does not have is an error with its line", () => {
    const at = (name: string) => load(name).diagnostics.filter((d) => d.level === "error" && d.path.startsWith("theme.pieces"));
    const slot = at("badslot")[0]!;
    expect(slot.message).toContain('no slot "sidebar"'); expect(slot.where).toBe("themes/badslot/theme.yaml:4 (theme badslot)");
    expect(at("badvariant")[0]!.message).toBe('no piece "toc/rail" — toc has block');
    expect(at("badswitch")[0]!.message).toBe('toc/block has no switch "sticky" — it offers none');
    expect(load("badslot").ok).toBe(false);
  });
  test("a piece's settings sit beneath the theme's: its own declaration of the same id wins", () => {
    expect(load("withtoc").settingDecls.find((d) => d.id === "tocDepth")?.default).toBe("3");
    expect(load("ownsetting").settingDecls.find((d) => d.id === "tocDepth")?.default).toBe("2");
  });
  test("a piece's `needs:` and the optional tokens it reads are added only where the theme is silent", () => {
    const entry = { ...loadPieces().pieces["toc/block"]!, reads: ["motion.quick", "radius"], needs: { "size.masthead": "4em" } };
    const p = { slot: "toc", name: "block", id: "toc/block", switches: {}, declaredBy: "x", entry } as ResolvedPiece;
    expect(pieceTokens([p], new Set(["radius"])).tokens).toEqual({ "size.masthead": "4em", "motion.quick": "150ms" });
    expect(pieceTokens([p], new Set(["radius", "motion.quick", "size.masthead"])).tokens).toEqual({});
  });
});

describe("render: the plate", () => {
  test("pieces sit in snypd.pieces.<slot> between base and the theme, in slot order; a theme on none has no such layer", async () => {
    const t = await loadTheme(load("withtoc"));
    const css = t.css!;
    const at = (s: string) => css.indexOf(s);
    expect(at("@layer snypd.base {")).toBe(0);
    expect(at("@layer snypd.pieces.house {")).toBeGreaterThan(0);
    expect(at("@layer snypd.pieces.toc {")).toBeGreaterThan(at("@layer snypd.pieces.house {"));
    expect(at("@layer snypd.theme.withtoc {")).toBeGreaterThan(at("@layer snypd.pieces.toc {"));
    expect(t.piecesCtx).toEqual({ house: { use: "house" }, toc: { use: "block" } });
    expect((await loadTheme(load("plain"))).css).not.toContain("snypd.pieces.");
  });
  test("the theme hash is taken over the pieces' files as well as the chain's, so a fix to a piece re-renders every theme on it", async () => {
    const { pieceDir } = await import("@snypd/core");
    const { themeHash } = await import("@snypd/render");
    const t = await loadTheme(load("withtoc"));
    expect(t.hash).toBe(themeHash([...t.chain.map((l) => l.dir), pieceDir("house/house"), pieceDir("toc/block")]));
    expect(t.hash).not.toBe(themeHash(t.chain.map((l) => l.dir)));
  });
  test("a theme with no sheet of its own still ships its pieces", async () => {
    expect((await loadTheme(load("onpieces"))).css).toContain("@layer snypd.pieces.house {");
  });
  test("per link: own file, then own piece, then the ancestor", async () => {
    const cov = async (n: string) => (await loadTheme(load(n))).partCoverage.find((c) => c.name === "toc");
    expect(await cov("withtoc")).toEqual({ name: "toc", status: "piece", via: "toc/block" });
    expect(await cov("childpiece")).toEqual({ name: "toc", status: "piece", via: "toc/block" });          // its own piece beats its parent's file
    expect(await cov("childfile")).toEqual({ name: "toc", status: "own" });                               // its own file beats its parent's piece
    expect(await cov("grandchild")).toEqual({ name: "toc", status: "piece", via: "toc/block" });          // a piece named two links up
    expect(await cov("parentfile")).toEqual({ name: "toc", status: "own" });
  });
  test("a build draws the piece's part and charges its CSS to the one sheet", async () => {
    const r = await build(root);
    expect(r.theme.name).toBe("withtoc");
    const html = readFileSync(join(root, "dist/posts/a/index.html"), "utf8");
    expect(html).toContain('<nav class="snypd-toc" aria-label="Contents">');
    const css = readFileSync(join(root, "dist/assets/theme.css"), "utf8");
    expect(css.startsWith("@layer snypd.tokens,snypd.base,snypd.pieces,snypd.theme,snypd.site;")).toBe(true);
    expect(css).toMatch(/@layer snypd.pieces.toc\{ ?\.snypd-toc\{/);
  });
});

describe("check theme: the expanded sheet", () => {
  test("names the pieces, fails a contract token they read and the theme lacks, and lints their files", async () => {
    const { checkTheme } = await import("../../render/src/check");
    const r = await checkTheme(root, "withtoc");
    const row = (rule: string) => r.rules.find((x) => x.rule === rule)!;
    expect(row("pieces.used")).toMatchObject({ status: "pass" });
    expect(row("pieces.used").detail).toStartWith("house: house (always) · toc: block — ");
    expect(row("pieces.tokens").status).toBe("fail");                     // the fixture declares no space.*
    expect(row("pieces.tokens").detail).toContain("space.2 (house/house)");
    expect(row("pieces.contract").status).toBe("pass");
    expect(row("coverage.parts").detail).toContain("toc from toc/block");
    expect(row("css.enhancement-guarded").detail).toContain("2 from its pieces");
    expect((await checkTheme(root, "plain")).rules.find((x) => x.rule === "pieces.used")!.status).toBe("skip");
  });
});
