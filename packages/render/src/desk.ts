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
 * **The one control** is S19a's push button, and since S19c (decision 80) it is a convenience rather
 * than a gate: `deploy.push` defaults to `agent`, so `site` › push does the same thing from a harness.
 * A site that sets `human` gets the S19a shape back and this button becomes the only way. Either way it
 * writes nothing and publishes nothing that was not already published — it sends a branch. Nothing else
 * here is a control, and the test that used to assert *no `<form>` at all* now asserts which one.
 *
 * Two consequences are structural rather than editorial:
 *
 * - **Approval lives on the review page, never here.** A row links to `/_snypd/review/…`; it carries
 *   no approve button of its own. An approval is bound to the bytes a human *read* (`contentHash` of
 *   the source the review page rendered), and a button next to a one-line summary would quietly sever
 *   that — the reviewer would be signing a title, not a post. Since S19c that page only offers the
 *   button for a type whose policy is `draft`, because that is the only policy anything reads it under.
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
 *
 *    **That rule was broken before this session and nothing noticed** (S19a): S18f's checklist reaches
 *    `onboardingFacts`, which calls `isRepoRoot`, which is a `git rev-parse` on every request. It was
 *    asserted here and measured nowhere. So S19a adds `desk.ttfb` — report-only, on the same server and
 *    tree as `preview.ttfb` — and the push card, which needs four git calls, is memoised behind a TTL in
 *    `preview.ts` rather than becoming the second unmeasured spawn on this path.
 * 3. **Never on the `initialize` path.** Nothing here is reachable from `server.ts`; the listener
 *    binds after `initialize` has already answered.
 *
 * The Desk renders its own document rather than going through the theme's page layout, which the
 * review page does use. A dashboard wearing the public site's nav and footer misrepresents where you
 * are — and owning `<head>` is what makes the meta refresh valid markup instead of a body injection.
 * It links the same stylesheet the shell does, so it inherits the theme's *colour* without inheriting
 * its chrome — and since S23 not its type either: the Desk sets `system-ui` for everything it says
 * itself, and the theme's faces appear in exactly one place, the specimens on the shelf, which is the
 * one place they are the subject rather than the dressing.
 *
 * **S23 (decisions 175–177) gave the page a shape.** Five equal tables answered "did it work?" and
 * nothing after it. Three things a person could not learn here: what the other themes *look* like (a
 * name and "14/14 primitives"), what to say to their agent once the first-run card had gone (its prompt
 * list went with it), and what the agent reads before it writes. So: a strip under the title with the
 * three facts a person arrives for; a permanent, computed **say this to your agent** card; and a shelf
 * where every theme and every look it ships is drawn from its own tokens, at request time, with the
 * `theme` › set call that would choose it. None of it is a control — decision 44 is exactly where it was.
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
  /** docs/08 decision 58, from `@snypd/core`. Passed rather than repeated, so there is one of it. */
  sentence: string;
}

/** A prompt as `prompts/list` describes it — `PROMPTS` from `@snypd/mcp`, passed in; this package may not import it. */
export interface DeskPrompt { name: string; description: string; arguments?: { name: string; description?: string; required?: boolean }[] }

/**
 * One look on the shelf (S23, decision 175): a theme this root can resolve × one of the variations it
 * ships, or the theme alone when it ships none. `tokens` is what the site *would render* on this look —
 * the same `loadConfig(root, { theme, variation })` the build makes, so the site's own overrides are in
 * it and a specimen is the truth rather than the brochure. Only the colour and type tokens ride: a tile
 * is a few hundred bytes, not a stylesheet.
 */
export interface DeskLook {
  theme: string;
  variation?: string;
  active: boolean;
  description?: string;
  tokens: Record<string, string>;
  /** Ships a webfont. Loaded only while this theme is active, so every other tile is its fallback face. */
  font: boolean;
}

/**
 * The push card's facts (S19a) — `@snypd/core`'s `PushState` as this page needs it, plus whatever the
 * button did last. A mirror rather than an import for the reason `DeskOnboarding` is one: this module is
 * a pure function from facts to HTML, and `preview.ts` is the only thing here that touches a repo.
 */
