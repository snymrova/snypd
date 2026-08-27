/**
 * SQLite behind the runtime interface (docs/04 "runtime", docs/07 decision 7): `bun:sqlite` on Bun,
 * `node:sqlite` (DatabaseSync, Node ≥ 22.5) elsewhere. Only the handful of calls the index needs, so a
 * regression in either driver is a one-file switch. Callers must never import a driver directly.
 */
export interface Db {
  run(sql: string, ...params: unknown[]): void;
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[];
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined;
  /** Run `fn` inside one transaction (commits on return, rolls back on throw). */
  transaction<T>(fn: () => T): T;
  close(): void;
}

export const isBun = typeof Bun !== "undefined";

/**
 * The index is disposable (docs/06 principle 3: git is truth), so durability buys nothing: `synchronous = OFF`
 * + an in-memory journal turn file creation from ~8 fsyncs (≈ 0.5 s on a loaded box, measured S6) into 3 ms.
 * WAL is not used yet — it costs a checkpoint on creation; revisit in S11 when the watcher reads concurrently.
 */
const PRAGMAS = ["PRAGMA journal_mode = MEMORY", "PRAGMA synchronous = OFF", "PRAGMA temp_store = MEMORY"];

export async function openDatabase(path: string): Promise<Db> {
  if (isBun) {
    const { Database } = await import("bun:sqlite");
    const db = new Database(path, { create: true });
    for (const p of PRAGMAS) db.run(p);
    const cache = new Map<string, ReturnType<typeof db.query>>();
    const q = (sql: string) => { let s = cache.get(sql); if (!s) { s = db.query(sql); cache.set(sql, s); } return s; };
    return {
      run: (sql, ...p) => { q(sql).run(...(p as never[])); },
      all: <T,>(sql: string, ...p: unknown[]) => q(sql).all(...(p as never[])) as T[],
      get: <T,>(sql: string, ...p: unknown[]) => (q(sql).get(...(p as never[])) ?? undefined) as T | undefined,
      transaction: <T,>(fn: () => T) => db.transaction(fn)(),
      close: () => db.close(),
    };
  }
  const { DatabaseSync } = await import("node:sqlite" as string) as { DatabaseSync: new (p: string) => NodeDb };
  const db = new DatabaseSync(path);
  for (const p of PRAGMAS) db.exec(p);
  const cache = new Map<string, NodeStmt>();
  const q = (sql: string) => { let s = cache.get(sql); if (!s) { s = db.prepare(sql); cache.set(sql, s); } return s; };
  return {
    run: (sql, ...p) => { q(sql).run(...p); },
    all: <T,>(sql: string, ...p: unknown[]) => q(sql).all(...p) as T[],
    get: <T,>(sql: string, ...p: unknown[]) => q(sql).get(...p) as T | undefined,
    transaction: <T,>(fn: () => T) => { db.exec("BEGIN"); try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; } },
    close: () => db.close(),
  };
}

interface NodeStmt { run(...p: unknown[]): unknown; all(...p: unknown[]): unknown[]; get(...p: unknown[]): unknown }
interface NodeDb { exec(sql: string): void; prepare(sql: string): NodeStmt; close(): void }
