# `snypd bench agent` — the kill test

docs/06's v0.1 test, run and scored: three plain posts upgraded with `suggest_blocks`, the theme swapped
and retuned, a new post written with a chart and a flow, every item approved by a person and published.

    bun run snypd bench agent                        # → bench/agent.md, bench/agent.json, bench/agent-transcript.md
    bun run snypd bench agent --driver=claude:haiku  # S21: a live model at the keyboard → bench/agent.claude-haiku.*
    bun run snypd bench writes --models=haiku,sonnet,opus   # S21: 20 topics × first-attempt lint → bench/writes.md

## What is scored

**`scenario.ts` reads the finished site, never the transcript.** A driver passes by leaving the repository
in the described state, so it cannot pass by replaying a blessed call sequence, and a live model that finds
a shorter route is not marked wrong for taking it. That is what makes the same scenario reusable for S21's
"kill test × 3 models" — only `Driver` changes.

Three numbers, deliberately not one:

| | |
|---|---|
| `agent.goal` | the fraction of the checks the run left true — the pass/fail |
| `agent.calls.draft` | nothing → a lint-clean draft of the new post. **Gated at 8**, which is D1's sentence taken literally: it is about one draft |
| `agent.calls` | the whole run, reported with its phase breakdown and gated *exactly* in the test — a tool call is discrete, and 80 % of one is not a thing |

`agent.tokens` sits next to them because eight calls that each return four thousand tokens is not a smooth
surface, and without it the call budget is gamed by batching. `tools/call` is counted apart from
`resources/read` and `tools/list`: decision 38 moved every read to a resource precisely so it would be
cheap, and charging reads at the same rate would erase what that bought.

## The parts that are deliberately not the agent's

The run happens in a throwaway copy of `corpora/kill` made into its own git repository — a site is
git-backed only when it *is* the top level (`git.ts`), so a corpus left in place would exercise none of the
drafts-branch path. The human who approves each item is an HTTP POST to the review page the agent's own
`content.render_preview` started: that is exactly the interaction, and it is outside the call budget
because approving is not something an agent can spend calls on.

## Three models (S21)

`claude.ts` runs D1's first clause literally — `claude -p` in a fresh session, every built-in tool off,
one MCP server — and turns the session's stream into the same `Turn`s `session.ts` records, so
`agent.goal`, `agent.calls.draft` and `agent.calls` mean the same thing whoever is at the keyboard.
`live.ts` is the driver: `KILL_PROMPT` is the task in a person's words, phases are read off the calls,
and the record goes to `bench/agent.claude-<model>.*` beside CI's `bench/agent.*`. `writes.ts` is the
other lane docs/05 asked for: twenty topics, the server's own `write-post` prompt, and whether the first
`content.create` lints clean. Neither runs in CI — there is no login there — so the records under
`bench/` are made at a desk and checked in.

The corpus has **all four plugins on** since S21, and `scenario.ts` scores each off the finished site:
a beacon in the page, a term linked in prose, a merged type, an emitted key file.

## The registry demo (S29 · R4)

    bun run snypd bench registry                          # → bench/registry.md, bench/registry.json, bench/registry-transcript.md
    bun run snypd bench registry --driver=claude:sonnet   # a live model walks it → bench/registry.claude-sonnet.*

docs/20 §2.4's twelve steps over Ferrule, the studio specimen: a `work` type declared in fifteen lines
of `snypd.yaml`, and what every tool says about it — the missing field named with the declaration's own
description, the publish of a `draft`-policy type refused with the next call in the sentence, the build
naming the archive, the other theme saying which layout drew the case. `registry.ts` is the whole lane:
`STEPS` as data, a scripted route, a `claude:<model>` driver whose harness presses the review page's
button the moment the model asks for the preview, and a judge.

**This one is scored on the transcript** (decision 199), the opposite of the rule above and on purpose:
the claim is about what the tools *say*. The site the run leaves is checked under it — the case on
`main` with its client and chart, the approval on the publish commit, the note, the redirect, the theme,
eight routes in `dist/`, the feed — so a sentence without the site behind it does not pass.
`registry.test.ts` enforces the scripted route at 12/12 and exactly 18 calls; docs/22 has the outcome.

## Status

D1 is **green at 15/15 with all three models** (15 Sep 2026): the scripted route in 18 calls, haiku in
30, sonnet in 22, opus in 23; every model reaches a lint-clean draft in 3 calls of the 8. The first live
run found two things the scripted one never could — `tokens.learn` over budget with four plugins on
(decision 169) and a build that could not find its JSX runtime from a foreign cwd — and both are fixed
where they were found. `agent.test.ts` asserts the scripted route exactly; the live records are
`bench/agent.claude-*.md`.
