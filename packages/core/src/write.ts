/**
 * Content writes (docs/03 `content.*`, docs/02 §5 status machine). The MCP tool layer is a thin adapter
 * over this file: every rule that decides whether a write is allowed — the type's `mcp.write` policy, the
 * status machine, the approval an agent cannot grant itself — lives here, where it is testable without
 * JSON-RPC and shared with the preview server's approve endpoint.
 *
 * Frontmatter is edited through the `yaml` Document API, not re-dumped: a human's comments, key order and
 * quoting survive an agent's `patch`. Only the keys named in the patch move.
 * Every write returns the paths it touched so the caller can stage exactly those (git.ts).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { parseDocument, stringify as yamlStringify, isMap, type Document } from "yaml";
import { loadConfig, type LoadedConfig } from "./config";
import { lintMarkdown, type LintResult } from "./content";
import { readFrontmatter, sha1 } from "./store";
import type { Config, TypeDef } from "./schema";

export const TRASH_DIR = "content/.trash";
/** Where a human approves one item — a page in the site served by `snypd serve --preview`, not an admin app. */
export const reviewPath = (type: string, slug: string) => `/_snypd/review/${type}/${slug}`;

export interface WriteTarget { type: string; slug: string; path: string; file: string; route: string }
export interface WriteResult extends WriteTarget { action: "create" | "update" | "status" | "trash" | "restore"; paths: string[]; status: string; lint?: LintResult }

export class WriteError extends Error {
  constructor(message: string, readonly hint?: string) { super(message); }
}

const rel = (root: string, file: string) => relative(root, file).split("\\").join("/");

/** `Hello, World!` → `hello-world`. Only used when the agent gives a title but no slug. */
export function slugify(s: string): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "untitled";
}

export function typeDef(cfg: LoadedConfig, type: string): TypeDef {
  const t = cfg.config.types[type];
  if (!t) throw new WriteError(`unknown type "${type}"`, `Known types: ${Object.keys(cfg.config.types).join(", ")}`);
  return t;
}

/** Where a `type`/`slug` lives and what URL it gets, without touching the index. */
export function target(root: string, cfg: LoadedConfig, type: string, slug: string): WriteTarget {
  const def = typeDef(cfg, type);
  const file = join(root, def.dir, `${slug}.md`);
  const route = def.urlPattern.replace("{slug}", slug).replace("{path}", slug).replace(/\/+$/, "") || "/";
  return { type, slug, file, path: rel(root, file), route };
}
const trashFile = (root: string, type: string, slug: string) => join(root, TRASH_DIR, type, `${slug}.md`);

/** Split `---\nyaml\n---\nbody`. A file without frontmatter is all body. */
export function splitFrontmatter(source: string): { yaml: string; body: string; had: boolean } {
  if (!source.startsWith("---\n") && !source.startsWith("---\r\n")) return { yaml: "", body: source, had: false };
  const end = source.indexOf("\n---", 3);
  if (end < 0) return { yaml: "", body: source, had: false };
  return { yaml: source.slice(4, end), body: source.slice(end + 4).replace(/^\r?\n+/, ""), had: true };
}

/** `date:` is a calendar day, so it is the writer's day — `toISOString()` would stamp yesterday all evening east of UTC. */
const today = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const compose = (doc: Document.Parsed | Document, body: string) => `---\n${doc.toString({ lineWidth: 0 }).replace(/\n+$/, "")}\n---\n\n${body.replace(/^\n+/, "").replace(/\s*$/, "")}\n`;

/** Apply a shallow patch to a frontmatter document: `null` deletes a key, everything else sets it. */
function patchDoc(doc: Document.Parsed, patch: Record<string, unknown>) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) doc.deleteIn([k]);
    else doc.setIn([k], v);
  }
}

/** The write policy for a type (docs/02 §3): `false` no writes, `draft` agent drafts only, `publish` free. */
export function writePolicy(cfg: LoadedConfig, type: string): "false" | "draft" | "publish" {
  const p = typeDef(cfg, type).mcp.write;
  return p === false ? "false" : p;
}
function assertWritable(cfg: LoadedConfig, type: string) {
  if (writePolicy(cfg, type) === "false") throw new WriteError(`type "${type}" is not writable over MCP`, `Its \`mcp.write\` policy is false — change it in snypd.yaml if that is wrong.`);
}

