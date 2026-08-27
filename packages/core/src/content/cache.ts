/**
 * S5 mdast cache: content-hash → parsed document + primitive tree. Parsing is the expensive half of lint;
 * a rebuild that touches one post must not re-parse the other 999. In-memory by default; `persist` writes
 * the parsed frontmatter + tree as JSON under `<dir>/<hash>.json` so a fresh process can warm from disk.
 * Keyed by hash(source), so the file path is irrelevant and renames are free.
 * S6: `persist` may also be an `MdastStore` (the site index's `mdast` table) — one SQLite file, no fsync
 * per document; the on-disk JSON directory form stays for callers without an index.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseMarkdown, type ParsedDoc } from "./parse";
import { buildTree, type PrimitiveTree } from "./tree";

export interface CachedDoc { hash: string; doc: ParsedDoc; tree: PrimitiveTree }
export interface MdastStore { read(hash: string): string | undefined; write(hash: string, json: string): void }

export const hashSource = (source: string) => createHash("sha1").update(source).digest("hex");

const fileStore = (dir: string): MdastStore => ({
  read: (hash) => { const f = join(dir, `${hash}.json`); return existsSync(f) ? readFileSync(f, "utf8") : undefined; },
  write: (hash, json) => writeFileSync(join(dir, `${hash}.json`), json),
});

export class MdastCache {
  private mem = new Map<string, CachedDoc>();
  hits = 0; misses = 0;
  private store?: MdastStore;
  constructor(persist?: string | MdastStore) {
    if (typeof persist === "string") { mkdirSync(persist, { recursive: true }); this.store = fileStore(persist); }
    else this.store = persist;
  }

  get(source: string): CachedDoc {
    const hash = hashSource(source);
    let c = this.mem.get(hash);
    if (c) { this.hits++; return c; }
    const stored = this.store?.read(hash);
    if (stored !== undefined) {
      try {
        const doc = JSON.parse(stored) as ParsedDoc;
        c = { hash, doc, tree: buildTree(doc, source) };
        this.mem.set(hash, c); this.hits++;
        return c;
      } catch { /* corrupt entry: fall through and re-parse */ }
    }
    this.misses++;
    const doc = parseMarkdown(source);
    c = { hash, doc, tree: buildTree(doc, source) };
    this.mem.set(hash, c);
    this.store?.write(hash, JSON.stringify(doc));
    return c;
  }
  get size() { return this.mem.size; }
  clear() { this.mem.clear(); this.hits = this.misses = 0; }
}
