/**
 * Writes `pieces.json` — the manifest of every piece on the shelf (docs/36 §2, §4.1). Core reads the
 * manifest and nothing else from this package, the way it reads `shelf.json`: the CSS and the parts are
 * read at render time, through the same file seam a theme's are (`themefs.ts`), so a piece inside the
 * binary and a piece in a checkout are one code path.
 *
 * Run after adding or editing a piece; `pieces.test.ts` regenerates and asserts no diff. Every piece is
 * validated here — the schema, the name against the directory, the slot against `slots.yaml`, every file a
 * `parts:` or `layouts:` names — so a broken piece fails the generator, not a reader's build.
 *
 * And the contract (decision 269), as errors here rather than warnings in `check theme`: a piece on the
 * shelf sits on *every* theme, so a literal colour or a class nothing emits is wrong for all of them.
 * `piece.literal` and `piece.selector` over every stylesheet the piece ships, and `reads:` held to the
 * contract tokens its CSS actually names — `reads:` is what decides which optional tokens a theme emits.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseYaml } from "../../core/src/yaml";
import { PieceYamlSchema } from "../../core/src/schema";
import { cssVar, minifyCss } from "../../render/src/tokens";
import { literalHits, selectorHits } from "../../render/src/contract";
import { themeContract } from "../../spec/src/index";
import { STILL_FILES, type BoardDecl, type PieceManifest, type PieceEntry, type SlotEntry, type StillRecord } from "./index";

const parse = (src: string, file: string) => parseYaml(src, file).value;
export const PIECES = join(import.meta.dir, "..");

/** A piece's stills are pictures of it, not part of it: kept out of `files`, of the bundle and of the stills' own input hash. */
export const isStill = (f: string) => (STILL_FILES as readonly string[]).includes(f);

const walk = (dir: string, base = dir, out: string[] = []): string[] => {
  for (const f of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (f.name.startsWith(".") || isStill(f.name)) continue;
    const p = join(dir, f.name);
    if (f.isDirectory()) walk(p, base, out); else out.push(relative(base, p).split("\\").join("/"));
  }
  return out;
};

/** Kilobytes on the wire, minified, to two places — what `cssKb` is charged for the piece. */
const kbOf = (css: string) => +(Buffer.byteLength(minifyCss(css)) / 1024).toFixed(2);

/** `board.yaml`, checked: every set's token is a contract token, every slot has a stills route. */
export function readBoard(slots: string[], known: Set<string>, errors: string[]): BoardDecl {
  const b = parse(readFileSync(join(PIECES, "board.yaml"), "utf8"), "board.yaml") as BoardDecl;
  if (!b?.stills?.host || !b.stills.root || !b.stills.routes) errors.push("board.yaml: stills needs host, root and routes");
  for (const s of slots) if (!b?.stills?.routes?.[s]?.startsWith("/")) errors.push(`board.yaml: stills.routes has no route for ${s}`);
  for (const k of Object.keys(b?.stills?.routes ?? {})) if (k.includes("/") && !slots.includes(k.split("/")[0]!)) errors.push(`board.yaml: stills.routes names ${k}, whose slot is not a slot`);
  for (const [k, r] of Object.entries(b?.stills?.routes ?? {})) if (!r?.startsWith("/")) errors.push(`board.yaml: stills.routes.${k} is not a route`);
  const seen = new Set<string>();
  for (const set of b?.sets ?? []) {
    if (!/^[a-z][a-z0-9-]*$/.test(set.name ?? "") || seen.has(set.name)) errors.push(`board.yaml: set name ${JSON.stringify(set.name)} — lowercase, dashes, once`);
    seen.add(set.name);
    if (!set.line) errors.push(`board.yaml: set ${set.name} has no line`);
    for (const t of Object.keys(set.tokens ?? {})) if (!known.has(t)) errors.push(`board.yaml: set ${set.name} sets \`${t}\`, which is not a contract token — a board set may only retune what every piece can read`);
  }
  if ((b?.sets?.length ?? 0) < 3) errors.push("board.yaml: at least three sets (docs/37 §4·3)");
  return b;
}

/**
 * What a piece's stills are a picture of: the piece's own files, the host theme's `theme.yaml` and the
 * stills block of `board.yaml`. `stills.json` records it when the stills are shot; a piece whose inputs
 * have moved since has stale stills, and the manifest test says which.
 */
export function stillInputs(id: string, board: BoardDecl): string {
  const dir = join(PIECES, id);
  const h = createHash("sha1");
  for (const f of walk(dir)) h.update(f).update(readFileSync(join(dir, f)));
  const host = join(PIECES, "..", "..", "themes", board.stills.host, "theme.yaml");
  if (existsSync(host)) h.update(readFileSync(host));
  // Only what this piece's picture depends on: the host, the specimen, its own route — so a route added
  // for one piece does not stale every still.
  h.update(JSON.stringify({ host: board.stills.host, root: board.stills.root, route: stillRoute(id, board) }));
  return h.digest("hex").slice(0, 16);
}

/** The route a piece is photographed on: its own, by id, where the slot's route cannot show it (`list/grid` wants covers), else its slot's. */
export const stillRoute = (id: string, board: BoardDecl): string => board.stills.routes[id] ?? board.stills.routes[id.split("/")[0]!] ?? "/";

export const STILLS_JSON = join(PIECES, "stills.json");
export const readStills = (): Record<string, StillRecord> => existsSync(STILLS_JSON) ? JSON.parse(readFileSync(STILLS_JSON, "utf8")).pieces ?? {} : {};

