/**
 * `theme › compose` (docs/37 §6, decision 279): a theme started from a kit, with a few slots changed.
 *
 * Scaffold, seed, the edit to `pieces:` and the brief's `## Kit` line were four calls an agent had to
 * get right in order; here they are one. The theme extends the kit's `extends:` (its tokens, face,
 * settings and variations), names the kit's whole `pieces:` map with the changes laid over it a slot at
 * a time (an entry replaces the kit's for that slot, switches included, as a child's does its parent's),
 * and takes the kit's seed and face unless the caller gives their own.
 *
 * Nothing is left half written: the composed theme is loaded as a site would load it, and a theme whose
 * pieces do not resolve is removed again and its diagnostics thrown. Drafts are allowed (a composed theme
 * is how a sitting sees a kit whole) and reported, because `check theme` fails a theme on a draft.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseDocument } from "yaml";
import { loadKits, loadPieces, type KitEntry } from "../../pieces/src/index";
import { loadConfig } from "./config";
import { scaffoldTheme, starterPiecesCss } from "./scaffold";
import { expandSeed, writeSeed, type SeedFace, type SeedResult, type SeedScheme, type SeedStrategy } from "./seed";
import { ThemePieceSchema, type ThemePiece } from "./schema";
import { WriteError } from "./write";

export interface ComposeInput {
  /** The new theme's name, and its directory under `themes/`. */
  name: string;
  kit: string;
  /** Slot → piece, laid over the kit's: `{ home: "split" }`, `{ prose: { use: "book", "display-heads": true } }`. */
  change?: Record<string, unknown>;
  /** An accent to seed from instead of the kit's (or where the kit has none). */
  seed?: string;
  strategy?: SeedStrategy;
  scheme?: SeedScheme;
  /** A shelf face instead of the kit's. Needs a seed, the caller's or the kit's. */
  face?: string;
}

/**
 * Core cannot import the shelf (it carries sixteen fonts and the initialize path stays small), so the door
 * that composes hands in how to copy a face into the theme — `@snypd/shelf` › `installFace`, as `seed` does.
 */
export type FaceInstaller = (id: string, themeDir: string) => SeedFace;

export interface ComposeResult {
  name: string; kit: string; extends: string; dir: string;
  files: string[];
  /** The theme's `pieces:` as written, slot by slot. */
  pieces: Record<string, ThemePiece>;
  /** The slots the caller changed from the kit. */
  changed: string[];
  seed?: SeedResult;
  face?: string;
  /** Draft pieces and switches the theme stands on — `check theme` fails it until a sitting passes them. */
  drafts: string[];
  /** What loading it warned about: a `pairs:` combination nobody has looked at, most often. */
  warnings: string[];
}

const label = (p: ThemePiece) => typeof p === "string" ? p : [p.use, ...Object.entries(p).filter(([k]) => k !== "use").map(([k, v]) => v === true ? k : `${k}=${v}`)].join("+");

export function kitOf(name: string): KitEntry {
  const kits = loadKits();
  const kit = kits[name];
  if (!kit) throw new WriteError(`no kit "${name}"`, `Kits: ${Object.keys(kits).join(", ")} (snypd://theme/kits).`);
  return kit;
}

/** The kit's `pieces:` with `change` laid over it, each changed entry checked for shape and against the shelf. */
export function composePieces(kit: KitEntry, change: Record<string, unknown> = {}): { pieces: Record<string, ThemePiece>; changed: string[] } {
  const m = loadPieces();
  const slots = m.slots.map((s) => s.slot);
  const pieces: Record<string, ThemePiece> = { ...kit.pieces } as Record<string, ThemePiece>;
  const changed: string[] = [];
  for (const [slot, raw] of Object.entries(change)) {
    if (!slots.includes(slot)) throw new WriteError(`no slot "${slot}"`, `The slots are ${slots.join(", ")}.`);
    const r = ThemePieceSchema.safeParse(raw);
    if (!r.success) throw new WriteError(`change.${slot}: a piece's name, or { use, …switches }`, `e.g. { ${slot}: "${Object.values(m.pieces).find((p) => p.slot === slot)?.name ?? "name"}" }`);
    const use = typeof r.data === "string" ? r.data : r.data.use;
    if (!m.pieces[`${slot}/${use}`]) {
      const has = Object.values(m.pieces).filter((p) => p.slot === slot).map((p) => p.name);
      throw new WriteError(`no piece "${slot}/${use}"`, `${slot} has ${has.join(", ")} (snypd://theme/pieces/${slot}).`);
    }
    pieces[slot] = r.data;
    changed.push(slot);
  }
  return { pieces: Object.fromEntries(slots.filter((s) => s in pieces).map((s) => [s, pieces[s]!])), changed };
}

