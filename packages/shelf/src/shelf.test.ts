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
    });
  }

  test("nothing in fonts/ or licences/ that the manifest does not name", () => {
    const named = new Set(shelf.faces.flatMap((f) => [f.file, f.licence]));
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
    expect(readdirSync(join(dir, "fonts")).sort()).toEqual(["OFL.txt", "bitter.woff2", "own.woff2"]);
  });

  test("an unknown face is refused by name", () => {
    expect(() => installFace("inter", mkdtempSync(join(tmpdir(), "shelf-")))).toThrow(/no face "inter" on the shelf/);
  });
});
