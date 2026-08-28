/**
 * `snypd serve --preview` (docs/03 "no UI", docs/04 "SSR / preview"), S11 — the site as it will look
 * *with the drafts in it*, plus the one page a human needs that the public site must never have:
 * `/_snypd/review/{type}/{slug}`, where a person reads the draft's diff and approves that exact version.
 * Approval is what unlocks `content.publish` for a `draft`-policy type; an agent cannot grant it.
 *
 * The preview is the same incremental build, not a second renderer: `build({drafts: true})` into
 * `.snypd/preview` with its own index, so the production route cache is untouched and a preview never
 * writes to `dist/`. A request pays nothing while nothing has changed — the watcher sets a flag, and
 * only a flagged request rebuilds (one route ≈ 20 ms). That is what keeps TTFB at the static floor.
 */
import { existsSync, readFileSync, statSync, watch, type FSWatcher } from "node:fs";
import { join } from "node:path";
import { loadConfig, SiteIndex, MdastCache, INDEX_DIR, target, approve, approvalOf, approvals, reviewPath, contentHash, publishCheck, draftSource, splitFrontmatter, Repo, draftBranch, type LoadedConfig, type ApprovalStore } from "@snypd/core";
import { build, type BuildResult } from "./build";
import { loadTheme, type Theme, type SiteCtx, type Page } from "./theme";
import { Html, escape } from "./jsx-runtime";
import { resolveTokens, tokensCss } from "./tokens";

export interface PreviewOptions { port?: number; out?: string; hostname?: string; watch?: boolean }
export interface PreviewServer { url: string; port: number; stop: () => void; rebuild: () => Promise<BuildResult>; out: string; dirty: () => boolean }