export interface DeskPush {
  /** The branch that goes. Never the drafts branch — `pushSite` refuses it, and this only reports. */
  branch: string;
  remote?: { name: string; url: string };
  origin?: string;
  /** `cloudflare` · `vercel` · absent, which is a host that needs no config file of ours. */
  deploy?: string;
  known: boolean;
  ahead: number;
  commits: { sha: string; subject: string }[];
  /** In flight and staying local: a draft is not on the base branch, so a push cannot carry it. */
  drafts: number;
  dirty: number;
  blockers: { reason: string; hint: string }[];
  ok: boolean;
  /** `deploy.push`. `agent` (the default) means the tool pushes too and this button is a convenience. */
  policy: "agent" | "human";
  /** Where the button posts. Spelled by `@snypd/core` (`PUSH_ROUTE`) and passed in with the rest. */
  route: string;
  /** The last push this preview server made, so the page can say what happened rather than only what is. */
  last?: { ok: boolean; at: number; sent: number; by?: string; reason?: string; hint?: string; /** what the plugins listening to `push` said (P3), one line each */ events?: string[] };
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
  /**
   * The theme's webfont, if it ships one (B1). Here for the same reason the shell has it and not because
   * the Desk is a page anybody rates: without the preload the face is found only once the stylesheet has
   * parsed, and the bench measured the difference — `desk.cls` 0.0005 against the public routes' 0, on a
   * localhost where the font arrives in a millisecond. The preload is what stops the swap being late.
   */
  font?: string;
  /** Seconds between self-refreshes. 0 disables it, which is how the bench measures a still page. */
  refresh?: number;
  /**
   * Absent when this preview has no repo to speak of — the Desk then has no push card, which is the
   * honest rendering of a site that cannot go anywhere yet.
   */
  push?: DeskPush;
  /**
   * Absent on a site that is past its first run — and *nothing renders* when the six are true, which is
   * the whole of "no dismiss button and no stored flag" (decision 52). The checklist disappears because
   * it has nothing left to say, not because somebody clicked something we wrote down.
   */
  onboarding?: DeskOnboarding;
  /** What the agent can be asked to run. Absent on a preview nothing with prompts started. */
  prompts?: DeskPrompt[];
  /** The shelf. Absent renders the S18b theme card's facts alone; empty renders no shelf. */
  looks?: DeskLook[];
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
 *
 * **Type is the Desk's own** (S23). The theme's stylesheet is still linked — it is where the colour
 * tokens and the active theme's `@font-face` come from — but `.desk` sets `system-ui` over whatever the
 * theme put on `body`, because an editorial serif on a dashboard made the Desk read as a page of the
 * site. The theme's faces belong to the specimens, which set them from their own tokens.
 *
 * **A specimen paints its own ground.** `.specimen` carries the look's tokens as inline custom
 * properties and its own `color-scheme`, so a dark-only look draws dark on a light Desk and a
 * `light-dark()` pair resolves the way that look's `color.scheme` says, not the way the Desk's does. A
 * token the look does not declare is set to `initial`, so the specimen falls to the browser's `Canvas`
 * rather than inheriting the *active* theme's value from `:root` — which is what a bare `base` tile
 * would otherwise do, and it would be a lie about what `base` looks like.
 */
const STYLE = `
:root{color-scheme:light dark}
body{margin:0;background:var(--color-bg,light-dark(#fdfcfa,#12110f));color:var(--color-text,light-dark(#1a1815,#e8e4dc))}
.desk{display:block;max-width:72rem;margin:0 auto;padding:1.5rem 1rem 4rem;line-height:1.5;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:1rem}
.desk h1,.desk h2,.desk h3,.desk summary{font-family:inherit}
.desk code,.desk pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace}
.desk code{font-size:.9em}
.desk h1{margin:0 0 .25rem;font-size:1.5rem;font-weight:700;letter-spacing:-.01em}
.desk .sub{margin:0 0 1rem;color:var(--color-muted,light-dark(#5a5a5a,#9a9287))}
.desk .strip{display:flex;flex-wrap:wrap;gap:.4rem 1.75rem;margin:0 0 2rem;padding:.75rem 0;border-top:1px solid var(--color-border,light-dark(#dcdcdc,#2e2b26));border-bottom:1px solid var(--color-border,light-dark(#dcdcdc,#2e2b26));list-style:none;font-size:.9375rem}
.desk .strip li{min-width:0;overflow-wrap:anywhere;padding:0;border:0}
.desk .strip .k{color:var(--color-muted,light-dark(#5a5a5a,#9a9287));margin-right:.4rem}
.desk .dot::before{content:"";display:inline-block;width:.55em;height:.55em;margin-right:.35em;border-radius:50%;background:currentColor;vertical-align:.05em}
.desk .cols{display:grid;grid-template-columns:minmax(0,1fr);gap:0 2rem;align-items:start}
.desk .cols>div{min-width:0}
@media (min-width:64rem){.desk .cols{grid-template-columns:minmax(0,1fr) 21rem}}
.desk .card{margin:0 0 1.5rem;padding:1.1rem 1.25rem 1.25rem;border:1px solid var(--color-border,light-dark(#dcdcdc,#2e2b26));border-radius:.5rem}
.desk .card h2{margin:0 0 .85rem;font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:var(--color-muted,light-dark(#5a5a5a,#9a9287))}
.desk .card h3{margin:1.25rem 0 .35rem;font-size:.9375rem;font-weight:700}
.desk .say pre{margin:.25rem 0 .9rem}
.desk .say li{border:0;padding:0}
.desk .agent li{padding:.35rem 0;border:0;font-size:.9375rem}
.desk .agent .args{color:var(--color-muted,light-dark(#5a5a5a,#9a9287));font-size:.875rem}
.desk .looks{display:grid;grid-template-columns:repeat(auto-fill,minmax(13.5rem,1fr));gap:1rem;margin:0;padding:0;list-style:none}
.desk .looks li{padding:0;border:0}
.desk .look{border:1px solid var(--color-border,light-dark(#dcdcdc,#2e2b26));border-radius:.5rem;overflow:hidden}
.desk .look.active{outline:2px solid var(--color-accent,light-dark(#0a6b2d,#7ee0a4));outline-offset:2px}
.desk .specimen{color-scheme:var(--color-scheme,light dark);background:var(--color-bg,Canvas);color:var(--color-text,CanvasText);font-family:var(--font-body,serif);padding:1rem 1rem .85rem;min-height:7.5rem;box-sizing:border-box;line-height:1.35}
.desk .specimen .name{font-family:var(--font-heading,var(--font-body,serif));font-weight:700;font-size:1.375rem;letter-spacing:-.01em;overflow-wrap:anywhere}
.desk .specimen .line{margin:.3rem 0 0;font-size:.875rem}
.desk .specimen .line .link{color:var(--color-accent,LinkText);text-decoration:underline}
.desk .specimen code{font-family:var(--font-mono,monospace)}
.desk .specimen .swatches{display:flex;gap:.3rem;margin:.75rem 0 0}
.desk .specimen .swatches span{width:1.1rem;height:1.1rem;border-radius:.2rem;border:1px solid var(--color-border,GrayText)}
.desk .look .meta{padding:.6rem .85rem .75rem;font-size:.875rem}
.desk .look .meta .title{font-size:.9375rem}
.desk .look .meta p{margin:.2rem 0 0;color:var(--color-muted,light-dark(#5a5a5a,#9a9287))}
.desk .look .meta pre{margin:.5rem 0 0;font-size:.75rem;white-space:pre-wrap;overflow-wrap:anywhere}
.desk .look .state{margin-left:.4rem}
.desk table{border-collapse:collapse;width:100%}
.desk th{text-align:left;font-weight:600;padding:.25rem 1.5rem .25rem 0;vertical-align:top;white-space:nowrap;width:1%}
.desk td{padding:.25rem 0;vertical-align:top;overflow-wrap:anywhere}
.desk .note{margin:.75rem 0 0;color:var(--color-muted,light-dark(#5a5a5a,#9a9287));font-size:.875rem}
.desk .ok{color:var(--color-ok,light-dark(#0a6b2d,#7ee0a4));font-weight:600}
.desk .wait{color:var(--color-wait,light-dark(#8a5a00,#f0b74e));font-weight:600}
.desk ol{margin:0;padding:0;list-style:none}
.desk li{padding:.7rem 0;border-top:1px solid var(--color-border,light-dark(#dcdcdc,#2e2b26))}
.desk li:first-child{border-top:0;padding-top:0}
.desk .title{font-weight:600}
.desk ul.plain{margin:0;padding:0;list-style:none;font-size:.875rem}
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
.desk form{margin:.9rem 0 0}
.desk button{font:inherit;font-weight:600;padding:.45rem .9rem;border-radius:.4rem;cursor:pointer;color:var(--color-bg,light-dark(#fdfcfa,#12110f));background:var(--color-text,light-dark(#1a1815,#e8e4dc));border:1px solid var(--color-text,light-dark(#1a1815,#e8e4dc))}
.desk button code{background:transparent;color:inherit;padding:0;font-size:.95em}
.desk button:focus-visible{outline:2px solid var(--color-accent,light-dark(#0a6b2d,#7ee0a4));outline-offset:2px}
.desk .fail{color:var(--color-fail,light-dark(#a3251b,#f2867a));font-weight:600}
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
type Surface = "type" | "say" | "harness" | "you";
interface Step { done: boolean; label: string; surface?: Surface; action?: string; note?: string }

/** `you` is S23's fourth: a review page to open, a button to press — the person's own act, no agent in it. */
const SURFACE: Record<Surface, string> = { type: "type this", say: "say this to your agent", harness: "do this in your harness", you: "do this yourself" };

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
      note: o.items > 0 ? `${o.items} item${o.items === 1 ? "" : "s"} in the index.` : "An agent writes it and can publish it. Set a type's <code>mcp.write</code> to <code>draft</code> if you would rather approve each one on the review page first. Nothing here writes." },
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

  // The prompt list this card carried until S23 is on the say-card now, which does not disappear.
  return [
    `<section class="card">`,
    `<h2>First run — ${done} of ${rows.length}</h2>`,
    `<ol class="steps">${items}</ol>`,
    block,
    // Inline `<details>` rather than a link: progressive disclosure at zero JS, so it costs the reader
    // who already knows nothing and `desk.js.kb` stays 0.
    `<details><summary>What is snypd?</summary>`,
    `<p>A CMS whose only interface is MCP. Your agent writes, edits, publishes and puts the site live through tools; this page is where a person watches that happen, and takes over any part of it they want to. There is no editor here and no button that writes.</p>`,
    `<p>Content is markdown files in git, and the vocabulary is a closed set of primitives a theme knows how to render. The database in <code>.snypd/</code> is a disposable index; delete it and the site is unchanged.</p>`,
    `</details>`,
    `<p class="note">Nothing on this list is stored. Every row is read from disk each time you load this page, so there is nothing to dismiss and nothing to reset — when all ${rows.length} are done this card stops rendering.</p>`,
    `</section>`,
  ].join("");
}

/**
 * **Say this to your agent** (S23, decision 176) — the card that stays.
 *
 * The first-run checklist was this card for six facts, and it stopped at six: the moment the site was
 * set up, the page stopped telling anybody what to say next, and the prompt list went with it. This is
 * the same idea made permanent and computed from every fact the page already has — the drafts, the
 * push, the shelf — in the order a person would act on them. Each line is a sentence into a harness
 * (or, labelled `you`, a thing only the person can do: open the review page, press the button), and
 * each is a `pre` so it can be selected and pasted rather than retyped.
 *
 * The first-run checklist is not repeated here. "Write the first post" and "set `site.url`" are two of
 * its six rows, and both are true of a site exactly while that card is on the page — so they are its
 * lines, and this card's begin where the checklist's end: the drafts, the push, the shelf.
 */
function sayCard(f: DeskFacts): string {
  const lines: { surface: Surface; text: string; why?: string }[] = [];

  // The drafts, ready ones first: a publish is one sentence, an approval is the person's own act.
  const ready = f.drafts.filter((d) => d.ready);
  const waiting = f.drafts.filter((d) => !d.ready && /needs a human|changed after/.test(d.state));
  for (const d of ready.slice(0, 3)) lines.push({ surface: "say", text: `Publish ${d.type}/${d.slug}.`, why: `${escape(d.title || `${d.type}/${d.slug}`)} — ${escape(d.state)}.` });
  if (ready.length > 3) lines.push({ surface: "say", text: `Publish everything that is ready — ${ready.length} drafts.` });
  for (const d of waiting.slice(0, 3)) lines.push({ surface: "you", text: `Open ${d.reviewUrl} and approve the version you read.`, why: `<a href="${escape(d.reviewUrl)}">${escape(d.title || `${d.type}/${d.slug}`)}</a> — ${escape(d.state)}. This type's <code>mcp.write</code> is <code>draft</code>, so a person signs the exact bytes.` });
  if (f.push?.ok && f.push.ahead > 0) lines.push(f.push.policy === "human"
    ? { surface: "you", text: `Press “Push ${f.push.branch}” on the Push card.`, why: `${f.push.ahead} commit${f.push.ahead === 1 ? "" : "s"} the remote does not have, and <code>deploy.push</code> is <code>human</code>.` }
    : { surface: "say", text: "Push the site.", why: `${f.push.ahead} commit${f.push.ahead === 1 ? "" : "s"} the remote does not have. <code>site</code> › <code>push</code> sends the branch your published items land on.` });
  // Always last, and always there when there is anywhere to go: the shelf and this line point at each
  // other, and a person who has never switched a theme learns here that it is one sentence.
  const other = f.looks?.find((l) => !l.active);
  if (other) lines.push({ surface: "say", text: `Switch the theme to ${other.theme}${other.variation ? ` › ${other.variation}` : ""}.`, why: `Or any other look on the shelf below — <code>theme</code> › <code>set</code> takes a name and a variation.` });

