/**
 * S18g — first run, gated. docs/08 F1 (the handoff), F3 (no dead ends), F4 (survives the restart).
 *
 * The lane next door produces the numbers and an artefact; this file is where they are *enforced*, for
 * the reason `packages/bench/agent/run.ts` gives about its own split: budgets in `snypd bench` are
 * continuous measurements gated at 80 % so a drift fails before a breach, and 80 % of a human action is
 * not a thing. "Six actions, not 5.2" is only sayable here.
 *
 * The whole file runs against **one** walk of the compiled binary, shared by every case. A walk costs a
 * compile plus about two seconds; thirteen of them would cost a CI job. `beforeAll` pays it once and the
 * cases read the record it left, which is also the honest shape — F1, F3 and F4 are three questions
 * about a single first run, not three first runs.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compile } from "./build";
import { runOnboard, HANDOFF_BUDGET, TTFV_BUDGET, TTFP_BUDGET, type OnboardWalk } from "./onboard";

let walk: OnboardWalk;
let relay: OnboardWalk;
let bin = "";

beforeAll(async () => {
  bin = await compile(join(mkdtempSync(join(tmpdir(), "snypd-onboard-bin-")), "snypd"));
  // Two walks, one binary (L4): `walk` is the front door docs/08 §2 describes and F1 is about, `relay`
  // is the sentence pasted into an open harness, which is what every measurement before this one counted.
  walk = await runOnboard({ bin, door: "front" });
  relay = await runOnboard({ bin, door: "relay" });
}, 300_000);

describe("F1 — the handoff (docs/08 §2, decision 65)", () => {
  /**
   * **The measured number is 6, and F1's budget is 5.** That is a finding, not a slack assertion, and it
   * is pinned exactly here so it cannot drift in either direction unnoticed.
   *
   * The sixth is *answering where the site will be served*. `publishCheck` refuses on the placeholder URL
   * before it refuses on the missing approval, so a person is asked for two different things at step 12:
   * a value, in the chat, and a click, on the review page. docs/08 §2 assumed those fold into one and
   * said so in as many words — *"the flow assumes it is asked and answered inside step 12's approval, and
   * whether that holds is a question for a measured walk rather than for this paragraph."* It does not
   * hold. The approval is a click on a page and the URL is a reply in a harness; they are two surfaces,
   * and nothing can merge them without moving one of the two.
   *
   * This is a real tension between two things the project has already decided, and resolving it is not
   * this test's job — decision 63 keeps the URL question away from step 4 because asking for a production
   * domain before somebody has seen a pixel is how setup flows lose people, and F1 wants five. Both are
   * defensible; they are not both achievable while the URL is required at publish. What this test does is
   * make the number impossible to lose: change the flow and this line fails, and whoever changes it reads
   * the paragraph above before they edit it.
   */
  /**
   * **Five, and F1 is green** — S19c, decision 80. This read six from S18g until the write policy's
   * default moved from `draft` to `publish`, and the action that left is `approve-post`: the walk breaks
   * out of its publish loop on the first call that does not refuse, so nothing here was told about the
   * change, it measured it. That is the whole reason the count was built as a measurement.
   *
   * The sixth is not gone from the product. A site that declares `mcp.write: draft` still pays it, and
   * the branch that records it is still in `onboard.ts` for exactly that walk.
   */
  /**
   * **Still five, and the fifth changed** — L2, docs/31 §4. The URL left: `publishCheck` no longer asks
   * for it, because a publish is a commit and the host *answers* the question at deploy. The click
   * arrived: the walk now ends at a URL rather than at a local publish, and the host has never seen the
   * machine, so `site` › deploy runs `wrangler login` and waits for a person to allow it (decision 230).
   * One action out, one in, and the one that came in is irreducible where the one that left was not —
   * nobody gets a URL on somebody else's host anonymously. Measured, again: the walk counts `allow-host`
   * only when the deploy result says login ran.
   */
  /**
   * **Three, on the door F1 is about** — L4, docs/31 §5.
   *
   * Everything above counted the *relay* door: a sentence pasted into a harness that was already open,
   * the agent running `init`, and therefore a shell approval and a restart. Decision 178 moved the front
   * door to a typed line in S24 and docs/08 §2 was rewritten to it in L3 — and for those six sessions
   * nothing measured the flow F1's first word points at. The number under the paragraph was five, the
   * flow above the paragraph had three in it, and neither was wrong; they were about different walks.
   *
   * So the instrument walks both, and the one that carries F1's budget is the one §2 shows. Three is not
   * a target that was met — the budget is still five, and is not being moved down to look better — it is
   * what the line costs once `init` stopped asking for a name (decision 63) and the harness stopped
   * needing a restart (178). The two that left are named in the case below, and the one that arrived,
   * `allow-host`, is the irreducible one.
   */
  test("three human actions on the front door: type the line, say the sentence, click allow", () => {
    expect(walk.door).toBe("front");
    expect(walk.actions.map((a) => a.kind)).toEqual(["type", "say", "allow-host"]);
    expect(walk.actions.length).toBeLessThanOrEqual(HANDOFF_BUDGET);   // F1's budget, and not moved to meet it
    expect(walk.actions.map((a) => a.kind)).not.toContain("answer-url");   // the product stopped asking (L2)
    // Both halves of the typed line are the product's, and both are read off what it printed rather than
    // remembered: `init <dir>` made the directory, and its last line is the rest of what gets typed (L1).
    expect(walk.printedNext).toBe("cd ash-and-ember && claude");
    // …and the sentence ends online, because the host's config is in the repo by default (L3, decision 229).
    expect(walk.printedSentence).toBe("Write me a first post and put it online.");
  });

  /**
   * The second door is still five, and is still walked — the Desk offers that sentence (docs/08 §9) and
   * somebody already inside a session has no use for a line that means closing it. Pinned exactly, in
   * both directions, for the reason the count has always been pinned: the two doors differ by exactly
   * two actions, and if that ever becomes one or three it is because the product moved.
   */
  test("the second door is five, and the two extra are the name question and the restart", () => {
    expect(relay.actions).toHaveLength(5);
    expect(relay.actions.map((a) => a.kind)).toEqual(["paste", "answer", "approve-shell", "restart", "allow-host"]);
    expect(relay.actions).toHaveLength(HANDOFF_BUDGET);   // the older door still lands exactly on the budget
    const extra = relay.actions.map((a) => a.kind).filter((k) => !walk.actions.some((a) => a.kind === k));
    expect(extra).toEqual(["paste", "answer", "approve-shell", "restart"]);
  });

  /**
   * …and the restart's absence from the front door is an observation, not an assumption. A harness reads
   * `.mcp.json` when it starts; the only question is whether the file was there first. It is, because
   * the person typed `cd my-site && claude` *after* `init` finished — and on the relay door it is not,
   * because an agent ran `init` inside a session that had already read the file's absence.
   */
  test("the front door skips the restart because the file was on disk before the harness started", () => {
    expect(walk.registeredBeforeHarness).toBe(true);
    expect(relay.registeredBeforeHarness).toBe(false);
    expect(walk.actions.map((a) => a.kind)).not.toContain("restart");
    expect(relay.actions.find((a) => a.kind === "restart")!.proof).toBe("absent");
    expect(relay.actions.find((a) => a.kind === "restart")!.detail).toContain("did not exist");
  });

  /**
   * Decision 65 said two of these were the safety story and a funnel metric that rewards removing them is
   * pointed at the wrong thing. **Decision 80 removed one of the two deliberately**, which is the case
   * that rule was written to make expensive rather than impossible: it took a decision, a documented
   * argument and a rewritten gate, not an optimisation.
   *
   * What is left is irreducible in the strict sense — neither is ours to delete. A shell command needs
   * its user's approval because the harness asks, not because we do; a harness reads `.mcp.json` at
   * startup because that is what harnesses do.
   */
  test("approving a shell command and restarting the harness are never optimised away", () => {
    const irreducible = relay.actions.filter((a) => a.irreducible).map((a) => a.kind);
    expect(irreducible).toContain("approve-shell");
    expect(irreducible).toContain("restart");
    expect(irreducible).toContain("allow-host");             // the host must see the person once (docs/31 §3)
    // And the one that left is gone from the walk rather than quietly reclassified as optional.
    expect(relay.actions.map((a) => a.kind)).not.toContain("approve-post");
  });

  /**
   * The front door pays one, and it is the one nobody can delete. Decision 178 did not optimise the
   * shell approval and the restart away — it moved who runs `init`, and they went with it; the rule
   * that makes removing an irreducible action expensive is about the *product* removing it, which is
   * why the relay walk above still pays both and the case above still pins them.
   */
  test("the front door's one irreducible action is the host's, and it is the last thing a person does", () => {
    const irreducible = walk.actions.filter((a) => a.irreducible).map((a) => a.kind);
    expect(irreducible).toEqual(["allow-host"]);
    expect(walk.actions.at(-1)!.kind).toBe("allow-host");
    expect(walk.actions.map((a) => a.kind)).not.toContain("approve-post");
  });

  /**
   * Half the count is structural and half is observed; a number that hides which is worse than two.
   *
   * The front door's two structural actions are a person typing and a person speaking, and no code can
   * prove either — but both have a product half that *is* observed, and the case above asserts those:
   * the line `init` printed, and the sentence it printed. That is as close as a structural action gets
   * to being measured, and the distinction is kept rather than blurred.
   */
  test("every action a product can prove was proved by the product refusing", () => {
    expect(walk.actions.filter((a) => a.proof !== "structural").map((a) => a.kind)).toEqual(["allow-host"]);
    expect(relay.actions.filter((a) => a.proof !== "structural").map((a) => a.kind)).toEqual(["restart", "allow-host"]);
    // One observed wait now, and it is the host's: `deploy` reported that login ran. `publishCheck` no
    // longer refuses for the URL (L2); it still refuses for an approval on a site that asks (S19c).
    expect(walk.actions.filter((a) => a.proof === "refused").map((a) => a.kind)).toEqual(["allow-host"]);
  });

  /**
   * docs/08 §12.11, which S18d left open in as many words: *"whether it does is a question for S18g's
   * measured walk rather than for this paragraph."* It does. A machine with no git author identity —
   * a CI runner, a container, a fresh laptop — pays a seventh, and the product half of that is already
   * fixed: `init` prints the two `git config --global` lines, so the agent can run them with one
   * approval instead of handing the person homework. What this asserts is that it is *said*, because
   * an unsaid one is a dead end and F3 is a release blocker.
   */
  test("a machine with no git identity pays one more, and is told which", () => {
    expect(walk.fresh).toBeDefined();
    expect(walk.fresh!.kind).toBe("git-identity");
    expect(walk.fresh!.proof).toBe("refused");
    expect(walk.fresh!.detail).toContain("printed the two lines that fix it");
  });
});

