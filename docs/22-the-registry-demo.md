# 22 — The registry demo: twelve steps, and the sentence each one gets

**Owner:** PM · **Engineer:** Claude Code · **Decider:** Sunny · **Written:** 18 Sep 2026 (S29 · R4)
**What this is:** the outcome of docs/20 §2.4 — the demo as a runnable lane (`snypd bench registry`), the four places the surface had to be changed before it said what the table promised, the transcript of a live model walking it, and the README section the launch docs take. Short, because the twelve steps are docs/20's; this records what they answer and what it cost to make them.

## 1. What was built

- **`packages/bench/agent/registry.ts`** — the demo as data and as a run. `STEPS` is docs/20 §2.4's table: what the agent does, and the sentence it should see. `scriptedRegistry` is one careful agent's route through it (seventeen calls, four reads); `liveRegistry(model)` hands the task to `claude -p` in a person's words and presses the review page's approve button the moment the model's own `content.render_preview` answers with the URL — so the model's next publish, a turn away, finds the approval. `judge` scores the twelve steps **off the transcript**, which is the opposite of the kill test's rule and deliberate: the claim is about what the tools *say*, and the only evidence for that is what they said. `assessSite` checks the site the run leaves under them — the case on `main` with its client and its chart, the publish commit carrying who approved it, the note on `main`, the redirect written, the theme swapped, eight routes in `dist/`, the feed with both types, lint clean — because a sentence with no site behind it is a demo of nothing.
- **`snypd bench registry [--driver=claude:<model>] [--keep]`** — the records go to `bench/registry.md`, `bench/registry.json` and `bench/registry-transcript.md`, or `bench/registry.claude-<model>.*` for a model. `registry.test.ts` enforces the scripted route in `bun test` (12/12, the site checks, **18 calls exactly**); the CI step makes the record and is non-enforcing, as the kill test's is.
- **The surface, in four places** — each a sentence the table promised that the tool did not yet say:
  1. `site` › **explain_config** on a type's own key says what it overrode: `` `types.work.layout` = "work" ← snypd.yaml:45, overrides inherited "post" (types.post.layout, @snypd/spec default) ``. The resolved type keeps `extends` (decision 196), which is how the base is known.
  2. **`content.create` and `content.update` print their diagnostics**, errors first, not only the count. A harness that hands the model the text and not the structured half was sending it to `content.lint` for the sentence the write already had.
  3. **The publish commit names who approved it** (`Snypd-Approved-By:` beside `Snypd-Principal:`), and `snypd://history` shows it as `approvedBy`. The same fix closed a blank commit in every history that had a trailer — git's `valueonly` ends a trailer with its own newline.
  4. **`site` › build names its lists and its fallbacks**: `lists: /posts/ Notes (4 post) · /work/ Work (7 work) · 15 term pages`, and *work renders through `post` — editorial declares no `work` layout*, the line `snypd build` already printed. `BuildResult.lists` and `.terms` carry it; bounded by types and terms, never items.
  Plus one for step 9: a transform's note in `content.explain` counts the links it added (*changed the tree in place — 1 link added*), read off the serialised trees the record already paid for.