export function generate(): PieceManifest {
  const slots = (parse(readFileSync(join(PIECES, "slots.yaml"), "utf8"), "slots.yaml") as { slots: SlotEntry[] }).slots;
  const names = new Set(slots.map((s) => s.slot));
  const contract = themeContract();
  const known = new Set([...contract.tokens, ...Object.keys(contract.optional)]);
  const errorsBoard: string[] = [];
  const board = readBoard(slots.map((s) => s.slot), known, errorsBoard);
  const shot = readStills();
  const byVar = new Map([...known].map((t) => [cssVar(t), t]));
  const pieces: Record<string, PieceEntry> = {};
  const errors: string[] = [...errorsBoard];
  for (const slot of slots.map((s) => s.slot)) {
    const sdir = join(PIECES, slot);
    if (!existsSync(sdir)) continue;
    for (const v of readdirSync(sdir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
      const dir = join(sdir, v);
      const id = `${slot}/${v}`;
      const yf = join(dir, "piece.yaml");
      if (!existsSync(yf)) { errors.push(`${id}: no piece.yaml`); continue; }
      const r = PieceYamlSchema.safeParse(parse(readFileSync(yf, "utf8"), `${id}/piece.yaml`));
      if (!r.success) { errors.push(`${id}/piece.yaml: ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`); continue; }
      const y = r.data;
      if (y.piece !== id) errors.push(`${id}/piece.yaml: \`piece: ${y.piece}\` but it lives in ${id}`);
      // A drawn piece is designed from references (docs/37 §3·2): two or three real pages and the idea taken from each.
      if (y.from === "drawn" && y.refs.length < 2) errors.push(`${id}/piece.yaml: \`from: drawn\` and ${y.refs.length ? "one ref" : "no refs"} — a drawn piece names at least two under \`refs:\` (url + took)`);
      for (const other of Object.keys(y.pairs)) if (!names.has(other)) errors.push(`${id}/piece.yaml: pairs names no slot "${other}"`);
      for (const [n, f] of [...Object.entries(y.parts), ...Object.entries(y.layouts)]) if (!existsSync(join(dir, f))) errors.push(`${id}/piece.yaml: ${n} → ${f}, which is missing`);
      const files = walk(dir);
      const css = existsSync(join(dir, "piece.css")) ? readFileSync(join(dir, "piece.css"), "utf8") : "";
      const switchKb: Record<string, number> = {};
      for (const f of files) if (f.endsWith(".css") && f !== "piece.css") {
        const stem = f.slice(0, -4);
        const offered = Object.entries(y.switches).some(([sw, d]) => stem === sw ? !d.of : d.of?.some((o) => stem === `${sw}-${o}`));
        if (!offered) errors.push(`${id}/${f}: no switch includes it — a boolean switch reads <id>.css, one with \`of:\` reads <id>-<value>.css`);
        switchKb[stem] = kbOf(readFileSync(join(dir, f), "utf8"));
      }
      for (const [sw, d] of Object.entries(y.switches)) if (d.draft && d.refs.length < 2) errors.push(`${id}/piece.yaml: switch \`${sw}\` is a draft and names ${d.refs.length ? "one ref" : "no refs"} — a drawn switch names at least two under \`refs:\` (url + took)`);
      if ("use" in y.switches) errors.push(`${id}/piece.yaml: a switch may not be called \`use\` — it is the key that names the piece`);
      for (const t of y.reads) if (!known.has(t) && !(t in y.needs)) errors.push(`${id}/piece.yaml: reads \`${t}\`, which is neither a contract token nor one of its \`needs:\``);
      const allowed = [...contract.classes, ...y.emits];
      const named = new Set<string>();
      for (const f of files.filter((f) => f.endsWith(".css"))) {
        const src = readFileSync(join(dir, f), "utf8");
        for (const h of literalHits(src, contract.literals)) errors.push(`${id}/${f}:${h.line} piece.literal — ${h.prop}: ${h.value} (${h.kind} ${h.what}): a token, a \`needs:\` entry, a switch, or the theme's residue`);
        for (const h of selectorHits(src, allowed, contract.classPrefixes)) errors.push(`${id}/${f}:${h.line} piece.selector — .${h.cls} is emitted by nothing base or this piece writes (add it to \`emits:\` if its own part does)`);
        for (const m of src.replace(/\/\*[^]*?\*\//g, "").matchAll(/var\(\s*(--[\w-]+)/g)) { const t = byVar.get(m[1]!); if (t) named.add(t); }
      }
      for (const t of named) if (!y.reads.includes(t)) errors.push(`${id}/piece.yaml: its CSS reads \`${t}\` and \`reads:\` does not list it`);
      for (const t of y.reads) if (known.has(t) && !named.has(t)) errors.push(`${id}/piece.yaml: \`reads:\` lists \`${t}\` and no stylesheet in the piece reads it`);
      // The stills are listed when both are on disk; `fresh` says whether they picture the piece as it is now.
      const stills = STILL_FILES.every((f) => existsSync(join(dir, f))) ? { files: STILL_FILES.map((f) => `${id}/${f}`), fresh: shot[id]?.inputs === stillInputs(id, board) } : undefined;
      pieces[id] = { ...y, slot, name: v, kb: kbOf(css), switchKb, files, ...(stills ? { stills } : {}) };
    }
  }
  if (errors.length) throw new Error(`pieces: ${errors.length} problem${errors.length === 1 ? "" : "s"}\n  ${errors.join("\n  ")}`);
  return { $comment: "GENERATED by `bun packages/pieces/src/gen.ts` — do not edit.", slots, board, pieces };
}

export const render = (m: PieceManifest) => JSON.stringify(m, null, 2) + "\n";

if (import.meta.main) {
  const m = generate();
  writeFileSync(join(PIECES, "pieces.json"), render(m));
  console.log(`wrote pieces.json (${Object.keys(m.pieces).length} pieces over ${m.slots.length} slots)`);
}
