/**
 * `.snypd/dev.json` — the one fact about a running `snypd dev` that a second process can read (S18e,
 * docs/07 decision 51).
 *
 * Ownership of the preview inverts in this session. Until now it belonged to whichever MCP session
 * called `content.render_preview` first: it appeared on a tool call, bound 4321 with no fallback, and
 * died with the harness. `snypd dev` gives it to the person instead — it exists before any tool call and
 * survives the harness restarting — and the agent has to be able to *find* it, or the two of them race
 * for the same port and the loser returns no URL at all (docs/08 §12.3).
 *
 * The seam is a file for the reason principle 3 gives: files are truth, so two processes over one
 * working tree already share everything that matters. What they do not share is "is a server up on this
 * port", which is not derivable from content — hence one record, written by the server that binds and
 * read by anybody who wants it.
 *
 * A record is a claim, never a guarantee. Between the write and the read the process can die, the port
 * can be taken by something else, or the whole directory can be copied to another machine — so
 * `liveDev` proves the claim over HTTP before anybody acts on it, and nothing here trusts the file's
 * own word for anything but where to look.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ensureDisposableDir, INDEX_DIR } from "./paths";

/** Answered by the preview server itself; the shape `liveDev` proves a port is one of ours by. */
export const ALIVE_ROUTE = "/_snypd/alive";

export interface DevRecord {
  /** Where a browser goes. Includes the scheme and the port, never a trailing slash. */
  url: string;
  port: number;
  hostname: string;
  /** The site this server was started in, resolved — a record found under a different root is not ours. */
  root: string;
  pid: number;
  startedAt: string;
  /** The binary that wrote it, so a stale record from an older install is legible in a bug report. */
  version?: string;
}

export const devPath = (root: string) => join(root, INDEX_DIR, "dev.json");

/** Written once, when the server has bound and knows its real port — never with the port it asked for. */
export function writeDev(root: string, rec: DevRecord): void {
  ensureDisposableDir(join(root, INDEX_DIR));
  writeFileSync(devPath(root), `${JSON.stringify(rec, null, 2)}\n`);
}

/** The record as written, or nothing. Shape-checked: a truncated write is the same as no record. */
export function readDev(root: string): DevRecord | undefined {
  const f = devPath(root);
  if (!existsSync(f)) return undefined;
  try {
    const j = JSON.parse(readFileSync(f, "utf8")) as Partial<DevRecord>;
    if (typeof j.url !== "string" || typeof j.port !== "number" || typeof j.pid !== "number") return undefined;
    return { url: j.url, port: j.port, hostname: j.hostname ?? "localhost", root: j.root ?? resolve(root), pid: j.pid, startedAt: j.startedAt ?? "", version: j.version };
  } catch { return undefined }
}

/**
 * Remove the record, but only if it is still ours. Two `snypd dev` runs in one directory is a mistake
 * the second one reports rather than commits, and an exit handler that deletes unconditionally would
 * have the *first* server's shutdown erase the *second* server's record — leaving a live preview that
 * `render_preview` can no longer find.
 */
export function clearDev(root: string, pid = process.pid): void {
  const rec = readDev(root);
  if (rec && rec.pid !== pid) return;
  rmSync(devPath(root), { force: true });
}

/** Cheap and wrong often enough to need the probe below: a pid is reused, and a record can outlive a reboot. */
export const devProcessAlive = (rec: DevRecord): boolean => {
  try { process.kill(rec.pid, 0); return true } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM" }
};

/**
 * The record, proven — or nothing, with the stale file cleaned up on the way out.
 *
 * The proof is an HTTP call rather than a pid check because the failure this exists to prevent is
 * *another program on that port*: `render_preview` handing an agent a URL that serves somebody else's
 * dev server is worse than binding a second port, and a pid says nothing about who holds 4321. The
 * route answers without building anything, so proving liveness costs a socket and no render.
 */
export async function liveDev(root: string, opts: { timeoutMs?: number } = {}): Promise<DevRecord | undefined> {
  const rec = readDev(root);
  if (!rec) return undefined;
  const mine = resolve(rec.root) === resolve(root);
  if (!mine || !devProcessAlive(rec)) { if (!mine) return undefined; clearDev(root, rec.pid); return undefined }
  try {
    const res = await fetch(`${rec.url}${ALIVE_ROUTE}`, { signal: AbortSignal.timeout(opts.timeoutMs ?? 1000) });
    if (!res.ok) return undefined;
    const j = (await res.json()) as { snypd?: boolean; root?: string; pid?: number };
    if (j.snypd !== true || (typeof j.root === "string" && resolve(j.root) !== resolve(root))) return undefined;
    return { ...rec, pid: typeof j.pid === "number" ? j.pid : rec.pid };
  } catch { clearDev(root, rec.pid); return undefined }
}
