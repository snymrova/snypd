/**
 * The write half of the MCP surface (docs/03 `content.*`), S11. Every rule lives in @snypd/core
 * (`write.ts` semantics, `git.ts` commits); this file is the adapter: JSON Schema in, `ToolResult` out,
 * and the one place that decides what an agent is *told* after a write — the route, the lint it just
 * caused, the branch its words are sitting on, and what has to happen before they go live.
 *
 * Two invariants worth keeping while editing:
 *  - imported lazily by server.ts, like resources.ts, so `initialize` still answers at the spawn floor;
 *  - a failed tool returns `isError` with a hint, never a JSON-RPC error. A protocol error aborts the
 *    agent's turn; a tool error is something it can read and fix.
 */
import { readFileSync } from "node:fs";
import type { Handlers, Tool, ToolResult } from "./protocol";

type Core = typeof import("@snypd/core");
let core: Core | undefined;
const loadCore = async () => (core ??= await import("@snypd/core"));

const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: "string", description, ...extra });
const S = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object" as const, properties, required });

const TYPE = str("Content type: `post`, `page`, `author` (snypd://types lists them)");
const SLUG = str("The item's slug — its filename without `.md`");

export const TOOLS: Tool[] = [
  { name: "content.create",
    description: "Write a new content file and commit it to its own draft branch. Frontmatter is the type's schema (snypd://types/{type}); the body is markdown plus the primitive directives in snypd://spec/primitives — a post that is all prose is a post that wastes the vocabulary. Status is always the site's initial status: this tool cannot publish. Returns the route, the branch and the lint the new file produces, so the fixes come back in the same turn as the writing.",
    inputSchema: S({ type: TYPE, slug: str("Slug to write at; defaults to the title, slugified"), frontmatter: { type: "object", description: "Frontmatter fields for the type. `status` is ignored — a new file is always a draft" }, body: str("Markdown body, without the frontmatter block") }, ["type"]),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false } },
  { name: "content.update",
    description: "Patch frontmatter and/or replace the body of an existing item, then commit it to its draft branch. `patch` names only the keys that change (`null` deletes one) and leaves every other key, comment and quote in the file untouched; `body` replaces the markdown wholesale. Use content.set_status to move a status — this tool refuses it.",
    inputSchema: S({ type: TYPE, slug: SLUG, patch: { type: "object", description: "Frontmatter keys to set; a key set to null is deleted" }, body: str("Replacement markdown body") }, ["type", "slug"]),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true } },
  { name: "content.query",
    description: "List content the index already knows, without reading files: filter by type, status or taxonomy term, sort, and take a slice. Ask for `fields` to get frontmatter keys alongside. This is how to find what exists before writing something that already does.",
    inputSchema: S({ type: TYPE, status: str("draft | published | trashed"), taxonomy: str("Taxonomy to filter on, e.g. `tag`"), term: str("Term within that taxonomy"), fields: { type: "array", items: { type: "string" }, description: "Extra frontmatter keys to return" }, sort: str("`date` (newest first, default), `title` or `slug`"), limit: { type: "number", description: "Default 20" } }),
    annotations: { readOnlyHint: true, idempotentHint: true } },
  { name: "content.lint",
    description: "Run the editorial lint (docs/01 rules 0–11) over the whole site, or one item. Every diagnostic carries a fix hint; rules 5, 10 and 11 (dead links, a slug change with nothing redirecting the old URL, a tag used once) can only be seen site-wide, which is why this exists next to the lint a write already returns.",
    inputSchema: S({ type: TYPE, slug: SLUG, severity: str("`error` to return errors only; default returns both") }),
    annotations: { readOnlyHint: true, idempotentHint: true } },
  { name: "content.set_status",
    description: "Move an item along the status machine (draft → published → trashed, per snypd://config › statuses). Transitions the machine does not allow are refused with the ones it does. Publishing this way is still subject to the type's write policy — content.publish is the tool that carries the approval.",
    inputSchema: S({ type: TYPE, slug: SLUG, status: str("Target status") }, ["type", "slug", "status"]),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true } },
  { name: "content.publish",
    description: "Publish a draft: set it published, then merge its draft branch back into the branch it was cut from. When the type's `mcp.write` policy is `draft` (the default) an agent cannot do this alone — a human approves the exact version on /_snypd/review/{type}/{slug} under `snypd serve --preview`, and editing after approval invalidates it. The refusal tells you which of the two it is.",
    inputSchema: S({ type: TYPE, slug: SLUG }, ["type", "slug"]),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true } },
  { name: "content.trash",
    description: "Move an item to content/.trash and mark it trashed: it leaves the build and every list. Reversible with content.restore until the 30-day sweep. Not a delete — nothing is removed from git history.",
    inputSchema: S({ type: TYPE, slug: SLUG }, ["type", "slug"]),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false } },
  { name: "content.restore",
    description: "Bring a trashed item back as a draft, at its original path.",
    inputSchema: S({ type: TYPE, slug: SLUG }, ["type", "slug"]),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false } },
];

