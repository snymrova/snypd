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
import { loadConfig, SiteIndex, MdastCache, INDEX_DIR, ALIVE_ROUTE, LIVE_ROUTE, MCP_FILE, ONE_SENTENCE, onboardingFacts, target, approve, approvalOf, approvals, reviewPath, contentHash, publishCheck, draftSource, splitFrontmatter, Repo, PUSH_ROUTE, pushState, pushSite, type PushState, type LoadedConfig, type ApprovalStore } from "@snypd/core";
import { build, renderDoc, type BuildResult } from "./build";
import { loadTheme, type Theme, type SiteCtx, type Page, type Entry } from "./theme";
import { Html, escape } from "./jsx-runtime";
import { deskPage, type DeskActivity, type DeskDraft, type DeskFacts, type DeskOnboarding, type DeskPush } from "./desk";
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
   * How a *content* page learns it is out of date. Absent or 0 turns it off; no library caller asks for
   * either mode, and both human-facing CLI verbs ask for `"watch"`.
   *
   *   `"watch"`  the change stream (S18k). The page holds an `EventSource` on `LIVE_ROUTE` and reloads
   *              when the watcher says a rebuild is owed — so a quiet tree costs one idle connection
   *              and nothing else, and the reload lands on the edit rather than up to N seconds after it.
   *   `N`        the old fixed poll: a `Refresh: N` response header, kept because it is the only mode
   *              that needs nothing from the client, and a page measured with a script in it is a page
   *              nobody can compare to the S11 numbers.
   *
   * `"watch"` costs the `<script>` that decision 51 spent S18e refusing, and the amendment recorded there
   * says why the refusal did not survive contact: the rule's *reason* is that the preview serves what
   * publishes, and what proves that is `render.test.ts`'s byte-equality over `.snypd/preview` against
   * `dist/` — a disk claim, which a response-path injection cannot touch, exactly as the Desk-link strip
   * already does not. The poll it replaces was not free of a cost either; it was paid by the person, every
   * two seconds, in a scroll position. Nothing enters `dist/`, and `page.js.kb` measures `dist/`.
   */
  reload?: number | "watch";
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

/**
 * How long the push card's git facts stand before they are read again (S19a).
 *
 * The Desk inherits `preview.ttfb ≤ 50 ms` and `pushState` is four `git` spawns, so it may not run per
 * request. It does not need to: what it reports — a remote, a tracking ref, a commit count — moves when
 * *this* process pushes, which invalidates the cache directly, or when something outside it does, which
 * is a person at a terminal and can wait three seconds. The Desk's own meta refresh is 10 s, so the
 * steady-state cost of the card is one read per page a person is actually looking at.
 */
const PUSH_TTL_MS = 3_000;

/** The default nobody chose and everybody collided on until S18e gave it somewhere else to go. */
export const DEFAULT_PORT = 4321;

/**
 * How long the watcher waits for an edit to stop moving before it announces one (S18k). Saving one file
 * in an editor is rarely one fs event — a write, a rename off a temp file, a mode change — and a theme
 * edit touches several files at once. 80 ms is under the threshold where a person reads the reload as a
 * response to what they just did, and long enough that the burst is one announcement.
 */
const SETTLE_MS = 80;

/**
 * A comment down an idle stream, often enough that nothing between the page and the server decides the
 * connection is dead. SSE comments are not events, so this never reaches `onmessage` and never reloads
 * anything; it exists so that a preview left open over lunch is still listening after it.
 */
const HEARTBEAT_MS = 25_000;

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

/**
 * The change listener, injected into the response and never into the file — the same rule, and the same
 * seam, as the strip above (decision 51 as amended in S18k).
 *
 * Three lines, and each is one of the two things a dev reload has to get right. `onmessage` is the
 * ordinary case: the watcher saw an edit, so reload. `onerror` + `onopen` is the case a poll got for free
 * and a socket has to be told about — the server went away and came back, which is a restart, and the page
 * in front of the person is from the build before it. `EventSource` reconnects on its own, so that pair is
 * the whole of it; there is no retry loop here because the platform already has one.
 *
 * A full `location.reload()` and not a swap: the preview's claim is that it serves what publishes, and a
 * page assembled by patching the DOM is a page nobody can hold to that. Browsers restore scroll on a
 * reload, which is the cost the `Refresh` poll could not avoid and this one does not pay.
 */
