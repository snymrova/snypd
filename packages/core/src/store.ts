/**
 * S6 site index — a disposable SQLite mirror of the content tree (docs/06 principle 3: files in git are
 * truth, SQLite is an index). Lives at `.snypd/index.sqlite`. One `sync()` per build or lint:
 *   stat every content file → unchanged (mtime + size) rows are kept as-is,
 *   changed files are hashed → same hash, new mtime: touch; new hash: re-read the frontmatter,
 *   missing files are dropped. Frontmatter, terms and routes are then answerable without parsing.
 * The route cache (`routes`: route → key → outputs) is what makes a rebuild incremental (docs/04):
 * key = hash(content) + hash(theme graph) + hash(config subset); a matching key means "copy nothing,
 * render nothing — the outputs on disk are current".
 * The driver is behind @snypd/runtime (`bun:sqlite` | `node:sqlite`), never imported here.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { ensureDisposableDir, INDEX_DIR } from "./paths";
import { load as parseYaml } from "js-yaml";
import { openDatabase, type Db } from "@snypd/runtime";
import type { LoadedConfig } from "./config";
import type { MdastStore } from "./content/cache";
import { listContent } from "./content";

export interface IndexedFile {
  /** Path relative to the site root, `/`-separated. */
  path: string;
  type: string; slug: string; route: string;
  hash: string; mtime: number; size: number;
  status: string; title: string; date?: string; updated?: string;
  frontmatter: Record<string, unknown>;
}
export interface TermRef { taxonomy: string; term: string; path: string }
export interface Move { path: string; from: string; to: string }
export interface SyncResult { files: IndexedFile[]; changed: string[]; removed: string[]; moved: Move[]; hashed: number; ms: number }
export interface RouteRow { route: string; key: string; outputs: string[] }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, type TEXT NOT NULL, slug TEXT NOT NULL, route TEXT NOT NULL, hash TEXT NOT NULL,
  mtime REAL NOT NULL, size INTEGER NOT NULL, status TEXT NOT NULL, title TEXT NOT NULL, date TEXT, updated TEXT, frontmatter TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS files_type ON files(type, status, date);