const text = (s: string, structured?: Record<string, unknown>): ToolResult => ({ content: [{ type: "text", text: s }], ...(structured ? { structuredContent: structured } : {}) });
const fail = (message: string, hint?: string): ToolResult => ({ content: [{ type: "text", text: hint ? `${message}\n↳ ${hint}` : message }], structuredContent: { ok: false, error: message, ...(hint ? { hint } : {}) }, isError: true });

const need = (args: Record<string, unknown>, key: string): string => {
  const v = args[key];
  if (typeof v !== "string" || !v) throw new Error(`${key} required`);
  return v;
};
const asObject = (v: unknown, key: string): Record<string, unknown> | undefined => {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "object" || Array.isArray(v)) throw new Error(`${key} must be an object`);
  return v as Record<string, unknown>;
};

/** Diagnostics as the agent should see them: the fix hint is the point, so it is never dropped. */
const diag = (r: { file?: string; diagnostics: { rule: string; n: number; severity: string; line: number; message: string; hint: string }[] }) =>
  r.diagnostics.map((d) => ({ file: r.file, rule: d.rule, n: d.n, severity: d.severity, line: d.line, message: d.message, hint: d.hint }));
const lintLine = (r: { errors: number; warnings: number }) => `lint: ${r.errors} error${r.errors === 1 ? "" : "s"}, ${r.warnings} warning${r.warnings === 1 ? "" : "s"}`;

