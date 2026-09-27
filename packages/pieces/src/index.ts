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
  /** A drawn piece's sources (docs/37 §3·2): the page and the one idea taken from it. */
  refs: { url: string; took: string }[];
  /** Unseen (decision 278): kept out of the shelf index, marked in its slot's file, refused by `check theme`. */
  draft: boolean;
  /** `piece.css`, minified, in KB — what the theme's `cssKb` is charged. */
  kb: number;
  /** Each switch file's KB, by stem (`sticky`, `tagline-under`). */
  switchKb: Record<string, number>;
  /** Piece-relative, sorted. */
  files: string[];
  /**
   * The piece's two stills (docs/37 §5, W2), `<slot>/<name>/still-1280.webp` and `…/still-390.webp`, when
   * `snypd pieces stills` has shot them; `fresh` is false once the piece or its host changed after.
   */
  stills?: { files: string[]; fresh: boolean };
}
/** One token set a piece is seen on (board.yaml): colour, one shelf face, and a few sizes where the set is about proportion. */
export interface BoardSet { name: string; line: string; face?: string; tokens: Record<string, string | number> }
export interface BoardDecl {
  stills: { host: string; root: string; routes: Record<string, string> };
  sets: BoardSet[];
}
/** What `snypd pieces stills` wrote down about one piece's stills (`stills.json`). */
export interface StillRecord { inputs: string; route: string; sizes: Record<string, [number, number]> }
export interface PieceManifest { $comment: string; slots: SlotEntry[]; board: BoardDecl; pieces: Record<string, PieceEntry> }

/** The two stills a piece carries: the slot at 1280 shown at half size in 640×400, at 390 in 195×422. */
export const STILL_FILES = ["still-1280.webp", "still-390.webp"] as const;
export const STILL_FRAMES: Record<(typeof STILL_FILES)[number], { width: number; frame: [number, number] }> = {
  "still-1280.webp": { width: 1280, frame: [640, 400] },
  "still-390.webp": { width: 390, frame: [195, 422] },
};

export const loadPieces = (): PieceManifest => manifest as PieceManifest;
/** The canonical slot order (docs/36 §4.2): the order of the `snypd.pieces.<slot>` sublayers. */
export const slotOrder = (): string[] => loadPieces().slots.map((s) => s.slot);
