/**
 * `snypd bench onboard` — the number docs/08 exists to defend (S18g; F1, F2, F4).
 *
 * Every other lane measures a system that is already set up. This one measures the minutes before that,
 * which is the only surface 100 % of users meet exactly once, and the only one where a wrong answer
 * costs the whole install rather than one page (docs/08 decision 54).
 *
 * Three rules it inherits, none of them negotiable here:
 *
 *  - **The compiled binary, from an empty directory** (decision 55). `bun test` starts in a checkout,
 *    which is state 3 of docs/08 §6 by construction; every interesting first-run failure is invisible
 *    from there, and S18a's was — for fifteen sessions and 210 green tests.
 *  - **Human actions, not seconds** (decision 65). Seconds drift with the model, and commands are the
 *    wrong unit once the agent is the one typing them.
 *  - **An action is counted where the walk is stopped, not where the table says it should be.** docs/08
 *    §2 is a design and this is a measurement; they are allowed to disagree, and that disagreement is
 *    the whole reason F1 has been "measured rather than claimed" for six sessions. Every action records
 *    how it was established:
 *      `refused`    — the product would not proceed, and said what it wanted;
 *      `absent`     — the thing a harness needs was not on disk yet;
 *      `structural` — nothing to observe. The paste and the answer are a person arriving, and no code
 *                     can prove them; they are counted because they are real, and marked because a
 *                     number that hides which half was observed is worse than two numbers.
 *
 * What this is not: `packages/bench/agent/` measures the *surface* an agent works against, over a site
 * that already exists, and is scored on tool calls. This measures the path to that site's first minute
 * and is scored on what a person had to do. The kill test would still pass on a product nobody could
 * install.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Session } from "../agent/session";
import { compile } from "./build";
import type { Metric, Report } from "../src/index";

/** docs/08 F1. The budget this document exists to defend; the walk is allowed to disagree with it. */
export const HANDOFF_BUDGET = 5;
/** docs/08 §3, proposed and confirmed by S18g's first measurement — see the note on each metric. */
export const TTFV_BUDGET = 5_000;
export const TTFP_BUDGET = 60_000;

/**
 * **Which door was walked** (L4, docs/31 §5). There are two, and until this session only the second one
 * had ever been counted — which is why F1's row quoted a number that no longer belonged to the flow F1
 * points at.
 *
 *  - `front` — docs/08 §2 since decision 178, and the only thing the README, snypd.rocks and the film
 *    show: one line typed in a terminal, one sentence said in the harness it opened, one click on the
 *    host's page. `init` asks nothing (decision 63), so there is no name question, and the harness starts
 *    *after* `.mcp.json` exists, so there is no restart. This is the walk F1 is about.
 *  - `relay` — the sentence pasted into a harness that is already open (decisions 58–60), which the Desk
 *    still offers (docs/08 §9) and which is what somebody already inside a session gets. The agent runs
 *    `init`, so a harness asks to approve a shell command and then has to be restarted. It is a longer
 *    walk on purpose, and it is the number S18g–L2 measured.
 *
 * Both are real and both are measured. Reporting only the short one would be a claim; dropping the long
 * one would delete the history of a number this project argued about for six sessions.
 */
export type Door = "front" | "relay";

export type ActionKind =
  | "type" | "say"
  | "paste" | "answer" | "approve-shell" | "restart" | "answer-url" | "approve-post" | "git-identity" | "allow-host";

export interface Action {
  /** The row of docs/08 §2 this belongs to, so the breakdown reads against the table it is scoring. */
  step: number;
  kind: ActionKind;
  what: string;
  /** Decision 65: approving a shell command and approving a publish are the safety story, and a funnel
   *  metric that rewards removing them is pointed at the wrong thing. Reported, never optimised. */
  irreducible: boolean;
  proof: "refused" | "absent" | "structural";
  detail: string;
}

export interface OnboardWalk {
  binary: string;
  /** Which of the two doors this walk came through (L4). */
  door: Door;
  /** docs/08 F2: the model goes beside the number, because ttfp drifts with it and handoff does not. */
  driver: string;
  actions: Action[];
  /**
   * The front door's two product halves, captured rather than described: the last line `init` printed
   * (the rest of what the person typed) and the sentence it told them to say. Empty on the relay walk,
   * where the person typed neither.
   */
  printedNext: string;
  printedSentence: string;
  /**
   * `.mcp.json` on disk when the harness started. The restart is an action when this is false and is
   * *absent* when it is true, and it is the same observation either way — which is the only reason the
   * front door may claim not to pay for it.
   */
  registeredBeforeHarness: boolean;
  /** A machine with no git author identity — CI, a container, a fresh laptop (docs/08 §12.11). */
  fresh: Action | undefined;
  ttfvMs: number;
  ttfpMs: number;
  publishedMs: number;
  lintClean: boolean;
  /** Where the site is, as the host said it (docs/31 §3 step 9) — the walk's last line, and the one a person is told. */
  url: string;
  /** How many uploads the first `site` › deploy took: two, when the URL had to be learned and the site rebuilt against it. */
  deploys: number;
  reviewUrl: string;
  /** F4: the same answers, after `.snypd/` is deleted underneath a running flow. */
  survivesRestart: RestartCheck;
}

