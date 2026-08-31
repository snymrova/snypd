# 08 — First run: the path from nothing to a first post

**Owner:** PM · **Engineer:** Claude Code · **Reviewer / decider:** Sunny · **Written:** 29 Aug 2026 · **Audited and re-spined:** 29 Aug 2026 · **Walked end to end against the compiled binary:** 31 Aug 2026 (§12), and again after S18d landed · **Inputs:** docs 00–07, the code as of `75ee22d` (S18b′).

**Why this is its own document:** every other gate in `07` measures something the product does. This one measures whether anybody ever gets to use it. D1 says "from a fresh Claude Code session with only the MCP"; D6 says a live public site. Both assume a person crossed a gap that no session has ever owned end to end.

**What the audit changed.** The first draft of this document declared *agent-first* in §4 and then designed *human-first* in every deliverable: a human verb, an auto-opened browser, a checklist page. It did so because it began from a premise that is false — that the agent cannot participate in its own bootstrap. It can: every harness this product targets has a shell. The gap is not three commands long. It is **one human action long**, and that action is a harness restart. This version is rebuilt around that correction. The pre-audit text is preserved in git history at the commit that introduced it.

Decisions continue `07` §7's numbering (54–) so a reference to "decision 51" means one thing across both files.

---

## 1. The stake, stated plainly

Snypd's entire pitch is *"your CMS is wherever your agent is."* The first run is the one part of the product where that is **not yet true** — the agent cannot restart the harness that would give the agent its tools. Every first-time user is therefore dropped, briefly, into exactly the world Snypd exists to replace.

That gap is short. It is also the whole funnel. A CMS that is excellent from turn two and confusing at turn one converts nobody, and no amount of `bench` green fixes it, because the person who bounced never ran a benchmark.

**Two facts make this urgent rather than merely important.**

- It is **unmeasured**. `bench/latest.md` gates 34 numbers. Not one of them covers the path in this document. Principle 9 says measure or don't claim, and "two commands and a sentence from an empty directory" is today a claim.
- It is **untested by construction**. `bun test` runs from a checkout where the MCP is already registered and a config already loads. Every test in this repo starts in state 3 of the seven in §6. That is the same class of blindness that let S18a's `$bunfs` bug survive to the binary: *the suite cannot fail on a state it never enters.*

---

## 2. The flow, in full

This is the spine of the document. Everything below either serves this sequence or is explicitly named as serving somebody else.

A person arrives at the repo, or at snypd.rocks. They do not open a terminal. They have a harness open already — that is the premise of the product — and what they see is **a sentence to paste into it**.

> **Set up snypd here and write me a first post.** Ask me what the site is called, then run `bunx snypd init`.

| # | Who acts | What happens | Human action? |
|---|---|---|---|
| 1 | person | pastes the sentence into Claude Code, Cursor or Codex | **yes** — paste |
| 2 | agent | asks, in **one** message: what is the site called, and one line about it | — |
| 3 | person | answers | **yes** — answer |
| 4 | agent | runs `bunx snypd init --name=… --description=…` | **yes** — approve the shell command |
| 5 | `init` | writes `snypd.yaml`, the content dirs, `.gitignore`, `.mcp.json`; `git init` if the directory is empty; commits the scaffold. **Prints an onboarding document addressed to the agent** (decision 60) | — |
| 6 | agent | relays the one thing it cannot do: *restart your harness so the snypd tools load* | — |
| 7 | person | restarts the harness | **yes** — restart |
| 8 | — | **the agent's context dies here.** Whatever was in the conversation is gone (decision 61) | — |
| 9 | agent, new session | `initialize` returns `instructions`, which name `get-started` for a site with no content. The agent reads `snypd://config`, `snypd://spec/primitives`, `snypd://theme` | — |
| 10 | agent | writes one real post using at least two primitives, fixes the lint it gets back, calls `content.render_preview` | — |
| 11 | agent | hands back the page, the markdown twin, and the review URL — and says plainly that publishing is the human's | — |
| 12 | person | opens the review URL, reads the post, approves | **yes** — approve the post |
| 13 | agent | `content.publish` lands the one item on the deploy branch | — |

**Five human actions, and only one of them is friction.** Answering a question and approving a post are the product working. Approving a shell command is a correct security prompt. The restart is the only irreducible cost, and it exists because a harness reads `.mcp.json` when it starts — which is not ours to change.

**The URL is absent from this table on purpose.** The feed, sitemap and JSON-LD are all absolute, so a real origin is genuinely required — at step 12, not step 4. Asking for a production domain before a person has seen one pixel is the single most common way a setup flow loses somebody (decision 63).

