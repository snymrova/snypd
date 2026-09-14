/**
 * SQLite behind the runtime interface (docs/04 "runtime", docs/07 decision 7): `bun:sqlite` on Bun,
 * `node:sqlite` (DatabaseSync, Node ≥ 22.5) elsewhere. Only the handful of calls the index needs, so a
 * regression in either driver is a one-file switch. Callers must never import a driver directly.
 */
export interface Db {
  run(sql: string, ...params: unknown[]): void;
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[];
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined;
  /**
   * Run `fn` inside one transaction (commits on return, rolls back on throw). `BEGIN IMMEDIATE`: every
   * transaction here writes, and a deferred one that reads first cannot wait for the lock under WAL — it
   * fails with `SQLITE_BUSY` the moment another connection has committed since its read, busy timeout or not.
   */
  transaction<T>(fn: () => T): T;
  close(): void;
}

export const isBun = typeof Bun !== "undefined";

/**
 * The index is disposable (docs/06 principle 3: git is truth), so durability buys nothing: `synchronous = OFF`
 * turned file creation from ~8 fsyncs (≈ 0.5 s on a loaded box, measured S6) into 3 ms.
 *
 * H3 (docs/11 finding 7): `dev`, `serve`, `build` and an MCP session can hold one index at once, and with
 * an in-memory rollback journal and no busy timeout the loser of any overlap got `SQLITE_BUSY` in the middle
 * of an agent's turn. WAL lets readers and the one writer pass each other, and the timeout makes writers
 * queue instead of fail. The "checkpoint on creation" S6 feared is real but is an fsync, and only when
 * `journal_mode` is switched *before* `synchronous` is off — ≈ 100–200 ms measured on this box, 0.5 ms in
 * the order below. The timeout goes first because the mode switch itself takes a lock. Order matters.
 */
const PRAGMAS = ["PRAGMA busy_timeout = 5000", "PRAGMA synchronous = OFF", "PRAGMA journal_mode = WAL", "PRAGMA temp_store = MEMORY"];

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
      transaction: <T,>(fn: () => T) => db.transaction(fn).immediate(),
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
    transaction: <T,>(fn: () => T) => { db.exec("BEGIN IMMEDIATE"); try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; } },
    close: () => db.close(),
  };
}

interface NodeStmt { run(...p: unknown[]): unknown; all(...p: unknown[]): unknown[]; get(...p: unknown[]): unknown }
interface NodeDb { exec(sql: string): void; prepare(sql: string): NodeStmt; close(): void }