  const now = lines.length
    ? `<ol class="say">${lines.map((l) => `<li><span class="surface">${escape(SURFACE[l.surface])}</span>${pre(l.text)}${l.why ? `<p class="meta">${l.why}</p>` : ""}</li>`).join("")}</ol>`
    : `<p class="note">Nothing is waiting on you. Ask for another post, a different look, or a change to the one you have.</p>`;

  // What the agent works with — the prompts by name and what each takes, and the four reads an agent
  // makes before it writes. Shown to the person so that "it read four things first" is expected
  // behaviour rather than a surprise, and so the prompt names are somewhere that stays on the page.
  const prompts = f.prompts?.length
    ? `<h3>Prompts your agent can run</h3><p class="note">Your harness lists these by name once it has connected — <code>/get-started</code> in Claude Code, the prompt menu elsewhere.</p><ul class="plain agent">${f.prompts.map((p) => {
        const args = (p.arguments ?? []).map((a) => `<code>${escape(a.name)}</code>${a.required ? "" : "?"}`).join(" ");
        return `<li><code>${escape(p.name)}</code> — ${escape(p.description)}${args ? ` <span class="args">takes ${args}</span>` : ""}</li>`;
      }).join("")}</ul>`
    : "";
  const reads = `<h3>What it reads before it writes</h3><ul class="plain agent">`
    + `<li><code>snypd://config</code> — this site: name, URL, types, theme.</li>`
    + `<li><code>snypd://spec/primitives</code> — the fourteen blocks a post is made of, and the reason to use this CMS instead of a folder of markdown.</li>`
    + `<li><code>snypd://theme</code> — the active theme, its tokens, the looks it ships.</li>`
    + `<li><code>snypd://themes</code> — every theme this site can switch to, described.</li>`
    + `</ul>`;