**Step 4 is built and waiting on one decision** (S18d′). The README carries the sentence, and everything `bunx snypd`
needs is written: a launcher on npm whose binary arrives as one platform-gated optional dependency, a release workflow
that publishes it with provenance on a `v*` tag, and a test that builds the host package, links it the way an installer
would and runs it under `node`. What has not happened is the publish — `07` decision 69 keeps that with Sunny, because a
scoped unpublish window is 72 hours and the name is claimed permanently. Until it is pressed, step 4 reads
`bun run snypd init` from a checkout, and F1 stays measured rather than claimed.

---

## 3. Definition of done

First run is done when all seven are true, on Linux + macOS, from the compiled binary:

| # | Gate | Evidence |
|---|---|---|
| **F1** | **Handoff cost.** The flow in §2 completes in **five human actions or fewer**, none of them typing a command, none of them opening an editor. | `onboard.handoff`, counted as actions rather than seconds (decision 65) |
| **F2** | **Time to first post.** From the paste to a lint-clean draft with a review URL. | `onboard.ttfp`, driven by the S17 MCP client, model named beside the number |
| **F3** | **No dead ends.** Every state in §6 names its own next action, *on the surface its actor is looking at* — stdout for an agent, the page for a person. A state that can be reached and cannot be left is a release blocker. | state-transition test, one case per row of §6 |
| **F4** | **Survives the restart.** Onboarding state is derived from disk on every request and on every session start; killing and restarting any process loses nothing that is not re-derivable. | `rm -rf .snypd/` mid-flow changes no answer except the heartbeat |
| **F5** | **Three entry paths converge.** Agent-first (§2), terminal-first (`snypd init` typed by a person), and clone (`snypd.yaml` + `.mcp.json` already committed) reach the same state and are told the same next thing. | all three drive the same assertions |
| **F6** | **Time to first visual.** For the terminal-first fallback: ≤ 2 commands from an empty directory to a painted Desk, no flags required. | `onboard.ttfv`, against the artefact |
| **F7** | **The first-run surfaces are held to the Desk's budgets.** 0 KB JS, 0 axe violations, CLS 0 — on the *empty* and *first-run* states, not only the populated one. | `desk.*` lane extended to cover them |

**F1, F2 and F6 get budgets; the rest are boolean.** F1's budget is 5 and is the number this document exists to defend. `onboard.ttfp` ≤ 60 s including model latency and `onboard.ttfv` ≤ 5 s wall clock on a cold box are proposed, to be confirmed by the first measurement rather than argued now.

---

## 4. Who arrives, and in what state

| Who | Arrives with | Wants | Served by |
|---|---|---|---|
| **Agent-first** | a harness open; may never type a command | to paste one sentence | **§2 — the primary flow** |
| **Curious dev** | a terminal, no site, low commitment | to see what it is in a minute | `snypd init` + `snypd dev` (F6) |
| **Second on a site** | a clone with `snypd.yaml` + `.mcp.json` | to start writing | **not served on any machine but the author's** — the committed registration names an absolute local path (§12.8) |
| **Has content** | a folder of markdown, a real blog | to migrate | **not at all**, and deliberately — a v0.2 `migrate-from-*` prompt |

**Decision: build for agent-first; keep terminal-first working, and name the user we are not serving.** A first run that tries to serve four arrivals equally serves the loudest one and pleases nobody.

---

## 5. Agent-first is blocked at state 0, and that changes the schedule

`bunx snypd init` is step 4 of §2 and nothing on npm answers it. Everything else in this document is downstream of that.

The first draft noted this and wrote *"No work here; the note exists so S18b″ is scoped with this in mind."* That is not tenable once agent-first is the declared primary flow: **you cannot gate a funnel on a population that cannot arrive.** `curl | sh` does not rescue it either — an agent cannot run a pipe-to-shell without a human approving something that *should* alarm them, which is a bad first impression and a correct security prompt at the same time.

So: **the npm platform-package publish moves ahead of the first-run Desk page.** *(Done in S18d′, up to the publish itself — `07` decisions 66 and 69.)* It was already the preferred shape on trust grounds (the esbuild/bun pattern, provenance, a Homebrew tap beside it — `07` S18b″); it is now load-bearing for onboarding as well. Until it lands, §2 step 4 reads `bun run snypd init` from a checkout, the flow is verifiable end to end for us and for nobody else, and F1 is measured but not claimed.

---

## 6. The seven states

| # | State | Reached by | Who is looking | What must tell them the next step | Exists? |
|---|---|---|---|---|---|
| 0 | no binary | — | agent | the README sentence; `bunx` resolves it | ❌ blocked on §5 |
| 1 | binary, no site | the paste | agent | `snypd init`'s usage / `--help` | ✅ usage line |
| 2 | site scaffolded, **harness not restarted** | `snypd init` | **agent**, then person | **`init`'s stdout** (decision 60) — the agent relays what it cannot do | ✅ S18d — addressed to the agent, the restart phrased to be relayed verbatim |
| 3 | MCP loaded, zero content | restart | agent | **`initialize`'s `instructions`** → `get-started` (decision 61) | ✅ S18d — static, and it names the prompt; `get-started` branches |
| 4 | first draft, unpublished | one sentence | person | Desk "in flight" + review page | ✅ shipped S18b′ |
| 5 | published locally to `main` | approval | person | Desk build card | ✅ |
| 6 | live on the internet | `site.push` | person | — | S19a |

