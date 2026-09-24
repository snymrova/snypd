/**
 * Reading a theme's files, wherever the theme is (decision 46, S18a).
 *
 * A theme is normally a directory: a checkout has `themes/`, an npm install has `node_modules/`, and a
 * user's own theme is always a real path. That is the path the loader takes and it is unchanged. Only
 * inside a `--compile` binary is there no directory to read, and there the two bundled themes are
 * answered from `./bundled` — the *same* lookups, a different source of bytes, so a third-party theme is
 * never on a worse path than a shipped one.
 *
 * Every theme read on the runtime path goes through here. `existsSync`/`readdirSync` against a theme dir
 * do not, because in a binary they are quietly wrong: they report "missing" for a theme that is present.
 *
 * Since P1 a plugin's files come through the same functions (docs/10 decision 83): a bundled plugin is a
 * `snypd:plugin/<name>` dir answered from `BUNDLED_PLUGINS`, and a plugin on disk is a real path — so
 * the route key's plugin graph hash (decision 95) is `themeHash` over plugin dirs, not a second hasher.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { BUNDLED, BUNDLED_PIECES, BUNDLED_PLUGINS } from "./bundled";

/** The dir a bundled theme is given when it has no directory. Never passed to `fs`. */
export const bundledDir = (name: string) => `snypd:theme/${name}`;
/** The same for a first-party plugin (docs/10 §4.8, decision 83): one seam, a second prefix, no second loader. */
export const bundledPluginDir = (name: string) => `snypd:plugin/${name}`;
/** And for a piece (docs/36 §4.6): `snypd:piece/<slot>/<name>`. */
export const bundledPieceDir = (id: string) => `snypd:piece/${id}`;
export const isBundledDir = (dir: string) => dir.startsWith("snypd:theme/") || dir.startsWith("snypd:plugin/") || dir.startsWith("snypd:piece/");
const bundledName = (dir: string) => dir.slice(dir.indexOf("/") + 1);
const of = (dir: string) => (dir.startsWith("snypd:theme/") ? BUNDLED[bundledName(dir)] : dir.startsWith("snypd:plugin/") ? BUNDLED_PLUGINS[bundledName(dir)] : dir.startsWith("snypd:piece/") ? BUNDLED_PIECES[bundledName(dir)] : undefined);
/** Where the pieces live in a checkout. Inside a binary this path does not exist and the barrel answers. */
const PIECES_ON_DISK = join(import.meta.dir, "..", "..", "pieces");
/**
 * A piece's directory, `<slot>/<name>` (docs/36 §4.6): on disk in a checkout, so an edit to a piece is
 * picked up like an edit to a theme; the bundled barrel inside a binary. Read with `themeFile` and friends.
 */
export function pieceDir(id: string): string {
  const d = join(PIECES_ON_DISK, id);
  return existsSync(join(d, "piece.yaml")) ? d : bundledPieceDir(id);
}
/** `./primitives/x.tsx` and `primitives/x.tsx` are the same slot; theme.yaml writes both. */
const norm = (rel: string) => rel.replace(/^\.\//, "");

/** Names of the themes that ship in the binary. */
export const bundledNames = (): string[] => Object.keys(BUNDLED).sort();
/** Names of the plugins that ship in the binary. */
export const bundledPluginNames = (): string[] => Object.keys(BUNDLED_PLUGINS).sort();

/** One theme file as text, or undefined if the theme does not have it. */
export function themeFile(dir: string, rel: string): string | undefined {
  const b = of(dir);
  if (b) return b.files[norm(rel)];
  const f = join(dir, rel);
  return existsSync(f) ? readFileSync(f, "utf8") : undefined;
}

export const themeHas = (dir: string, rel: string): boolean =>
  of(dir) ? norm(rel) in of(dir)!.files || norm(rel) in of(dir)!.bytes || norm(rel) in of(dir)!.modules : existsSync(join(dir, rel));

/**
 * One theme file as bytes — a webfont (B1), and anything else a theme ships that is not text or code.
 * The build copies these verbatim into `dist/`, so this is the one read whose answer is a `Buffer` on
 * both sides of the seam: on disk it is the file, and in a binary it is `bytes` decoded from base64.
 */
export function themeBinary(dir: string, rel: string): Buffer | undefined {
  const b = of(dir);
  if (b) { const v = b.bytes[norm(rel)]; return v === undefined ? undefined : Buffer.from(v, "base64"); }
  const f = join(dir, rel);
  return existsSync(f) ? readFileSync(f) : undefined;
}

/** Load one theme module (a layout, a primitive) and return its default export. */
export async function themeModule(dir: string, rel: string, bust = ""): Promise<unknown> {
  const b = of(dir);
  if (b) {
    const load = b.modules[norm(rel)];
    if (!load) throw new Error(`theme ${bundledName(dir)}: ${rel} is not bundled in this build`);
    return (await load() as { default: unknown }).default;
  }
  return (await import(join(dir, rel) + bust) as { default: unknown }).default;
}

/** Every file in the theme, theme-relative and sorted — what the hash and the stamp are taken over. */
export function themeFiles(dir: string): string[] {
  const b = of(dir);
  if (b) return [...Object.keys(b.files), ...Object.keys(b.bytes), ...Object.keys(b.modules)].sort();
  const out: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d, { withFileTypes: true }).sort((a, x) => a.name.localeCompare(x.name))) {
      if (f.name === "node_modules" || f.name.startsWith(".")) continue;
      const p = join(d, f.name);
      if (f.isDirectory()) walk(p); else out.push(relative(dir, p).split("\\").join("/"));
    }
  };
  try { walk(dir); } catch { return []; }
  return out;
}

/** Bytes for hashing; `undefined` for a bundled module, whose bytes are folded into the theme's own hash. */
export const themeBytes = (dir: string, rel: string): string | Buffer | undefined =>
  of(dir) ? of(dir)!.files[norm(rel)] ?? themeBinary(dir, rel) : readFileSync(join(dir, rel));

/**
 * A change signal for the theme. On disk that is mtime + size, which is cheap and catches an edit.
 * In a binary it is the generation-time hash: nothing can change, so nothing has to be watched.
 */
export function themeSignature(dir: string): string {
  const b = of(dir);
  if (b) return `${dir}:${b.hash}`;
  return themeFiles(dir).map((r) => { const s = statSync(join(dir, r)); return `${r}:${s.mtimeMs}:${s.size}`; }).join("|");
}
