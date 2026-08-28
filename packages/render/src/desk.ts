/**
 * **Snypd Desk** — the operator's half of the surface (S18b, decisions 44–45).
 *
 * `/_snypd` has served two loose routes since S11 — `review/{type}/{slug}` and `approve/…`. This is
 * that namespace grown up into a page, and the page answers the one question a person actually arrives
 * with: *did it work?* Is a harness connected, what is in flight, what theme is it wearing.
 *
 * What the Desk may **not** do is the whole of decision 44. There is no authoring here, no theme
 * switcher, no config editor. Approving words an agent wrote is not editing them, which is precisely
 * how D6's "edited only via MCP" stays literally true with a web page in the product. The alternative
 * is an admin app — every other CMS ships one — and it is refused because a second way to write means
 * every feature is built twice, and the MCP surface stops being the product the moment there is a
 * better way to use it.
 *
 * Two consequences are structural rather than editorial:
 *
 * - **Approval lives on the review page, never here.** A row links to `/_snypd/review/…`; it carries
 *   no approve button of its own. An approval is bound to the bytes a human *read* (`contentHash` of
 *   the source the review page rendered), and a button next to a one-line summary would quietly sever
 *   that — the reviewer would be signing a title, not a post.
 * - **The theme card is read-only and says which MCP call changes it.** A control here would be the
 *   first brick of the admin app.
 *
 * Three constraints shape the code:
 *
 * 1. **0 KB JS** (decision 26). No `<script>`, ever. The status card refreshes with `<meta
 *    http-equiv>`, which decision 45 chose over a socket: what it reports moves on the order of
 *    seconds and is read once, so the polling a human would not notice is the polling that costs
 *    nothing.
 * 2. **`preview.ttfb ≤ 50 ms`** (D2). The Desk inherits the preview's budget rather than getting one
 *    of its own, so it may not shell out to git per request. This module is pure — it takes facts and
 *    returns HTML — and `preview.ts` gathers those facts from the index and the working tree. The test
 *    that renders a Desk in a directory which is not a git repo at all is what keeps it that way.
 * 3. **Never on the `initialize` path.** Nothing here is reachable from `server.ts`; the listener
 *    binds after `initialize` has already answered.
 *
 * The Desk renders its own document rather than going through the theme's page layout, which the
 * review page does use. A dashboard wearing the public site's nav and footer misrepresents where you
 * are — and owning `<head>` is what makes the meta refresh valid markup instead of a body injection.
 * It links the same stylesheet the shell does, so it inherits the theme's type and colour without
 * inheriting its chrome.
 */
import { Html, escape } from "./jsx-runtime";
import type { Theme } from "./theme";

/**
 * Structural on purpose: `@snypd/mcp` passes its own `activitySnapshot()` straight in and neither
 * package imports the other. The seam is a shape, not a dependency.
 */
export interface DeskActivity { calls: number; lastMethod?: string; lastAt?: number; since?: number; client?: string }

/** One item that is not public yet, and what stands between it and publishing. */
export interface DeskDraft {
  type: string; slug: string; title: string; status: string;
  /** Where it will live once published — the preview serves it now. */
  route: string;
  reviewUrl: string;
  /** `publishCheck().ok`: nothing further is needed from a human. */
  ready: boolean;
  /** That check in a person's words: "ready to publish", "needs a human", "changed after approval". */
  state: string;
  updated?: number;
}

export interface DeskFacts {
  site: { name: string; url: string };
  theme: { name: string; chain: string[]; coverage: Theme["coverage"] };
  drafts: DeskDraft[];
  /** Absent, or `calls: 0`, means nothing has spoken to this server yet — the case the card exists for. */
  activity?: DeskActivity;
  build?: { routes: number; ms: number; at: number };
  previewUrl: string;
  /** The theme stylesheet, if the build emitted one. */
  css?: string;
  /** Seconds between self-refreshes. 0 disables it, which is how the bench measures a still page. */
  refresh?: number;
}

const ago = (at: number | undefined, now: number): string => {
  if (!at) return "never";
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 1) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};