/** Lint one file with what a single-file lint can know (rules 5/10/11 need the whole site: `content.lint`). */
function lintOne(cfg: LoadedConfig, type: string, source: string, file: string): LintResult {
  const def = typeDef(cfg, type);
  return lintMarkdown(source, { type: { fields: def.fields as never, taxonomies: def.taxonomies }, statuses: Object.keys(cfg.config.statuses), file });
}

export interface CreateInput { type: string; slug?: string; frontmatter?: Record<string, unknown>; body?: string; cfg?: LoadedConfig; now?: Date }

/** Create a content file. The status is always the config's `initialStatus`: an agent drafts (docs/02 §11). */
export function createContent(root: string, input: CreateInput): WriteResult {
  const cfg = input.cfg ?? loadConfig(root);
  assertWritable(cfg, input.type);
  const def = typeDef(cfg, input.type);
  const fm: Record<string, unknown> = { ...input.frontmatter };
  const title = typeof fm.title === "string" ? fm.title : typeof fm.name === "string" ? fm.name : undefined;
  const slug = input.slug ?? (typeof fm.slug === "string" ? fm.slug : undefined) ?? (title ? slugify(title) : undefined);
  if (!slug) throw new WriteError("slug required", "Pass `slug`, or a `title` in the frontmatter to derive one from.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new WriteError(`invalid slug "${slug}"`, "Lowercase letters, digits and single dashes.");
  const t = target(root, cfg, input.type, slug);
  if (existsSync(t.file)) throw new WriteError(`${input.type}/${slug} already exists`, `Use content.update to change it, or pick another slug.`);
  if (existsSync(trashFile(root, input.type, slug))) throw new WriteError(`${input.type}/${slug} is in the trash`, `content.restore brings it back; creating over it would lose its history.`);
  const fields = def.fields as Record<string, { type?: string; required?: boolean }>;
  if (fields.date?.required && fm.date === undefined) fm.date = today(input.now ?? new Date());
  fm.status = cfg.config.initialStatus;
  if (fm.slug === slug) delete fm.slug;   // the filename already says it
  const ordered: Record<string, unknown> = {};
  for (const k of ["title", "name", "date", "status", "description", ...Object.keys(fm)]) if (k in fm && !(k in ordered)) ordered[k] = fm[k];
  const source = `---\n${yamlStringify(ordered, { lineWidth: 0 }).replace(/\n+$/, "")}\n---\n\n${(input.body ?? "").replace(/^\n+/, "").replace(/\s*$/, "")}\n`;
  mkdirSync(dirname(t.file), { recursive: true });
  writeFileSync(t.file, source);
  return { ...t, action: "create", paths: [t.path], status: String(fm.status), lint: lintOne(cfg, input.type, source, t.path) };
}

export interface UpdateInput { type: string; slug: string; patch?: Record<string, unknown>; body?: string; cfg?: LoadedConfig }

/** Patch frontmatter and/or replace the body. `status` is not patchable here — that is `setStatus`. */
export function updateContent(root: string, input: UpdateInput): WriteResult {
  const cfg = input.cfg ?? loadConfig(root);
  assertWritable(cfg, input.type);
  const t = target(root, cfg, input.type, input.slug);
  if (!existsSync(t.file)) throw new WriteError(`no ${input.type} with slug "${input.slug}"`, `content.query lists what exists; content.create makes a new one.`);
  if (input.patch && "status" in input.patch) throw new WriteError("status is not patchable", "Use content.set_status — it checks the transition the status machine allows.");
  if (!input.patch && input.body === undefined) throw new WriteError("nothing to update", "Pass `patch` (frontmatter keys) or `body` (the markdown below the frontmatter).");
  const source = readFileSync(t.file, "utf8");
  const { yaml, body, had } = splitFrontmatter(source);
  const doc = parseDocument(had ? yaml : "");
  if (!isMap(doc.contents)) doc.contents = doc.createNode({}) as never;
  if (input.patch) patchDoc(doc, input.patch);
  const next = compose(doc, input.body ?? body);
  writeFileSync(t.file, next);
  const status = String(readFrontmatter(next).status ?? cfg.config.initialStatus);
  return { ...t, action: "update", paths: [t.path], status, lint: lintOne(cfg, input.type, next, t.path) };
}

/** The statuses the machine allows from here (docs/02 §5). */
export function transitions(cfg: Config, from: string): string[] { return cfg.statuses[from]?.transitions ?? []; }

export interface StatusInput { type: string; slug: string; status: string; cfg?: LoadedConfig; now?: Date }

export function setStatus(root: string, input: StatusInput): WriteResult {
  const cfg = input.cfg ?? loadConfig(root);
  assertWritable(cfg, input.type);
  const t = target(root, cfg, input.type, input.slug);
  if (!existsSync(t.file)) throw new WriteError(`no ${input.type} with slug "${input.slug}"`, `content.query lists what exists.`);
  const source = readFileSync(t.file, "utf8");
  const from = String(readFrontmatter(source).status ?? cfg.config.initialStatus);
  if (!cfg.config.statuses[input.status]) throw new WriteError(`unknown status "${input.status}"`, `Statuses: ${Object.keys(cfg.config.statuses).join(", ")}`);
  if (from === input.status) throw new WriteError(`${input.type}/${input.slug} is already ${input.status}`);
  const allowed = transitions(cfg.config, from);
  if (!allowed.includes(input.status)) throw new WriteError(`${from} → ${input.status} is not a transition the status machine allows`, `From ${from} you can go to: ${allowed.join(", ") || "nowhere"}.`);
  const { yaml, body, had } = splitFrontmatter(source);
  const doc = parseDocument(had ? yaml : "");
  if (!isMap(doc.contents)) doc.contents = doc.createNode({}) as never;
  doc.setIn(["status"], input.status);
  const fields = typeDef(cfg, input.type).fields as Record<string, unknown>;
  if (input.status === "published" && "updated" in fields && doc.getIn(["date"]) !== undefined) {
    const day = today(input.now ?? new Date());
    if (String(doc.getIn(["date"])) !== day) doc.setIn(["updated"], day);
  }
  const next = compose(doc, body);
  writeFileSync(t.file, next);
  return { ...t, action: "status", paths: [t.path], status: input.status, lint: lintOne(cfg, input.type, next, t.path) };
}

/** Move to `content/.trash/<type>/<slug>.md` and mark it trashed. Both paths are returned: git needs the pair. */
export function trashContent(root: string, input: { type: string; slug: string; cfg?: LoadedConfig }): WriteResult {
  const cfg = input.cfg ?? loadConfig(root);
  assertWritable(cfg, input.type);
  const t = target(root, cfg, input.type, input.slug);
  if (!existsSync(t.file)) throw new WriteError(`no ${input.type} with slug "${input.slug}"`);
  const source = readFileSync(t.file, "utf8");
  const from = String(readFrontmatter(source).status ?? cfg.config.initialStatus);
  if (!transitions(cfg.config, from).includes("trashed")) throw new WriteError(`${from} → trashed is not a transition the status machine allows`, `From ${from} you can go to: ${transitions(cfg.config, from).join(", ") || "nowhere"}.`);
  const { yaml, body, had } = splitFrontmatter(source);
  const doc = parseDocument(had ? yaml : "");
  if (!isMap(doc.contents)) doc.contents = doc.createNode({}) as never;
  doc.setIn(["status"], "trashed");
  const dest = trashFile(root, input.type, input.slug);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(t.file, compose(doc, body));
  renameSync(t.file, dest);
  return { ...t, action: "trash", paths: [t.path, rel(root, dest)], status: "trashed" };
}

export function restoreContent(root: string, input: { type: string; slug: string; cfg?: LoadedConfig }): WriteResult {
  const cfg = input.cfg ?? loadConfig(root);
  assertWritable(cfg, input.type);
  const t = target(root, cfg, input.type, input.slug);
  const src = trashFile(root, input.type, input.slug);
  if (!existsSync(src)) throw new WriteError(`nothing trashed at ${input.type}/${input.slug}`);
  if (existsSync(t.file)) throw new WriteError(`${input.type}/${input.slug} exists again`, `Rename or trash the live one first.`);
  const { yaml, body, had } = splitFrontmatter(readFileSync(src, "utf8"));
  const doc = parseDocument(had ? yaml : "");
  if (!isMap(doc.contents)) doc.contents = doc.createNode({}) as never;
  doc.setIn(["status"], cfg.config.initialStatus);
  mkdirSync(dirname(t.file), { recursive: true });
  writeFileSync(t.file, compose(doc, body));
  rmSync(src, { force: true });
  return { ...t, action: "restore", paths: [t.path, rel(root, src)], status: cfg.config.initialStatus };
}

// ── approval ────────────────────────────────────────────────────────────────
/**
 * A publish an agent cannot grant itself (docs/03 "safety defaults"): a human approves *one version* of
 * one item on the review page, and the approval names that version's content hash. Edit after approving
 * and the approval no longer matches — the publish is refused rather than silently shipping new words.
 */
export interface Approval { type: string; slug: string; hash: string; by: string; at: string }
export const approvalKey = (type: string, slug: string) => `approval:${type}/${slug}`;
export const contentHash = (source: string) => sha1(source);

export interface ApprovalStore { meta(k: string): string | undefined; setMeta(k: string, v: string): void }

/**
 * Approvals live in `.snypd/approvals.json`, not in an index: the preview server that records one keeps
 * its *own* route cache (`preview.sqlite`) so it can render drafts without disturbing `dist/`, and the MCP
 * server that spends one opens the default index — two SQLite files, one of which would never see the
 * other's approval. A route cache and a human's decision have nothing to do with each other anyway; this
 * one is also readable by the human who made it. Losing the file only ever refuses a publish.
 */
export function approvals(root: string): ApprovalStore {
  const file = join(root, ".snypd", "approvals.json");
  const read = (): Record<string, string> => { try { return JSON.parse(readFileSync(file, "utf8")) as Record<string, string>; } catch { return {}; } };
  return {
    meta: (k) => read()[k],
    setMeta: (k, v) => { const all = read(); if (v) all[k] = v; else delete all[k]; mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(all, null, 2)); },
  };
}