CREATE TABLE IF NOT EXISTS terms (path TEXT NOT NULL, taxonomy TEXT NOT NULL, term TEXT NOT NULL, PRIMARY KEY (path, taxonomy, term));
CREATE INDEX IF NOT EXISTS terms_term ON terms(taxonomy, term);
CREATE TABLE IF NOT EXISTS moves (path TEXT PRIMARY KEY, from_route TEXT NOT NULL, to_route TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS routes (route TEXT PRIMARY KEY, key TEXT NOT NULL, outputs TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mdast (hash TEXT PRIMARY KEY, json TEXT NOT NULL);`;

export const sha1 = (s: string | Buffer) => createHash("sha1").update(s).digest("hex");
// Defined in the leaf `paths.ts` so the MCP cold-start path can read it without this file (S18f).
export { INDEX_DIR } from "./paths";

/** Frontmatter only, without a markdown parse: the `---` block + js-yaml. Same result parseMarkdown gives. */
export function readFrontmatter(source: string): Record<string, unknown> {
  if (!source.startsWith("---\n") && !source.startsWith("---\r\n")) return {};
  const end = source.indexOf("\n---", 3);
  if (end < 0) return {};
  try { const v = parseYaml(source.slice(4, end)); return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {}; }
  catch { return {}; }
}

/**
 * The status a file of this type gets when its frontmatter does not name one.
 * A type that declares a `status` field has a lifecycle, and an unstated status means the start of it
 * (`initialStatus`, normally `draft`). A type that declares no such field has no lifecycle at all — the
 * built-in `author` is one — and giving it `draft` made it permanently invisible: the base theme ships an
 * `author` layout that could never render, and the only way to publish an author was a frontmatter key
 * lint calls unknown. Such a type is public, at whichever status the site says public means.
 */
export function defaultStatus(cfg: LoadedConfig, type: string): string {
  const fields = cfg.config.types[type]?.fields as Record<string, unknown> | undefined;
  if (fields && "status" in fields) return cfg.config.initialStatus;
  return Object.keys(cfg.config.statuses).find((s) => cfg.config.statuses[s]!.public) ?? cfg.config.initialStatus;
}

/** Which frontmatter field carries each taxonomy of a type (`category: ref(category)`, `tags: list(ref(tag))`). */
export function taxonomyFields(type: LoadedConfig["config"]["types"][string]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, f] of Object.entries(type.fields as Record<string, { type: string; to?: string; of?: { type: string; to?: string } }>)) {
    const to = f.type === "ref" ? f.to : f.type === "list" && f.of?.type === "ref" ? f.of.to : undefined;
    if (to && type.taxonomies.includes(to) && !(to in out)) out[to] = k;
  }
  return out;
}

export class SiteIndex {
  private constructor(readonly root: string, readonly path: string, private db: Db) {}

  static async open(root: string, path = join(root, INDEX_DIR, "index.sqlite")): Promise<SiteIndex> {
    // The index is disposable (docs/07 decision 13) and must never reach a commit — nor make the tree
    // look dirty, which would stop the one drafts-branch switch (git.ts). A self-ignoring directory needs no
    // repo-level .gitignore and no cooperation from the site's own. Shared with the heartbeat since S18f,
    // which writes into this directory before any index has opened it.
    ensureDisposableDir(join(path, ".."));
    const db = await openDatabase(path);
    db.transaction(() => { for (const stmt of SCHEMA.split(";")) if (stmt.trim()) db.run(stmt); });   // one transaction: one journal write, not one per table
    return new SiteIndex(root, path, db);
  }

  /** Bring the index up to date with the content tree. Cheap when nothing changed (one stat per file). */
  sync(cfg: LoadedConfig): SyncResult {
    const t0 = performance.now();
    const existing = new Map(this.db.all<IndexedFile & { frontmatter: string }>("SELECT * FROM files").map((r) => [r.path, { ...r, date: r.date ?? undefined, updated: r.updated ?? undefined }]));   // NULL → undefined, as a cold sync produces
    const seen = new Set<string>();
    const changed: string[] = [], moved: Move[] = [];
    let hashed = 0;
    const files: IndexedFile[] = [];
    this.db.transaction(() => {
      for (const c of listContent(this.root, cfg)) {
        const path = relative(this.root, c.file).split("\\").join("/");
        seen.add(path);
        const st = statSync(c.file);
        const prev = existing.get(path);
        if (prev && prev.mtime === st.mtimeMs && prev.size === st.size && prev.route === c.route && prev.type === c.type) {
          files.push({ ...prev, frontmatter: JSON.parse(prev.frontmatter) });
          continue;
        }
        const source = readFileSync(c.file, "utf8");
        const hash = sha1(source); hashed++;
        let row: IndexedFile;
        if (prev && prev.hash === hash) row = { ...prev, frontmatter: JSON.parse(prev.frontmatter), mtime: st.mtimeMs, size: st.size, route: c.route, type: c.type };
        else {
          const fm = readFrontmatter(source);
          const type = cfg.config.types[c.type]!;
          row = { path, type: c.type, slug: c.slug, route: c.route, hash, mtime: st.mtimeMs, size: st.size,
            status: String(fm.status ?? defaultStatus(cfg, c.type)), title: String(fm.title ?? fm.name ?? c.slug),
            date: fm.date !== undefined ? String(fm.date instanceof Date ? fm.date.toISOString().slice(0, 10) : fm.date) : undefined,
            updated: fm.updated !== undefined ? String(fm.updated instanceof Date ? fm.updated.toISOString().slice(0, 10) : fm.updated) : undefined, frontmatter: fm };
          this.db.run("DELETE FROM terms WHERE path = ?", path);
          for (const [tax, field] of Object.entries(taxonomyFields(type))) {
            const v = fm[field];
            for (const term of Array.isArray(v) ? v : v !== undefined && v !== null ? [v] : []) this.db.run("INSERT OR IGNORE INTO terms VALUES (?, ?, ?)", path, tax, String(term));
          }
          changed.push(path);
        }
        if (prev && prev.route !== c.route) {
          const m = this.db.get<{ from_route: string }>("SELECT from_route FROM moves WHERE path = ?", path);
          const from = m?.from_route ?? prev.route;
          if (from === c.route) this.db.run("DELETE FROM moves WHERE path = ?", path);   // moved back: no redirect needed
          else { this.db.run("INSERT OR REPLACE INTO moves VALUES (?, ?, ?)", path, from, c.route); moved.push({ path, from, to: c.route }); }
        }
        this.db.run("INSERT OR REPLACE INTO files VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", row.path, row.type, row.slug, row.route, row.hash, row.mtime, row.size, row.status, row.title, row.date ?? null, row.updated ?? null, JSON.stringify(row.frontmatter));
        files.push(row);
      }
      for (const path of existing.keys()) if (!seen.has(path)) { this.db.run("DELETE FROM files WHERE path = ?", path); this.db.run("DELETE FROM terms WHERE path = ?", path); this.db.run("DELETE FROM moves WHERE path = ?", path); }
    });
    const removed = [...existing.keys()].filter((p) => !seen.has(p));
    return { files, changed, removed, moved, hashed, ms: performance.now() - t0 };
  }

  files(where: { type?: string; status?: string } = {}): IndexedFile[] {
    const conds: string[] = [], params: unknown[] = [];
    if (where.type) { conds.push("type = ?"); params.push(where.type); }
    if (where.status) { conds.push("status = ?"); params.push(where.status); }
    const rows = this.db.all<IndexedFile & { frontmatter: string }>(`SELECT * FROM files${conds.length ? ` WHERE ${conds.join(" AND ")}` : ""} ORDER BY date DESC, path ASC`, ...params);
    return rows.map((r) => ({ ...r, date: r.date ?? undefined, updated: r.updated ?? undefined, frontmatter: JSON.parse(r.frontmatter) }));
  }
  file(path: string): IndexedFile | undefined { return this.files().find((f) => f.path === path); }
  terms(taxonomy?: string): TermRef[] {
    return taxonomy ? this.db.all<TermRef>("SELECT * FROM terms WHERE taxonomy = ? ORDER BY term, path", taxonomy) : this.db.all<TermRef>("SELECT * FROM terms ORDER BY taxonomy, term, path");
  }
  /** Files carrying a term, newest first. */
  byTerm(taxonomy: string, term: string): IndexedFile[] {
    const paths = new Set(this.db.all<{ path: string }>("SELECT path FROM terms WHERE taxonomy = ? AND term = ?", taxonomy, term).map((r) => r.path));
    return this.files().filter((f) => paths.has(f.path));
  }
  /** Files whose route changed since they were first indexed and have no redirect yet (lint rule 10). */
  moves(): Move[] { return this.db.all<{ path: string; from_route: string; to_route: string }>("SELECT * FROM moves").map((r) => ({ path: r.path, from: r.from_route, to: r.to_route })); }

  // ── route cache ────────────────────────────────────────────────────────────
  routes(): RouteRow[] { return this.db.all<{ route: string; key: string; outputs: string }>("SELECT * FROM routes").map((r) => ({ ...r, outputs: JSON.parse(r.outputs) })); }
  route(route: string): RouteRow | undefined { const r = this.db.get<{ route: string; key: string; outputs: string }>("SELECT * FROM routes WHERE route = ?", route); return r && { ...r, outputs: JSON.parse(r.outputs) }; }
  setRoute(route: string, key: string, outputs: string[]) { this.db.run("INSERT OR REPLACE INTO routes VALUES (?, ?, ?)", route, key, JSON.stringify(outputs)); }
  deleteRoute(route: string) { this.db.run("DELETE FROM routes WHERE route = ?", route); }
  /** Forget every route (the renderer calls this when its output layout changes; dist/ is then rebuilt, not pruned). */
  clearRoutes() { this.db.run("DELETE FROM routes"); }
  /** Backing store for `MdastCache` (parsed documents by content hash) — same file, one transaction per build. */
  mdastStore(): MdastStore {
    return {
      read: (hash) => this.db.get<{ json: string }>("SELECT json FROM mdast WHERE hash = ?", hash)?.json,
      write: (hash, json) => this.db.run("INSERT OR REPLACE INTO mdast VALUES (?, ?)", hash, json),
    };
  }
  /** Drop parsed documents no current file hashes to (call after sync; cheap). */
  pruneMdast() { this.db.run("DELETE FROM mdast WHERE hash NOT IN (SELECT hash FROM files)"); }
  meta(k: string): string | undefined { return this.db.get<{ v: string }>("SELECT v FROM meta WHERE k = ?", k)?.v; }
  setMeta(k: string, v: string) { this.db.run("INSERT OR REPLACE INTO meta VALUES (?, ?)", k, v); }
  transaction<T>(fn: () => T): T { return this.db.transaction(fn); }
  close() { this.db.close(); }
}

/** True when `.snypd/index.sqlite` exists (a cold build starts without one). */
export const hasIndex = (root: string) => existsSync(join(root, INDEX_DIR, "index.sqlite"));
