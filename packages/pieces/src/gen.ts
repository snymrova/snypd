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
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseYaml } from "../../core/src/yaml";
import { PieceYamlSchema } from "../../core/src/schema";
import { cssVar, minifyCss } from "../../render/src/tokens";
import { literalHits, selectorHits } from "../../render/src/contract";
import { themeContract } from "../../spec/src/index";
import type { PieceManifest, PieceEntry, SlotEntry } from "./index";

const parse = (src: string, file: string) => parseYaml(src, file).value;
export const PIECES = join(import.meta.dir, "..");

const walk = (dir: string, base = dir, out: string[] = []): string[] => {
  for (const f of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (f.name.startsWith(".")) continue;
    const p = join(dir, f.name);
    if (f.isDirectory()) walk(p, base, out); else out.push(relative(base, p).split("\\").join("/"));
  }
  return out;
};

/** Kilobytes on the wire, minified, to two places — what `cssKb` is charged for the piece. */
const kbOf = (css: string) => +(Buffer.byteLength(minifyCss(css)) / 1024).toFixed(2);

export function generate(): PieceManifest {
  const slots = (parse(readFileSync(join(PIECES, "slots.yaml"), "utf8"), "slots.yaml") as { slots: SlotEntry[] }).slots;
  const names = new Set(slots.map((s) => s.slot));
  const contract = themeContract();
  const known = new Set([...contract.tokens, ...Object.keys(contract.optional)]);
  const byVar = new Map([...known].map((t) => [cssVar(t), t]));
  const pieces: Record<string, PieceEntry> = {};
  const errors: string[] = [];
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
      pieces[id] = { ...y, slot, name: v, kb: kbOf(css), switchKb, files, ...(files.includes("still.png") ? { still: `${id}/still.png` } : {}) };
    }
  }
  if (errors.length) throw new Error(`pieces: ${errors.length} problem${errors.length === 1 ? "" : "s"}\n  ${errors.join("\n  ")}`);
  return { $comment: "GENERATED by `bun packages/pieces/src/gen.ts` — do not edit.", slots, pieces };
}

export const render = (m: PieceManifest) => JSON.stringify(m, null, 2) + "\n";

if (import.meta.main) {
  const m = generate();
  writeFileSync(join(PIECES, "pieces.json"), render(m));
  console.log(`wrote pieces.json (${Object.keys(m.pieces).length} pieces over ${m.slots.length} slots)`);
}