const LIVE = `<script data-snypd-live>(()=>{let d=0;const e=new EventSource(${JSON.stringify(LIVE_ROUTE)});e.onmessage=()=>location.reload();e.onerror=()=>{d=1};e.onopen=()=>{if(d){d=0;location.reload()}}})()</script>`;

/** Both preview-only additions go in before `</body>`, in one pass, or on the end if there is no body. */
const inject = (html: string, snippet: string) =>
  snippet === "" ? html : html.includes("</body>") ? html.replace("</body>", () => `${snippet}</body>`) : html + snippet;

const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };
const mimeOf = (f: string) => MIME[f.slice(f.lastIndexOf("."))] ?? "application/octet-stream";

/** Who did it, when asked from a browser. Not an identity system: the audit trail is the git trailer. */
const reviewerOf = (req: Request, where = "the review page") => req.headers.get("x-snypd-reviewer") || process.env.SNYPD_REVIEWER || `a human at ${where}`;

export async function preview(root: string, opts: PreviewOptions = {}): Promise<PreviewServer> {
  const out = opts.out ?? join(root, INDEX_DIR, "preview");
  let cfg: LoadedConfig = loadConfig(root);
  const index = await SiteIndex.open(root, join(root, INDEX_DIR, "preview.sqlite"));
  const store: ApprovalStore = approvals(root);   // shared with the MCP server; the preview index is not (see write.ts)
  let theme!: Theme;
  let dirty = false, building: Promise<BuildResult> | undefined;
  let lastBuild: { routes: number; ms: number; at: number } | undefined;   // S18b: the Desk's "did it work?"
  // S19a: the push card. `cached` is the git half (see PUSH_TTL_MS); `last` is what the button did, kept
  // in memory because it is a fact about this session rather than about the repo — a restarted preview
  // has nothing to say about a push it did not make.
  let pushCache: { at: number; state: PushState } | undefined;
  let lastPush: DeskPush["last"] | undefined;

  /**
   * The change stream's whole state (S18k). `generation` counts announced changes, not fs events: one save
   * in an editor is a rename and two writes, and a page that reloaded three times per keystroke would be
   * worse than the poll it replaces — so `touch` restarts a short timer and only the settled edge counts.
   * The number goes over the wire because a stream that says *something* changed is easier to reason
   * about in a log than one that only says something did, not because a client compares it.
   */
  const live = opts.reload === "watch";
  let generation = 0;
  const listeners = new Set<(gen: number) => void>();
  let settling: ReturnType<typeof setTimeout> | undefined;
  const announce = () => { settling = undefined; generation++; for (const l of [...listeners]) l(generation); };

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
    // The flag is the build's business and the announcement is the browser's; a preview nobody is
    // listening to sets the first and never starts a timer for the second. `unref` so a settling edit
    // cannot be the reason the process outlives its last request.
    const touch = () => {
      dirty = true;
      if (!live) return;
      if (settling) clearTimeout(settling);
      settling = setTimeout(announce, SETTLE_MS);
      settling.unref?.();
    };
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
    return new Response(inject(shell(cfg.config.site.name, new Html(note.html + body.html), "/").html, extras), { headers: pageHeaders() });
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
  /**
   * The push card's facts, or nothing at all (S19a).
   *
   * `existsSync(.git)` is the gate rather than `Repo.open`, which spawns: a directory with no repo has
   * no push card and pays nothing for it, which is the same shape the S18b test pins — the Desk renders
   * in a directory that is not a repo, and now also proves it asks git nothing there.
   */
  const pushFacts = (drafts: number): DeskPush | undefined => {
    if (!existsSync(join(root, ".git"))) return undefined;
    const now = Date.now();
    if (!pushCache || now - pushCache.at > PUSH_TTL_MS) pushCache = { at: now, state: pushState(root, cfg) };
    const st = pushCache.state;
    // `drafts` is the one number that must never be cached: it is the index's, it is free, and a card
    // saying "2 drafts stay local" while three are in flight would be wrong in the direction that matters.
    return { ...st, deploy: st.deploy, drafts, route: PUSH_ROUTE, last: lastPush };
  };

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
      push: pushFacts(drafts.length),
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
  /**
   * The preview-only additions, in the response and never in the file: the way back to the Desk and the
   * change listener. One string, so the injection is one pass over the HTML and `Bun.file` stays
   * zero-copy for the caller that asks for neither — which is still every library caller and the
   * `preview.ttfb` lane, so the number it has reported since S11 is measuring the same path it was.
   */
  const extras = (opts.deskLink ? STRIP : "") + (live ? LIVE : "");

  const pageHeaders = (): Record<string, string> => {
    const h: Record<string, string> = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" };
    if (typeof opts.reload === "number" && opts.reload > 0) h.refresh = String(opts.reload);
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

      /**
       * The change stream (S18k). Answers before `fresh()` for the same reason `/_snypd/alive` does: this
       * is the route that must never be the slow one, and a listener that had to wait out a rebuild to be
       * *registered* would miss the change it was opened for.
       *
       * Registration is idempotent on both ends — Bun calls `cancel` when the socket drops, and the abort
       * signal covers the shapes it does not — because the one thing this set may not do is grow by a
       * listener every time a page is opened and closed.
       */
      if (path === LIVE_ROUTE) {
        if (!live) return new Response("live reload is off", { status: 404 });
        const enc = new TextEncoder();
        let send: ((gen: number) => void) | undefined;
        let beat: ReturnType<typeof setInterval> | undefined;
        const done = () => {
          if (send) { listeners.delete(send); send = undefined; }
          if (beat) { clearInterval(beat); beat = undefined; }
        };
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const write = (text: string) => { try { controller.enqueue(enc.encode(text)) } catch { done() } };
            // The opening comment flushes the headers, so `EventSource` fires `open` on connect rather
            // than on the first change — which is what lets the page tell a reconnect from a first load.
            write(`retry: 1000\n: snypd live, at generation ${generation}\n\n`);
            send = (gen) => write(`data: ${gen}\n\n`);
            listeners.add(send);
            beat = setInterval(() => write(":\n\n"), HEARTBEAT_MS);
            beat.unref?.();
          },
          cancel: done,
        });
        req.signal.addEventListener("abort", done);
        return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" } });
      }

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
      /**
       * **The push** (S19a, decision 44) — the one request in this server that reaches the internet.
       *
       * Three guards, in the order they are cheap:
       *
       *  - `POST` only, so a link, a prefetch or a crawler cannot deploy a site.
       *  - **Same-origin only.** A form on any page in the same browser can POST here, and this one has a
       *    consequence outside the machine, so a cross-site `Sec-Fetch-Site` is refused. The header is
       *    absent in `curl` and in every non-browser client, which is deliberately allowed: the threat
       *    being closed is a page the person did not write, not a terminal they typed in.
       *  - `pushSite` re-checks every blocker itself. The card decides whether to draw a button; it does
       *    not decide whether a push is allowed, because the state can move between a render and a click.
       */
      if (path === PUSH_ROUTE) {
        if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: { allow: "POST" } });
        const site = req.headers.get("sec-fetch-site");
        if (site && site !== "same-origin" && site !== "none")
          return new Response("cross-site push refused", { status: 403 });
        const r = pushSite(root, cfg, { who: reviewerOf(req, "the Desk") });
        lastPush = { ok: r.ok, at: Date.now(), sent: r.sent, by: r.by, reason: r.reason, hint: r.hint };
        pushCache = undefined;   // the tracking ref moved, or git just told us why it did not
        return new Response(null, { status: 303, headers: { location: "/_snypd" } });
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
      if (file.endsWith(".html")) return new Response(extras ? inject(await Bun.file(file).text(), extras) : Bun.file(file), { headers: pageHeaders() });
      return new Response(Bun.file(file), { headers: { "content-type": mimeOf(file), "cache-control": "no-store" } });
  };

  const startedAt = new Date().toISOString();
  const server = bind(opts.port ?? DEFAULT_PORT, opts.hostname, handler, opts.strictPort);

  return {
    url: `http://${server.hostname ?? "localhost"}:${server.port}`, port: server.port ?? 0, hostname: server.hostname ?? "localhost", out, rebuild, dirty: () => dirty,
    stop: () => {
      for (const w of watchers) w.close();
      if (settling) { clearTimeout(settling); settling = undefined; }
      listeners.clear();
      server.stop(true); index.close();
    },
  };
}