**States 2 and 3 were the crack**, and both are crossed by an agent, not a person. The first draft of this document located the crack correctly and then handed it to a browser. S18d closed both, in strings: state 2's stdout is written for the reader it has, and state 3 picks up from `initialize` rather than from a handoff that cannot survive the restart. States 4–5 are in good shape and are not re-litigated here.

**The column that matters is "who is looking."** Half of onboarding failure is a correct instruction delivered to the wrong reader — a line of prose for a human printed where an agent will act on it, or a page rendered for a person at a moment when nobody has a browser open. Every gap below is an instance of that.

---

## 7. Transitions — what is missing at each

### 0 → 1 · getting the binary
See §5. No design work; a scheduling decision, taken.

### 1 → 2 · `snypd init` — **fails for a first-timer on both paths today**

`cli/index.ts:127` exits 2 unless both `--name` and `--url` are passed. `catalog.ts:265` calls `need(args, "url")`, so the agent path hard-requires it too. A person who has just met a CMS is being asked for a production origin before seeing one pixel — and the agent that is trying to help them cannot route around it.

- **`snypd init` with no arguments must succeed.** Name ← the directory name. URL ← a localhost placeholder. Flags stay optional, not absent: §2 step 4 passes `--name` because the agent asked for it, and the no-args form is the terminal-first fallback and the test fixture.
- **The same on both paths.** `site` › init drops `need(args,"url")` and takes the same placeholder. Decision 52's sixth derived fact — *is `site.url` still a placeholder* — is currently unreachable because nothing in the codebase can produce that state (`initSite` validates through `new URL()`, `core/src/site.ts:221`). Fixing one caller and not the other leaves the row half-reachable, which is worse than unreachable.
- **git:** `initSite` returns `git: isRepoRoot(root)` and both callers merely report it (`cli/index.ts:144`, `catalog.ts:267`). In an *empty* directory `init` should run `git init` itself and say so — nothing in this product works without it. In a directory that has files but no repo, ask; creating a repo around someone else's work is not ours to assume.

### 2 → 3 · the restart — the highest-leverage moment in the product, and the agent is standing in it

Today: three `console.log`s written for a person (`cli/index.ts:141-143`), the last of which is *"restart your harness (Claude Code, Cursor, Codex)"* — an instruction the agent **cannot execute but can relay**, printed as though a human were reading it.

Under §2 the reader of that output is an agent. So it must be written as one (decision 60): what was created, what is still unknown and when it will be needed, the one thing the human must do, and what to do on the far side of it. `site` › init's return text (`catalog.ts:268`, currently *"Next: content.create a post"*) carries the same load for the clone case and gets the same treatment.

**And then the context dies** (decision 61). The agent that pastes is not the agent that writes. Nothing can be carried across in a message, which is why the far side has to be picked up from disk rather than handed over.

### 3 → 4 · the far side of the restart, and the first post

`initialize` already returns an `instructions` string on every session start, before any tool call (`mcp/src/protocol.ts:52`). It is the single best onboarding surface in the product for this user and the first draft of this document did not mention it. It becomes where a zero-content site is pointed at `get-started` — as a **static string that names the prompt**, never as computed state, because decision 45 forbids `initialize` touching disk and D2's budget is 50 ms.

`get-started` then has to be a prompt for the state the person is actually in. It is not (see §9.1): step 1 tells an agent whose config loads to *stop*, and steps 2–3 are written for MCP-loaded-with-no-config — the rarest state in §6's table. It branches three ways (decision 62).

**The empty state is rendered, not scaffolded.** `initSite` writes a config and empty directories and no content (`site.ts:216-252`), so the first visual on the terminal-first path is an empty index. The fix is not a welcome post: a file every new site must delete is a file that ships to production when somebody forgets. Instead the dev server synthesises the index route while the site has zero items — `corpora/theme` already renders all 13 primitives and all 5 layouts in the active theme (S13), so the empty state can carry the product argument at the exact moment somebody is deciding whether to continue — marked as visible only to you, gone on the first real post, and a test asserts `build()` never emits it.

### 4 → 5 · the review, where the URL comes due
The placeholder is now load-bearing: publish refuses until `site.url` is real, and the refusal says so with the one-line fix. This is the correct place for that question and the only place it blocks anything.

---

## 8. What the agent reads, and when

Four surfaces, in the order the agent meets them. Together they are the agent-facing half of onboarding, and only the last of them exists today.

