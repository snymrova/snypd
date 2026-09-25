/**
 * **The pieces** (docs/36, decisions 266–271): the bricks a theme is assembled from. Each is one answer
 * to one question a theme must answer — the masthead, the prose, the list of entries — carved from a
 * sheet a person already judged, reading the contract's tokens and styling the contract's classes, so it
 * sits on any theme (`spec/defaults/theme-contract.yaml`).
 *
 * This module is the manifest and nothing else. Core validates a theme's `pieces:` against it at config
 * load; render reads each piece's files through `themefs.ts` — from `packages/pieces/<slot>/<name>/` in a
 * checkout, from the bundled barrel inside the binary.
 */
import manifest from "../pieces.json";

export interface SlotEntry { slot: string; line: string; always?: boolean }
export interface PieceSwitchDecl { default: boolean | string; of?: string[]; description?: string }
export interface PieceSettingDecl { id: string; type: string; [k: string]: unknown }
export interface PieceEntry {
  piece: string; slot: string; name: string; from: string; line: string;
  reads: string[]; needs: Record<string, string | number>; emits: string[];
  switches: Record<string, PieceSwitchDecl>;
  settings: PieceSettingDecl[];
  parts: Record<string, string>; layouts: Record<string, string>;
  pairs: Record<string, string | string[]>;
  /** `piece.css`, minified, in KB — what the theme's `cssKb` is charged. */
  kb: number;
  /** Each switch file's KB, by stem (`sticky`, `tagline-under`). */
  switchKb: Record<string, number>;
  /** Piece-relative, sorted. */
  files: string[];
  /** `<slot>/<name>/still.png`, when the piece ships one. */
  still?: string;
}
export interface PieceManifest { $comment: string; slots: SlotEntry[]; pieces: Record<string, PieceEntry> }

export const loadPieces = (): PieceManifest => manifest as PieceManifest;
/** The canonical slot order (docs/36 §4.2): the order of the `snypd.pieces.<slot>` sublayers. */
export const slotOrder = (): string[] => loadPieces().slots.map((s) => s.slot);
