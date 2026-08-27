/**
 * S5 mdast cache: content-hash → parsed document + primitive tree. Parsing is the expensive half of lint;
 * a rebuild that touches one post must not re-parse the other 999. In-memory by default; `persist` writes
 * the parsed frontmatter + tree as JSON under `<dir>/<hash>.json` so a fresh process can warm from disk.
 * Keyed by hash(source), so the file path is irrelevant and renames are free.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseMarkdown, type ParsedDoc } from "./parse";
import { buildTree, type PrimitiveTree } from "./tree";

export interface CachedDoc { hash: string; doc: ParsedDoc; tree: PrimitiveTree }

export const hashSource = (source: string) => createHash("sha1").update(source).digest("hex");

export class MdastCache {
  private mem = new Map<string, CachedDoc>();
  hits = 0; misses = 0;
  constructor(private persist?: string) { if (persist) mkdirSync(persist, { recursive: true }); }

  get(source: string): CachedDoc {
    const hash = hashSource(source);
    let c = this.mem.get(hash);
    if (c) { this.hits++; return c; }
    if (this.persist) {
      const f = join(this.persist, `${hash}.json`);
      if (existsSync(f)) {
        try {
          const doc = JSON.parse(readFileSync(f, "utf8")) as ParsedDoc;
          c = { hash, doc, tree: buildTree(doc, source) };
          this.mem.set(hash, c); this.hits++;
          return c;
        } catch { /* corrupt entry: fall through and re-parse */ }
      }
    }
    this.misses++;
    const doc = parseMarkdown(source);
    c = { hash, doc, tree: buildTree(doc, source) };
    this.mem.set(hash, c);
    if (this.persist) writeFileSync(join(this.persist, `${hash}.json`), JSON.stringify(doc));
    return c;
  }
  get size() { return this.mem.size; }
  clear() { this.mem.clear(); this.hits = this.misses = 0; }
}
