/**
 * The write half of the MCP surface (docs/03 `content.*`), S11. Every rule lives in @snypd/core
 * (`write.ts` semantics, `git.ts` commits); this file is the adapter: JSON Schema in, `ToolResult` out,
 * and the one place that decides what an agent is *told* after a write — the route, the lint it just
 * caused, the branch its words are sitting on, and what has to happen before they go live.
 *
 * Two invariants worth keeping while editing:
 *  - imported lazily by server.ts, like resources.ts, so `initialize` still answers at the spawn floor.
 *    `@snypd/render` is a dependency of this package *only* so `render_preview` can resolve it; the
 *    import is dynamic and inside the handler, so the renderer is parsed when a preview is asked for
 *    and never on the path `mcp.coldStart` measures. Keep it that way — it is the tightest budget here;
 *  - a failed tool returns `isError` with a hint, never a JSON-RPC error. A protocol error aborts the
 *    agent's turn; a tool error is something it can read and fix.
 *
 * S16 splits the surface in two (docs/07 decision 38). What is listed here is the hot path — `content.*`,
 * which an agent writing a post needs immediately — plus `find_tools`, which hands over the rest
 * (`theme`, `site`, `bench`; catalog.ts) on demand. A tool the catalogue defines is callable whether or
 * not it was ever listed, so the split degrades to "slightly more typing" on a client that ignores
 * `notifications/tools/list_changed` rather than to a broken server.
 */
import { existsSync, readFileSync } from "node:fs";
import { activitySnapshot, type Handlers, type Tool, type ToolResult } from "./protocol";

type Core = typeof import("@snypd/core");
let core: Core | undefined;
const loadCore = async () => (core ??= await import("@snypd/core"));

const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: "string", description, ...extra });
const S = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object" as const, properties, required });

const TYPE = str("Content type: `post`, `page`, `author` (snypd://types lists them)");
const SLUG = str("The item's slug — its filename without `.md`");