| When | Surface | Carries | Today |
|---|---|---|---|
| before install | the README sentence | the whole flow, in one line | ❌ decision 59 |
| state 2 | **`snypd init` stdout** | what exists, what the human must do, what happens next | ✅ S18d |
| state 3, every session | **`initialize` › `instructions`** | where to pick up: `get-started` for an empty site | ✅ S18d — static, names the prompt |
| state 3+ | **`get-started`** | the vocabulary, the first post, the handback | ✅ S18d — three branches |
| any time | **`site` › doctor** | the derived facts — the agent's Desk | ✅ S18d — eight of nine; dev-server waits for S18e |

`site` › doctor checked config, theme, stranded tokens, lint, redirects and git, and none of: is `.mcp.json` present and naming snypd, has a harness ever called, is a dev server running, is `site.url` a placeholder, is there any content at all. S18d added four of those five and returns them as `structuredContent.facts` as well as prose, so S18f's checklist renders the same computation rather than a second one. The fifth — is a `snypd dev` server running — waits for S18e, the session that creates the `.snypd/dev.json` it would read; a row that reads a file nothing writes is a row that always says no. Decision 52 already says the derived facts and doctor are one implementation; that is right, and doctor is where it belongs, because **doctor is what the agent has instead of a page** (decision 64).

The registration row does more than report presence: it reads the command `.mcp.json` names and, when that is an absolute path, checks it exists on this machine. That is §12.8 made visible — doctor cannot fix a committed machine-local path, but naming it is the difference between a five-minute puzzle and a five-hour one, because the failure it causes is §10's undiagnosable case.

---

## 9. What the first-run Desk carries

This section is unchanged in content and demoted in priority. It serves the **terminal-first** arrival and the **person** at states 2, 4 and 5 — a real user, correctly served, and not the one §2 is built for.

`/_snypd` today has three cards: Status, In flight, Theme (`desk.ts:190-192`). First run adds a checklist above them and two disclosures below.

1. **The checklist** — the six derived facts of decision 52, rendered from what `site` › doctor computes (decision 64), ordered by dependency, with unreachable rows shown as not-yet rather than hidden.
2. **Three surface labels, not two.** *type this* / *say this to your agent* / *click this*, and the restart is properly *do this in your harness*. The entire confusion of onboarding is not knowing which surface you are on; the labels are cheaper than any copy.
3. **The prompts, as selectable text.** `PROMPTS` and `getStarted({})` are static exports of a leaf module (`mcp/src/prompts.ts`, one `import type`). `tabindex="0"` on the container — the `<pre>` a keyboard could not reach is the defect `07` decision 50 caught on the review page.
4. **The `.mcp.json` block, verbatim.** "My harness didn't pick it up" is the most predictable failure in the flow and the fix is always *paste this into that file*.
5. **"What is snypd"** inline in `<details>` — progressive disclosure at zero JS.
6. **The site card**, with a placeholder URL flagged as unfinished rather than presented as fact.

When the six are true, none of this renders and what remains is the ordinary Desk. No dismiss button, no stored flag.

**The Desk is not the front door under §2.** It is the surface a person meets at the *review*, which is step 12 and the first moment a human is genuinely needed. `07` decision 51's claim that a browser tab is "the only surface that survives the restart" is true of a human and false of an agent, whose continuous surface is the repo — and that is the claim this document's first draft built on. Amended in §11.

---

## 10. Failure modes, and which are distinguishable

| Failure | Detectable | Today |
|---|---|---|
| harness never restarted | yes — no heartbeat | ✅ `desk.ts:144` |
| **server spawned but crashed** | **not distinguishable from the above** | ❌ both render as silence |
| `.mcp.json` written, harness ignores it | no | mitigate by showing the block (§9.4) |
| not a git repo | yes | reported, not fixed |
| port 4321 occupied | yes | ❌ **live defect** — see §12 |
| two harnesses connected at once | yes | not surfaced |

**Refinement to `07` decision 51's heartbeat file:** record `startedAt` separately from `calls` in `.snypd/activity.json` — the `Activity` record already has `since` (`protocol.ts:65`). Then *spawned but never called* (server up, harness misconfigured) is distinguishable from *never spawned* (you did not restart) — two very different instructions, today rendered identically as one silent line, and both of them consumed by `site` › doctor as well as by the Desk.

---

## 11. Decisions

**54. First run is a gated surface, not a polish pass** (this document): it gets its own metrics namespace (`onboard.*`), its own lane, and F1–F7. `07` decision 48 generalised once more — *a gate measures the artefact or it measures nothing*, and *a surface no suite visits has no gates at all*. First run is the largest such surface left, and the only one where the population that hits it is 100 % of users exactly once.

**55. The measurement runs from an empty directory, against the binary, or it does not count.** `bun test` starts in state 3 by construction. `packages/bench/smoke/` already drives the compiled binary from a temp directory and is the right home. Anything that asserts about first run from inside the workspace is asserting about a state no user is ever in.

