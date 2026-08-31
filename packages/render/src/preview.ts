/**
 * `snypd dev` (docs/03 "no UI", docs/04 "SSR / preview"), S11 and S18e — the site as it will look
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
import { join, resolve } from "node:path";
import { loadConfig, SiteIndex, MdastCache, INDEX_DIR, ALIVE_ROUTE, MCP_FILE, ONE_SENTENCE, onboardingFacts, target, approve, approvalOf, approvals, reviewPath, contentHash, publishCheck, draftSource, splitFrontmatter, Repo, type LoadedConfig, type ApprovalStore } from "@snypd/core";
import { build, renderDoc, type BuildResult } from "./build";
import { loadTheme, type Theme, type SiteCtx, type Page, type Entry } from "./theme";
import { Html, escape } from "./jsx-runtime";
import { deskPage, type DeskActivity, type DeskDraft, type DeskFacts, type DeskOnboarding } from "./desk";
import { resolveTokens, tokensCss } from "./tokens";

export interface PreviewOptions {
  port?: number; out?: string; hostname?: string; watch?: boolean;
  /**
   * Refuse to bind anywhere but `port`. Off by default, which is the S18e fix for docs/08 §12.3: two
   * callers both defaulted to 4321 with no fallback, so a human with a preview open made every
   * `content.render_preview` in the harness return no URL at all — a port collision failing D1. A
   * scanning default is right because neither caller has an opinion about *which* port; someone who
   * types `--port=` does, and gets the error instead of a silent second address to be confused by.
   */
  strictPort?: boolean;
  /**
   * Seconds between browser reloads of a *content* page, via a `Refresh` response header; 0 or absent
   * turns it off. A header rather than a script because of decision 51's hard rule — live reload may
   * not change a published byte, and the preview's whole claim is that it serves what publishes. The
   * cost is a poll's cost: scroll position resets, which is why only the two human-facing CLI verbs
   * ask for it and no library caller does. A socket buys back the scroll position; it also buys a
   * `<script>`, so it waits for a session that wants to pay that.
   */
  reload?: number;
  /**
   * Add the preview-only strip linking back to the Desk. Response path only, never the file: `dist/`
   * has no Desk to link to, and the byte-equality test in `render.test.ts` is what holds that line.
   */
  deskLink?: boolean;
  /**
   * Where the Desk's status card gets "is a harness connected" from (S18b). A function rather than a
   * value because the answer changes under the page: `@snypd/mcp` passes its `activitySnapshot`, and a
   * standalone `snypd dev` passes nothing, which is itself the honest answer — a preview
   * nobody started from a tool call has no harness attached to it.
   */
  activity?: () => DeskActivity | undefined;
  /**
   * Seconds between the Desk's self-refreshes; 0 turns it off. The bench lane passes 0 — a meta refresh
   * firing mid-measurement would reload the page out from under axe-core and turn the a11y count into a
   * race. Nothing else sets it, so a person always gets the live card.
   */
  deskRefresh?: number;
  /**
   * `PROMPTS` from `@snypd/mcp`, for the first-run Desk to list (S18f, docs/08 §9.3).
   *
   * Passed rather than imported for the reason `activity` is: `@snypd/mcp` depends on this package, so
   * this package may not depend on it. Both callers that have prompts hand them over — the CLI's `dev`
   * and the tool that starts a session-scoped preview — and a preview started by anything else lists
   * none, which is honest rather than lossy.
   */
  prompts?: { name: string; description: string }[];
}
export interface PreviewServer { url: string; port: number; hostname: string; stop: () => void; rebuild: () => Promise<BuildResult>; out: string; dirty: () => boolean }

const REVIEW = /^\/_snypd\/review\/([a-z][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)\/?$/i;
const APPROVE = /^\/_snypd\/approve\/([a-z][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)\/?$/i;
const DESK = /^\/_snypd\/?$/;

/** The default nobody chose and everybody collided on until S18e gave it somewhere else to go. */
export const DEFAULT_PORT = 4321;

/**
 * Bind, or take the next free port. `Bun.serve` throws `EADDRINUSE` synchronously, so this is a loop and
 * not a listener dance. `port: 0` means "the OS picks" and is never scanned — every bench and test uses
 * it, so none of them can be perturbed by a stray server on this box.
 */
function bind(port: number, hostname: string | undefined, fetch: (req: Request) => Promise<Response>, strict = false, span = 20): ReturnType<typeof Bun.serve> {
  for (let p = port; p <= (strict || port === 0 ? port : port + span); p++) {
    try { return Bun.serve({ port: p, hostname, fetch }) }
    catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "EADDRINUSE" && !/EADDRINUSE|address already in use/i.test(String((e as Error).message))) throw e;
      if (p === port + span) break;
    }
  }
  const err = new Error(strict ? `port ${port} is in use` : `ports ${port}\u2013${port + span} are all in use`) as Error & { hint?: string };
  err.hint = strict ? "Drop --port to let snypd take the next free one." : "Something is holding twenty consecutive ports; pass --port=N to choose another range.";
  throw err;
}

