import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_FONT_KB, ThemeFontSchema, ThemeYamlSchema } from "@snypd/core";
import { installFace, loadShelf, shelfFile } from "./index";
import { FILES } from "./files.gen";

const SHELF = join(import.meta.dir, "..");
const shelf = loadShelf();

describe("the font shelf (docs/29 §5)", () => {
  test("holds 12–20 faces with unique ids", () => {
    expect(shelf.faces.length).toBeGreaterThanOrEqual(12);
    expect(shelf.faces.length).toBeLessThanOrEqual(20);
    expect(new Set(shelf.faces.map((f) => f.id)).size).toBe(shelf.faces.length);
  });

  test("leaves the overused faces off (decision 227)", () => {
    const families = shelf.faces.map((f) => f.family);
    for (const f of ["Inter", "Roboto", "Geist", "Fraunces", "Space Grotesk", "Plus Jakarta Sans"]) expect(families).not.toContain(f);
  });

  for (const f of shelf.faces) {
    test(`${f.id}: under the lane, and kb is the file's size`, () => {
      const size = statSync(join(SHELF, f.file)).size;
      expect(f.bytes).toBe(size);
      expect(f.kb).toBe(Math.ceil(size / 1024));
      expect(f.kb).toBeLessThanOrEqual(MAX_FONT_KB);
    });

    test(`${f.id}: travels with its OFL`, () => {
      const text = readFileSync(join(SHELF, f.licence), "utf8").toUpperCase();
      expect(text).toContain("SIL OPEN FONT LICENSE");
      expect(text).toContain("VERSION 1.1");
    });

    test(`${f.id}: every file is in the embedded barrel`, () => {
      expect(FILES[f.file]).toBeDefined();
      expect(FILES[f.licence]).toBeDefined();
      expect(statSync(shelfFile(f.file)).size).toBe(f.bytes);
      for (const c of f.cuts) expect(statSync(shelfFile(c.file)).size).toBe(c.bytes);
    });

    test(`${f.id}: each cut is under the lane, and kb is its size (decision 281)`, () => {
      for (const c of f.cuts) {
        expect(c.kb).toBe(Math.ceil(statSync(join(SHELF, c.file)).size / 1024));
        expect(c.kb).toBeLessThanOrEqual(MAX_FONT_KB);
      }
      expect(f.italic).toBe(f.cuts.some((c) => c.style === "italic"));
    });

    test(`${f.id}: records what it can do`, () => {
      for (const t of f.features) expect(t).toMatch(/^[a-z0-9]{4}$/);
      expect(["tabular", "proportional"]).toContain(f.digits);
      expect(f.weights.length).toBeGreaterThan(0);
      // No face asks for a figure style and silently lacks it: a column always has a way to align.
      expect(f.features.includes("tnum") || f.digits === "tabular" || f.role === "display").toBe(true);
    });
  }

  test("every text face and Instrument Serif ship an italic (decision 281), where upstream has one", () => {
    const noItalicUpstream = new Set(["young-serif", "gloock", "bricolage-grotesque", "big-shoulders", "barlow-condensed"]);
    for (const f of shelf.faces) if (f.role === "text" || f.id === "instrument-serif") expect(f.italic || noItalicUpstream.has(f.id)).toBe(true);
  });

  test("text serifs keep their old-style figures and small caps where the source has them", () => {
    expect(shelf.faces.find((f) => f.id === "source-serif-4")!.features).toEqual(expect.arrayContaining(["tnum", "onum", "smcp", "c2sc"]));
    expect(shelf.faces.find((f) => f.id === "bitter")!.features).toEqual(expect.arrayContaining(["onum", "smcp"]));
  });

  test("IBM Plex Serif reaches 600 through a cut, as prose/book asks", () => {
    expect(shelf.faces.find((f) => f.id === "ibm-plex-serif")!.weights).toEqual([400, 600]);
  });

  test("nothing in fonts/ or licences/ that the manifest does not name", () => {
    const named = new Set(shelf.faces.flatMap((f) => [f.file, f.licence, ...f.cuts.map((c) => c.file)]));
    for (const d of ["fonts", "licences"]) for (const n of readdirSync(join(SHELF, d))) expect(named).toContain(`${d}/${n}`);
  });
});

describe("installFace", () => {
  test("every face installs into a theme and round-trips through the contract", () => {
    for (const f of shelf.faces) {
      const dir = mkdtempSync(join(tmpdir(), "shelf-"));
      const { font, stack } = installFace(f.id, dir);
      expect(ThemeFontSchema.parse(font)).toEqual(font);
      expect(ThemeYamlSchema.safeParse({ theme: "t", extends: "base", font }).success).toBe(true);
      expect(readFileSync(join(dir, font.file)).length).toBe(f.bytes);
      expect(font.cuts?.length ?? 0).toBe(f.cuts.length);
      for (const c of font.cuts ?? []) expect(existsSync(join(dir, c.file))).toBe(true);
      expect(existsSync(join(dir, "fonts", "OFL.txt"))).toBe(true);
      expect(stack.startsWith(`'${f.family}', '${f.family} fallback', `)).toBe(true);
    }
  });

  test("re-seeding with another face removes the shelf face it replaced, and nothing else", () => {
    const dir = mkdtempSync(join(tmpdir(), "shelf-"));
    mkdirSync(join(dir, "fonts"));
    writeFileSync(join(dir, "fonts", "own.woff2"), "not ours");
    installFace("lora", dir);
    installFace("bitter", dir);
    expect(readdirSync(join(dir, "fonts")).sort()).toEqual(["OFL.txt", "bitter-italic.woff2", "bitter.woff2", "own.woff2"]);
  });

  test("an unknown face is refused by name", () => {
    expect(() => installFace("inter", mkdtempSync(join(tmpdir(), "shelf-")))).toThrow(/no face "inter" on the shelf/);
  });
});