const REFERENCE_DRIVER = "reference driver (no model)";

/** §2 step 2–3: what the agent asks for in one message, and what the person answers. */
const SITE = { name: "Ash & Ember", description: "A small blog about cooking over fire." };
const ORIGIN = "https://ash-and-ember.example";
/**
 * The front door types a directory and nothing else — no `--name`, no `--description`, no `--host`.
 * Decision 63 is why: the name falls back to the directory and the URL to a placeholder, so `init` has
 * no question to ask, and a walk that passed flags would be measuring a command no README prints.
 */
const SITE_DIR = "ash-and-ember";
/** …and the rest of the one line, which `init` prints as its last line so it can be typed from there. */
const NEXT_LINE = `cd ${SITE_DIR} && claude`;

/**
 * §2 step 10: "one real post using at least two primitives". Two is the floor the table names, and a
 * post that is all prose is the failure mode `content.create`'s own description warns about — so this
 * is the shortest thing that is honestly a first post rather than a fixture.
 */
const FIRST_POST = {
  slug: "first-fire",
  title: "Cooking over fire, badly, on purpose",
  body: [
    ":::tldr",
    "Three dinners over a live fire, none of them good, all of them worth it.",
    ":::",
    "",
    "The first thing a live fire teaches is that heat is a place, not a number.",
    "",
    ':::callout{kind="note"}',
    "Everything here was cooked on a grate over hardwood coals, with no thermometer.",
    ":::",
    "",
    "The second thing it teaches is patience, which is harder.",
  ].join("\n"),
};

const spawnBin = (bin: string, args: string[], cwd: string, env: Record<string, string> = {}) => {
  const p = Bun.spawnSync([bin, ...args], {
    cwd, stdout: "pipe", stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1", ...env },
  });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
};

/**
 * docs/08 §12.11, and the one question S18d left explicitly to this session.
 *
 * A GitHub runner has no `user.email`; neither does a fresh laptop, a container or a devcontainer. Snypd
 * will not commit under a name it invented, so `init` prints the failure and the two lines that fix it —
 * that is the *product* half, fixed in S18d′. What was never established is whether that makes a sixth
 * human action, because nothing had counted. This runs `init` on a machine that genuinely has no
 * identity (`GIT_CONFIG_*` pointed at files that do not exist, `HOME` at an empty directory, and every
 * `GIT_AUTHOR_*`/`GIT_COMMITTER_*` override stripped) and reports what it finds.
 */