export function approve(store: ApprovalStore, a: Approval): Approval {
  store.setMeta(approvalKey(a.type, a.slug), JSON.stringify(a));
  return a;
}
export function approvalOf(store: ApprovalStore, type: string, slug: string): Approval | undefined {
  const raw = store.meta(approvalKey(type, slug));
  if (!raw) return undefined;
  try { return JSON.parse(raw) as Approval; } catch { return undefined; }
}
export function clearApproval(store: ApprovalStore, type: string, slug: string) { store.setMeta(approvalKey(type, slug), ""); }

/** Why a publish may or may not go ahead right now. The tool and the review page both ask this. */
export function publishCheck(root: string, cfg: LoadedConfig, store: ApprovalStore, type: string, slug: string): { ok: boolean; policy: string; reason?: string; hint?: string; approval?: Approval } {
  const policy = writePolicy(cfg, type);
  if (policy === "false") return { ok: false, policy, reason: `type "${type}" is not writable over MCP` };
  const t = target(root, cfg, type, slug);
  if (!existsSync(t.file)) return { ok: false, policy, reason: `no ${type} with slug "${slug}"` };
  if (policy === "publish") return { ok: true, policy };
  const approval = approvalOf(store, type, slug);
  const hash = contentHash(readFileSync(t.file, "utf8"));
  if (!approval) return { ok: false, policy, reason: `publishing ${type}/${slug} needs a human`, hint: `Open ${reviewPath(type, slug)} on \`snypd serve --preview\` and approve it, then call content.publish again.` };
  if (approval.hash !== hash) return { ok: false, policy, reason: `${type}/${slug} changed after it was approved`, hint: `The approval covers the version ${approval.by} read at ${approval.at}. Re-open ${reviewPath(type, slug)} and approve the current draft.`, approval };
  return { ok: true, policy, approval };
}
