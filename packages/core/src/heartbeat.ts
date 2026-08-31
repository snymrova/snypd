/**
 * `.snypd/activity.json` — what an MCP server on stdio can tell a browser it will never talk to (S18f,
 * docs/08 §12.9 and §10).
 *
 * The Desk's status card has been wrong for every real user since it shipped. "Is a harness connected"
 * lived in a module-scoped record inside `protocol.ts`, which is right for the process that answers the
 * calls and useless to the process that renders the page — and since S18e the preview being *its own
 * process* is the normal configuration rather than the odd one. So a person who had just driven a full
 * MCP session read *"nothing has called this server yet"* on the page built to answer exactly that.
 *
 * Two facts, not one. `startedAt` is written when the server binds and `calls` when a message arrives,
 * which is what makes docs/08 §10's undiagnosable case diagnosable: *spawned and silent* (the harness
 * launched us and never spoke — a registration or a crash) reads differently from *never spawned* (you
 * did not restart), and today both render as the same grey line. A pid that no longer exists is a third
 * thing again: the harness had us and let us go.
 *
 * **Three rules the writer lives by**, because it sits on the cold-start path this project has spent two
 * sessions defending:
 *
 * 1. **This file imports nothing but `node:fs`, `node:path` and a string.** `@snypd/core`'s index pulls
 *    a YAML parser, Zod and a SQLite driver; `packages/mcp/src/protocol.ts` is 50 ms of budget from
 *    spawn to `initialize` and imports one local module. So the seam is a leaf, reachable as
 *    `@snypd/core/heartbeat`, and `INDEX_DIR` moved to `paths.ts` to keep it that way.
 * 2. **Never `fsync`, and never on the measured path.** The record is a hint about a live process; if
 *    the machine loses power the process is gone too and the file was going to be stale either way.
 *    `writeFileSync` without a flush is a page-cache write, and the caller schedules even that off the
 *    turn that answers `initialize`.
 * 3. **Atomic, or absent.** Write-then-rename, because the reader is a *different process* polling on a
 *    timer, and a half-written JSON object read at the wrong moment would render as "no harness" — the
 *    precise lie this module exists to stop telling.
 */
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ensureDisposableDir, INDEX_DIR } from "./paths";

export interface HeartbeatRecord {
  /** The site this server was spawned in, resolved. A record under a different root is not ours. */
  root: string;
  pid: number;
  /** Epoch ms at which the transport came up — before any message, which is the whole point. */
  startedAt: number;
  /** Messages dispatched, including ones this server went on to refuse: contact, not success. */
  calls: number;
  lastMethod?: string;
  lastAt?: number;
  /** First contact, so the card can say "12 calls since 4 min ago" rather than a bare count. */
  since?: number;
  /** `clientInfo.name` from `initialize` — which harness reached us, when two are pointed at one repo. */
  client?: string;
}

export const heartbeatPath = (root: string) => join(root, INDEX_DIR, "activity.json");

/**
 * Best-effort by construction: a heartbeat that threw would take down the server whose health it
 * reports, and every reader already treats a missing record as an answer.
 */
export function writeHeartbeat(root: string, rec: Omit<HeartbeatRecord, "root" | "pid"> & Partial<Pick<HeartbeatRecord, "root" | "pid">>): void {
  const full: HeartbeatRecord = { ...rec, root: rec.root ?? resolve(root), pid: rec.pid ?? process.pid };
  const file = heartbeatPath(root);
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    ensureDisposableDir(join(root, INDEX_DIR));
    writeFileSync(tmp, `${JSON.stringify(full, null, 2)}\n`);
    renameSync(tmp, file);
  } catch { try { rmSync(tmp, { force: true }) } catch { /* nothing here is worth an exception */ } }
}

/** The record as written, or nothing. Shape-checked: a truncated or foreign file is the same as none. */
export function readHeartbeat(root: string): HeartbeatRecord | undefined {
  const file = heartbeatPath(root);
  if (!existsSync(file)) return undefined;
  try {
    const j = JSON.parse(readFileSync(file, "utf8")) as Partial<HeartbeatRecord>;
    if (typeof j.pid !== "number" || typeof j.startedAt !== "number" || typeof j.calls !== "number") return undefined;
    if (typeof j.root === "string" && resolve(j.root) !== resolve(root)) return undefined;
    return { root: j.root ?? resolve(root), pid: j.pid, startedAt: j.startedAt, calls: j.calls, lastMethod: j.lastMethod, lastAt: j.lastAt, since: j.since, client: j.client };
  } catch { return undefined }
}

export function clearHeartbeat(root: string, pid = process.pid): void {
  const rec = readHeartbeat(root);
  if (rec && rec.pid !== pid) return;   // the same rule `clearDev` follows: never erase another server's record
  try { rmSync(heartbeatPath(root), { force: true }) } catch { /* best effort */ }
}

/** Cheap, and wrong often enough that nothing irreversible may hang off it: pids are reused. */
export const heartbeatProcessAlive = (rec: HeartbeatRecord): boolean => {
  try { process.kill(rec.pid, 0); return true } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM" }
};

/**
 * The four states docs/08 §10 asks for, and the four different sentences they deserve.
 *
 * Unlike `liveDev` there is no probe available: a server on stdio holds no port, and the only process
 * that can speak to it is the harness that spawned it. So this is the pid check and no more, and
 * `stale` is stated as history — *it was here* — rather than as a diagnosis.
 */
export type HarnessState = "connected" | "silent" | "stale" | "never";

export function harnessState(root: string): { state: HarnessState; rec?: HeartbeatRecord } {
  const rec = readHeartbeat(root);
  if (!rec) return { state: "never" };
  if (!heartbeatProcessAlive(rec)) return { state: "stale", rec };
  return { state: rec.calls > 0 ? "connected" : "silent", rec };
}
