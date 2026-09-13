# 13 — Acting on the landscape read: what changes before 6 October, and what does not

**Owner:** PM · **Engineer:** Claude Code · **Decider:** Sunny · **Written:** 13 Sep 2026
**Input:** [docs/12](12-competitive-landscape.md), read against [docs/06](06-roadmap.md) (milestones), [docs/11 §7](11-hardening-and-themes.md) (the eight sessions left), [docs/11 §10](11-hardening-and-themes.md) (Sunny's open calls), `bench/latest.md` and `bench/onboard.md`.
**Scope:** turn docs/12's six findings and four questions into scheduled work with an owner, a cost and a session to ride in. docs/12 proposes and decides nothing; **this document schedules, and asks for four decisions.**
**Constraint, stated first:** nothing here moves the docs/11 §7 session order, and nothing here costs a session. Twenty-three days to 6 October, eight sessions in the queue, and a dirty tree ahead of all of it.

---

## 1. The queue this has to fit behind

Before any line of this document is actionable, three things sit in front of it, none of them from docs/12:

| # | Owed | Whose hand | Blocks |
|---|---|---|---|
| Q-1 | **The npm credential** — v0.1.4 is tagged and unpublished; the publish failed on an expired token (docs/11 §2) | **Sunny** | E3, D7, half of D12, and the Cloudflare pin behind it |
| Q-2 | **The dirty tree** — I0, U6b and X1 are done and uncommitted; U6a and B1 are committed and unpushed. Three sessions, one working copy | Claude Code | every session after it; a stranger cloning `main` |
| Q-3 | **H2** (session 6) — finding 1, the build-time JS assertion, exit **E6** | Claude Code | the "0 KB by default" claim enforcing itself |

**Rule for this document: nothing below jumps that queue.** The single most expensive mistake available right now is letting a competitive read — which is interesting — displace a credential and a commit, which are load-bearing.

---

## 2. The four calls, with a recommendation each

docs/12 §8 asks four questions and answers none, on purpose. A decider handed zero candidates defers, and copy freezes at L2. So each has a recommendation and a deadline.

### Q1 — The tagline: pass or ship as-is? **Recommend: one pass, decided before L2 starts.**

*"Your CMS is wherever your agent is"* names a **location**. It is a good second sentence and a weak first one: it presumes the reader already accepts that a CMS has a location worth arguing about. Super's *"The #1 tool for turning a Notion document into a website"* names an input and an output in nine words and needs no premise.

The current line does not have to go. It has to stop being the **first** thing a Product Hunt visitor reads for four seconds. Three candidates, all derived from sentences already true in the README:

| # | Candidate | What it names | Cost of being wrong |
|---|---|---|---|
| A | **"A CMS your agent can actually use. Markdown in your repo, static HTML out, zero JS."** | input, output, owner | verbose; reads like a feature list |
| B | **"Publish a website from the harness you already have open."** | the action and the place, no jargon | says nothing about ownership or speed |
| C | **Keep the current line as the strapline; lead with B; keep A as the sub-paragraph.** | — | none, and it is the cheapest |

**Recommendation: C.** It is not a rename — it is an ordering. `docs/00 §One paragraph` already contains all three sentences; the only change is which one is set largest on snypd.rocks and first in the README. **Decide by the start of session 12 (S22 · L1)**, because L1 builds `/themes` and `/plugins` and the hero is set then; re-cutting it at L2 costs screenshots.

### Q2 — "A domain is never behind a paywall": commit now, or defer? **Recommend: commit now, one sentence.**

docs/00 §Business shape is four lines and says "optional paid cloud later … free tier is the funnel and must be complete on its own". Add one clause to it:

> **A custom domain is never inside the paid tier.** On a static artefact behind a CDN a domain costs the provider nothing; charging for it is the clearest possible signal that the paid tier is a hostage rather than a service. Super's $16 line is exactly that, and it is the cheapest differentiator we will ever be handed.

It is cheapest to write **now**, before there is revenue to protect. Deferring it means deciding it later, under pressure, against a number. One sentence, rides the same commit as §3.

### Q3 — `migrate-from-notion` on v0.2 or v0.3? **Recommend: v0.2, and sequenced *ahead of* `migrate-from-wordpress`.**

docs/06 v0.2 already commits to `migrate-from-wordpress`. docs/12 §7's argument is that the Notion one is **strictly easier** — Notion's export is already block-structured and maps onto our primitives, where WordPress is HTML soup — and the audience is better qualified: 100 k+ Super creators who have proven they pay $16–28/month for this product shape, are on record about price and exit friction, and cannot leave without exactly the tool we would be writing.

Doing the easy one first also de-risks the hard one: the prompt shape, the primitive-mapping table and the "what could not be mapped" report are shared, and they get designed against clean input instead of soup. **Not a launch item. Not before H2.**

### Q4 — Mint "never a visual designer" as a numbered decision? **Recommend: yes. Decision 145, text below.**

This is the cheapest item in the whole document and the one whose absence costs most later, because an unwritten refusal gets re-litigated by every new advisor, every quarter, from scratch. Ready to paste into docs/11 §8 (last decision is 144, from X1):

> **145. There will never be a visual designer, a dashboard, or a WYSIWYG.** Super is building one, and says why: *"those without coding knowledge struggle to make their site look how they want."* That is a true problem for their user and not one ours has — ours arrives with an agent that writes CSS, and `snypd new theme` → `snypd check theme` already closes the loop with real WCAG numbers rather than a preview. Building one would contradict principle 1 outright (*if it isn't a resource, tool or prompt, it doesn't exist*) and would solve a problem we do not have, at the cost of the only thing that makes the product coherent. This is recorded as a decision and not a preference because it is the most likely piece of well-meant competitive advice we will receive, and the next person to propose it is owed an argument rather than a shrug.

---

## 3. Before 6 October — one commit, roughly an hour, no engineering

Three copy edits, one docs edit, one decision. **They ride in whichever session touches their files** — the README ones in L2, the docs/00 sentence in any session, the roadmap rows now. None is a session.

| # | Change | File | From docs/12 |
|---|---|---|---|
| 3.1 | Lead with candidate B; current line becomes the strapline | README.md, snypd.rocks hero | §6.1 |
| 3.2 | **The agency arithmetic.** "Twenty client sites on the nearest comparable product is **$320–560/month in site plans alone**, before analytics and before seats. Here it is one binary and twenty git repos, and it is $0." | README.md, near "Who it's for" | §4.4 |
| 3.3 | **The ownership line.** "Every CMS claims no lock-in. This is the only one where you can check it with `ls`: markdown and YAML, in your repo, rendered by a binary you have a copy of." | README.md | §4.6 |
| 3.4 | The domain clause (Q2 above) | docs/00 §Business shape | §4.4 |
| 3.5 | Decision 145 (Q4 above) | docs/11 §8 | §5.1 |

**Guard rail:** 3.2's numbers are read off a public pricing page on 13 Sep 2026 and are a competitor's prices, not a bench row. Write them **as arithmetic with the date and the source in the sentence**, never as a benchmark claim — principle 9 governs our numbers, and borrowing someone else's without the date attached is the same failure wearing a different hat.

**Open, to settle when 3.2 actually lands in L2:** *where* the arithmetic goes. The README is the highest-maintenance home available for a number with an expiry date — it gets forked, mirrored, vendored and screenshotted, and a stale competitor price there ages into looking dishonest rather than merely old. The alternative is the launch post and docs/12, where a date is native, leaving the README only the half that never ages: *one binary, twenty git repos, $0*. Raised 13 Sep; not decided, because nothing writes this sentence until L2.

---

## 4. `publish.toLive` — the one finding that is further along than docs/12 thought

docs/12 §4.1 calls this "the strongest single number in the comparison and we cannot use it", and proposes a new bench lane for v0.2. That is right about the claim and **wrong about the cost**, because two thirds of the lane already exist:

| Existing row | Value | Budget | What it covers |
|---|---|---|---|
| `onboard.ttfp` (`bench/onboard.md`) | **0.84 s** | 5 s | paste → a lint-clean draft with a review URL |
| `onboard.published` | **0.99 s** | report | …and on to a **published** post, through both refusals |
| `build.incremental.100` (`bench/latest.md`) | **10.6 ms** (CI) / 17.5 ms | 300 ms | one body edit → 1 rendered, 122 cached |

So the measured path already runs **paste → published in 0.99 s**. What is missing is only the last leg: **push → readable at the deployed URL.** Against Super's best tier — ten minutes, lazily revalidated, with the first visitor eating the staleness — even a generous deploy leg leaves three orders of magnitude.

**Revised proposal.** `publish.toLive` is not a new lane, it is `onboard.published` plus a deploy assertion. But it needs a real deploy in CI — a credential, a live origin and a propagation wait — which is a new flaky surface, and **the three weeks before a launch is the worst possible time to add one.** So:

- **Before launch:** nothing. Do not add the lane. Do not claim the number.
- **Allowed before launch, at zero cost:** the claim we *can* already evidence — *"an edit is a published post in under a second, measured"* — linking `bench/onboard.md`, which is principle 9 satisfied exactly. It is a weaker sentence than the one we want and it is true today.
- **v0.2:** the deploy leg, with a budget, in CI. Highest-value item on the post-launch list.

---

## 5. After launch — the docs/06 v0.2 edits, ready to make now

Logging these costs minutes and stops them being re-derived. Add to docs/06 **v0.2**:

| # | Item | Source | Size |
|---|---|---|---|
| 5.1 | **`publish.toLive` bench lane** — the deploy leg on top of `onboard.published`, budgeted, in CI | §4 above | ~half a session |
| 5.2 | **Three `snypd check theme` rules**: `meta.changelog` required · third-party font/script/asset credit and licence · dead internal links | docs/12 §4.3 | ~half a session; 16 rules → 19 |
| 5.3 | **`migrate-from-notion` prompt**, sequenced ahead of `migrate-from-wordpress` | docs/12 §7, Q3 above | needs sizing |
| 5.4 | **One pass of Super Builder's 60-component list against docs/01's ~35 primitives** — does anything we declined deserve revisiting? Output is a note, not a spec change; the vocabulary is locked | docs/12 §4.2 | ~1 hour |
| 5.5 | **The shelf as a gated marketplace** — submit, CI runs `check`, green means listed. Already docs/10 §6; strengthened by knowing the incumbent does this with human review *and* a disclaimer | docs/12 §4.3 | already planned |

**Honest exception to record with 5.2.** "Responsive at all breakpoints" is on Super's human checklist and is a permanent gap in ours — it needs a browser (decision 140's doctrine). When the shelf's pitch is written ("theirs is a person with a disclaimer; ours is exit code 1"), **state that one exception rather than omit it.** A pitch with a known hole named in it survives the first person who finds the hole.