export const TOOLS: Tool[] = [
  { name: "content.create",
    description: "Write a new content file and commit it to the site's drafts branch. Frontmatter is the type's schema (snypd://types/{type}); the body is markdown plus the primitive directives in snypd://spec/primitives — a post that is all prose is a post that wastes the vocabulary. Status is always the site's initial status: this tool cannot publish. Returns the route, the branch and the lint the new file produces, so the fixes come back in the same turn as the writing.",
    inputSchema: S({ type: TYPE, slug: str("Slug to write at; defaults to the title, slugified"), frontmatter: { type: "object", description: "Frontmatter fields for the type. `status` is ignored — a new file is always a draft" }, body: str("Markdown body, without the frontmatter block") }, ["type"]),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false } },
  { name: "content.update",
    description: "Patch frontmatter and/or replace the body of an existing item, then commit it to the drafts branch. `patch` names only the keys that change (`null` deletes one) and leaves every other key, comment and quote in the file untouched; `body` replaces the markdown wholesale. Use content.set_status to move a status — this tool refuses it.",
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
    description: "Publish a draft: set it published, then land that one item on the branch the site deploys from — every other draft stays a draft. When the type's `mcp.write` policy is `draft` (the default) an agent cannot do this alone — a human approves the exact version on /_snypd/review/{type}/{slug} under `snypd serve --preview`, and editing after approval invalidates it. The refusal tells you which of the two it is.",
    inputSchema: S({ type: TYPE, slug: SLUG }, ["type", "slug"]),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true } },
  { name: "content.suggest_blocks",
    description: "Read a post that is plain prose and return the primitives it was already trying to be — the table that is a chart, the numbered list that branches and is therefore a flow, the run of question headings that is an faq. Every suggestion carries its confidence, the reasons in words, the exact markdown that replaces the exact lines, and anything the prose could not supply (a chart has no `source:` in it). Nothing is returned that would fail lint. Pass `apply` to write the accepted ones straight to the draft branch instead of handing them back.",
    inputSchema: S({ type: TYPE, slug: SLUG, markdown: str("Score this string instead of a stored item; read-only"),
      apply: { description: "true, or a list of ids, to write those suggestions. Needs type+slug", oneOf: [{ type: "boolean" }, { type: "array", items: { type: "string" } }] },
      fill: { type: "object", description: "Meet a need so it can apply: {\"2\":{\"source\":\"https://…\"}}" },
      only: { type: "array", items: { type: "string" }, description: "Only these primitives" },
      minConfidence: { type: "number", description: "Override every detector's floor, 0–1. Below it shows what was nearly suggested" } }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true } },
  { name: "content.render_preview",
    description: "Get a URL for looking at an item as it will actually render, drafts included. Starts the preview server for this session if it is not already up, and returns the page, its markdown twin (which you can read yourself) and the review page a human approves on. The preview is the same incremental build as `snypd build`, not a second renderer, so what you see is what publishes.",
    inputSchema: S({ type: TYPE, slug: SLUG, port: { type: "number", description: "Port to serve on; default 4321" } }, ["type", "slug"]),
    annotations: { readOnlyHint: true, idempotentHint: true } },
  { name: "content.trash",
    description: "Move an item to content/.trash and mark it trashed: it leaves the build and every list. Reversible with content.restore until the 30-day sweep. Not a delete — nothing is removed from git history.",
    inputSchema: S({ type: TYPE, slug: SLUG }, ["type", "slug"]),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false } },
  { name: "content.restore",
    description: "Bring a trashed item back as a draft, at its original path.",
    inputSchema: S({ type: TYPE, slug: SLUG }, ["type", "slug"]),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false } },

  { name: "find_tools",
    description: "Load the tools for anything that is not writing a post — changing the theme or its colours, editing site config, redirecting a URL that moved, checking the site's health, running the benchmarks. Say what you are trying to do and the matching tools come back with their full schemas, callable straight away. They are behind this call so that a session which only writes content never pays for a surface it does not use.",
    inputSchema: S({ query: str("What you are trying to do, in your own words — \"change the accent colour\", \"the post moved, redirect the old URL\", \"is the build still fast\". Omit it to see everything there is.") }),
    annotations: { readOnlyHint: true, idempotentHint: true } },
];

/** The always-listed surface. The catalogue joins `tools/list` only once `find_tools` has unlocked part of it. */
export const CORE_TOOLS = TOOLS;

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

/**
 * One preview server per MCP session, started by the first `render_preview` and living as long as the
 * agent does. Starting it from a tool call rather than telling a human to run a command is the whole
 * point: the kill test says "never opening an editor", and a URL nobody can reach fails that. The
 * import is lazy like every other write-path import, so `initialize` still answers at the spawn floor.
 */
let previewing: Promise<{ url: string; stop: () => void }> | undefined;
async function previewServer(root: string, port?: number) {
  // `activitySnapshot` is what turns the Desk's status card green (S18b): the preview is started by a
  // tool call, so by the time anyone can load the page a harness has demonstrably called us.
  previewing ??= import("@snypd/render/preview").then((m) => m.preview(root, { port, activity: activitySnapshot }));
  return previewing;
}
/**
 * Release everything a tool call started. `Bun.serve` holds the event loop open, so without this a
 * session that ever asked for a preview would never exit when its stdin closed — a stdio server that
 * survives the harness closing the pipe is a hung session, not a running one.
 */
export async function dispose(): Promise<void> {
  const p = previewing;
  previewing = undefined;
  if (p) { try { (await p).stop(); } catch { /* already gone */ } }
}

type Catalog = typeof import("./catalog");
let catalog: Catalog | undefined;
const loadCatalog = async () => (catalog ??= await import("./catalog"));

/**
 * Tools `find_tools` has handed over this session. Session-scoped rather than global: two roots served by
 * one process must not leak each other's unlocked surface, and a fresh session starts back at the small list.
 */