**56. Build for agent-first — which means shipping distribution first** (amended by the audit, §5). The original decision named agent-first as the priority and then left the one thing that unblocks it parked. A priority that does not move the schedule is a preference. npm platform packages move ahead of the first-run Desk page; migration stays a v0.2 prompt.

**57. `init` may open a browser; `initSite` may not.** The two callers differ in whether a person is present: `snypd init` is typed at a TTY (`cli/index.ts:122`), `site` › init is called by an agent (`catalog.ts:266`), and `packages/bench/smoke/` calls it with no display at all. Browser-opening lives in the CLI verb behind a TTY check and `--no-open`, never in the library function. Under §2 the agent path opens nothing and *says* nothing about a browser — there is no person watching a screen at step 5.

**58. The one sentence is a named artefact, and it names its first command** (amended): 

> *Set up snypd here and write me a first post. Ask me what the site is called, then run `bunx snypd init`.*

Used verbatim in the README, on snypd.rocks, on the first-run Desk, and as the driver of the `onboard.*` lane. The original version carried intent only; an agent that has never heard of snypd cannot infer `bunx snypd init`, and a sentence whose first step is a web search has a nondeterministic first step. It names the question too, because asking for the site's name in one message beats naming a directory after the fact — and because the *ask* is what makes step 3 a conversation rather than a form.

**59. The front door is a sentence in a README, not a command in a terminal** (the audit): the entry point is a thing a person pastes into the harness they already have open. This is what "your CMS is wherever your agent is" means at turn zero, and it is the only claim in the pitch that the product has never actually made true. Everything the agent needs after that sentence is taught by the output of the command the sentence names.

**60. `snypd init`'s stdout is an onboarding document addressed to the agent.** Under §2 the reader of that output is an agent, not a person. Today it prints three human-facing lines ending in an instruction the agent cannot execute but can relay. It becomes: what was created; what is still unknown and when it will be needed (the URL, at publish); the one thing the human must do, phrased so it can be passed on verbatim; and what to do on the far side. `site` › init's return text carries the same load for the clone case. This is the cheapest change in the flow and the one that carries it — two strings, no new surface, no new module.

**61. The restart destroys the agent's context, so continuity is a disk read, not a handoff.** `07` decision 52 said onboarding state is derived from disk and reached it from principle 3; this is the same conclusion reached from the operational fact, and it binds harder. The agent that pastes the sentence is not the agent that writes the post — nothing may be carried across in a message. `initialize`'s `instructions` field is delivered on every session start before any tool call and already ships (`protocol.ts:52`); it becomes where the far side is picked up, as a **static string naming `get-started`** rather than computed state, because decision 45 forbids `initialize` touching disk and D2's budget is 50 ms. A pointer costs nothing; a state read costs the gate.

**62. `get-started` branches three ways.** It is written today for exactly one state — MCP loaded, no config — which §6 shows is the rarest of the seven. The branches are: *(a)* config does not load → ask for what cannot be inferred, `site` › init, continue; *(b)* **config loads and there are zero items** → skip init entirely, read the vocabulary, write the first post, hand back the review URL — this is the majority path and today it is told to *stop* (`prompts.ts:40`); *(c)* config loads and items exist → this is an existing site, run doctor and say what you found. The branch is a read of `snypd://config` plus one `content.query`, both of which the prompt already tells the agent to do.

**63. The URL is a placeholder until publish, on both paths.** Required — feed, sitemap and JSON-LD are absolute — and required *at step 12*. Placeholder at init, a doctor row and a checklist row that nag, a publish that refuses with the one-line fix. The CLI's flag requirement and `catalog.ts`'s `need(args,"url")` are the same defect and are fixed together; fixing one leaves decision 52's sixth fact reachable from one caller, which is a worse state than unreachable because it is reachable *inconsistently*.

**64. `site` › doctor is the agent's Desk.** One implementation of the derived facts, two renderings: doctor's text for the agent, the checklist for the person. Doctor gains registration-present, heartbeat (with `startedAt`, §10), dev-server-running, placeholder-URL and item-count; it already has config, theme, lint and git. The rule that follows: **no fact appears on the Desk that doctor cannot answer.** A page that knows something the agent cannot ask for is a second source of truth wearing a stylesheet.

**65. The funnel number counts human actions, not seconds or commands.** `onboard.handoff` = the number of times a person must do something between reading the sentence and seeing their first post. Seconds drift with the model; commands are the wrong unit once the agent is the one typing them. Five today (§2), and **two of the five must never be optimised away** — approving a shell command and approving a publish are the safety story, and a funnel metric that rewards removing them is a metric pointed at the wrong thing. Report the breakdown, not just the total.

---

## 12. Defects and gaps

**Audited 31 Aug 2026** by walking §2 end to end: the release binary compiled with `packages/bench/smoke/build.ts`,
an empty directory, `init`, then states 3–5 driven over stdio JSON-RPC the way a harness drives them, then the
Desk and the review page over HTTP. Three of the defects below were fixed in that pass and three more were found
by walking — none of which any suite could have reported, because until this session no suite entered state 1.