/**
 * The strip, injected into the response and never into the file (decision 51).
 *
 * It exists because the front door was invisible: three sessions after `/_snypd` became a page, the only
 * thing that ever named it was a tool result. A person looking at their own post in a browser had no way
 * to reach the Desk except by knowing the path.
 */
const STRIP = '<a href="/_snypd" style="position:fixed;left:0;bottom:0;z-index:2147483647;margin:.5rem;padding:.3rem .6rem;border-radius:.4rem;font:600 12px/1.4 ui-sans-serif,system-ui,sans-serif;background:#111;color:#fff;text-decoration:none;opacity:.85">Snypd Desk</a>';
const withStrip = (html: string) => (html.includes("</body>") ? html.replace("</body>", `${STRIP}</body>`) : html + STRIP);

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
  let lastBuild: { routes: number; ms: number; at: number } | undefined;   // S18b: the Desk's "did it work?"

  const rebuild = async (): Promise<BuildResult> => {
    if (building) return building;
    dirty = false;
    cfg = loadConfig(root);
    // `bundle: true` is the whole of S11's deferred fix: entry files are rebuilt into single-file modules
    // whose path carries the theme hash, so a theme edit reloads the *graph* — not just the entry, with
    // its statically-imported `./shell` still coming from Bun's module cache and rendering the old page.
    theme = await loadTheme(cfg, { bundle: true });
    building = build(root, { out, cfg, index, drafts: true, cache: new MdastCache(index.mdastStore()) });
    try {
      const r = await building;
      lastBuild = { routes: r.routes, ms: r.ms, at: Date.now() };
      return r;
    } finally { building = undefined; }
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
  const siteCtx = (): SiteCtx => {
    const tokens = resolveTokens(cfg.config.theme.tokens as Parameters<typeof resolveTokens>[0]);
    const css = tokensCss(tokens) + (theme.css ?? "");
    return { site: { name: cfg.config.site.name, url: cfg.config.site.url.replace(/\/$/, ""), description: cfg.config.site.description }, tokens, theme: { name: theme.name }, assets: { css: css ? "/assets/theme.css" : undefined, feed: "/feed.xml", llms: "/llms.txt", api: "/api/site.json" }, config: cfg.config, media: {} };
  };

  const shell = (title: string, body: Html, route: string) => {
    const ctx = siteCtx();
    const layout = theme.layouts.page ?? theme.layouts.post;
    if (!layout) return new Html(`<!doctype html><meta charset="utf-8"><title>${escape(title)}</title>${body.html}`);
    const page: Page = { route, type: "page", slug: "review", title, status: "draft", frontmatter: {}, body, terms: [], layout: "page", markdownUrl: "" };
    return layout({ ctx, kind: "page", route, title, description: "snypd review", page, entries: [] });
  };

  const reviewPage = (type: string, slug: string, note?: string): Response => {
    const t = target(root, cfg, type, slug);
    // The item as it stands on the drafts branch, which since S17b is the working tree — a person must
    // read the version they are signing, and every draft in flight is in it (write.ts `draftSource`).
    const source = draftSource(root, cfg, type, slug);
    if (source === undefined) return new Response("not found", { status: 404 });
    const { yaml } = splitFrontmatter(source);
    const hash = contentHash(source);
    const check = publishCheck(root, cfg, store, type, slug);
    const current = approvalOf(store, type, slug);
    const repo = Repo.open(root);
    const branch = repo?.branch();
    const base = repo?.publishBase();
    // What publishing this item would change on the branch the site deploys from — committed drafts and
    // anything still uncommitted, in one diff. Comparing two branches would hide the latter, and since
    // S17b every draft lives in this tree, so the tree is what the reviewer is being asked to sign.
    const diff = repo && base && base !== branch ? repo.run("diff", base, "--", t.path).stdout : repo ? repo.run("diff", "HEAD", "--", t.path).stdout : "";
    const row = (k: string, v: string) => `<tr><th style="text-align:left;padding:.15rem 1rem .15rem 0;font-weight:600">${escape(k)}</th><td>${v}</td></tr>`;
    const status = check.ok ? `<strong>ready to publish</strong>${current ? ` — approved by ${escape(current.by)} at ${escape(current.at)}` : ` — this type's policy is <code>${escape(check.policy)}</code>, no approval needed`}`
      : `<strong>${escape(check.reason ?? "not publishable")}</strong>${check.hint ? `<br><small>${escape(check.hint)}</small>` : ""}`;
    const body = new Html([
      note ? `<p role="status"><strong>${escape(note)}</strong></p>` : "",
      `<p><a href="/_snypd">\u2190 Snypd Desk</a></p>`,
      `<table>`,
      row("item", `<a href="${escape(t.route)}">${escape(t.route)}</a>`),
      row("file", `<code>${escape(t.path)}</code>`),
      row("version", `<code>${escape(hash.slice(0, 12))}</code>`),
      branch && base && branch !== base ? row("branch", `<code>${escape(branch)}</code> → <code>${escape(base)}</code>`) : "",
      row("state", status),
      `</table>`,
      // `tabindex="0"` for the same reason the viz wrapper carries it (S14, decision 32): a `pre` that
      // scrolls is a scrollable region, and a scrollable region a keyboard cannot reach is an axe
      // `scrollable-region-focusable` violation — which is exactly how S18b's Desk lane found this one,
      // the review page having shipped since S11 without any browser suite ever looking at it.
      `<h2>Frontmatter</h2><pre tabindex="0"><code>${escape(yaml)}</code></pre>`,
      diff ? `<h2>Diff</h2><pre tabindex="0"><code>${escape(diff)}</code></pre>` : `<h2>Diff</h2><p>No uncommitted or branched changes — this is what is already committed.</p>`,
      check.ok && current ? "" : `<form method="post" action="/_snypd/approve/${escape(type)}/${escape(slug)}"><button type="submit">Approve this version</button></form>`,
      `<p><small>Approving covers version <code>${escape(hash.slice(0, 12))}</code> only. Edit after approving and the approval no longer applies — deliberately: an agent must not be able to swap the words a human read.</small></p>`,
    ].join("\n"));
    return new Response(shell(`Review: ${t.type}/${t.slug}`, body, reviewPath(type, slug)).html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  };

  // ── the empty state ────────────────────────────────────────────────────────
  /**
   * The index route while the site has zero items (`07` decision 52, S18f).
   *
   * `initSite` writes a config and empty directories and no content, so the first thing a new site
   * showed a person was an empty list — the weakest possible first impression of a themed CMS, at the
   * exact moment they are deciding whether this was worth installing.
   *
   * **Rendered, never scaffolded.** The obvious fix is a welcome post, and it is wrong: a file every new
   * site must delete is a file that ships to production when somebody forgets, and WordPress's "Hello
   * world!" is the demonstration of that rather than the counterexample. This page is a *response*. It
   * exists nowhere on disk, `build()` never emits it, and it disappears the moment there is one real
   * item — nothing to delete, and nothing that can leak into `dist/`.
   *
   * It goes through `renderDoc` and the theme's own layout for the same reason: a hand-written HTML
   * splash would demonstrate snypd's taste in splashes. This demonstrates the installed theme rendering
   * five of the thirteen primitives, which is the claim the product actually makes.
   */
  const EMPTY_MARK = "data-snypd-empty-state";
  const emptySource = (): string => `:::tldr
This site works. It has no content yet — so this page is being **rendered for you now** rather than read from a file, and it disappears the moment the first post exists.
:::

Everything here is written through MCP, from the harness you already have open. There is no editor on this site and no button that writes.

:::steps
1. **Say what you want.** Ask your agent for a post. It reads the vocabulary first — thirteen primitives — then writes.
2. **Read it here.** The draft appears on the Desk with a review link. The preview serves exactly what would publish.
3. **Approve the version you read.** Publishing is yours; an approval is bound to those bytes and lapses if they change.
:::

:::callout{kind="note" title="What you are looking at"}
The blocks on this page are the theme rendering the vocabulary — a \`tldr\`, a \`steps\`, this \`callout\`, and the questions below. Your posts get the same components, because a theme implements the vocabulary rather than a stylesheet implementing your posts.
:::

:::faq
### Where does the content live?
Markdown files under \`content/\`, in git. The database in \`.snypd/\` is a disposable index — delete it and the site is unchanged.

### Can I edit a post by hand?
Yes, they are files. But the tools lint what they write, and the lint is most of what makes a theme able to render it.

### How do I get rid of this page?
Write something. There is no file to delete.
:::`;

  const emptyIndex = (): Response => {
    const ctx = siteCtx();
    const page: Entry = { route: "/", type: "page", slug: "index", title: cfg.config.site.name, status: "draft", frontmatter: {} };
    const { body } = renderDoc(emptySource(), { theme, ctx, page, cache: new MdastCache(index.mdastStore()) });
    // The strip says who can see it, in the response and never in a file — the same rule the Desk link
    // and the reload header live by.
    const note = new Html(`<p ${EMPTY_MARK} role="status"><strong>Only you can see this.</strong> The site has no content yet, so this page is being rendered by <code>snypd dev</code>. It is not in <code>dist/</code> and it will not publish.</p>`);
    return new Response(shell(cfg.config.site.name, new Html(note.html + body.html), "/").html, { headers: pageHeaders() });
  };

  // ── the Desk ───────────────────────────────────────────────────────────────
  /**
   * Everything the Desk shows, gathered without touching git (S18b, decision 45).
   *
   * The item list is the SQLite index; each item's state is `publishCheck`, which for a file that is in
   * the working tree — and since S17b every draft is — reads that file and `approvals.json` and stops.
   * `Repo` is reached only when a file is *missing*, which on this path it is not. That is what keeps
   * the Desk inside `preview.ttfb ≤ 50 ms`, and `desk.test` renders one in a directory that is not a
   * repo at all, so the day somebody adds a `git status` here the suite says so.
   *
   * `approvals.json` is re-read once per draft rather than cached. It is a sub-kilobyte file and the
   * draft count is small, but the real reason is correctness: a standalone `snypd dev` and
   * an MCP server are two processes over one store, and a cache that made this page fast would make it
   * wrong the first time the other process approved something.
   */
  const deskFacts = (): DeskFacts => {
    const statuses = cfg.config.statuses as Record<string, { public?: boolean }> | undefined;
    const inFlight = index.files().filter((f) => f.status !== "trashed" && statuses?.[f.status]?.public !== true);
    const drafts: DeskDraft[] = inFlight
      .sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0))
      .map((f) => {
        const check = publishCheck(root, cfg, store, f.type, f.slug);
        const state = check.ok
          ? check.approval ? `ready to publish — approved by ${check.approval.by}` : "ready to publish"
          : (check.reason ?? "not publishable");
        return { type: f.type, slug: f.slug, title: f.title, status: f.status, route: f.route, reviewUrl: reviewPath(f.type, f.slug), ready: check.ok, state, updated: f.mtime };
      });
    const tokens = resolveTokens(cfg.config.theme.tokens as Parameters<typeof resolveTokens>[0]);
    const css = tokensCss(tokens) + (theme.css ?? "");
    const facts = onboardingFacts(root, { cfg, items: index.files({}).filter((f) => f.status !== "trashed").length });
    return {
      onboarding: onboarding(facts),
      site: { name: cfg.config.site.name, url: cfg.config.site.url },
      theme: { name: theme.name, chain: theme.chain.map((l) => l.name), coverage: theme.coverage },
      drafts,
      // In-process first, then the file. A preview started by a tool call has the live record and is
      // exact; a `snypd dev` in its own process has only what the server wrote, and before S18f it had
      // nothing at all — which is why the status card said "nothing has called this server yet" through
      // a full MCP session, on the page whose one job is to answer that (docs/08 §12.9).
      activity: opts.activity?.() ?? fromHeartbeat(facts),
      build: lastBuild,
      previewUrl: `http://${server.hostname ?? "localhost"}:${server.port}`,
      css: css ? "/assets/theme.css" : undefined,
      refresh: opts.deskRefresh,
    };
  };

  /**
   * The six derived facts, from `@snypd/core` (S18f, `07` decision 52 and docs/08 decision 64).
   *
   * Gathered here and rendered in `desk.ts`, so the page stays a pure function and this stays the only
   * place that touches disk for it. `onboardingFacts` costs four `existsSync`, one small `JSON.parse`
   * and a `process.kill(pid, 0)`; the item count and the config it is handed are already in hand. The
   * `.mcp.json` block is read only when there is a reason to show it, which on a working site is never.
   */
  const onboarding = (f: ReturnType<typeof onboardingFacts>): DeskOnboarding => {
    const sound = f.registration.present && f.registration.names && !f.registration.missingCommand;
    let mcpJson: string | undefined;
    if (!sound || f.harness !== "connected") {
      try { mcpJson = readFileSync(join(root, MCP_FILE), "utf8").trimEnd() } catch { mcpJson = undefined }
    }
    return {
      config: f.config, git: f.git, harness: f.harness, items: f.items, placeholderUrl: f.placeholderUrl,
      registration: { present: f.registration.present, names: f.registration.names, missingCommand: f.registration.missingCommand, command: f.registration.command },
      mcpJson, prompts: opts.prompts, sentence: ONE_SENTENCE,
    };
  };

  /** The disk record as the status card's shape — and only while the process that wrote it is alive. */
  const fromHeartbeat = (f: ReturnType<typeof onboardingFacts>): DeskActivity | undefined => {
    const rec = f.heartbeat;
    if (!rec || f.harness === "stale" || f.harness === "never") return undefined;
    return { calls: rec.calls, lastMethod: rec.lastMethod, lastAt: rec.lastAt, since: rec.since ?? rec.startedAt, client: rec.client };
  };

  /**
   * What a *content* page gets that its file does not: the reload instruction and the way back to the
   * Desk. Both live here and only here — `dist/` is the same bytes, and `render.test.ts` asserts it.
   */
  const pageHeaders = (): Record<string, string> => {
    const h: Record<string, string> = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" };
    if (opts.reload) h.refresh = String(opts.reload);
    return h;
  };

  const handler = async (req: Request): Promise<Response> => {
      const url = new URL(req.url);
      const path = decodeURIComponent(url.pathname);
      if (path.includes("..")) return new Response("bad path", { status: 400 });

      // Cheap on purpose: `liveDev` calls this to prove that whatever holds this port is a snypd
      // preview *for this root*, and a probe that had to build a page would make finding a server cost
      // more than starting one. It answers before `fresh()`, so a stale build cannot make it hang.
      if (path === ALIVE_ROUTE)
        return Response.json({ snypd: true, pid: process.pid, root: resolve(root), url: `http://${server.hostname ?? "localhost"}:${server.port}`, startedAt }, { headers: { "cache-control": "no-store" } });

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
      // The two `/_snypd` pages take neither: they are the Desk, so a strip pointing at it is noise, and
      // the Desk already carries its own meta refresh (`deskRefresh`) which a header would double.
      if (DESK.test(path)) { await fresh(); return new Response(deskPage(deskFacts()).html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }); }
      const reviewM = REVIEW.exec(path);
      if (reviewM) { await fresh(); return reviewPage(reviewM[1]!, reviewM[2]!, url.searchParams.has("approved") ? "Approved. The agent can call content.publish now." : undefined); }

      await fresh();
      // Before the file, and only while there is nothing: an index with zero items is the one route
      // whose file is a worse answer than a rendered one. `wantsMd` is checked first, because an agent
      // asking for the twin wants the real (empty) index and not a page written at it.
      const wantsMd = req.headers.get("accept")?.includes("text/markdown");
      if (!wantsMd && (path === "/" || path === "/index.html") && index.files({}).every((f) => f.status === "trashed")) return emptyIndex();
      let file = join(out, path);
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, wantsMd ? "index.md" : "index.html");
      if (!existsSync(file)) return new Response("not found", { status: 404 });
      // Only HTML is decorated. The markdown twin is what an agent reads and the JSON API is what a
      // program reads; a strip in either would be a preview-only difference in the one surface whose
      // whole point is that it is the same text the published site serves.
      // `Bun.file` stays zero-copy unless the strip is asked for — the `preview.ttfb` lane asks for
      // neither option, so the number it has reported since S11 is still measuring the same path.
      if (file.endsWith(".html")) return new Response(opts.deskLink ? withStrip(await Bun.file(file).text()) : Bun.file(file), { headers: pageHeaders() });
      return new Response(Bun.file(file), { headers: { "content-type": mimeOf(file), "cache-control": "no-store" } });
  };

  const startedAt = new Date().toISOString();
  const server = bind(opts.port ?? DEFAULT_PORT, opts.hostname, handler, opts.strictPort);

  return {
    url: `http://${server.hostname ?? "localhost"}:${server.port}`, port: server.port ?? 0, hostname: server.hostname ?? "localhost", out, rebuild, dirty: () => dirty,
    stop: () => { for (const w of watchers) w.close(); server.stop(true); index.close(); },
  };
}
