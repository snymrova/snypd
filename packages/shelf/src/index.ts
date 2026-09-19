/**
 * **The font shelf** (docs/29 §5, decisions 118 and 227): the faces `snypd theme seed --face` can give a
 * theme, each already subset to Latin, licensed, under the 40 KB lane and measured against the system
 * face it falls back to. Built by `scripts/shelf-build.py`; nothing here computes a number.
 *
 * **Never on the MCP initialize path.** The fonts are embedded (`files.gen.ts`), so importing this module
 * costs the manifest and a table of paths — still, the only callers are the seed step and its tests, and
 * they reach it with a dynamic `import()` (see the cold-start memory: every static import is paid on
 * every `initialize`).
 *
 * The contract carries one web font (`ThemeFontSchema`), so a shelf face is always paired with a system
 * stack rather than with a second face: `pairsWith` is that stack.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ThemeFont } from "@snypd/core";
import manifest from "../shelf.json";
import { FILES } from "./files.gen";

export type FaceCategory = "serif" | "slab" | "sans" | "mono";
/** `text` faces can set prose; `display` faces are for headings only, and the taste lint says so. */
export type FaceRole = "text" | "display";

export interface ShelfFace {
  id: string;
  family: string;
  category: FaceCategory;
  role: FaceRole;
  /** Shelf-relative paths. */
  file: string;
  licence: string;
  licenceName: "OFL-1.1";
  /** Exact size of the .woff2, and the kilobytes a theme is charged for it (rounded up). */
  bytes: number;
  kb: number;
  /** `font-weight` for the generated face: `400`, or a variable range like `400 700`. */
  weight: string;
  style: "normal";
  /** Measured, in em. The seed's `leading.body` is worked out from `xHeight`. */
  xHeight: number;
  capHeight: number;
  avgWidth: number;
  fallback: ThemeFont["fallback"];
  /** The system stack the face sits in front of, after itself and its fallback. */
  tail: string;
  suits: string;
  /** The system stack to set the other role in. */
  pairsWith: string;
  source: string;
}

export interface Shelf {
  source: { repo: string; ref: string };
  unicodes: string;
  features: string;
  faces: ShelfFace[];
}

export function loadShelf(): Shelf {
  return manifest as Shelf;
}

export function shelfFace(id: string): ShelfFace | undefined {
  return loadShelf().faces.find((f) => f.id === id);
}

/** A path Bun can read for a shelf-relative file: on disk from a checkout, in `$bunfs` from the binary. */
export function shelfFile(rel: string): string {
  const p = FILES[rel];
  if (!p) throw new Error(`the shelf has no file ${rel}`);
  return p;
}

export interface InstalledFace {
  /** The `font:` block for `theme.yaml` — passes `ThemeFontSchema` as it stands. */
  font: ThemeFont;
  /**
   * The `font-family` value to name the face by: `'<family>', '<family> fallback', <tail>`. The fallback
   * `@font-face` itself is *not* returned — the renderer already writes it from `font.fallback`
   * (`fontFaceCss`, render/src/tokens.ts), and a second copy in theme.css would declare it twice.
   */
  stack: string;
  face: ShelfFace;
}

/**
 * Copy a shelf face into `<themeDir>/fonts/` — the .woff2 and, beside it, `OFL.txt`, which the OFL
 * requires travel with the file and which is where editorial and studio already keep theirs. A face that
 * an earlier seed installed from the shelf is removed, so re-seeding with another face does not leave a
 * file behind that the theme no longer names.
 */
export function installFace(id: string, themeDir: string): InstalledFace {
  const face = shelfFace(id);
  if (!face) throw new Error(`no face "${id}" on the shelf — one of: ${loadShelf().faces.map((f) => f.id).join(", ")}`);
  const dir = join(themeDir, "fonts");
  mkdirSync(dir, { recursive: true });
  const ours = new Set(loadShelf().faces.map((f) => `${f.id}.woff2`));
  for (const name of readdirSync(dir)) if (ours.has(name) && name !== `${face.id}.woff2`) rmSync(join(dir, name));
  writeFileSync(join(dir, `${face.id}.woff2`), readFileSync(shelfFile(face.file)));
  writeFileSync(join(dir, "OFL.txt"), readFileSync(shelfFile(face.licence)));
  const font: ThemeFont = {
    family: face.family,
    file: `./fonts/${face.id}.woff2`,
    weight: face.weight,
    kb: face.kb,
    fallback: { ...face.fallback },
  };
  const q = (s: string) => `'${s}'`;
  return { font, stack: `${q(face.family)}, ${q(`${face.family} fallback`)}, ${face.tail}`, face };
}
