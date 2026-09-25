/**
 * A theme's `pieces:`, resolved (docs/36 §4.1, decisions 266 and 270).
 *
 * The declaration is read off the `theme.yaml` docs the chain walk already parsed, parent first, and
 * map-merged a slot at a time — a child names only the slots it changes, and its entry for a slot
 * replaces its parent's whole, switches included. Every entry is checked against the manifest
 * (`packages/pieces/pieces.json`): a slot the shelf does not have, a variant it does not have, a switch
 * the piece does not offer or a value outside its `of:` is an error with the file and line.
 *
 * A theme that declares `pieces:` at all is a theme *on pieces*, and gets the slots marked `always` (the
 * `house` rules) without naming them. A theme that does not declare it gets nothing — the four sheets in
 * the tree today render byte for byte as they did before P2.
 *
 * What resolving adds to the config, and nothing else: the tokens the pieces read that the theme does not
 * declare (a piece's `needs:` default, or an optional contract token's derived value) and the settings the
 * pieces offer. Both land *beneath* the theme's own — a theme that declares the token or the setting wins.
 */
import { themeContract } from "@snypd/spec";
import { loadPieces, type PieceEntry } from "../../pieces/src/index";
import { describeSource, type Source } from "./merge";
import { pathKey, type Origin } from "./yaml";
import { SettingDeclSchema, ThemePieceSchema, type SettingDecl } from "./schema";
import type { Diagnostic, ThemeLink } from "./config";

/** One slot of a resolved theme: which piece fills it, with which switches, declared where. */
export interface ResolvedPiece {
  slot: string;
  name: string;
  /** `<slot>/<name>` — the manifest key and the piece's directory. */
  id: string;
  /** Every switch the piece offers, the theme's value or the piece's default. */
  switches: Record<string, boolean | string>;
  /** The theme in the chain whose `pieces:` named it; the child-most theme on pieces for an `always` slot. */
  declaredBy: string;
  /** True for a slot the theme got for being on pieces rather than by naming it. */
  always?: boolean;
  entry: PieceEntry;
}