- **The sentence in both halves — the live run's finding.** The scripted route passed 12/12 and the first Sonnet run scored **2/12 on a site it had left 9/9 right**. Claude Code hands a model the `structuredContent` of a result when there is one, as JSON, and the text not at all; `explain_config` reached the model as `{"ok":true}` (it read the layout's line off `snypd://config` instead), `set_redirect` as `{ok, from, to}` with no commit and no 301, a publish with no policy. So three structured halves now say what their text says — `explanation` on `explain_config`, `status: 301` and `git` on `set_redirect`, `policy` and `approvedBy` on `content.publish` — and the judge reads either half: a pattern over the text, or a predicate over the parsed JSON, the same fact both ways. The live harness also unwraps a resource read (Claude Code's read tool returns the `resources/read` envelope as one string), so a model's read of `snypd://history` is judged on the resource, as the scripted driver's is.

## 2. The twelve steps, as answered (scripted route, 18 Sep 2026)

| # | The agent | Sees |
|---|---|---|
| 1 | reads `snypd://types`, `snypd://config` | `work` beside `post`, `page`, `author`, `client` in its `required`; the config folds the type's untouched keys to *13 more untouched: `<inherited from types.post>`* |
| 2 | `site` › explain_config `types.work.layout` | `"work" ← snypd.yaml:45, overrides inherited "post" (types.post.layout, @snypd/spec default)` |
| 3 | `content.create` type `work`, no `client` | *create work/the-ledger → /work/the-ledger (draft) · lint: 1 error · 2 error [frontmatter] Frontmatter is missing required field `client` ↳ Add `client:` — Who it was for. Shown in the facts strip.* |
| 4 | `content.update` with `client`, `service`, `industry` | *update work/the-ledger → /work/the-ledger (draft) · committed on snypd/drafts (from main) · lint: 0 errors* |
| 5 | `content.suggest_blocks`, then apply with the source | *1. lines 3–9 → `chart` (0.9) · needs source* → *applied 1 of 1* |
| 6 | `content.publish` | refused: *publishing work/the-ledger needs a human ↳ Call content.render_preview for work/the-ledger: it returns /_snypd/review/work/the-ledger as a URL on a running preview … then call content.publish again* |
| 7 | a person approves; publish again; read the history; a note | *published work/the-ledger → /work/the-ledger · landed on main · approved by a human at the review page*; the history's publish carries `"principal": "agent:claude-code/sunny"` and `"approvedBy": "a human at the review page at …"`; the note: *landed on main · approved by policy publish* |
| 8 | `content.query` type `work`, service `product`, published | *4 items* — the ledger, kiln-to-table, stem, sela, newest first |
| 9 | `content.explain` work/the-ledger | *autolink stages.transform — changed the tree in place — 1 link added*; outputs `work/the-ledger/index.html`, `index.md`, `api/work/the-ledger.json` |
| 10 | `site` › set_redirect `/posts/the-ledger` → `/work/the-ledger` | *(301) · committed → main* |
| 11 | `site` › build | *built 36 routes · lists: /posts/ Notes (4 post) · /work/ Work (7 work) · 15 term pages*; `dist/` has `/work/`, `/posts/`, `/service/product/`, `/industry/hospitality/`, `/studio/credits/`, `/posts/the-ledger/` (the redirect page); the feed carries the case and the note |
| 12 | `theme` › set `editorial`; build | *theme studio → editorial*; *work renders through `post` — editorial declares no `work` layout* |

Cost: 18 tool calls (17 and the harness's closing lint), 4 reads, 9,611 tokens both directions, 4.1 s wall.

**Four departures from docs/20 §2.4, all kept.** (1) *Inherited from types.post* is `snypd://config`'s sentence, not `snypd://types`'s: provenance is the config's job and the schema is the schema, so step 1 reads both. (7) The history shows the approval **on the publish commit** rather than as a commit of its own — an approval is a hash a person signed, not a change to the file. (8) `content.query` lists drafts by default, because an agent finding what exists needs them; the demo asks for `status: published`, and the draft is absent by request rather than by policy. (10) Rule 10 has nothing to say — the case never lived at `/posts/the-ledger`, so the redirect covers a URL the site tells a reader it once had; the sentence is the 301 landing on `main`.

## 3. A live model at the keyboard

Three Sonnet runs on 18 Sep 2026, each a finding; §5 has the numbers and the record is `bench/registry.claude-sonnet.md` with its transcript. The first scored 2/12 on a site it had left 9/9 right and found the structured-half rule (§1). The second previewed *before* publishing, edited after the approval, was refused with *changed after it was approved*, previewed again as the hint said — and found a harness that had pressed its one button once; it stopped and waited for Sunny. The harness now approves every version the model shows it, as a person would. The third: **10/12, the site 9/9**, every sentence it asked for answered as the table says, and the two misses are steps it skipped — it never called `explain_config` (it read the layout's line off `snypd://config`, which is the same fact one read earlier) and never read `snypd://history`, though the task asked for both. What it did instead of the history is the run's finding: six `find_tools` calls in a row — *audit history*, *who approved each version*, *git log commit history*, *git*, an empty query — each answered with `site` and `content.explain`, because a history is not a tool. It is a resource template, which `resources/list` does not print. `find_tools` now answers a query that names a resource with the resource (*not a tool but a resource — read it, it costs no call: snypd://history/{type}/{slug} — …*), for history, content, types, taxonomies, config, primitives, theme, nav, plugins and bench.

## 4. The README section — *Custom types* (launch copy, for `r0-readme-ground`)

> ## Custom types
>
> A post is the type every theme draws. A site that is not a blog declares its own — a case study, a release, a recipe — in the same file the rest of its config lives in, and every tool knows it from the next call.
>
> ```yaml
> types:
>   work:
>     extends: post
>     dir: content/work
>     urlPattern: /work/{slug}
>     layout: work
>     taxonomies: [service, industry]
>     mcp: { read: true, write: draft }
>     fields:
>       client:   { type: string, required: true, description: "Who it was for. Shown in the facts strip." }
>       service:  { type: list, of: { type: ref, to: service } }
>       industry: { type: ref, to: industry }
> ```
>
> Fifteen lines, and from the next call: `snypd://types` lists `work` beside `post` with `client` required; a draft written without one is answered with *missing required field `client` — Who it was for. Shown in the facts strip.*, the sentence you wrote; `content.publish` on it is refused — *publishing work/the-ledger needs a human* — with the review URL a person approves on, because `write: draft` says an agent drafts a case and a person publishes it, while a note publishes at once; `content.query` filters it by service; the build lists it at `/work/`, headed by the word your menu uses, feeds it, and files it under `/service/product/`; and a theme that has no `work` layout says so — *work renders through `post` — editorial declares no `work` layout* — and draws it through the type it extends.
>
> The whole walk is `snypd bench registry`: twelve steps over the studio specimen, each checked against the sentence the tool should answer, in CI on every push. The transcript of a model walking it cold is in [`bench/registry-transcript.claude-sonnet.md`](bench/registry-transcript.claude-sonnet.md).

Stills for this section — the facts strip, the refusal, the build line — are owed with the site's move to the studio look (S28), which is when the README's other stills are reshot.

## 5. The live run

| | scripted | claude:sonnet (third run) |
|---|---|---|
| steps answered as the table says | 12/12 | 10/12 (skipped 2 and 7's history read) |
| site checks | 9/9 | 9/9 |
| tool calls (with the closing lint) | 18 | 27 (six of them `find_tools` hunting for the history) |
| reads | 4 | 3 (`snypd://types/work`, `snypd://config`, the resource list) |
| MCP tokens both directions | 9,604 | 13,144 |
| the model's own context | — | 992,330 in (cache included), 8,554 out, 30 turns, $0.78 |
| wall | 4.1 s | 143 s |

The three runs together cost $1.64. The model's closing words on the third: *On `editorial`, the site says under `fallbacks`: it wanted the `work` layout but had none, so it used `post` instead.* — read off the structured half, which is where a Claude Code model reads.

## 6. Not done, and why

- **The film's second clip.** The launch docs and the film's shot list are on `s27-launch-docs` (PR #36), not this branch; the clip is a `vhs` recording of the twelve steps and belongs with the reshoot the hero film already owes (memory: the site on studio first, then re-record). The script the clip records is this lane's scripted route.
- **The README section is copy, not a diff.** `README.md` on this branch is the pre-`r0-readme-ground` one; §4 is written for the launch README's headings and goes in beside *The MCP surface* when that branch takes it.
- **Not changed:** `content.query`'s default (drafts listed), the `snypd://types` schema (no provenance in a schema), rule 10's scope.
