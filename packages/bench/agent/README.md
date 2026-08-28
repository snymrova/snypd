# `snypd bench agent` — the kill test

docs/06's v0.1 test, run and scored: three plain posts upgraded with `suggest_blocks`, the theme swapped
and retuned, a new post written with a chart and a flow, every item approved by a person and published.

    bun run snypd bench agent          # → bench/agent.md, bench/agent.json, bench/agent-transcript.md

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
draft-branch path. The human who approves each item is an HTTP POST to the review page the agent's own
`content.render_preview` started: that is exactly the interaction, and it is outside the call budget
because approving is not something an agent can spend calls on.

## Status

D1 is **red at 3/11**, and the vocabulary is not why — see docs/07 §6 "the write model". The parts that
work are the ones the primitives own: all three posts are read correctly, the upgrades apply, and the new
post reaches a lint-clean draft in 2 calls of the 8. `agent.test.ts` asserts the failing set exactly, so a
fix to the write model has to come back here and say so.