/** The draft pieces and turned-on draft switches in a `pieces:` map, as `<slot>/<name>` and `<slot>/<name> › <switch>`. */
export function draftsIn(pieces: Record<string, ThemePiece>): string[] {
  const m = loadPieces();
  const out: string[] = [];
  for (const [slot, p] of Object.entries(pieces)) {
    const { use, ...set } = typeof p === "string" ? { use: p } : p;
    const e = m.pieces[`${slot}/${use}`];
    if (!e) continue;
    if (e.draft) out.push(e.piece);
    for (const [sw, v] of Object.entries(set)) if (e.switches[sw]?.draft && v !== e.switches[sw]!.default) out.push(`${e.piece} › ${sw}`);
  }
  return out;
}

export function composeTheme(root: string, input: ComposeInput, installFace?: FaceInstaller): ComposeResult {
  const kit = kitOf(input.kit);
  const { pieces, changed } = composePieces(kit, input.change);
  const accent = input.seed ?? kit.seed?.accent;
  const faceId = input.face ?? kit.face;
  if (input.face && !accent) throw new WriteError(`a face needs a seed`, `Kit ${kit.kit} has none; give \`seed\` too, e.g. "oklch(0.55 0.13 252)".`);
  if (faceId && !installFace) throw new WriteError(`kit ${kit.kit} names face ${faceId}, and this door cannot install faces`, "Compose through `snypd compose` or `theme › compose`.");
  // Solve the seed before anything is written: a seed that cannot be solved leaves no theme behind.
  const seeded = accent ? expandSeed({ seed: accent, strategy: input.strategy ?? kit.seed?.strategy, scheme: input.scheme ?? kit.seed?.scheme }) : undefined;

  const s = scaffoldTheme(root, { name: input.name, extends: kit.extends });
  const dir = join(root, s.dir);
  try {
    const file = join(dir, "theme.yaml");
    const doc = parseDocument(readFileSync(file, "utf8"));
    const node = doc.createNode(pieces);
    for (const item of (node as unknown as { items: { value: { flow?: boolean } }[] }).items) if (typeof item.value === "object" && item.value) item.value.flow = true;
    doc.set("pieces", node);
    // The kit's line is a personality somebody wrote and looked at; the scaffold's placeholder is one `check theme` fails.
    doc.set("personality", `${kit.line}${changed.length ? ` Composed from ${kit.kit}, with ${changed.map((c) => `${c}: ${label(pieces[c]!)}`).join(", ")}.` : ""}`);
    writeFileSync(file, `${doc.toString({ lineWidth: 0 }).replace(/\n+$/, "")}\n`);
    writeFileSync(join(dir, "theme.css"), starterPiecesCss(s.name, kit.extends, Object.entries(pieces).map(([k, v]) => `${k}: ${label(v)}`)));

    const files = new Set(s.files.map((f) => join(root, f)));
    if (seeded) for (const f of writeSeed(dir, s.name, seeded, faceId ? installFace!(faceId, dir) : undefined)) files.add(f);

    const design = join(dir, "DESIGN.md");
    const block = `## Kit\n\nComposed from kit \`${kit.kit}\` (extends \`${kit.extends}\`)${changed.length ? `, changed: ${changed.map((c) => `\`${c}: ${label(pieces[c]!)}\``).join(", ")}` : ", unchanged"}.\n${kit.line}\n`;
    const before = readFileSync(design, "utf8");
    writeFileSync(design, /^## Seed\b/m.test(before) ? before.replace(/^## Seed\b/m, `${block}\n## Seed`) : `${before.replace(/\n*$/, "\n\n")}${block}`);

    // Loaded as a site would load it, from the root, with this theme in place of the live one.
    const cfg = loadConfig(root, { theme: s.name });
    const errors = cfg.diagnostics.filter((d) => d.level === "error" && d.path.startsWith("theme"));
    if (errors.length) throw new WriteError(`composed ${s.name} does not load: ${errors.map((d) => d.message).join("; ")}`, "Nothing was kept. Change the slot named, then compose again.");
    return {
      name: s.name, kit: kit.kit, extends: kit.extends, dir: s.dir,
      files: [...files].map((f) => relative(root, f).split("\\").join("/")),
      pieces, changed, seed: seeded, face: faceId, drafts: draftsIn(pieces),
      warnings: cfg.diagnostics.filter((d) => d.level === "warning" && d.path.startsWith("theme")).map((d) => d.message),
    };
  } catch (e) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}
