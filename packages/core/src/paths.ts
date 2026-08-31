/**
 * The two path constants that a *leaf* has to know (S18f).
 *
 * `INDEX_DIR` lived in `store.ts`, which imports `bun:sqlite` through `@snypd/runtime`. That is the
 * right home for it right up until something on the MCP cold-start path needs it — `heartbeat.ts` does,
 * and D2's 50 ms budget is not going to survive dragging a database driver in to learn the string
 * `".snypd"`. So the constant moves down here, where nothing imports anything, and `store.ts` re-exports
 * it so every existing caller is unaffected.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Everything disposable: the index, the preview build, `dev.json`, `activity.json`. Git-ignored. */
export const INDEX_DIR = ".snypd";

/**
 * Create a disposable directory that ignores itself (S18f).
 *
 * The pattern is `SiteIndex.open`'s, lifted here because it acquired a second caller and the second
 * caller ran *first*. The index dropped a `.gitignore` holding `*` into `.snypd/` the moment it opened
 * one, which is what has kept the tree clean since S6 — and `.snypd/activity.json` is now written when
 * the MCP server binds, before any index exists in that process. In a repo whose own `.gitignore`
 * predates snypd (so `initSite` never wrote the `.snypd/` line, because it only writes that file when
 * there is not one already) the result was a directory full of untracked files and `Repo.useDrafts`
 * refusing every single write: *"1 uncommitted change(s) in the tree (.snypd/activity.json)"*, naming a
 * file the user never wrote. docs/08 §10's shape exactly — the symptom and the cause in different
 * places — and found by four tests going red the first time the heartbeat shipped.
 *
 * A `.gitignore` inside the directory needs no cooperation from the repo's own and travels with it. The
 * directory is disposable by definition (principle 3: files in git are truth, the index is not), so
 * ignoring all of it — this file included — is the whole statement.
 */
export function ensureDisposableDir(dir: string): string {
  mkdirSync(dir, { recursive: true });
  const ignore = join(dir, ".gitignore");
  if (!existsSync(ignore)) { try { writeFileSync(ignore, "*\n") } catch { /* an unwritable index dir fails later, and louder */ } }
  return dir;
}