export function freshMachine(bin: string): Action | undefined {
  const dir = mkdtempSync(join(tmpdir(), "snypd-onboard-fresh-"));
  const home = mkdtempSync(join(tmpdir(), "snypd-onboard-home-"));
  try {
    const env: Record<string, string> = {
      HOME: home, XDG_CONFIG_HOME: join(home, ".config"),
      GIT_CONFIG_GLOBAL: join(home, "nonexistent-gitconfig"),
      GIT_CONFIG_SYSTEM: join(home, "nonexistent-gitconfig-system"),
      GIT_CONFIG_NOSYSTEM: "1",
    };
    for (const k of ["GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL", "EMAIL"]) env[k] = "";
    const r = spawnBin(bin, ["init", ".", `--name=${SITE.name}`], dir, env);
    const committed = Bun.spawnSync(["git", "log", "--oneline"], { cwd: dir, stdout: "pipe", stderr: "pipe", env: { ...process.env, ...env } })
      .stdout.toString().includes("site: init");
    if (committed) return undefined;   // the machine had an identity after all, or init found one
    // The scaffold is there and uncommitted: the next `content.create` refuses on a dirty tree. What
    // decides whether this is an *action* or a dead end is whether init said so where the agent reads.
    const said = r.out.includes("git config --global");
    return {
      step: 5, kind: "git-identity",
      what: "set a git author identity (`git config --global user.name` / `user.email`)",
      irreducible: false,
      proof: "refused",
      detail: said
        ? "git refused the scaffold commit for want of an identity; `init` printed the two lines that fix it, so the agent can run them with one approval"
        : "git refused the scaffold commit for want of an identity and `init` did not say so — a dead end, docs/08 F3",
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

/**
 * The walk itself: docs/08 §2 against the artefact, from a directory that does not exist when this
 * function is called — and, on the front door, from a *parent* in which even the site's directory does
 * not exist, because `init <dir>` making it is the first half of the one line a person types (L1).
 *
 * The restart is not simulated away in either direction. A harness reads `.mcp.json` when it starts, so
 * the walk observes the file rather than asserting the action: on the relay door it does not exist
 * before `init` and does after, which is exactly why the tools cannot be there in the session that ran
 * the command; on the front door it is already there when the harness opens, because the person typed
 * `cd … && claude` after `init` had finished. Same observation, opposite sign — and the front door is
 * allowed to claim it does not pay for a restart only because this is what was looked at.
 */
export async function runOnboard(opts: { bin?: string; keep?: boolean; door?: Door } = {}): Promise<OnboardWalk> {
  const door = opts.door ?? "front";
  const bin = opts.bin ?? (await compile(join(mkdtempSync(join(tmpdir(), "snypd-onboard-bin-")), "snypd")));
  const box = mkdtempSync(join(tmpdir(), "snypd-onboard-"));
  // The front door runs from the parent and lets `init` make the directory; the relay door is already
  // standing in one, because an agent runs `init .` where the harness was opened.
  const dir = door === "front" ? join(box, SITE_DIR) : box;
  const actions: Action[] = [];
  const act = (a: Action) => { actions.push(a); return a };
  let dev: ReturnType<typeof Bun.spawn> | undefined;
  let session: Session | undefined;
  let stubState: string | undefined;
  let printedNext = "";
  let printedSentence = "";
  /**
   * The one observation the two doors disagree about, and the whole of the front door's claim to be
   * shorter: was the file a harness reads at startup on disk when *the harness this walk uses* started?
   * On the front door that harness is the one the typed line opened, after `init` had finished; on the
   * relay door it is the one that was already open when the sentence was pasted into it, which is why
   * that door pays a restart and this one does not.
   */
  let registeredBeforeHarness = false;

  try {
    const t0 = performance.now();
    let init: ReturnType<typeof spawnBin>;

    if (door === "front") {
      // ── §2 row 1: the one line. `init <dir>` makes the directory and the shell moves into it, so what
      //    a person does is *type*, once — and the product's half of it is observable: the directory
      //    exists afterwards, and the last line printed is the rest of the line they typed.
      init = spawnBin(bin, ["init", SITE_DIR], box);
      if (init.code !== 0) throw new Error(`init exited ${init.code}: ${init.err || init.out}`);
      if (!existsSync(join(dir, "snypd.yaml"))) throw new Error(`init ${SITE_DIR} did not make the directory it was given`);
      registeredBeforeHarness = existsSync(join(dir, ".mcp.json"));
      printedNext = init.out.trimEnd().split("\n").at(-1)?.trim() ?? "";
      if (printedNext !== NEXT_LINE) throw new Error(`init's last line is "${printedNext}", not "${NEXT_LINE}" — the line a person types next is not the line they are given (L1)`);
      act({ step: 1, kind: "type", what: `type the one line: \`bunx @snypd/cli init ${SITE_DIR} && ${NEXT_LINE}\``, irreducible: false, proof: "structural",
        detail: `the front door is the command (decision 178), and it is typed once: \`init\` made ${SITE_DIR}/ and printed \`${printedNext}\` as its last line, so the rest of the line is read off the screen rather than remembered` });

      // ── §2 row 3: the sentence. Also the product's: `init` prints the one to say, and since L3 it
      //    ends *online* when the host's half is in the repo — which it is, by default (decision 229).
      printedSentence = (init.out.match(/Write me a first post[^\n]*/) ?? [""])[0].trim();
      if (!printedSentence) throw new Error(`init printed no sentence for a person to say:\n${init.out}`);
      act({ step: 3, kind: "say", what: `say the sentence \`init\` printed: *${printedSentence}*`, irreducible: false, proof: "structural",
        detail: `nobody was asked for a name (decision 63: it falls back to the directory) or a URL (the host answers it at deploy), so the sentence is the whole of the second action` });
    } else {
      // ── steps 1–3: a person arrives. There is nothing on disk to observe, and pretending otherwise
      //    would be the dishonest half of this metric.
      act({ step: 1, kind: "paste", what: "paste the Desk's sentence into the harness that is already open", irreducible: false, proof: "structural",
        detail: "the second door (docs/08 §9): somebody already inside a session, for whom the README's line would mean closing it" });
      act({ step: 3, kind: "answer", what: "answer what the site is called, in one message", irreducible: false, proof: "structural",
        detail: `one question, one answer — "${SITE.name}"` });

      // ── step 4: the agent runs a shell command, and a harness asks first. The harness that asks is
      //    one that started before any of this, so the file it reads at startup is not there yet.
      registeredBeforeHarness = existsSync(join(dir, ".mcp.json"));
      act({ step: 4, kind: "approve-shell", what: "approve the shell command the agent wants to run", irreducible: true, proof: "structural",
        detail: "a correct security prompt, not friction — decision 65 keeps it out of any optimisation" });

      // ── step 5: init.
      init = spawnBin(bin, ["init", ".", `--name=${SITE.name}`, `--description=${SITE.description}`], dir);
      if (init.code !== 0) throw new Error(`init exited ${init.code}: ${init.err || init.out}`);

      // ── steps 6–7: the restart, proved rather than assumed.
      act({ step: 7, kind: "restart", what: "restart the harness so the snypd tools load", irreducible: true, proof: "absent",
        detail: `.mcp.json ${registeredBeforeHarness ? "already existed" : "did not exist"} when the harness started and ${existsSync(join(dir, ".mcp.json")) ? "does now" : "still does not"} — a harness reads it once, at startup, which is not ours to change` });
    }

    if (door === "front" && !registeredBeforeHarness)
      throw new Error("the front door skipped the restart on the strength of a file that is not there");

    // ── `onboard.ttfv`: the person's half of the same moment. `dev` is the one verb aimed at them, and
    //    the Desk is the first thing they see that is not a terminal (docs/08 F6). The clock started
    //    before `init` on both doors, so this is the whole of *nothing → a painted page*.
    dev = Bun.spawn([bin, "dev", "."], { cwd: dir, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
    const record = join(dir, ".snypd", "dev.json");
    const devDeadline = Date.now() + 30_000;
    while (!existsSync(record) && Date.now() < devDeadline) await Bun.sleep(10);
    if (!existsSync(record)) throw new Error("dev never wrote .snypd/dev.json");
    const { url: devUrl } = JSON.parse(readFileSync(record, "utf8")) as { url: string };
    const desk = await fetch(`${devUrl}/_snypd`);
    if (!desk.ok) throw new Error(`the Desk answered ${desk.status}`);
    await desk.text();
    const ttfvMs = performance.now() - t0;

    // ── the harness opens, and picks up from `initialize` with nothing handed to it. A fresh process
    //    against the directory on disk is the honest form of that on either door: on the front one it
    //    is the harness the person opened with `cd … && claude`, on the relay one it is the restart.
    // The host's CLI is the stub (`core/src/wrangler.stub.sh`): wrangler's own lines, no account, no
    //    network. The walk measures the product's actions; the stub stands in for Cloudflare's tool
    //    exactly as the bare repo stands in for GitHub in `push.test.ts`.
    stubState = mkdtempSync(join(tmpdir(), "snypd-onboard-host-"));
    session = new Session(dir, [bin, "serve", dir], { SNYPD_WRANGLER: resolve("packages/core/src/wrangler.stub.sh"), STUB_STATE: stubState });
    const hello = await session.start();
    if (!hello.instructions?.includes("get-started")) throw new Error("initialize's instructions do not name the prompt a new site starts from");
    await session.read("snypd://config");
    await session.read("snypd://spec/primitives");
    await session.read("snypd://theme");

    // ── step 10: one real post, two primitives, lint fixed, preview handed back.
    await session.call("content.create", {
      type: "post", slug: FIRST_POST.slug,
      frontmatter: { title: FIRST_POST.title, date: "2026-08-31", tags: ["fire"], description: SITE.description },
      body: FIRST_POST.body,
    });
    await session.call("content.lint", { type: "post", slug: FIRST_POST.slug });
    const lintClean = spawnBin(bin, ["lint", "."], dir).code === 0;
    const prev = await session.call("content.render_preview", { type: "post", slug: FIRST_POST.slug });
    const said = prev.content.map((c) => ("text" in c ? c.text : "")).join("\n");
    // Three URLs come back — the page, its markdown twin and the review page — and only the third is the
    // one a person acts on. Matching the first `http` would take the page, which is what the first draft
    // of this walk did: the approve POST still worked (same origin) and `reviewUrl` was quietly a lie.
    const reviewUrl = (said.match(/https?:\/\/[^\s)]*\/_snypd\/review\/[^\s)]+/) ?? [])[0] ?? "";
    if (!reviewUrl) throw new Error(`render_preview returned no review URL for a person to approve on:\n${said}`);
    // F2's endpoint, exactly as docs/08 words it: a lint-clean draft with a review URL.
    const ttfpMs = performance.now() - t0;

    // ── steps 12–13: publish, and let the refusals do the counting.
    //
    //    This is the part §2 could not settle on paper. From S18d to L1 `publishCheck` refused for the
    //    placeholder URL *before* it refused for the missing approval, so the agent learned about both
    //    in a fixed order, and each refusal that only a person can satisfy was one more action. Since
    //    L2 (docs/31 §4) the URL is not asked here at all — a publish is a commit, and the host answers
    //    the question at deploy — so the branch below is not reached on a default site. Kept, like the
    //    approval branch under it: a site that is git-connected still pays it at `push`, and this file's
    //    claim is that the count is measured, not decided.
    const origin = new URL(reviewUrl).origin;
    for (let guard = 0; guard < 6; guard++) {
      const r = await session.call("content.publish", { type: "post", slug: FIRST_POST.slug });
      if (!r.isError) break;
      const said = r.content.map((c) => ("text" in c ? c.text : "")).join("\n");
      if (/placeholder/i.test(said)) {
        act({ step: 12, kind: "answer-url", what: "answer where the site will be served", irreducible: false, proof: "refused",
          detail: "publish refused: the feed, sitemap and JSON-LD are absolute, so the origin is due here — decision 63 keeps it off step 4, and this is where the debt comes due" });
        await session.call("site", { action: "set_config", path: "site.url", value: ORIGIN });
        continue;
      }
      // Not reached on a default site since S19c (decision 80): `mcp.write` is `publish`, so the call
      // above does not refuse for an approval and the loop breaks. Kept, and deliberately not deleted —
      // it is the branch a site that declares `mcp.write: draft` still walks, and this file's whole
      // claim is that the count is measured rather than asserted. Deleting it would make the five a
      // number this file *decided* instead of one it observed.
      if (/needs a human/i.test(said)) {
        act({ step: 12, kind: "approve-post", what: "read the post on the review page and approve it", irreducible: true, proof: "refused",
          detail: "publish refused without an approval for this exact version — a `draft`-policy type, which is opt-in from S19c" });
        const res = await fetch(`${origin}/_snypd/approve/post/${FIRST_POST.slug}`, { method: "POST", redirect: "manual" });
        if (res.status !== 303 && !res.ok) throw new Error(`approve: HTTP ${res.status}`);
        continue;
      }
      throw new Error(`publish refused for a reason this walk does not know how to satisfy: ${said}`);
    }
    const publishedMs = performance.now() - t0;

    // ── the walk's step 9 (docs/31 §3): `site` › deploy. The host has never seen this machine, so the
    //    tool runs `wrangler login` and a person clicks *allow* in the tab it opened — once per machine,
    //    and the one human action inside the tool. Then build, upload, the URL read back, `site.url` set
    //    from it and the site uploaded again against it. Proved by the result, not assumed: `loggedIn`
    //    is true only when login ran, and `deploys` is 2 only when the URL had to be learned.
    const deployed = await session.call("site", { action: "deploy" });
    const d = (deployed.structuredContent ?? {}) as { ok?: boolean; url?: string; loggedIn?: boolean; deploys?: number; urlSet?: string };
    if (!d.ok || !d.url) throw new Error(`deploy did not end at a URL:\n${deployed.content.map((c) => ("text" in c ? c.text : "")).join("\n")}`);
    // Row 9 of the §2 table L3 rewrote; on the relay door the step numbers are the fourteen-row table
    // that one replaced, where the deploy would have been the fifteenth row had it been written down.
    if (d.loggedIn) act({ step: door === "front" ? 9 : 14, kind: "allow-host", what: "click allow in the tab `wrangler login` opened", irreducible: true, proof: "refused",
      detail: "the host had never seen this machine; the tool ran its login and waited — nobody gets a URL on somebody else's host anonymously (docs/31 §3), and the credential lands in the host's own store, never ours" });
    if (/localhost/.test(d.url)) throw new Error(`the host answered with a localhost URL: ${d.url}`);

    // ── F4: onboarding state is derived from disk, so deleting the cache changes no answer except the
    //    heartbeat. Checked here rather than in a test as well, because the walk is the only place a
    //    *live* flow exists to delete it out from under.
    const survivesRestart = await checkRestart(session, dir, devUrl);

    return {
      binary: bin, door, driver: REFERENCE_DRIVER, actions, fresh: freshMachine(bin),
      printedNext, printedSentence, registeredBeforeHarness,
      ttfvMs: +ttfvMs.toFixed(1), ttfpMs: +ttfpMs.toFixed(1), publishedMs: +publishedMs.toFixed(1),
      lintClean, reviewUrl, url: d.url, deploys: d.deploys ?? 0, survivesRestart,
    };
  } finally {
    session?.stop();
    if (dev) { dev.kill("SIGTERM"); await dev.exited.catch(() => {}) }
    if (!opts.keep) rmSync(box, { recursive: true, force: true });
    if (stubState) rmSync(stubState, { recursive: true, force: true });
  }
}

/**
 * docs/08 F4 — "killing and restarting any process loses nothing that is not re-derivable".
 *
 * The instrument is `rm -rf .snypd/` under a live flow, and the comparison is `site` › doctor's
 * **structured facts** rather than the rendered Desk. Two reasons. Doctor returns the nine derived facts
 * as data (decision 64), so this diffs values instead of matching strings on a page whose wording is
 * allowed to change. And the facts are independent of one another, which the page is not: the first-run
 * checklist has a heartbeat row in it, so *any* page-level diff reports one cause as several losses —
 * which is what the first draft of this function did, and it read as F4 failing when nothing had.
 *
 * Three outcomes, and only the third is a failure:
 *
 *  - **heartbeat** — `.snypd/activity.json` is gone, so the server's claim to be spoken to goes with it.
 *    F4 exempts this by name, and decision 70 is why: a claim that outlived its process is worse than no
 *    claim, so going quiet is the correct answer rather than a lost one.
 *  - **live record** — `.snypd/dev.json` is the running preview's note of where it bound. Deleting it
 *    does not stop the server, but nothing can find it until that process writes the note again. It is a
 *    live process's claim about itself, not state derived from the repository, and it is reported
 *    separately rather than counted as either.
 *  - **host record** — `.snypd/deploy.json` (L3) is the last deploy's note of what the host answered:
 *    the URL, the count, when. It is a memory of an event on another system, not state derived from
 *    the repository, and the repository cannot re-derive it without the network. Doctor's sentence for
 *    its absence is *no deploy on record here*, which is true after the deletion — and `site.url`,
 *    which the deploy committed, is still in the config. Reported separately, like the live record.
 *  - **lost** — anything else. Every remaining fact is derived from git and the config on each request,
 *    so a difference here is F4 failing: onboarding state that only existed in a cache.
 */
export interface RestartCheck {
  checked: string[];
  heartbeat: string[];
  liveRecord: string[];
  hostRecord: string[];
  lost: string[];
  /** The Desk must still answer after its cache is deleted — the failure mode this instrument invites. */
  deskStillRenders: boolean;
  /**
   * The heartbeat, observed where it is observable. Doctor cannot show it going quiet: the session
   * asking *is* the harness, and decision 70 has in-process memory outrank the file precisely so that a
   * server cannot report itself unspoken-to while answering. The Desk is another process with only the
   * file, so its "Your harness has connected" row is the one place the deletion shows — and when that
   * row goes false the whole first-run checklist comes back, which is the crisp signal used here.
   */
  deskFirstRun: { before: boolean; after: boolean };
}

/** Doctor's facts that *are* the heartbeat. F4 exempts these by name. */
const HEARTBEAT_FACTS = new Set(["harness", "harnessState", "startedAt", "client"]);
/** …and the running preview's own note of itself, which is a claim rather than derived state. */
const LIVE_RECORD_FACTS = new Set(["dev", "deskUrl"]);
/** …and the last deploy's note of what the host said (L3): an event elsewhere, not derivable here. */
const HOST_RECORD_FACTS = new Set(["lastDeploy"]);

async function checkRestart(session: Session, dir: string, devUrl: string): Promise<RestartCheck> {
  const facts = async (): Promise<Record<string, unknown>> => {
    const r = await session.call("site", { action: "doctor" });
    const f = (r.structuredContent as { facts?: Record<string, unknown> } | undefined)?.facts;
    if (!f) throw new Error("doctor returned no structured facts — decision 64 says it returns them as data");
    return f;
  };
  const before = await facts();
  const deskBefore = await (await fetch(`${devUrl}/_snypd`)).text();

  // The order below is the whole of this function's correctness, and the first version got it wrong.
  //
  // The heartbeat is written *off* the turn that answers a call, a quarter-second late, so decision 70
  // can keep it off `mcp.coldStart`. That makes two races, and both of them produce a green run about
  // half the time — the kind docs/08 §12.10 calls corrosive, because it trains its reader to re-run
  // rather than look. The sleep drains a write that is already scheduled from the doctor call above;
  // the Desk is then read *before* any further call, because asking doctor again is itself a call and
  // would re-create the file this is trying to observe the absence of.
  await Bun.sleep(400);
  rmSync(join(dir, ".snypd"), { recursive: true, force: true });
  const desk = await fetch(`${devUrl}/_snypd`);
  const page = desk.ok ? await desk.text() : "";

  const after = await facts();
  const checked = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const changed = checked.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  return {
    checked,
    heartbeat: changed.filter((k) => HEARTBEAT_FACTS.has(k)),
    liveRecord: changed.filter((k) => LIVE_RECORD_FACTS.has(k)),
    hostRecord: changed.filter((k) => HOST_RECORD_FACTS.has(k)),
    lost: changed.filter((k) => !HEARTBEAT_FACTS.has(k) && !LIVE_RECORD_FACTS.has(k) && !HOST_RECORD_FACTS.has(k)),
    deskStillRenders: desk.ok && page.includes("Snypd Desk"),
    deskFirstRun: { before: deskBefore.includes("First run"), after: page.includes("First run") },
  };
}

/**
 * `onboard.handoff` is the number; the rest are the context that keeps it honest.
 *
 * Budgets: `handoff` carries docs/08 F1's 5 and is the one that was designed before it was measured.
 * `ttfv` and `ttfp` were proposed in docs/08 §3 "to be confirmed by the first measurement rather than
 * argued now" — S18g is that measurement, and both are kept where they were proposed because the first
 * run came in an order of magnitude under them. A budget that is loose on purpose is still a gate: it
 * catches the regression that turns two seconds into forty, which is the failure that loses somebody.
 */
export function onboardMetrics(w: OnboardWalk, relay?: OnboardWalk): Metric[] {
  const irreducible = w.actions.filter((a) => a.irreducible).length;
  const observed = w.actions.filter((a) => a.proof !== "structural").length;
  return [
    // `exact`: five is a number docs/08 F1 states in prose, not a target with headroom. 80 % of it is
    // four, which no document claims and which would have this row read ⚠️ at the exact value F1 asks for.
    { name: "onboard.handoff", value: w.actions.length, unit: "actions", budget: HANDOFF_BUDGET, exact: true,
      note: `the front door (docs/08 §2): ${w.actions.map((a) => a.kind).join(" · ")} — ${irreducible} irreducible (decision 65), ${observed} of ${w.actions.length} established by the product refusing or the file being absent` },
    // L4. The second door, kept because it is what S18g–L2 measured and what somebody already inside a
    // harness still walks (docs/08 §9). No budget: F1 is about §2, and giving this row the same 5 would
    // quietly make the longer walk the one the project defends.
    ...(relay ? [{ name: "onboard.handoff.relay", value: relay.actions.length, unit: "actions",
      note: `the sentence pasted into an open harness: ${relay.actions.map((a) => a.kind).join(" · ")} — the restart and the name question are the two the front door does not pay (decision 178)` } satisfies Metric] : []),
    { name: "onboard.handoff.fresh", value: w.actions.length + (w.fresh ? 1 : 0), unit: "actions",
      note: w.fresh ? `a machine with no git author identity: ${w.fresh.detail}` : "no git identity needed — this machine had one and the walk could not reach the state (docs/08 §12.11)" },
    { name: "onboard.ttfv", value: +(w.ttfvMs / 1000).toFixed(2), unit: "s", budget: TTFV_BUDGET / 1000,
      note: `${w.door === "front" ? "a directory that does not exist yet" : "an empty directory"} → \`init\` → \`dev\` → the Desk answering 200, against the artefact named at the foot of this file (docs/08 F6)` },
    { name: "onboard.ttfp", value: +(w.ttfpMs / 1000).toFixed(2), unit: "s", budget: TTFP_BUDGET / 1000,
      note: `the typed line → a lint-clean draft with a review URL · driver: ${w.driver} — no model latency in this number, and S21 substitutes three that have it` },
    { name: "onboard.published", value: +(w.publishedMs / 1000).toFixed(2), unit: "s",
      note: "…and on to a published post — report-only: it is bounded by how fast a person reads" },
    // docs/31 §5 · L4 names this row `onboard.live`; L2 puts it here because L2 is what changed the walk's
    // end from a local publish to a URL. A count, exact, for the reason `handoff` is: two uploads is the
    // shape of a first deploy (the URL is learned on the first and the site rebuilt against it), and one
    // or three would each mean something moved.
    { name: "onboard.live", value: w.deploys, unit: "uploads", budget: 2, exact: true,
      note: `${w.url} — the first \`site\` › deploy, against the stub wrangler: login, build, upload, the URL read back, \`site.url\` set, build and upload again` },
  ];
}

/**
 * `snypd bench onboard`. Writes `bench/onboard.{json,md}` beside the other lanes.
 *
 * Both doors are walked (L4), sharing one compiled binary: the front one because it is the flow docs/08
 * §2 describes and F1 is about, the relay one because it is what the Desk still offers and what every
 * measurement from S18g to L2 counted. A second walk costs about four seconds and is the difference
 * between a number and a claim.
 */
export async function onboard(opts: { bin?: string; keep?: boolean; write?: boolean } = {}): Promise<{ report: Report; walk: OnboardWalk; relay: OnboardWalk }> {
  const { VERSION, toMarkdown } = await import("../src/index");
  const bin = opts.bin ?? (await compile(join(mkdtempSync(join(tmpdir(), "snypd-onboard-bin-")), "snypd")));
  const walk = await runOnboard({ ...opts, bin, door: "front" });
  const relay = await runOnboard({ ...opts, bin, door: "relay" });
  const report: Report = { version: VERSION, suite: "onboard", bun: Bun.version, date: new Date().toISOString(), tokenizer: "o200k_base", metrics: onboardMetrics(walk, relay) };
  if (opts.write !== false) {
    writeFileSync("bench/onboard.json", JSON.stringify({ ...report, actions: walk.actions, relayActions: relay.actions, fresh: walk.fresh, survivesRestart: walk.survivesRestart }, null, 2));
    writeFileSync("bench/onboard.md", `${toMarkdown(report)}\n\n${formatWalk(walk, relay)}\n`);
  }
  return { report, walk, relay };
}

/** The breakdown decision 65 asks for: not just the total, and not just which rows were observed. */
export function formatWalk(w: OnboardWalk, relay?: OnboardWalk): string {
  const r = w.survivesRestart;
  const table = (x: OnboardWalk) => [
    `| # | Step | What a person does | Decision 65 | Established by | Why |`,
    `|---|---|---|---|---|---|`,
    ...x.actions.map((a, i) => `| ${i + 1} | §2.${a.step} | ${a.what} | ${a.irreducible ? "**irreducible**" : "—"} | \`${a.proof}\` | ${a.detail} |`),
  ];
  const fresh = w.fresh
    ? `\n**On a machine with no git author identity** — a CI runner, a container, a fresh laptop — there is one more: ${w.fresh.what}. ${w.fresh.detail}.\n`
    : "\n**On a machine with no git author identity** the walk found nothing to add.\n";
  const second = relay ? [
    `## The second door — ${relay.actions.length} human actions`, "",
    `The Desk's sentence, pasted into a harness that is already open (docs/08 §9, decisions 58–60). Step numbers here are the fourteen-row table decision 178 replaced, which is where they were measured.`, "",
    ...table(relay), "",
    `The two the front door does not pay: **the name question** — \`init\` asks nothing when a person runs it, because the name falls back to the directory (decision 63) — and **the restart**, because the harness is opened after \`.mcp.json\` exists rather than before. \`.mcp.json\` on disk when the harness started: front **${w.registeredBeforeHarness ? "yes" : "no"}**, relay **${relay.registeredBeforeHarness ? "yes" : "no"}** — the same observation, and the whole of the difference.`, "",
  ] : [];
  return [
    `## The handoff — ${w.actions.length} human action${w.actions.length === 1 ? "" : "s"}`, "",
    `The front door (docs/08 §2): \`bunx @snypd/cli init ${SITE_DIR} && ${NEXT_LINE}\`, then the sentence, then the host's page. \`init\` was given a directory and no flags.`, "",
    ...table(w), "",
    fresh,
    ...second,
    `## F4 — survives the restart`, "",
    `\`.snypd/\` deleted under a running \`dev\`, then \`site\` › doctor asked again: **${r.checked.length} derived facts, ${r.lost.length} lost**.`,
    r.lost.length
      ? `Lost: **${r.lost.join(", ")}** — state that existed only in the cache, which is F4 failing.`
      : `Everything is re-derived from git and the config on the request. ` +
        (r.heartbeat.length
          ? `The heartbeat facts doctor reports changed (${r.heartbeat.join(", ")}), which F4 exempts by name. `
          : `Doctor's own heartbeat facts did not move, and cannot: the session asking is the harness, and decision 70 has in-process memory outrank the file so a server cannot report itself unspoken-to while answering. `) +
        `The running preview's record of where it bound (${r.liveRecord.join(", ") || "unchanged"}) went with the directory it lives in, and returns when that process writes it again. ` +
        `The last deploy's note of what the host answered (${r.hostRecord.join(", ") || "unchanged"}) went too, and doctor now says *no deploy on record here* — true, and \`site.url\` is in the config the deploy committed.`,
    `The Desk still renders with its cache deleted: ${r.deskStillRenders ? "yes" : "**no**"}. Its first-run checklist ` +
      (r.deskFirstRun.before === r.deskFirstRun.after
        ? `was ${r.deskFirstRun.after ? "showing" : "finished"} on both sides.`
        : r.deskFirstRun.after
          ? `came back — the heartbeat is the one fact the Desk can only get from the file, so deleting it correctly returns that row to unfinished.`
          : `went away, which it should not have.`),
    "", `Driver \`${w.driver}\` · binary \`${w.binary}\` · review URL handed back: ${w.reviewUrl ? "yes" : "**no**"} · lint clean: ${w.lintClean ? "yes" : "**no**"}`,
    `\`init\` printed \`${w.printedNext}\` as its last line and *${w.printedSentence}* as the sentence to say; the site ended at ${w.url}.`,
  ].join("\n");
}