  return `<section class="card"><h2>Say this to your agent</h2>${now}${prompts}${reads}</section>`;
}

/**
 * **The shelf** (S23, decision 175) — every theme this root can resolve, every look each one ships,
 * drawn from that look's own tokens.
 *
 * A specimen and not a photograph. The gallery PNGs are `bench gallery`'s build artefact, and a site
 * never has them; a specimen is true at request time, costs no bytes, and shows a dark look on a light
 * Desk honestly because it paints its own ground. The site's own name is the heading in every tile,
 * because that is what the look would actually render — a lorem-ipsum specimen tells you about the
 * font, and this tells you about your site in that font.
 *
 * Nothing here is clickable (decision 44). What a tile carries is the exact call that would choose it,
 * selectable, which is the switcher — and it lives in the harness.
 */
function shelf(f: DeskFacts): string {
  const looks = f.looks ?? [];
  if (!looks.length) return "";
  const KEYS = ["color.scheme", "color.bg", "color.surface", "color.text", "color.muted", "color.accent", "color.on-accent", "color.border", "font.body", "font.heading", "font.ui", "font.mono"];
  const tiles = looks.map((l) => {
    // Every key is set, present or not: an absent one is `initial`, so the specimen falls to the
    // browser's own canvas rather than inheriting the active theme's value from `:root`.
    const vars = KEYS.map((k) => `--${k.replace(/\./g, "-")}:${l.tokens[k] !== undefined ? escape(l.tokens[k]!) : "initial"}`).join(";");
    const label = `${l.theme}${l.variation ? ` › ${l.variation}` : ""}`;
    const call = `theme › set ${JSON.stringify(l.variation ? { name: l.theme, variation: l.variation } : { name: l.theme })}`;
    const swatches = ["color.surface", "color.text", "color.muted", "color.accent", "color.border"]
      .map((k) => `<span style="background:var(--${k.replace(/\./g, "-")},transparent)" title="${escape(k)}"></span>`).join("");
    return [
      `<li><div class="look${l.active ? " active" : ""}">`,
      // `role="img"`: a specimen is a picture of the look, and what it says is not for a screen reader —
      // the tile's meta below carries the name. It also keeps a link-coloured span from needing to be a link.
      `<div class="specimen" style="${vars}" role="img" aria-label="${escape(label)} specimen">`,
      `<div class="name">${escape(f.site.name)}</div>`,
      `<p class="line">Body text, <span class="link">a link</span>, and <code>code</code>.</p>`,
      `<div class="swatches" aria-hidden="true">${swatches}</div>`,
      `</div>`,
      `<div class="meta">`,
      `<div class="title"><code>${escape(label)}</code>${l.active ? `<span class="state done">active</span>` : ""}</div>`,
      l.description ? `<p>${escape(l.description)}</p>` : "",
      // The webfont loads with the active theme's stylesheet and no other, so a tile of any other theme
      // that ships one is its metric-matched fallback face — said on the tile rather than left to be noticed.
      l.font && l.theme !== f.theme.name ? `<p>Ships a webfont; shown here in its fallback face.</p>` : "",
      l.active ? "" : pre(call),
      `</div></div></li>`,
    ].join("");
  });
  const themes = new Set(looks.map((l) => l.theme)).size;
  return [
    `<section class="card"><h2>Themes — ${looks.length} look${looks.length === 1 ? "" : "s"} across ${themes} theme${themes === 1 ? "" : "s"}</h2>`,
    `<ul class="looks">${tiles.join("")}</ul>`,
    `<p class="note">Each tile is drawn from that look's own tokens, as your site would render on it. Read-only: the call under a tile is how it is chosen, from your harness — <code>theme</code> › <code>set</code>, or <code>set_tokens</code> to retune the one you have.</p>`,
    `</section>`,
  ].join("");
}