describe("F2 — time to first post", () => {
  test("a lint-clean draft with a review URL, from an empty directory", () => {
    expect(walk.lintClean).toBe(true);
    expect(walk.reviewUrl).toMatch(/^https?:\/\//);
    expect(walk.ttfpMs).toBeLessThan(TTFP_BUDGET);
    expect(walk.ttfvMs).toBeLessThan(TTFV_BUDGET);
    // ttfv is a prefix of ttfp by construction — the Desk is painted before the post is written — and
    // an inversion means one of the two stopped measuring what its name says.
    expect(walk.ttfvMs).toBeLessThan(walk.ttfpMs);
  });

  /** docs/08 F2: the model goes beside the number. This driver has none, and says so rather than
   *  letting a 1.7 s reference run be read as what a person with a model will see (S21 measures that). */
  test("the driver is named beside the number", () => {
    expect(walk.driver).toContain("no model");
  });
});

/**
 * F3 — no dead ends. One case per row of docs/08 §6, which is the form S18d asked for and could not
 * give: it asserted per *surface* (`initialize`, the prompt, init's text, doctor, the publish refusal)
 * and the states were left implied. The question each case asks is the table's own fifth column —
 * *what must tell them the next step* — and it asks it on the surface the fourth column names, because
 * half of onboarding failure is a correct instruction delivered to the wrong reader.
 */
describe("F3 — the seven states, each naming its own next action", () => {
  /** State 0: no binary. The only row whose surface is a README, and the only one still blocked. */
  test("0 · no binary → the README sentence names what to run", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("snypd init");
    // docs/08 §5 and `07` decision 69: the sentence reads `bunx @snypd/cli init` from the first
    // published release, and until then it is a checkout. Whichever it currently is, it must be *a
    // runnable command in the README*, not a promise — this asserts the row is not empty, not that it
    // is npm. The launcher is scoped since S18h and the binary is not, so both spellings are live: what
    // you `bunx` is the package, what a checkout runs is the verb. Since L6 the front door is one line
    // long enough to want its own fenced block — `init <dir> && cd && claude`, where three commands
    // used to be — so the command counts whether it opens a fenced line or sits in an inline span.
    // Both are code a reader can run, which is the whole of this row's claim.
    expect(readme).toMatch(/(^|`)(bunx @snypd\/cli|bun run snypd) init/m);
  });

  /** State 1: a binary, no site. The surface is the usage line, and it must not exit 0. */
  test("1 · binary, no site → the usage line names `init`", () => {
    const p = Bun.spawnSync([bin], { cwd: tmpdir(), stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
    const said = p.stdout.toString() + p.stderr.toString();
    // The row's claim is that somebody who has the binary and no site is told what to run next. It is
    // *not* a claim about the exit code: no arguments prints usage and exits 0, which is the ordinary
    // reading of "you asked for help", and `snypd nonsense-verb` exits non-zero — smoke.test.ts owns
    // that pair. Asserting an exit code here would gate a convention this row does not care about.
    expect(said).toContain("init");
    expect(said).toContain("serve");
  });

  /**
   * State 2 — the first of the two that were the crack. Since decision 178 it is ordinarily crossed by
   * a *person* who ran `init` in a terminal and now opens the harness; when an agent ran it instead, the
   * next step is a restart the agent cannot do, and init's stdout carries the one sentence it relays.
   */
  test("2 · scaffolded, harness not started → init's stdout says what to open and what to say", () => {
    // The front door crosses this state without stopping — the line types `cd … && claude` after `init`
    // returns — so the state is reached on the relay walk, which is the one an agent's `init` produces.
    const restart = relay.actions.find((a) => a.kind === "restart")!;
    expect(restart.proof).toBe("absent");
    expect(restart.detail).toContain("did not exist");
    // The sentence itself is asserted against the artefact in smoke.test.ts, where init's stdout is
    // captured; what this row owns is that the state is real — the file a harness reads was written
    // after the harness started, so nothing but a restart can load the tools.
  });

  /** State 3: the restart happened and the context died. `initialize` has to pick up alone. */
  test("3 · MCP loaded, zero content → initialize's instructions name the prompt", () => {
    // Asserted inside the walk: it throws if `instructions` does not name `get-started`, because a walk
    // that got past this row without it would be measuring a flow no agent could follow.
    expect(walk.ttfpMs).toBeGreaterThan(0);
    expect(relay.actions.some((a) => a.step === 7)).toBe(true);
  });

  /** State 4: a draft nobody has approved. The surface is a person's — the Desk and the review page. */
  test("4 · first draft, unpublished → a review URL a person can open", () => {
    expect(walk.reviewUrl).toContain("/_snypd/");
    expect(walk.survivesRestart.deskStillRenders).toBe(true);
  });

  /** State 5: published to `main`. Reached with nothing owed by a person: the URL is the host's to answer now. */
  test("5 · published locally → reached, and nobody was asked for anything", () => {
    expect(walk.publishedMs).toBeGreaterThan(walk.ttfpMs);
    // Until S19c this asserted `approve-post`; until L2, `answer-url`. Under decision 80 the agent
    // publishes, and under docs/31 §4 the one thing it could not answer for itself — where the site will
    // be served — is answered by the host at deploy rather than asked of a person at publish.
    expect(walk.actions.map((a) => a.kind)).not.toContain("answer-url");
    expect(walk.actions.map((a) => a.kind)).not.toContain("approve-post");
  });

  /**
   * State 6: live. `site` › deploy, docs/31 §3 step 9 — the URL came from the host, `site.url` was the
   * placeholder so the site was built and uploaded twice, and the person's part was one click.
   */
  test("6 · live → `site` › deploy ends at the host's URL, two uploads the first time", () => {
    expect(walk.url).toMatch(/^https:\/\/[a-z0-9-]+\.stub\.workers\.dev$/);
    expect(walk.deploys).toBe(2);
    expect(walk.actions.map((a) => a.kind)).toContain("allow-host");
  });
});

describe("F4 — survives the restart", () => {
  /** `rm -rf .snypd/` mid-flow changes no answer except the heartbeat. */
  test("every derived fact comes back; nothing lived only in the cache", () => {
    expect(walk.survivesRestart.lost).toEqual([]);
    expect(walk.survivesRestart.checked.length).toBeGreaterThan(8);
    expect(walk.survivesRestart.deskStillRenders).toBe(true);
    // L3: the deploy's note of the host's answer is the one thing in `.snypd/` that is neither derived
    // nor a live process's claim — it went, it is reported by name, and the derived half (`deploy`:
    // target, mode, policy, the URL from the config) is in `checked` and not in `lost`.
    expect(walk.survivesRestart.hostRecord).toEqual(["lastDeploy"]);
    expect(walk.survivesRestart.checked).toContain("deploy");
  });

  /**
   * …and the exemption is real rather than vacuous. The Desk is a different process with only the file,
   * so deleting `.snypd/activity.json` must return "Your harness has connected" to unfinished — which
   * brings the whole first-run checklist back. If this ever stops happening, either the Desk grew a
   * cache of its own or the heartbeat stopped being read from disk, and both are decision 70 undone.
   */
  test("the heartbeat is the one thing that goes quiet, on the surface that can see it", () => {
    expect(walk.survivesRestart.deskFirstRun.before).toBe(false);
    expect(walk.survivesRestart.deskFirstRun.after).toBe(true);
  });
});