const card = (title: string, rows: [string, string][], note?: string) => [
  `<section class="card"><h2>${escape(title)}</h2><table>`,
  ...rows.map(([k, v]) => `<tr><th scope="row">${escape(k)}</th><td>${v}</td></tr>`),
  `</table>${note ? `<p class="note">${note}</p>` : ""}</section>`,
].join("");

/**
 * The Desk's own stylesheet, inline and small.
 *
 * Deliberately not in the theme: a theme author cannot break the operator's page, and the operator's
 * page cannot drift when a theme is swapped mid-session. Every colour is a token with a **`light-dark()`
 * pair** as its fallback, and the Desk paints its own `background` and `color` rather than trusting the
 * theme to have done it.
 *
 * That is not defensiveness, it is a caught bug: the first version used flat light-mode literals for
 * `.ok` and `.wait`, and `desk.a11y.violations` opened at 2 — headless Chrome reports
 * `prefers-color-scheme: dark`, so those three labels were dark green and dark amber on `editorial`'s
 * #12110f. The public routes passed because the theme states every colour as a pair; the Desk did not,
 * because it brings its own. A page that supplies its own colours owes both schemes.
 */
const STYLE = `
:root{color-scheme:light dark}
body{margin:0;background:var(--color-bg,light-dark(#fdfcfa,#12110f));color:var(--color-text,light-dark(#1a1815,#e8e4dc))}
.desk{max-width:58rem;margin:0 auto;padding:1.5rem 1rem 4rem;line-height:1.5}
.desk h1{margin:0 0 .25rem;font-size:1.5rem}
.desk .sub{margin:0 0 2rem;color:var(--color-muted,light-dark(#5a5a5a,#9a9287))}
.desk .card{margin:0 0 1.5rem;padding:1rem 1.25rem;border:1px solid var(--color-border,light-dark(#dcdcdc,#2e2b26));border-radius:.5rem}
.desk .card h2{margin:0 0 .75rem;font-size:.8125rem;letter-spacing:.06em;text-transform:uppercase;color:var(--color-muted,light-dark(#5a5a5a,#9a9287))}
.desk table{border-collapse:collapse;width:100%}
.desk th{text-align:left;font-weight:600;padding:.25rem 1.5rem .25rem 0;vertical-align:top;white-space:nowrap;width:1%}
.desk td{padding:.25rem 0;vertical-align:top}
.desk .note{margin:.75rem 0 0;color:var(--color-muted,light-dark(#5a5a5a,#9a9287));font-size:.875rem}
.desk .ok{color:var(--color-ok,light-dark(#0a6b2d,#7ee0a4));font-weight:600}
.desk .wait{color:var(--color-wait,light-dark(#8a5a00,#f0b74e));font-weight:600}
.desk ol{margin:0;padding:0;list-style:none}
.desk li{padding:.7rem 0;border-top:1px solid var(--color-border,light-dark(#dcdcdc,#2e2b26))}
.desk li:first-child{border-top:0;padding-top:0}
.desk .title{font-weight:600}
.desk .meta{color:var(--color-muted,light-dark(#5a5a5a,#9a9287));font-size:.875rem}
.desk footer{margin-top:2.5rem;padding-top:1rem;border-top:1px solid var(--color-border,light-dark(#dcdcdc,#2e2b26));color:var(--color-muted,light-dark(#5a5a5a,#9a9287));font-size:.875rem}
@media (max-width:30rem){.desk th{white-space:normal}}
`.trim();