/**
 * **The push card, and the one button on this page** (S19a, decision 44).
 *
 * Everything else on the Desk reads. This posts — and what it posts is not a write to the site but a
 * `git push` of the branch publishes already land on, which is the moment a site becomes visible to
 * anybody but its owner. Decision 44 put it here rather than on a tool for one reason: a human clicking
 * in a local browser is a stronger gate than a `destructiveHint` on a tool an agent can call. `site` ›
 * push exists and returns this same state; it does not push, and it hands the agent this URL instead.
 *
 * Three things the card is careful to say, because each is a way somebody could be surprised:
 *
 *  - **What is not going.** Drafts are on `snypd/drafts` and a push sends the base, so every item in
 *    flight stays local. Uncommitted files in the tree are not in a commit and do not go either.
 *  - **What "up to date" is measured against** — the tracking ref, which is as fresh as the last fetch.
 *    A number that needed a network round trip is a number this page could not render inside its budget,
 *    so it says which one it is rather than implying a live answer.
 *  - **What happened last time**, including a refusal in git's own words. A credential error paraphrased
 *    is a credential error nobody can act on.
 *
 * It renders no button at all while anything blocks a push: a button that answers "no" is worse than a
 * sentence saying what would make it yes.
 */
function pushCard(p: DeskPush, now: number): string {
  const rows: [string, string][] = [];
  rows.push(["branch", `<code>${escape(p.branch)}</code>${p.remote ? ` → <code>${escape(p.remote.name)}</code>` : ""}${p.deploy ? ` · ${escape(p.deploy)}` : ""}`]);
  if (p.remote) rows.push(["remote", p.origin ? `${escape(p.origin)} <span class="meta">(<code>${escape(p.remote.url)}</code>)</span>` : `<code>${escape(p.remote.url)}</code>`]);

  const state = !p.ok ? `<span class="wait">${escape(p.blockers[0]!.reason)}</span>`
    : !p.known ? `<span class="wait">never pushed</span> — <code>${escape(p.branch)}</code> is not on <code>${escape(p.remote?.name ?? "the remote")}</code> yet, so all ${p.ahead} commit${p.ahead === 1 ? "" : "s"} of it would go`
    : p.ahead === 0 ? `<span class="ok">up to date</span> as of the last fetch`
    : `<span class="wait">${p.ahead} commit${p.ahead === 1 ? "" : "s"}</span> the remote does not have`;
  rows.push(["state", state]);
  if (p.ok && p.commits.length)
    rows.push([p.known ? "going" : "going (all of it)", `<ul class="plain">${p.commits.slice(0, 5).map((c) => `<li><code>${escape(c.sha.slice(0, 7))}</code> ${escape(c.subject)}</li>`).join("")}${p.ahead > 5 ? `<li class="meta">and ${p.ahead - 5} more</li>` : ""}</ul>`]);
  // Worded from what is actually there. "neither of those" read as a bug on the first real site, which
  // had three drafts and a clean tree: there was one kind of thing, not two.
  const parts = [
    p.drafts ? `${p.drafts} draft${p.drafts === 1 ? "" : "s"} in flight` : "",
    p.dirty ? `${p.dirty} uncommitted file${p.dirty === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  rows.push(["staying here", parts.length
    ? `${parts.join(" · ")} — a push sends <code>${escape(p.branch)}</code>, and ${parts.length > 1 ? "none of that is on it" : p.drafts === 1 || p.dirty === 1 ? "it is not on it" : "they are not on it"}`
    : `nothing — no drafts in flight, nothing uncommitted. <code>${escape(p.branch)}</code> is the whole site`]);

  const last = p.last
    ? p.last.ok
      ? `<p class="note"><span class="ok">Pushed</span> ${escape(ago(p.last.at, now))}${p.last.sent ? ` — ${p.last.sent} commit${p.last.sent === 1 ? "" : "s"}` : " — the remote already had it"}${p.last.by ? ` · <code>${escape(p.last.by)}</code>` : ""}. The host builds from the branch; give it a minute.</p>${(p.last.events ?? []).map((e) => `<p class="note">${escape(e)}</p>`).join("")}`
      : `<p class="note"><span class="fail">The last push failed</span> ${escape(ago(p.last.at, now))}.</p>${pre(p.last.reason ?? "")}${p.last.hint ? `<p class="note">${escape(p.last.hint)}</p>` : ""}`
    : "";

  const button = p.ok
    ? `<form method="post" action="${escape(p.route)}"><button type="submit">Push <code>${escape(p.branch)}</code> to ${escape(p.remote?.name ?? "the remote")}</button></form>`
    : `<p class="note">${escape(p.blockers[0]!.hint)}</p>`;

  return [
    `<section class="card"><h2>Push</h2><table>`,
    ...rows.map(([k, v]) => `<tr><th scope="row">${escape(k)}</th><td>${v}</td></tr>`),
    `</table>`,
    last,
    button,
    p.policy === "human"
      ? `<p class="note">This is the only button on the Desk, and on this site it is the only way: <code>deploy.push</code> is <code>human</code>, so <code>site</code> › <code>push</code> reports and refuses. It publishes nothing that was not already published — it sends the branch your published items land on.</p>`
      : `<p class="note">This is the only button on the Desk, and it is a convenience rather than a gate: <code>site</code> › <code>push</code> does the same thing from your harness. It publishes nothing that was not already published — it sends the branch your published items land on. A site that wants a person in that loop sets <code>deploy.push</code> to <code>human</code>.</p>`,
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

  const build = f.build
    ? `${f.build.routes} route${f.build.routes === 1 ? "" : "s"} in ${Math.round(f.build.ms)} ms · ${escape(ago(f.build.at, now))}`
    : "not built yet";
  const placeholder = f.onboarding?.placeholderUrl ? ` <span class="wait">placeholder — needed before publish</span>` : "";

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
  // Since S23 the active theme's facts are three rows on the Status card and the shelf is the theme's
  // own card. The S18b card stays only for a caller that passes no `looks` at all.
  const themeRows: [string, string][] = [
    ["theme", `<code>${escape(f.theme.name)}</code>${f.theme.chain.length > 1 ? ` <span class="meta">→ ${f.theme.chain.slice(1).map((n) => `<code>${escape(n)}</code>`).join(" → ")}</span>` : ""}`],
    // `editorial` renders 14/14 with zero `.tsx` of its own (S12), so "0 own, 14 inherited" is the
    // normal case for a well-behaved theme, not a deficiency — the copy says so rather than implying
    // a score. Only a *missing* primitive is a problem, because that one falls back to generic markup.
    ["coverage", missing === 0
      ? `<span class="ok">${cov.length}/${cov.length} primitives</span>` + (own === 0 && parent ? ` — all inherited from <code>${escape(parent)}</code>` : own && inherited ? ` — ${own} own, ${inherited} inherited` : "")
      : `<span class="wait">${cov.length - missing}/${cov.length} primitives</span> — ${missing} falling back to the generic renderer`],
  ];
  const theme = f.looks ? "" : card("Theme", themeRows, `Read-only. Themes and tokens change through the MCP surface — <code>theme</code> › <code>set</code> or <code>set_tokens</code> — not from this page.`);
  const status = card("Status", [
    ...harness,
    ["preview", `<a href="/">${escape(f.previewUrl)}</a>`],
    ["build", build],
    // Flagged as unfinished rather than presented as fact (docs/08 §9.6): the placeholder is a working
    // default two minutes into a site and a broken feed the moment anything publishes, and the card that
    // reports state should not be the one place that reads it as settled.
    ["site", `${escape(f.site.name)} — <code>${escape(f.site.url)}</code>${placeholder}`],
    ...(f.looks ? themeRows : []),
  ], connected
    ? undefined
    // The one instruction no prompt of ours can deliver: a harness that has not loaded the server
    // cannot be told to load it by the server (S18a). So it is said here, where a person is looking.
    : `A harness reads <code>.mcp.json</code> when it starts. If you have just run <code>snypd init</code>, restart Claude Code, Cursor or Codex — this line turns green on its first call.`);

  // The strip (S23): the three facts a person arrives for, above the fold and before any card. The
  // status card keeps the detail; this is the glance.
  const strip = `<ul class="strip">`
    + `<li><span class="k">harness</span>${connected ? `<span class="ok dot">connected${a!.client ? ` · ${escape(a!.client)}` : ""}</span>` : `<span class="wait dot">not connected</span>`}</li>`
    + `<li><span class="k">build</span>${build}</li>`
    + `<li><span class="k">site</span><code>${escape(f.site.url)}</code>${placeholder}</li>`
    + `</ul>`;

  const body = [
    `<main class="desk">`,
    `<h1>Snypd Desk</h1>`,
    `<p class="sub">${escape(f.site.name)} — local preview. Nothing on this page is public.</p>`,
    strip,
    // Two columns from 64 rem: what a person acts on in the main column, what they check in the rail.
    // One column below that, in this order, which is the order of the questions.
    `<div class="cols"><div>`,
    firstRun(f.onboarding),
    sayCard(f),
    inFlight,
    shelf(f),
    theme,
    `</div><div>`,
    f.push ? pushCard(f.push, now) : "",
    status,
    `</div></div>`,
    // Rewritten twice: S19a added the button, S19c took away the claim that it was a gate. What is left
    // is the line that has never moved — this page does not write words — and it is the only one the
    // product actually needs, because it is the one that keeps MCP the single way to author.
    `<footer>The Desk reads. It can also approve and push, which are the two acts a site may choose to keep for a person — this one ${f.push?.policy === "human" ? "keeps the push" : "keeps neither, so both are also an agent's"}. What it never does is write words: no “New post” button, no theme switcher and no config editor, because a second way to write would mean every feature is built twice, and the MCP surface is the product.</footer>`,
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
    f.font ? `<link rel="preload" href="${escape(f.font)}" as="font" type="font/woff2" crossorigin="anonymous">` : "",
    `<style>${STYLE}</style>`,
    `</head><body>`,
    body,
    `</body></html>`,
  ].join(""));
}