const REVIEW = /^\/_snypd\/review\/([a-z][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)\/?$/i;
const APPROVE = /^\/_snypd\/approve\/([a-z][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)\/?$/i;

const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };
const mimeOf = (f: string) => MIME[f.slice(f.lastIndexOf("."))] ?? "application/octet-stream";

/** Who approved, when asked from a browser. Not an identity system: the audit trail is the git trailer. */
const reviewerOf = (req: Request) => req.headers.get("x-snypd-reviewer") || process.env.SNYPD_REVIEWER || "a human at the review page";

export async function preview(root: string, opts: PreviewOptions = {}): Promise<PreviewServer> {
  const out = opts.out ?? join(root, INDEX_DIR, "preview");
  let cfg: LoadedConfig = loadConfig(root);
  const index = await SiteIndex.open(root, join(root, INDEX_DIR, "preview.sqlite"));
  const store: ApprovalStore = approvals(root);   // shared with the MCP server; the preview index is not (see write.ts)
  let theme!: Theme;
  let dirty = false, building: Promise<BuildResult> | undefined;

  const rebuild = async (): Promise<BuildResult> => {
    if (building) return building;
    dirty = false;
    cfg = loadConfig(root);
    // `bundle: true` is the whole of S11's deferred fix: entry files are rebuilt into single-file modules
    // whose path carries the theme hash, so a theme edit reloads the *graph* — not just the entry, with
    // its statically-imported `./shell` still coming from Bun's module cache and rendering the old page.
    theme = await loadTheme(cfg, { bundle: true });
    building = build(root, { out, cfg, index, drafts: true, cache: new MdastCache(index.mdastStore()) });
    try { return await building; } finally { building = undefined; }
  };
  const fresh = async () => { if (dirty) await rebuild(); };
  await rebuild();

  // Watch what a build reads: content, the theme, the config. Recursive where the platform allows it.
  const watchers: FSWatcher[] = [];
  if (opts.watch !== false) {
    const touch = () => { dirty = true; };
    const add = (p: string, recursive = true) => { if (!existsSync(p)) return; try { watchers.push(watch(p, { recursive }, touch)); } catch { try { watchers.push(watch(p, touch)); } catch { /* watch is best-effort: a request can always force a rebuild */ } } };
    add(join(root, "content"));
    add(join(root, "snypd.yaml"), false);
    if (theme.dir) add(theme.dir);
  }

  // ── the review page ────────────────────────────────────────────────────────
  const shell = (title: string, body: Html, route: string) => {
    const tokens = resolveTokens(cfg.config.theme.tokens as Parameters<typeof resolveTokens>[0]);
    const css = tokensCss(tokens) + (theme.css ?? "");
    const ctx: SiteCtx = { site: { name: cfg.config.site.name, url: cfg.config.site.url.replace(/\/$/, ""), description: cfg.config.site.description }, tokens, theme: { name: theme.name }, assets: { css: css ? "/assets/theme.css" : undefined, feed: "/feed.xml", llms: "/llms.txt", api: "/api/site.json" }, config: cfg.config, media: {} };
    const layout = theme.layouts.page ?? theme.layouts.post;
    if (!layout) return new Html(`<!doctype html><meta charset="utf-8"><title>${escape(title)}</title>${body.html}`);
    const page: Page = { route, type: "page", slug: "review", title, status: "draft", frontmatter: {}, body, terms: [], layout: "page", markdownUrl: "" };
    return layout({ ctx, kind: "page", route, title, description: "snypd review", page, entries: [] });
  };

  const reviewPage = (type: string, slug: string, note?: string): Response => {
    const t = target(root, cfg, type, slug);
    // The item as it stands on *its* draft branch — a person must read the version they are signing, and
    // the working tree holds only whichever draft was written last (write.ts `draftSource`).
    const source = draftSource(root, cfg, type, slug);
    if (source === undefined) return new Response("not found", { status: 404 });
    const { yaml } = splitFrontmatter(source);
    const hash = contentHash(source);
    const check = publishCheck(root, cfg, store, type, slug);
    const current = approvalOf(store, type, slug);
    const repo = Repo.open(root);
    const branch = draftBranch(type, slug);
    const onBranch = repo?.exists(branch) ? branch : undefined;
    const base = onBranch ? repo!.baseOf(onBranch) ?? "" : "";
    const diff = onBranch && base ? repo!.run("diff", `${base}...${onBranch}`, "--", t.path).stdout : repo ? repo.run("diff", "HEAD", "--", t.path).stdout : "";
    const row = (k: string, v: string) => `<tr><th style="text-align:left;padding:.15rem 1rem .15rem 0;font-weight:600">${escape(k)}</th><td>${v}</td></tr>`;
    const status = check.ok ? `<strong>ready to publish</strong>${current ? ` — approved by ${escape(current.by)} at ${escape(current.at)}` : ` — this type's policy is <code>${escape(check.policy)}</code>, no approval needed`}`
      : `<strong>${escape(check.reason ?? "not publishable")}</strong>${check.hint ? `<br><small>${escape(check.hint)}</small>` : ""}`;
    const body = new Html([
      note ? `<p role="status"><strong>${escape(note)}</strong></p>` : "",
      `<table>`,
      row("item", `<a href="${escape(t.route)}">${escape(t.route)}</a>`),
      row("file", `<code>${escape(t.path)}</code>`),
      row("version", `<code>${escape(hash.slice(0, 12))}</code>`),
      onBranch ? row("branch", `<code>${escape(onBranch)}</code> → <code>${escape(base)}</code>`) : "",
      row("state", status),
      `</table>`,
      `<h2>Frontmatter</h2><pre><code>${escape(yaml)}</code></pre>`,
      diff ? `<h2>Diff</h2><pre><code>${escape(diff)}</code></pre>` : `<h2>Diff</h2><p>No uncommitted or branched changes — this is what is already committed.</p>`,
      check.ok && current ? "" : `<form method="post" action="/_snypd/approve/${escape(type)}/${escape(slug)}"><button type="submit">Approve this version</button></form>`,
      `<p><small>Approving covers version <code>${escape(hash.slice(0, 12))}</code> only. Edit after approving and the approval no longer applies — deliberately: an agent must not be able to swap the words a human read.</small></p>`,
    ].join("\n"));
    return new Response(shell(`Review: ${t.type}/${t.slug}`, body, reviewPath(type, slug)).html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  };

  const server = Bun.serve({
    port: opts.port ?? 4321,
    hostname: opts.hostname,
    async fetch(req) {
      const url = new URL(req.url);
      const path = decodeURIComponent(url.pathname);
      if (path.includes("..")) return new Response("bad path", { status: 400 });

      const approveM = APPROVE.exec(path);
      if (approveM) {
        if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: { allow: "POST" } });
        const [, type, slug] = approveM;
        const approving = draftSource(root, cfg, type!, slug!);
        if (approving === undefined) return new Response("not found", { status: 404 });
        // Hashed from the same bytes the review page rendered, so an approval cannot be recorded against
        // a version nobody read just because another item's draft is the one checked out.
        approve(store, { type: type!, slug: slug!, hash: contentHash(approving), by: reviewerOf(req), at: new Date().toISOString() });
        return new Response(null, { status: 303, headers: { location: `/_snypd/review/${type}/${slug}?approved=1` } });
      }
      const reviewM = REVIEW.exec(path);
      if (reviewM) { await fresh(); return reviewPage(reviewM[1]!, reviewM[2]!, url.searchParams.has("approved") ? "Approved. The agent can call content.publish now." : undefined); }

      await fresh();
      const wantsMd = req.headers.get("accept")?.includes("text/markdown");
      let file = join(out, path);
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, wantsMd ? "index.md" : "index.html");
      if (!existsSync(file)) return new Response("not found", { status: 404 });
      return new Response(Bun.file(file), { headers: { "content-type": mimeOf(file), "cache-control": "no-store" } });
    },
  });

  return {
    url: `http://${server.hostname ?? "localhost"}:${server.port}`, port: server.port ?? 0, out, rebuild, dirty: () => dirty,
    stop: () => { for (const w of watchers) w.close(); server.stop(true); index.close(); },
  };
}