/** The Desk as one document. `now` is a parameter so the page is deterministic under test. */
export function deskPage(f: DeskFacts, now: number = Date.now()): Html {
  const a = f.activity;
  const connected = !!a && a.calls > 0;

  const harness: [string, string][] = connected
    ? [
        ["harness", `<span class="ok">connected</span>${a!.client ? ` — <code>${escape(a!.client)}</code>` : ""}`],
        ["last call", `<code>${escape(a!.lastMethod ?? "—")}</code> · ${escape(ago(a!.lastAt, now))}`],
        ["calls", `${a!.calls} since ${escape(ago(a!.since, now))}`],
      ]
    : [["harness", `<span class="wait">nothing has called this server yet</span>`]];

  const status = card("Status", [
    ...harness,
    ["preview", `<a href="/">${escape(f.previewUrl)}</a>`],
    ["build", f.build
      ? `${f.build.routes} route${f.build.routes === 1 ? "" : "s"} in ${Math.round(f.build.ms)} ms · ${escape(ago(f.build.at, now))}`
      : "not built yet"],
    ["site", `${escape(f.site.name)} — <code>${escape(f.site.url)}</code>`],
  ], connected
    ? undefined
    // The one instruction no prompt of ours can deliver: a harness that has not loaded the server
    // cannot be told to load it by the server (S18a). So it is said here, where a person is looking.
    : `A harness reads <code>.mcp.json</code> when it starts. If you have just run <code>snypd init</code>, restart Claude Code, Cursor or Codex — this line turns green on its first call.`);

  const inFlight = f.drafts.length
    ? `<section class="card"><h2>In flight (${f.drafts.length})</h2><ol>${f.drafts.map((d) => [
        `<li>`,
        `<div class="title"><a href="${escape(d.reviewUrl)}">${escape(d.title || `${d.type}/${d.slug}`)}</a></div>`,
        `<div class="meta"><code>${escape(d.type)}/${escape(d.slug)}</code> · ${escape(d.status)}`,
        d.updated ? ` · ${escape(ago(d.updated, now))}` : "",
        ` · <a href="${escape(d.route)}">preview</a></div>`,
        `<div class="${d.ready ? "ok" : "wait"}">${escape(d.state)}</div>`,
        `</li>`,
      ].join("")).join("")}</ol></section>`
    : `<section class="card"><h2>In flight</h2><p class="note">Nothing in flight. Drafts appear here the moment an agent writes one — ask it to create a post, then reload.</p></section>`;

  const cov = f.theme.coverage;
  const count = (s: string) => cov.filter((c) => c.status === s).length;
  const missing = count("missing"), inherited = count("inherited"), own = count("own");
  const parent = f.theme.chain.length > 1 ? f.theme.chain[f.theme.chain.length - 1] : undefined;
  const theme = card("Theme", [
    ["name", `<code>${escape(f.theme.name)}</code>`],
    ...(f.theme.chain.length > 1 ? ([["chain", f.theme.chain.map((n) => `<code>${escape(n)}</code>`).join(" → ")]] as [string, string][]) : []),
    // `editorial` renders 13/13 with zero `.tsx` of its own (S12), so "0 own, 13 inherited" is the
    // normal case for a well-behaved theme, not a deficiency — the copy says so rather than implying
    // a score. Only a *missing* primitive is a problem, because that one falls back to generic markup.
    ["coverage", missing === 0
      ? `<span class="ok">${cov.length}/${cov.length} primitives</span>` + (own === 0 && parent ? ` — all inherited from <code>${escape(parent)}</code>` : own && inherited ? ` — ${own} own, ${inherited} inherited` : "")
      : `<span class="wait">${cov.length - missing}/${cov.length} primitives</span> — ${missing} falling back to the generic renderer`],
  ], `Read-only. Themes and tokens change through the MCP surface — <code>theme</code> › <code>set</code> or <code>set_tokens</code> — not from this page.`);

  const body = [
    `<main class="desk">`,
    `<h1>Snypd Desk</h1>`,
    `<p class="sub">${escape(f.site.name)} — local preview. Nothing on this page is public.</p>`,
    status,
    inFlight,
    theme,
    `<footer>The Desk reads and approves; it never writes. There is no “New post” button, no theme switcher and no config editor here — a second way to write would mean every feature is built twice, and the MCP surface is the product.</footer>`,
    `</main>`,
  ].join("\n");

  const refresh = f.refresh ?? 10;
  return new Html([
    `<!doctype html><html lang="en"><head><meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<meta name="robots" content="noindex, nofollow">`,
    refresh > 0 ? `<meta http-equiv="refresh" content="${refresh}">` : "",
    `<title>Snypd Desk — ${escape(f.site.name)}</title>`,
    f.css ? `<link rel="stylesheet" href="${escape(f.css)}">` : "",
    `<style>${STYLE}</style>`,
    `</head><body>`,
    body,
    `</body></html>`,
  ].join(""));
}