export function handlers(root: string, notify?: (method: string, params?: Record<string, unknown>) => void): Pick<Handlers, "listTools" | "callTool"> {
  const unlocked = new Set<string>();
  const cfgOf = async () => {
    const c = await loadCore();
    const cfg = c.loadConfig(root);
    if (!cfg.ok) throw new Error(`snypd.yaml is invalid: ${c.formatDiagnostics(cfg.diagnostics)}`);
    return cfg;
  };

  /**
   * Enter the drafts branch *before* a byte is written (S18d).
   *
   * `useDrafts` refuses when the tree carries work this write did not do, and until this session that
   * guard ran after the content was already on disk — so a refusal came back as `isError` over a write
   * that had happened, leaving the item on the working branch, uncommitted, and listed by
   * `content.query` as something the agent had just been told it failed to create. An agent that
   * believes its own error report then retries, or reports a failure to a person who can see the file.
   *
   * Every empty-directory first run hit it, because `init` in a directory that was not yet a repo could
   * not commit its own scaffold — so the first `content.create` was always the call that discovered the
   * tree was dirty. `shouldInitRepo` (core/site.ts) removes that cause; this removes the class.
   *
   * Called first, the guard is also *more* accurate than it was: nothing of ours is dirty yet, so every
   * dirty path is genuinely foreign and there is nothing for `ours` to exclude. Switching a clean tree
   * to the drafts branch and then failing to write is harmless — that is where writes live anyway.
   */
  const enterDrafts = async (): Promise<void> => {
    const c = await loadCore();
    c.Repo.open(root)?.useDrafts();
  };

  /** Put the write on the site's drafts branch and commit exactly the paths it touched (docs/02 §6). */
  const commitWrite = async (r: { paths: string[] }, subject: string) => {
    const c = await loadCore();
    const repo = c.Repo.open(root);
    if (!repo) return { enabled: false as const };
    const draft = repo.useDrafts(r.paths);
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
    async listTools() {
      if (!unlocked.size) return CORE_TOOLS;
      const { CATALOG } = await loadCatalog();
      return [...CORE_TOOLS, ...CATALOG.filter((t) => unlocked.has(t.name))];
    },

    async callTool(name, args): Promise<ToolResult> {
      // Before the core import: finding a tool is the one call that needs nothing but the catalogue.
      if (name === "find_tools") {
        const { search, CATALOG } = await loadCatalog();
        const q = typeof args.query === "string" ? args.query : "";
        const found = search(q);
        if (!found.length)
            return text(`nothing matches "${q}"\nThere are ${CATALOG.length} tools here: ${CATALOG.map((t) => t.name).join(", ")}. Call find_tools with no query to see them all.`,
              { ok: true, count: 0, available: CATALOG.map((t) => t.name) });
        const fresh = found.filter((t) => !unlocked.has(t.name));
        for (const t of found) unlocked.add(t.name);
        // Tell the client its list grew. A client that acts on it can call these natively; one that
        // does not still has the schemas printed below, and callTool takes them either way.
        if (fresh.length) notify?.("notifications/tools/list_changed");
        const body = found.map((t) => `## ${t.name}\n${t.description}\n\ninput: ${JSON.stringify(t.inputSchema)}`).join("\n\n");
        return text(`${found.length} tool${found.length === 1 ? "" : "s"} ready to call:\n\n${body}`, { ok: true, count: found.length, tools: found });
      }
      const c = await loadCore();
      try {
        switch (name) {
          case "content.create": {
            const cfg = await cfgOf();
            await enterDrafts();
            const r = c.createContent(root, { type: need(args, "type"), slug: typeof args.slug === "string" ? args.slug : undefined, frontmatter: asObject(args.frontmatter, "frontmatter"), body: typeof args.body === "string" ? args.body : undefined, cfg });
            return await wrote(r, `content: create ${r.type}/${r.slug}`);
          }
          case "content.update": {
            const cfg = await cfgOf();
            await enterDrafts();
            const r = c.updateContent(root, { type: need(args, "type"), slug: need(args, "slug"), patch: asObject(args.patch, "patch"), body: typeof args.body === "string" ? args.body : undefined, cfg });
            return await wrote(r, `content: update ${r.type}/${r.slug}`);
          }
          case "content.set_status": {
            const cfg = await cfgOf();
            await enterDrafts();
            const r = c.setStatus(root, { type: need(args, "type"), slug: need(args, "slug"), status: need(args, "status"), cfg });
            return await wrote(r, `content: ${r.status} ${r.type}/${r.slug}`);
          }
          case "content.trash": {
            const cfg = await cfgOf();
            await enterDrafts();
            const r = c.trashContent(root, { type: need(args, "type"), slug: need(args, "slug"), cfg });
            const g = await commitWrite(r, `content: trash ${r.type}/${r.slug}`);
            // Trashing an item that is *on the site* has to take it off the site. The approval gate exists
            // so an agent cannot publish words a human has not read; it is not a reason to leave a post the
            // operator just deleted serving to readers until somebody publishes the deletion. The removal
            // lands exactly the way a publish does — one path, no checkout — and `git revert` undoes it.
            const repo = c.Repo.open(root);
            const base = repo?.publishBase();
            const live = !!(repo && base && repo.show(base, r.path) !== undefined);
            const landed = live ? repo!.land(r.paths, `content: unpublish ${r.type}/${r.slug}`) : undefined;
            const lines = [`trashed ${r.type}/${r.slug} → ${c.TRASH_DIR}/${r.type}/${r.slug}.md`, gitLine(g)];
            if (landed) lines.push(landed.ok ? `taken off ${landed.base} (${landed.changed ? landed.sha!.slice(0, 8) : "already gone"})` : `still on ${landed.base}: ${landed.reason}`);
            return text(lines.join("\n"), { ok: true, type: r.type, slug: r.slug, route: r.route, path: r.path, status: r.status, git: { ...g, landed: landed?.changed ?? false, base: landed?.base } });
          }
          case "content.restore": {
            const cfg = await cfgOf();
            await enterDrafts();
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
              await enterDrafts();
              const r = c.setStatus(root, { type, slug, status: "published", cfg });
              status = r.status;
              g = await commitWrite(r, `content: publish ${type}/${slug}`);
            }
            // The publish itself: one item's path, from the drafts branch onto the branch it was cut
            // from, without moving the working tree (git.ts `land`). Every other draft stays where it is.
            const repo = c.Repo.open(root);
            const landed = repo?.land([t.path], `content: publish ${type}/${slug}`);
            if (landed && !landed.ok) return fail(`published ${type}/${slug}, but landing it on ${landed.base ?? "the base branch"} failed: ${landed.reason}`, "The file itself is published — this is git's problem, not the post's. `git log snypd/drafts` shows the commit that has not landed.");
            c.clearApproval(store, type, slug);
            const where = !landed ? "not a git repo" : landed.changed ? `landed on ${landed.base} as ${landed.sha!.slice(0, 8)}` : `${landed.base} already has this version`;
            return text([`published ${type}/${slug} → ${t.route}`, where, `approved by ${check.approval?.by ?? `policy ${check.policy}`}`].join("\n"),
              { ok: true, type, slug, route: t.route, status, git: { ...g, landed: landed?.changed ?? false, base: landed?.base, landedSha: landed?.sha }, approval: check.approval });
          }
          case "content.suggest_blocks": {
            const cfg = await cfgOf();
            const inline = typeof args.markdown === "string" ? args.markdown : undefined;
            const type = typeof args.type === "string" ? args.type : undefined;
            const slug = typeof args.slug === "string" ? args.slug : undefined;
            if (!inline && !(type && slug)) return fail("nothing to read", "Pass `type` and `slug` for a stored item, or `markdown` for a string.");
            const t = inline ? undefined : c.target(root, cfg, type!, slug!);
            const source = inline ?? readFileSync(t!.file, "utf8");
            const def = t ? cfg.config.types[t.type]! : undefined;
            const list = c.suggestBlocks(source, {
              ...(def ? { type: { fields: def.fields as never, taxonomies: def.taxonomies }, vocabulary: def.vocabulary } : {}),
              statuses: Object.keys(cfg.config.statuses),
              only: Array.isArray(args.only) ? args.only.filter((x): x is string => typeof x === "string") : undefined,
              minConfidence: typeof args.minConfidence === "number" ? args.minConfidence : undefined,
            });
            const wantApply = args.apply === true || Array.isArray(args.apply);
            if (!wantApply)
              return text(c.formatSuggestions(list), { ok: true, count: list.length, suggestions: list });
            if (inline) return fail("`apply` needs a stored item", "Pass `type` and `slug`; there is nothing to write a bare `markdown` string back to.");

            const ids = Array.isArray(args.apply) ? args.apply.filter((x): x is string => typeof x === "string") : undefined;
            const fill = asObject(args.fill, "fill") as Record<string, Record<string, string>> | undefined;
            await enterDrafts();
            const r = c.applySuggestions(source, list, { ids, fill });
            if (!r.applied.length)
              return text([`no suggestions applied of ${list.length} found`, ...r.skipped.map((s) => `  ${s.id}: ${s.why}`)].join("\n"),
                { ok: true, applied: [], skipped: r.skipped, suggestions: list });
            const w = c.updateContent(root, { type: type!, slug: slug!, body: c.splitFrontmatter(r.markdown).body, cfg });
            const g = await commitWrite(w, `content: suggest_blocks ${type}/${slug} (${r.applied.map((a) => a.primitive).join(", ")})`);
            const lines = [
              `applied ${r.applied.length} of ${list.length} to ${w.type}/${w.slug} → ${w.route}`,
              ...r.applied.map((a) => `  ${a.id}. lines ${a.line}–${a.endLine} → \`${a.primitive}\` (${a.confidence})`),
              ...(r.skipped.length ? ["not applied:", ...r.skipped.map((s) => `  ${s.id}: ${s.why}`)] : []),
              gitLine(g),
            ];
            if (w.lint) lines.push(lintLine(w.lint));
            return text(lines.join("\n"), { ok: true, applied: r.applied, skipped: r.skipped, route: w.route, git: g,
              ...(w.lint ? { lint: { errors: w.lint.errors, warnings: w.lint.warnings, diagnostics: diag(w.lint) } } : {}) });
          }
          case "content.render_preview": {
            const cfg = await cfgOf();
            const type = need(args, "type"), slug = need(args, "slug");
            const t = c.target(root, cfg, type, slug);
            if (!existsSync(t.file)) return fail(`no ${type} with slug "${slug}"`, "content.query lists what exists.");
            const p = await previewServer(root, typeof args.port === "number" ? args.port : undefined);
            const url = `${p.url}${t.route}`;
            const md = `${url.replace(/\/$/, "")}/index.md`;
            const review = `${p.url}${c.reviewPath(type, slug)}`;
            return text([`${url}`, `markdown twin: ${md}`, `review + approve: ${review}`,
              "The preview rebuilds on change and includes drafts; it is the same build that publishes."].join("\n"),
              { ok: true, url, markdownUrl: md, reviewUrl: review, route: t.route, server: p.url });
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
          default: {
            const { CATALOG_NAMES, call } = await loadCatalog();
            // A catalogue tool is callable whether or not `find_tools` listed it first: the schema is the
            // same either way, and refusing here would only punish a client that read the schema and acted.
            if (CATALOG_NAMES.has(name)) { unlocked.add(name); return await call(root, name, args); }
            return fail(`unknown tool "${name}"`, `Listed: ${CORE_TOOLS.map((t) => t.name).join(", ")}. Everything else is behind find_tools.`);
          }
        }
      } catch (e) {
        const err = e as Error & { hint?: string };
        return fail(err.message, err.hint);
      }
    },
  };
}