The audit's own finding, before any individual defect: **every one of the six is a state `bun test` cannot reach
or a surface it does not read.** Decision 55 said the measurement runs from an empty directory against the binary
or it does not count. That is not a preference about rigour; it is the only configuration in which any of this is
visible.

Four were real when this document was written. Three are closed by S18d; the fourth is S18e's.

1. ~~**`get-started` dead-ends the majority path.**~~ **Fixed, S18d.** Step 1 (`prompts.ts:40`) said: *"If it loads, this site already exists — say so, run `site` › doctor instead of initialising, and stop."* Anyone who has run `snypd init` — which under §2 is everyone — **has** a loading config. They restarted, ran the onboarding prompt, and were told to stop, with zero content and no next step. It branches three ways now (decision 62), on the config read and the one `content.query` it was already asking for.
2. ~~**`snypd init` requires flags on both paths**~~ (`cli/index.ts:127`, `catalog.ts:265`). **Fixed, S18d.** Neither caller requires either now: name falls back to the directory, URL to `PLACEHOLDER_URL`. A URL that is *passed* and is malformed still throws — an omission and a typo are different things and only one of them has a sensible default. Decision 52's placeholder fact is reachable at last, and the debt comes due in `publishCheck` (decision 63), which is the only place it blocks anything.
3. **The EADDRINUSE defect `07` decision 51 predicted is live and red.** `preview.ts:181` and `tools.ts:69` both default to 4321 with no fallback; a leftover `snypd serve --preview` from an earlier session makes `content.render_preview` return no URL, and it can fail the kill test outright — D1, environmental. A port collision that fails the product's headline gate is a first-run failure by another name. **Still open: S18e**, the session that gives the preview an owner.
4. ~~**`initialize`'s `instructions` string does not mention `get-started`.**~~ **Fixed, S18d.** The one surface guaranteed to reach the agent on every session start pointed at resources rather than at the prompt that would carry a new site to its first post, and named `snypd serve --preview` rather than the Desk. It is still a static string and must stay one — decision 45 forbids `initialize` touching disk, so the *prompt* is what branches on state and the pointer is what costs nothing. Decision 61.

### Fixed in the 31 Aug audit

5. **`content.create` reported a failure over a write that had happened** — the worst of the six, because it lied.
`createContent` wrote the file and *then* `commitWrite` called `useDrafts`, whose guard refuses to switch branches
over a dirty tree. The refusal came back as `isError`; the post was on disk on the working branch, uncommitted,
and `content.query` listed it one call later. An agent that believes its own error report retries, or tells a
person a post failed that they can see in the repo. **Every empty-directory first run hit it**, because defect 6
guaranteed the tree was dirty. Fixed by entering the drafts branch before a byte is written (`tools.ts`
`enterDrafts`, seven write sites) — which also makes the guard more accurate, since nothing of ours is dirty yet
and there is nothing for `ours` to exclude.

6. **`init` left a first-timer with an uncommitted scaffold and homework.** In an empty directory `initSite`
wrote seven files, reported `git: false`, and printed *"next: git init here"* — so the scaffold sat uncommitted,
and the agent's first write tripped defect 5 on it. `git init` is now `init`'s own job when the directory is
empty **and** not already inside a work tree (`site.ts` `shouldInitRepo`); anything else is reported and left
alone, because creating a repo around somebody else's files, or nesting one inside their checkout, is not ours to
assume. `initRepo` uses `-b main`, so the branch a publish lands on is the branch the site was born on rather
than whatever `init.defaultBranch` happens to be — the walk produced `master` before this.

7. **`site` › doctor invented 38 problems, in the binary only.** On a scaffold `init` had just written, the
compiled artefact reported *"38 token overrides the theme does not declare"* — every token in the editorial
theme. The checkout reported none. `themeTokens` read `theme.yaml` with `readFileSync` on `link.yamlFile`, which
inside a binary is `snypd:theme/editorial/theme.yaml` — a name, not a path; the read threw, a bare `catch`
swallowed it, and `overridden` counts an undeclared token as a stranded override, so **a read that returned
nothing became 38 problems rather than an error**. This is S18a's bug in its quietest form — one path on disk and
another in `$bunfs` — surviving S18a for S18a's own reason: `bun test` runs where `themes/editorial` is a real
directory. Fixed by reading through the `themefs` seam that `config.ts:79` already uses. The regression test is
in the smoke lane, against the artefact, per decision 48.

### Found by the audit, still open