interface Parsed { value: unknown; origins: Map<string, Origin> }
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function resolvePieces(chain: ThemeLink[], parsed: Map<string, Parsed>, relTo: (f: string) => string): { pieces: ResolvedPiece[]; diagnostics: Diagnostic[] } {
  const m = loadPieces();
  const order = m.slots.map((s) => s.slot);
  const diagnostics: Diagnostic[] = [];
  const bySlot = new Map<string, ResolvedPiece>();
  let onPieces: string | undefined;
  for (const link of [...chain].reverse()) {
    const p = link.yamlFile ? parsed.get(link.yamlFile) : undefined;
    if (!p || !isObj(p.value) || !("pieces" in p.value)) continue;
    onPieces = link.name;
    const decl = p.value.pieces;
    if (!isObj(decl)) continue;                                            // the strict schema pass says so
    const at = (path: (string | number)[]): Source => ({ layer: "theme", from: link.name, file: relTo(link.yamlFile!), line: p.origins.get(pathKey(path))?.line });
    const err = (path: (string | number)[], message: string) => { const src = at(path); diagnostics.push({ level: "error", path: pathKey(["theme", ...path]), message, source: src, where: describeSource(src) }); };
    for (const [slot, raw] of Object.entries(decl)) {
      if (!order.includes(slot)) { err(["pieces", slot], `no slot "${slot}" — the slots are ${order.join(", ")} (snypd://theme/pieces)`); continue; }
      const shape = ThemePieceSchema.safeParse(raw);
      if (!shape.success) continue;                                        // reported by the strict pass with its line
      const { use, ...set } = typeof shape.data === "string" ? { use: shape.data } : shape.data;
      const id = `${slot}/${use}`;
      const entry = m.pieces[id];
      if (!entry) {
        const has = Object.values(m.pieces).filter((e) => e.slot === slot).map((e) => e.name);
        err(["pieces", slot], `no piece "${id}" — ${slot} has ${has.length ? has.join(", ") : "no variants yet"}`);
        continue;
      }
      const switches: Record<string, boolean | string> = {};
      for (const [sw, d] of Object.entries(entry.switches)) switches[sw] = d.default;
      let bad = false;
      for (const [sw, v] of Object.entries(set)) {
        const d = entry.switches[sw];
        const offered = Object.keys(entry.switches);
        if (!d) { err(["pieces", slot, sw], `${id} has no switch "${sw}"${offered.length ? ` — it offers ${offered.join(", ")}` : " — it offers none"}`); bad = true; continue; }
        if (d.of ? typeof v !== "string" || !d.of.includes(v) : typeof v !== "boolean") { err(["pieces", slot, sw], `${id} › ${sw}: ${d.of ? `one of ${d.of.join(", ")}` : "true or false"}, got ${JSON.stringify(v)}`); bad = true; continue; }
        switches[sw] = v as boolean | string;
      }
      if (!bad) bySlot.set(slot, { slot, name: use, id, switches, declaredBy: link.name, entry });
    }
  }
  if (onPieces) for (const s of m.slots) if (s.always && !bySlot.has(s.slot)) {
    const id = Object.keys(m.pieces).find((k) => m.pieces[k]!.slot === s.slot);
    if (id) { const entry = m.pieces[id]!; bySlot.set(s.slot, { slot: s.slot, name: entry.name, id, switches: Object.fromEntries(Object.entries(entry.switches).map(([k, d]) => [k, d.default])), declaredBy: onPieces, always: true, entry }); }
  }
  const pieces = order.filter((s) => bySlot.has(s)).map((s) => bySlot.get(s)!);
  // `pairs:` — a warning: the sampler honours them (P5), and a hand-assembled theme that breaks one is a
  // look nobody has judged, not a theme that cannot build.
  for (const p of pieces) for (const [slot, want] of Object.entries(p.entry.pairs)) {
    const allowed = Array.isArray(want) ? want : [want];
    const has = bySlot.get(slot);
    if (!has || !allowed.includes(has.name))
      diagnostics.push({ level: "warning", path: `theme.pieces.${p.slot}`, message: `${p.id} pairs with ${slot}: ${allowed.join(" or ")}${has ? `, and this theme has ${has.id}` : ", and this theme names no " + slot} — a combination nobody has looked at` });
  }
  return { pieces, diagnostics };
}

/**
 * The tokens the pieces read that the theme does not declare, with the value each gets (docs/36 §3):
 * a piece's own `needs:` default first, then an optional contract token's derived value. Contract tokens
 * the theme lacks are not invented — every theme on the shelf declares the forty, and one that does not is
 * `check theme`'s finding, not a value to guess.
 */
export function pieceTokens(pieces: ResolvedPiece[], declared: Set<string>): { tokens: Record<string, string | number>; from: Record<string, string> } {
  const optional = themeContract().optional;
  const tokens: Record<string, string | number> = {}, from: Record<string, string> = {};
  for (const p of pieces) {
    for (const [k, v] of Object.entries(p.entry.needs)) if (!declared.has(k) && !(k in tokens)) { tokens[k] = v; from[k] = p.id; }
    for (const k of p.entry.reads) if (!declared.has(k) && !(k in tokens) && optional[k]) { tokens[k] = optional[k]!.derive; from[k] = p.id; }
  }
  return { tokens, from };
}

/** The settings the pieces offer, in slot order — laid down before the chain's, so a theme's own `id` replaces a piece's. */
export function pieceSettings(pieces: ResolvedPiece[]): SettingDecl[] {
  const out: SettingDecl[] = [];
  for (const p of pieces) for (const raw of p.entry.settings) {
    const r = SettingDeclSchema.safeParse(raw);
    if (!r.success) continue;                                              // the generator validated it
    const at = out.findIndex((d) => d.id === r.data.id);
    if (at >= 0) out[at] = r.data; else out.push(r.data);
  }
  return out;
}

/** `ctx.pieces` (docs/36 §4.5): slot → `{ use, …switches }`, read-only data a part reads its switches from. */
export const piecesCtx = (pieces: ResolvedPiece[]): Record<string, Readonly<{ use: string } & Record<string, boolean | string>>> =>
  Object.fromEntries(pieces.map((p) => [p.slot, Object.freeze({ use: p.name, ...p.switches })]));
