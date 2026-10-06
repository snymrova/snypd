/**
 * `theme › compose` (W5, docs/37 §6): a theme from a kit, with a few slots changed, in one call — and the
 * proof the kit format holds a theme somebody looked at: composing a theme's own kit unchanged gives that
 * theme's pieces and tokens back.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./config";
import { composeTheme, draftsIn } from "./compose";
import { loadKits, loadPieces } from "../../pieces/src/index";
import { installFace } from "../../shelf/src/index";

const site = mkdtempSync(join(tmpdir(), "snypd-compose-"));
writeFileSync(join(site, "snypd.yaml"), "snypd: 1\nsite: { name: t, url: https://t.example }\ntheme: { use: editorial }\n");
afterAll(() => rmSync(site, { recursive: true, force: true }));
const install = (id: string, dir: string) => { const g = installFace(id, dir); return { id: g.face.id, font: g.font, stack: g.stack, role: g.face.role, pairsWith: g.face.pairsWith }; };
const shape = (root: string, theme: string) => {
  const c = loadConfig(root, { theme });
  return { pieces: c.pieces.map((p) => [p.id, p.switches]), tokens: c.config.theme.tokens };
};

describe("compose (W5)", () => {
  test.each(["editorial", "technical", "studio"])("the %s kit, composed unchanged, is %s: the same pieces, switches and tokens", (kit) => {
    const r = composeTheme(site, { name: `k-${kit}`, kit });
    expect(r).toMatchObject({ kit, extends: kit, changed: [], drafts: [], warnings: [] });
    expect(shape(site, `k-${kit}`)).toEqual(shape(site, kit));
  });

  test("a change replaces the kit's slot whole; the brief and the personality say what it was composed from", () => {
    const r = composeTheme(site, { name: "split-editorial", kit: "editorial", change: { home: "split", footer: "close" } });
    expect(r.changed).toEqual(["home", "footer"]);
    expect(r.pieces.footer).toBe("close");                           // the kit's { use: line, roomy: true } is gone whole
    const c = loadConfig(site, { theme: "split-editorial" });
    expect(c.pieces.find((p) => p.slot === "home")?.id).toBe("home/split");
    expect(c.pieces.find((p) => p.slot === "footer")).toMatchObject({ id: "footer/close", switches: {} });
    expect(readFileSync(join(site, "themes/split-editorial/DESIGN.md"), "utf8")).toContain("Composed from kit `editorial` (extends `editorial`), changed: `home: split`, `footer: close`.");
    expect(readFileSync(join(site, "themes/split-editorial/theme.yaml"), "utf8")).toMatch(/^personality: >-\n  A reading page .* Composed from editorial, with home: split, footer: close\.$/m);
    expect(readFileSync(join(site, "themes/split-editorial/theme.css"), "utf8")).toContain("home: split · ");
  });

  test("a kit's seed and face land in the theme, and it names no draft once the sitting has passed its pieces", () => {
    const r = composeTheme(site, { name: "nb", kit: "notebook" }, install);
    expect(r.face).toBe("instrument-serif");
    expect(r.seed?.input).toMatchObject({ seed: "oklch(0.42 0.06 250)", strategy: "restrained", scheme: "light" });
    expect(existsSync(join(site, "themes/nb/fonts/instrument-serif.woff2"))).toBe(true);
    expect(r.drafts).toEqual([]);
    const d = readFileSync(join(site, "themes/nb/DESIGN.md"), "utf8");
    expect(d.indexOf("## Kit")).toBeLessThan(d.indexOf("## Seed"));
  });

  test("a face needs somewhere to come from: refused without an installer, and without a seed", () => {
    expect(() => composeTheme(site, { name: "nb2", kit: "notebook" })).toThrow("cannot install faces");
    expect(() => composeTheme(site, { name: "ed2", kit: "editorial", face: "lora" }, install)).toThrow("a face needs a seed");
    expect(existsSync(join(site, "themes/nb2"))).toBe(false);
  });

  test("nothing is kept when the change is wrong — an unknown piece before writing, an unknown switch after loading", () => {
    expect(() => composeTheme(site, { name: "bad1", kit: "editorial", change: { home: "nope" } })).toThrow('no piece "home/nope"');
    expect(() => composeTheme(site, { name: "bad2", kit: "editorial", change: { nope: "x" } })).toThrow('no slot "nope"');
    expect(() => composeTheme(site, { name: "bad3", kit: "editorial", change: { prose: { use: "book", nope: true } } })).toThrow('prose/book has no switch "nope"');
    expect(() => composeTheme(site, { name: "bad4", kit: "nope" })).toThrow('no kit "nope"');
    for (const n of ["bad1", "bad2", "bad3", "bad4"]) expect(existsSync(join(site, "themes", n))).toBe(false);
  });

  test("a pair nobody has looked at is a warning, not a refusal", () => {
    const r = composeTheme(site, { name: "pf", kit: "portfolio", change: { home: "split" } });
    expect(r.warnings.join()).toContain("feature/facts pairs with home: bands");
  });

  test("draftsIn: a draft piece, and a draft switch only when it is turned on", () => {
    // The sitting passed every drawn piece, so two are marked drafts again for this test alone.
    const m = loadPieces(), home = m.pieces["home/index"]!, sw = m.pieces["prose/book"]!.switches["display-heads"]!;
    expect(draftsIn({ prose: { use: "book", "display-heads": true }, home: "index" })).toEqual([]);
    home.draft = sw.draft = true;
    try {
      expect(draftsIn({ prose: "book", home: "index" })).toEqual(["home/index"]);
      expect(draftsIn({ prose: { use: "book", "display-heads": true } })).toEqual(["prose/book › display-heads"]);
      expect(draftsIn({ prose: { use: "book", "display-heads": false } })).toEqual([]);
    } finally { home.draft = sw.draft = false; }
  });

  test("the kits that are not drafts name no draft", () => {
    for (const k of Object.values(loadKits()).filter((k) => !k.draft)) expect(draftsIn(k.pieces as never)).toEqual([]);
  });
});