---

## 6. Distribution — the free half, and what it costs

docs/12 §4.5: Super ranks by owning the long tail of *Notion's own* keyword surface — hundreds of task-shaped guides. The 2026 equivalent is the agent-read surface, and **snypd emits it on every build** (`.md` twins, `llms.txt`, feeds, JSON API, public read-only MCP), on a site we already publish over MCP.

- **Before launch:** one sentence in launch copy. *The dogfood and the distribution channel are the same activity* is true of nobody else in this category and costs nothing to say. Rides L2.
- **After launch:** a guides-shaped section on snypd.rocks, written the way everything there is written — through the MCP, by an agent, which is itself the demonstration. Not a v0.2 roadmap row; a standing content activity.

---

## 7. The refusal list — pinned, so it is not re-argued

docs/12 §5, restated here because a plan of action should carry its own "no" list. **We do not copy:** a visual designer (decision 145) · per-site pricing (it punishes the agency docs/00 wants) · metered analytics (rent on someone else's traffic, and the loudest complaint in docs/12 §3.5) · **freshness as a pricing tier** (only sellable if your architecture has latency; ours does not, and introducing it to have something to sell would be self-inflicted) · cancellation friction.

---

## 8. Sequencing — where each item lands

| Session (docs/11 §7) | Rides along |
|---|---|
| — **now, before any session** | Q-1 npm credential *(Sunny)* · Q-2 commit the dirty tree · docs/06 rows 5.1–5.5 · decision 145 · docs/00 domain clause |
| 6 · **H2** | nothing from this document — E6 is the session's whole job |
| 7–9 · H3, H4, F1 | nothing |
| 10–11 · S19d·S20, S21 | nothing |
| 12 · **S22 · L1** | **tagline decision must be made before this starts** (the hero is set here); §6's one sentence in the site copy |
| 13 · **L2** | README §3.1–3.3; launch-copy pass |
| **post-launch v0.2** | §5.1–5.5, in that order |

**Total pre-launch cost of this document: about one hour of writing, spread across two sessions that were happening anyway, plus four decisions.** That is the test it had to pass.

---

## 9. What would make this wrong

- **The Trustpilot evidence is five reviews**, flagged twice as anecdote in docs/12 and load-bearing nowhere in this plan except §7's mention of analytics complaints. The pricing structure supports that inference on its own. If anyone quotes it as data, the plan is being misread.
- **§3.2's arithmetic ages.** Competitor prices change; the sentence must carry its date, and it goes stale rather than wrong.
- **§4's "three orders of magnitude"** is unclaimable until the deploy leg is measured, and the temptation to claim it early — on the strength of `onboard.published`, which does not include the deploy — is exactly the failure principle 9 exists to prevent. The permitted sentence is in §4 and it is narrower on purpose.
- **The biggest risk is not in this document at all.** It is that eight sessions, a credential, a dirty tree and a launch date are the actual critical path, and a well-written competitive read is the most pleasant possible way to spend a day not doing them.

---

## 10. Asks of Sunny — answered 13 September 2026

All four were put to Sunny the day this document was written, before the commit that clears the tree, because three of the five edits land in files that were already dirty and would otherwise have been committed and then amended.

| # | Ask | Answer | Where it landed |
|---|---|---|---|
| Q1 | The tagline | **C — reorder, don't rename.** Lead with B, current line becomes the strapline, A is the sub-paragraph | **Decision 146**, docs/11 §8. Decided nine sessions ahead of its deadline; the *edit* still rides L2 (§3.1) |
| Q2 | The domain clause | **Write it now** | docs/00 §Business shape, one paragraph, dated and attributed |
| Q3 | `migrate-from-notion` sequencing | **Deferred** — decided later, not now | Nothing moves. docs/06's v0.2 row is untouched and §5.3 stays unsized; see below |
| Q4 | Decision 145 | **Mint as written** | **Decision 145**, docs/11 §8, verbatim from §2 Q4 |
| Q5 | The npm token | Recommendation unchanged: token today, trusted publishing alongside finding 9 | **Sunny's hand. Still owed** — Q-1 in §1 |

**On Q3, so it is not re-derived.** The deferral costs nothing today: §2 Q3 already said *not a launch item, not before H2*, and no pre-launch session touches either prompt. What the deferral does mean is that **docs/06's v0.2 row still reads `migrate-from-wordpress`**, and §5.3 stays on the post-launch list unsized. The call is owed at v0.2 planning, and the argument it has to answer is §2 Q3's: the Notion export is block-structured where WordPress is soup, the shared machinery — prompt shape, primitive-mapping table, "what could not be mapped" report — gets designed against whichever one goes first, and there is a qualified audience on the Notion side that is on record about price.

**What is now unblocked:** the three edits above are in the tree, so the commit that clears Q-2 carries them. Q-1 is the only ask still open, and it is the only one on the critical path.