8. ~~**`.mcp.json` is committed carrying an absolute, machine-local path.**~~ **Fixed, S18d′** (`07`
decision 67). The file is committed, so its second reader is the clone — and an absolute path under
someone else's home directory fails there as §10's undiagnosable case, *spawned but crashed*, rendered
identically to *you did not restart*. It also committed a local home-directory path into a repo S19a
pushes to public GitHub. The audit's recommendation was that the committed registration name the
published command and the local one name the binary; what landed instead is one rule that produces both,
because the file cannot be two files: **name the most portable command that is demonstrably present.**
`snypd` on `PATH` → `snypd serve`. A binary in a `bunx`/`npx` cache — which is what `bunx snypd init`,
§2 step 4, leaves behind — → `bunx snypd serve`, because that directory is collected and the path would
expire on *this* machine, not merely on somebody else's. A Bun checkout → `bun <entry> serve`. Otherwise
the running binary, which is S18a's answer and remains right for an installer that dropped it in
`~/.local/bin` without a shell restart. All four walked against the compiled artefact from an empty
directory; three of them are unreachable from `bun test`, which always takes the checkout branch. Doctor
now resolves what the file names on `PATH` as well as on disk, and reports the difference between "not a
file" and "nothing by that name on this shell's PATH — the harness's PATH may differ".

9. **The Desk's heartbeat is blind whenever the preview is its own process — which is always.** The walk drove a
full MCP session and the Desk still read *"nothing has called this server yet"*, because activity lives in a
module-scoped record (`protocol.ts`) and `snypd serve --preview` is a different process from the one the harness
spawned. `07` decision 51 already prescribes `.snypd/activity.json` and §10 already asks for `startedAt`; what
the audit adds is that this is not an edge case for diagnosing a crash. **It is the normal configuration**, so
the status card is wrong for every user who has a preview open — which is every user at step 12.

10. ~~**A pre-existing flake, unrelated to onboarding but corrosive to the gates.**~~ **Fixed, S18d.**
`mcp.test.ts` › *"init → set_config → redirect → tokens → scaffold"* drives eleven tool calls in one session
against `bun test`'s 5 s default and timed out on roughly one run in three on this box, at HEAD, without any
change of that session's (verified by stashing). A second test in the same file — *"create → query → lint →
publish"* — failed the same way during S18d, and that is what settled the shape of the fix: `setDefaultTimeout`
for the whole file rather than an argument on whichever test happened to trip. The cause is what these tests
*are*, and the timeout is a hang detector here rather than an assertion about speed — speed is `snypd bench`'s
job, where it is measured against a budget instead of a stopwatch that only fires when the box is busy.

---

## 13. Sessions

Resequenced by the audit. The first draft ranked `snypd dev` first on the reasoning that it is "the only one that makes the flow *possible*" — true of the terminal-first flow, and not of §2, which needs no new verb at all.

| S | Deliverable | Exit |
|---|---|---|
| ~~**S18d**~~ | **done.** The agent's path, decisions 60–64 — every one of them a string or a branch rather than a surface. `init` stdout and `site` › init text written for the reader they have; `get-started`'s three branches; `initialize` › `instructions` naming the prompt; argument-free `init` with the placeholder URL on **both** paths, and `publishCheck` as where that debt comes due; `git init` in an empty dir; `site` › doctor extended to eight of the nine derived facts and returning them as data. Four defects closed (§12.1, 2, 4, 10). Walked end to end against the compiled binary from an empty directory. | ✅ §2 completes agent-driven; 250 pass / 0 fail; F3 and F5 for the agent path |
| ~~**S18d′**~~ | **done, up to the button.** Five platform packages generated from one list, a 20 KB launcher that resolves and spawns the one binary npm downloaded, `release.yml` publishing with provenance on a `v*` tag, a generated Homebrew formula, and the repo's own remote. Two riders: §12.8 closed (`07` decision 67) and `--deploy` writing a host build command that is an installed pinned command rather than a pipe to a shell (68). | ✅ built, tested against the artefact and rehearsed with `--dry-run`; **`bunx snypd init` resolves on the first publish, which is Sunny's** (69). F1 stays measured, not claimed |
| **S18e** | **The human verb.** `snypd dev` (decision 51) — bind, open, watch, print; discovered by `serve` through `.snypd/dev.json`; the EADDRINUSE fix (§12.3); decision 57's TTY split; live reload that changes no published byte. | `snypd init && snypd dev` from an empty directory paints the Desk; `.snypd/preview` bytes equal `dist/` bytes |
| **S18f** | **The page that meets you.** The first-run checklist rendered from doctor's facts (§9), three surface labels, prompts as text, the verbatim `.mcp.json`, the rendered empty state, `startedAt` in the heartbeat. | F6, F7 |
| **S18g** | **The number.** The `onboard.*` lane in `packages/bench/smoke/`, driving the compiled binary from a temp directory: `handoff`, `ttfp`, `ttfv`, and the state-transition test that is F3. `sites/` + `bun run scratch` (decision 53) as the loop that dogfoods this by walking it. | F1, F2, F4; budgets set from the first measurement and gated thereafter |

