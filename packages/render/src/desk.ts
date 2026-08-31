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

/**
 * The six derived facts of `07` decision 52, as the Desk needs them (S18f).
 *
 * A mirror of `@snypd/core`'s `OnboardingFacts` and deliberately not an import of it: `desk.ts` is a
 * pure function from facts to HTML — that is what lets `render.test.ts` render a Desk in a directory
 * which is not a git repo at all — and a module that reached for the filesystem to draw a checklist
 * would be the end of `preview.ttfb ≤ 50 ms` as a claim about this page. `preview.ts` gathers, this
 * renders.
 */
export interface DeskOnboarding {
  config: boolean;
  git: boolean;
  registration: { present: boolean; names: boolean; missingCommand: boolean; command?: string };
  /** `connected` · `silent` (spawned, never spoke to) · `stale` (it was here) · `never`. docs/08 §10. */
  harness: "connected" | "silent" | "stale" | "never";
  items: number;
  placeholderUrl: boolean;
  /** The registration block, verbatim, for the most predictable failure in the flow (docs/08 §9.4). */
  mcpJson?: string;
  /** `PROMPTS` from `@snypd/mcp`, passed in — `@snypd/render` may not import it, and does not need to. */
  prompts?: { name: string; description: string }[];
  /** docs/08 decision 58, from `@snypd/core`. Passed rather than repeated, so there is one of it. */
  sentence: string;
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
  /**
   * Absent on a site that is past its first run — and *nothing renders* when the six are true, which is
   * the whole of "no dismiss button and no stored flag" (decision 52). The checklist disappears because
   * it has nothing left to say, not because somebody clicked something we wrote down.
   */
  onboarding?: DeskOnboarding;
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
.desk .steps{counter-reset:step}
.desk .steps li{display:grid;grid-template-columns:5.5rem 1fr;gap:0 1rem;align-items:baseline}
.desk .steps li>div{min-width:0}
.desk .state{font-size:.75rem;letter-spacing:.06em;text-transform:uppercase;font-weight:700}
.desk .state.done{color:var(--color-ok,light-dark(#0a6b2d,#7ee0a4))}
.desk .state.now{color:var(--color-wait,light-dark(#8a5a00,#f0b74e))}
.desk .state.later{color:var(--color-muted,light-dark(#5a5a5a,#9a9287))}
.desk .surface{display:inline-block;margin:.35rem .5rem .1rem 0;padding:.05rem .4rem;border:1px solid var(--color-border,light-dark(#dcdcdc,#2e2b26));border-radius:.25rem;font-size:.6875rem;letter-spacing:.04em;text-transform:uppercase;color:var(--color-muted,light-dark(#5a5a5a,#9a9287));vertical-align:.05rem}
.desk pre{margin:.35rem 0 0;padding:.6rem .75rem;overflow-x:auto;border:1px solid var(--color-border,light-dark(#dcdcdc,#2e2b26));border-radius:.4rem;background:var(--color-surface,light-dark(#f4f2ee,#1b1916));font-size:.8125rem;line-height:1.45}
.desk pre:focus-visible{outline:2px solid var(--color-accent,light-dark(#0a6b2d,#7ee0a4));outline-offset:2px}
.desk details{margin:.75rem 0 0}
.desk summary{cursor:pointer;font-weight:600}
.desk details p{margin:.5rem 0 0;color:var(--color-muted,light-dark(#5a5a5a,#9a9287));font-size:.875rem}
@media (max-width:30rem){.desk .steps li{grid-template-columns:1fr}}
.desk footer{margin-top:2.5rem;padding-top:1rem;border-top:1px solid var(--color-border,light-dark(#dcdcdc,#2e2b26));color:var(--color-muted,light-dark(#5a5a5a,#9a9287));font-size:.875rem}
@media (max-width:30rem){.desk th{white-space:normal}}
`.trim();

/**
 * The first-run checklist (`07` decision 52, docs/08 §9).
 *
 * Six rows, ordered by dependency, and **rows that cannot be reached yet are shown as *later* rather
 * than hidden**. Hiding them would make the page shorter and the flow longer: somebody who cannot get
 * past step 1 deserves to see that steps 2–6 exist and are small, rather than discovering each one as it
 * appears. It is the same argument as showing a progress bar you are at the start of.
 *
 * **Every row names its surface.** *type this* is a shell, *say this to your agent* is a sentence into a
 * harness, *do this in your harness* is neither — it is a menu somewhere in Claude Code or Cursor. The
 * entire confusion of onboarding is not knowing which of the three you are looking at, and three words
 * of label are cheaper than any amount of copy explaining it.
 */
type Surface = "type" | "say" | "harness";
interface Step { done: boolean; label: string; surface?: Surface; action?: string; note?: string }

const SURFACE: Record<Surface, string> = { type: "type this", say: "say this to your agent", harness: "do this in your harness" };

/** A `pre` that can scroll is a scrollable region, and one a keyboard cannot reach is an axe violation
 *  (`scrollable-region-focusable`) — the defect decision 50 caught on the review page. `tabindex="0"`
 *  is also what makes the block selectable by keyboard, which is the point of putting it here at all. */
const pre = (text: string) => `<pre tabindex="0"><code>${escape(text)}</code></pre>`;

function steps(o: DeskOnboarding): Step[] {
  const reg = o.registration;
  const registered = reg.present && reg.names && !reg.missingCommand;
  return [
    { done: o.config, label: "A site here", surface: "say", action: o.sentence,
      note: "<code>snypd.yaml</code>, the content directories and <code>.mcp.json</code>, written by <code>site</code> › <code>init</code>." },
    { done: o.git, label: "Under git", surface: "type", action: "git init",
      note: "Writes land on a drafts branch and publishing lands one path onto the base — without a repo a draft is never versioned and nothing can be published." },
    { done: registered, label: "Registered with your harness",
      surface: registered ? undefined : "type", action: registered ? undefined : "snypd init",
      note: !reg.present ? `No <code>.mcp.json</code>. Nothing tells an editor this server exists.`
        : !reg.names ? `<code>.mcp.json</code> exists but registers something else — it needs a <code>snypd</code> entry under <code>mcpServers</code>.`
        : reg.missingCommand ? `<code>.mcp.json</code> names <code>${escape(reg.command ?? "")}</code>, which is not on this shell's PATH. The harness's PATH may differ, so this is a likely cause rather than a verdict.`
        : `Registered as <code>${escape(reg.command ?? "snypd")}</code>.` },
    { done: o.harness === "connected", label: "Your harness has connected",
      surface: o.harness === "connected" ? undefined : "harness",
      action: o.harness === "connected" ? undefined : o.harness === "silent" ? undefined : "Restart Claude Code, Cursor or Codex",
      note: o.harness === "connected" ? "This line went green on its first call."
        : o.harness === "silent" ? "A server is running and nothing has spoken to it — it was spawned and then went unused. That is a harness-side problem, so its own MCP log is the place to look; restarting again will not say anything new."
        : o.harness === "stale" ? "A harness had this server and let it go. Nothing is connected right now; the next restart spawns a new one."
        : "A harness reads <code>.mcp.json</code> when it starts, so a file written after it opened is a file it has not seen." },
    { done: o.items > 0, label: "One post written", surface: o.items > 0 ? undefined : "say",
      action: o.items > 0 ? undefined : "Write the first post — use the get-started prompt.",
      note: o.items > 0 ? `${o.items} item${o.items === 1 ? "" : "s"} in the index.` : "An agent drafts; you approve the exact version on the review page. Nothing here writes." },
    { done: !o.placeholderUrl, label: "A real site URL", surface: o.placeholderUrl ? "say" : undefined,
      action: o.placeholderUrl ? "Set site.url to where this will be served from." : undefined,
      note: o.placeholderUrl ? "The feed, the sitemap and the JSON-LD are absolute, so this is needed before anything publishes — and not before. <code>content.publish</code> refuses until it is set." : undefined },
  ];
}

/**
 * The card, or nothing at all. There is no dismiss button and no stored flag anywhere in this codebase:
 * when the six are true this returns the empty string, and what remains is the ordinary Desk.
 */
function firstRun(o: DeskOnboarding | undefined): string {
  if (!o) return "";
  const rows = steps(o);
  const done = rows.filter((r) => r.done).length;
  if (done === rows.length) return "";
  // "Now" is the first unfinished row; everything after it is *later* rather than a second instruction
  // competing for the same attention. A checklist with two live rows is a checklist nobody starts.
  const next = rows.findIndex((r) => !r.done);
  const items = rows.map((r, i) => {
    const state = r.done ? "done" : i === next ? "now" : "later";
    return [
      `<li>`,
      `<div class="state ${state}">${state === "done" ? "done" : state === "now" ? "next" : "later"}</div>`,
      `<div>`,
      `<div class="title">${escape(r.label)}</div>`,
      r.note ? `<div class="meta">${r.note}</div>` : "",
      r.action && !r.done ? `${r.surface ? `<span class="surface">${escape(SURFACE[r.surface])}</span>` : ""}${pre(r.action)}` : "",
      `</div>`,
      `</li>`,
    ].join("");
  }).join("");

  // Shown whenever the harness is not connected, because "my editor didn't pick it up" is the most
  // predictable failure in the flow (docs/08 §9.4) and the fix is always *paste this into that file*.
  const block = o.mcpJson && o.harness !== "connected"
    ? `<h3>${escape(".mcp.json")}</h3><p class="note">What <code>init</code> wrote, verbatim. If your harness keeps its own registration file, this is the entry to copy into it.</p>${pre(o.mcpJson)}`
    : "";

  const prompts = o.prompts?.length
    ? `<h3>Prompts</h3><p class="note">Loaded with the server; your harness lists them by name once it has connected.</p><ul>${o.prompts.map((pr) => `<li><code>${escape(pr.name)}</code> — ${escape(pr.description)}</li>`).join("")}</ul>`
    : "";

  return [
    `<section class="card">`,
    `<h2>First run — ${done} of ${rows.length}</h2>`,
    `<ol class="steps">${items}</ol>`,
    block,
    prompts,
    // Inline `<details>` rather than a link: progressive disclosure at zero JS, so it costs the reader
    // who already knows nothing and `desk.js.kb` stays 0.
    `<details><summary>What is snypd?</summary>`,
    `<p>A CMS whose only interface is MCP. Your agent writes and edits through tools; this page is the half that needs a person — it reads, and it approves. There is no editor here and no button that writes.</p>`,
    `<p>Content is markdown files in git, and the vocabulary is a closed set of primitives a theme knows how to render. The database in <code>.snypd/</code> is a disposable index; delete it and the site is unchanged.</p>`,
    `</details>`,
    `<p class="note">Nothing on this list is stored. Every row is read from disk each time you load this page, so there is nothing to dismiss and nothing to reset — when all ${rows.length} are done this card stops rendering.</p>`,
    `</section>`,
  ].join("");
}

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
    // Flagged as unfinished rather than presented as fact (docs/08 §9.6): the placeholder is a working
    // default two minutes into a site and a broken feed the moment anything publishes, and the card that
    // reports state should not be the one place that reads it as settled.
    ["site", `${escape(f.site.name)} — <code>${escape(f.site.url)}</code>${f.onboarding?.placeholderUrl ? ` <span class="wait">placeholder — needed before publish</span>` : ""}`],
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
    firstRun(f.onboarding),
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