export function handlers(root: string): Pick<Handlers, "listTools" | "callTool"> {
  const cfgOf = async () => {
    const c = await loadCore();
    const cfg = c.loadConfig(root);
    if (!cfg.ok) throw new Error(`snypd.yaml is invalid: ${c.formatDiagnostics(cfg.diagnostics)}`);
    return cfg;
  };

  /** Put the write on its draft branch and commit exactly the paths it touched (docs/02 §7). */
  const commitWrite = async (r: { type: string; slug: string; paths: string[] }, subject: string) => {
    const c = await loadCore();
    const repo = c.Repo.open(root);
    if (!repo) return { enabled: false as const };
    const draft = repo.useDraft(r.type, r.slug, r.paths);
    const commit = repo.commit(r.paths, subject);
    return { enabled: true as const, branch: draft.branch, base: draft.base, committed: commit.committed, sha: commit.sha, reason: commit.reason };
  };
  const gitLine = (g: Awaited<ReturnType<typeof commitWrite>>) =>
    !g.enabled ? "not a git repo: written, not committed" : g.committed ? `committed ${g.sha!.slice(0, 8)} on ${g.branch} (from ${g.base})` : `no commit: ${g.reason}`;

  const wrote = async (r: Awaited<ReturnType<Core["createContent"]>>, subject: string) => {
    const g = await commitWrite(r, subject);
    const lines = [`${r.action} ${r.type}/${r.slug} → ${r.route} (${r.status})`, gitLine(g)];
    if (r.lint) lines.push(lintLine(r.lint));
    return text(lines.join("\n"), { ok: true, type: r.type, slug: r.slug, route: r.route, path: r.path, status: r.status, git: g, ...(r.lint ? { lint: { errors: r.lint.errors, warnings: r.lint.warnings, diagnostics: diag(r.lint) } } : {}) });
  };

  return {
    async listTools() { return TOOLS; },

    async callTool(name, args): Promise<ToolResult> {
      const c = await loadCore();
      try {
        switch (name) {
          case "content.create": {
            const cfg = await cfgOf();
            const r = c.createContent(root, { type: need(args, "type"), slug: typeof args.slug === "string" ? args.slug : undefined, frontmatter: asObject(args.frontmatter, "frontmatter"), body: typeof args.body === "string" ? args.body : undefined, cfg });
            return await wrote(r, `content: create ${r.type}/${r.slug}`);
          }
          case "content.update": {
            const cfg = await cfgOf();
            const r = c.updateContent(root, { type: need(args, "type"), slug: need(args, "slug"), patch: asObject(args.patch, "patch"), body: typeof args.body === "string" ? args.body : undefined, cfg });
            return await wrote(r, `content: update ${r.type}/${r.slug}`);
          }
          case "content.set_status": {
            const cfg = await cfgOf();
            const r = c.setStatus(root, { type: need(args, "type"), slug: need(args, "slug"), status: need(args, "status"), cfg });
            return await wrote(r, `content: ${r.status} ${r.type}/${r.slug}`);
          }
          case "content.trash": {
            const cfg = await cfgOf();
            const r = c.trashContent(root, { type: need(args, "type"), slug: need(args, "slug"), cfg });
            return await wrote(r, `content: trash ${r.type}/${r.slug}`);
          }
          case "content.restore": {
            const cfg = await cfgOf();
            const r = c.restoreContent(root, { type: need(args, "type"), slug: need(args, "slug"), cfg });
            return await wrote(r, `content: restore ${r.type}/${r.slug}`);
          }
          case "content.publish": {
            const cfg = await cfgOf();
            const type = need(args, "type"), slug = need(args, "slug");
            const store = c.approvals(root);
            const check = c.publishCheck(root, cfg, store, type, slug);
            if (!check.ok) return fail(check.reason!, check.hint);
            const t = c.target(root, cfg, type, slug);
            // Already published (a re-run, or a publish whose merge failed last time): don't re-stamp it,
            // just finish the half that is left — the merge.
            const current = String(c.readFrontmatter(readFileSync(t.file, "utf8")).status ?? cfg.config.initialStatus);
            let status = current, g: Awaited<ReturnType<typeof commitWrite>> = { enabled: false };
            if (current !== "published") {
              const r = c.setStatus(root, { type, slug, status: "published", cfg });
              status = r.status;
              g = await commitWrite(r, `content: publish ${type}/${slug}`);
            }
            const repo = c.Repo.open(root);
            const branch = c.draftBranch(type, slug);
            const merged = repo?.exists(branch) ? repo.merge(branch, undefined, `content: publish ${type}/${slug}`) : undefined;
            if (merged && !merged.ok) return fail(`published ${type}/${slug}, but merging ${branch} failed: ${merged.reason}`, "Resolve it in git and merge the draft branch by hand — the file itself is already published, so this is the branch's problem, not the post's.");
            c.clearApproval(store, type, slug);
            const where = merged?.ok ? `merged ${branch} into ${merged.base}` : repo ? "no draft branch to merge" : "not a git repo";
            return text([`published ${type}/${slug} → ${t.route}`, where, `approved by ${check.approval?.by ?? `policy ${check.policy}`}`].join("\n"),
              { ok: true, type, slug, route: t.route, status, git: { ...g, merged: merged?.ok ?? false, base: merged?.base }, approval: check.approval });
          }
          case "content.query": {
            const cfg = await cfgOf();
            const index = await c.SiteIndex.open(root);
            try {
              index.sync(cfg);
              const type = typeof args.type === "string" ? args.type : undefined;
              const status = typeof args.status === "string" ? args.status : undefined;
              if (type && !cfg.config.types[type]) return fail(`unknown type "${type}"`, `Known types: ${Object.keys(cfg.config.types).join(", ")}`);
              let files = index.files({ type, status });
              const taxonomy = typeof args.taxonomy === "string" ? args.taxonomy : undefined;
              const term = typeof args.term === "string" ? args.term : undefined;
              if (taxonomy && term) { const paths = new Set(index.byTerm(taxonomy, term).map((f) => f.path)); files = files.filter((f) => paths.has(f.path)); }
              const sort = typeof args.sort === "string" ? args.sort : "date";
              if (sort === "title") files.sort((a, b) => a.title.localeCompare(b.title));
              else if (sort === "slug") files.sort((a, b) => a.slug.localeCompare(b.slug));
              const limit = typeof args.limit === "number" && args.limit > 0 ? Math.floor(args.limit) : 20;
              const total = files.length;
              const fields = Array.isArray(args.fields) ? args.fields.filter((f): f is string => typeof f === "string") : [];
              const items = files.slice(0, limit).map((f) => ({ type: f.type, slug: f.slug, title: f.title, status: f.status, date: f.date, route: f.route, path: f.path, ...(fields.length ? { frontmatter: Object.fromEntries(fields.filter((k) => k in f.frontmatter).map((k) => [k, f.frontmatter[k]])) } : {}) }));
              const head = items.map((i) => `${i.status.padEnd(9)} ${i.type}/${i.slug}  ${i.title}${i.date ? `  ${i.date}` : ""}`).join("\n");
              return text(`${total} item${total === 1 ? "" : "s"}${total > items.length ? `, showing ${items.length}` : ""}${items.length ? `\n${head}` : ""}`, { ok: true, total, items });
            } finally { index.close(); }
          }
          case "content.lint": {
            const cfg = await cfgOf();
            const index = await c.SiteIndex.open(root);
            try {
              index.sync(cfg);
              const site = c.lintSite(root, { cfg, moves: index.moves(), cache: new c.MdastCache(index.mdastStore()) });
              const type = typeof args.type === "string" ? args.type : undefined;
              const slug = typeof args.slug === "string" ? args.slug : undefined;
              let files = site.files;
              if (type && slug) {
                const t = c.target(root, cfg, type, slug);
                files = files.filter((f) => f.file === t.path);
                if (!files.length) return fail(`no ${type} with slug "${slug}"`, "content.query lists what exists.");
              }
              const errorsOnly = args.severity === "error";
              const out = files.map((f) => ({ ...f, diagnostics: errorsOnly ? f.diagnostics.filter((d) => d.severity === "error") : f.diagnostics })).filter((f) => f.diagnostics.length);
              const errors = out.reduce((n, f) => n + f.diagnostics.filter((d) => d.severity === "error").length, 0);
              const warnings = out.reduce((n, f) => n + f.diagnostics.filter((d) => d.severity === "warning").length, 0);
              const body = out.flatMap((f) => f.diagnostics.map((d) => `${f.file}:${d.line} ${d.severity} [${d.rule}] ${d.message}\n    ↳ ${d.hint}`)).join("\n");
              return text(`${files.length} file${files.length === 1 ? "" : "s"} · ${errors} errors · ${warnings} warnings${body ? `\n${body}` : ""}`,
                { ok: true, files: files.length, errors, warnings, diagnostics: out.flatMap(diag) });
            } finally { index.close(); }
          }
          default: return fail(`unknown tool "${name}"`, `Tools: ${TOOLS.map((t) => t.name).join(", ")}`);
        }
      } catch (e) {
        const err = e as Error & { hint?: string };
        return fail(err.message, err.hint);
      }
    },
  };
}