**S18d′ has landed, up to the button.** The machinery is done and the decision is not: publishing claims a name permanently, unpublishes for 72 hours, and cannot be rehearsed here — `07` decision 69 leaves it with Sunny, and until it is pressed §2 step 4 is a checkout. **S18e is next**, and it is the first session in this list that serves the *secondary* arrival: `snypd dev`, the EADDRINUSE fix (§12.3), and the TTY split. S18f then makes the page meet the person who got there, and closes §12.9 — the heartbeat that is blind for every user with a preview open, which is every user at step 12. S18g is the number, and is what keeps the rest from rotting.

**One thing S18d′ added to the list rather than removing.** A release cut from one Linux runner ships one binary on Bun 1.4.0 and four on 1.3.14, because `--compile --target=` downloads a published runtime for a foreign platform (`07` §6, new row). Both are lanes CI runs green, so it is tolerable; it is also the kind of fact that, unrecorded, costs somebody a day when a number differs across platforms.

**What S18d could not close, and why.** F1's five human actions are still *designed* rather than measured — that is S18g, and decision 55 is right that a number from inside the workspace would not count. Two things the walk surfaced belong on that list when it is counted. The URL now comes due at publish, which is correct and is also a sixth action for anyone who reaches step 13 without having set one; the flow assumes it is asked and answered inside step 12's approval, and whether that holds is a question for a measured walk rather than for this paragraph. And the state-transition test that is F3 is asserted here per surface — `initialize`, the prompt, init's text, doctor, the publish refusal — rather than as one case per row of §6, which is the form S18g gives it.

---

## 14. Risks

| Risk | L | Mitigation |
|---|---|---|
| `onboard.ttfp` includes model latency and drifts with the model | High | report the model beside the number, gate generously, treat the trend not the value; F1 counts actions precisely so there is one number that does not drift |
| The agent does not reliably ask before running `init` | Medium | the sentence names the question (decision 58) and `init` succeeds argument-free either way, so the failure mode is a site named after a directory — recoverable with one `site` › set_config, not a dead end |
| The checklist becomes a wizard, and the wizard becomes an admin app | Medium | decision 44's wall holds: the checklist *reports* derived facts and names commands. No `<form>`, no button, no stored progress. Decision 64 adds a second lock — nothing renders that doctor cannot answer |
| Opening a browser is hostile in some environments (SSH, container, CI) | Medium | TTY check + `--no-open` + `$SSH_TTY`/`$CI` detection (decision 57); under §2 nothing opens at all |
| The rendered empty state leaks into `dist/` | Low | decision 52's test asserts `build()` never emits it; extend to the binary lane, since that is where S18a's equivalent bug lived |
| Publishing to npm is irreversible and cannot be rehearsed on this box | Medium | **new, and the reason S18d′ is its own session** — a scoped `@snypd/*` unpublish window is 72 h; the first publish is a release decision, not a session deliverable, and needs Sunny |
| Five sessions on onboarding while S19–S22 wait | Medium | accepted: D6 needs a site a person can make, and the funnel is upstream of everything Phase 4 measures. Two of the five (S18e, S18f) can slip past Gate C without blocking it |

---

## 15. What is already true

Not to be rebuilt. Each is a piece of the first run that shipped for another reason:

- **`snypd init` writes `.mcp.json`** and commits the scaffold — S18a, `core/src/site.ts:181`. `command` is the most portable command demonstrably present — `snypd` on `PATH`, else the launcher a `bunx`/`npx` cache implies, else the binary that actually ran (S18d′, `07` decision 67). The registration risk in `07` §6 is closed.
- **`initialize` returns an `instructions` string** on every session start, before any tool call — `mcp/src/protocol.ts:52`. The best agent-facing surface in the product, currently under-used by one line.
- **The prompts are written** and are a leaf module (`mcp/src/prompts.ts`, one `import type`) — importable at no cost, from the CLI as easily as from the server.
- **`site` › doctor exists** and answers four of the facts it needs to answer — `catalog.ts:335`.
- **The Desk renders the not-connected state** with the restart instruction — S18b′, `desk.ts:144,157`.
- **The heartbeat exists and is free**: `activitySnapshot()` reads a five-field record on the one funnel every message crosses (`protocol.ts:65-85`), so the hardest derived fact costs `initialize` nothing.
- **`desk.*` measures a live server** rather than only `dist/` — S18b′ — so the first-run states can be gated by extending a lane rather than writing one.
- **The smoke lane drives the compiled binary from a temp directory** — S18a, `packages/bench/smoke/` — the only place decision 55 can live. Its comment at line 48 already calls the registration *"the step that is the whole of onboarding"*.

The first run is not a greenfield. It is eight shipped pieces that had never been walked in order, by one agent, from an empty directory — S18d walked them, and S18d′ made the one step that only worked for us into one that will work for anybody, on the first publish.
