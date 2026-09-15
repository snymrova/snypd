# snypd bench — writes

**Version** 0.1.4 · **Bun** 1.4.0 · **Date** 2026-09-15T15:18:30.946Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `agent.write.pass.claude-haiku-4-5-20251001` | 0.7  | — | report | 14/20 first attempts lint clean — target ≥ 0.8 (docs/05), no budget yet · errors: unsourced-evidence: `stat` has no checkable source ×8 · unsourced-evidence: `chart` has no checkable source ×2 · invalid-prop: `stat` is a leaf, written as a container ×2 · required-prop: `flow` has no body ×2 · invalid-prop: `flow` body is not valid YAML: bad indentation of a mapping entry (4:12) ×1 · invalid-prop: `flow` body is not valid YAML: bad indentation of a mapping entry (6:41) ×1 |
| `agent.write.before.claude-haiku-4-5-20251001` | 8 turns | — | report | median reads + calls before the first content.create (7 reads, 1 calls) |
| `agent.write.tokens.claude-haiku-4-5-20251001` | 67806 tokens | — | report | median of what the model's context paid per post, cache included · $1.00 for 20 |
| `agent.write.pass.claude-sonnet-5` | 0.95  | — | report | 19/20 first attempts lint clean — target ≥ 0.8 (docs/05), no budget yet · errors: unsourced-evidence: `stat` has no checkable source ×2 |
| `agent.write.before.claude-sonnet-5` | 7 turns | — | report | median reads + calls before the first content.create (6 reads, 1 calls) |
| `agent.write.tokens.claude-sonnet-5` | 89686 tokens | — | report | median of what the model's context paid per post, cache included · $2.63 for 20 |
| `agent.write.pass.claude-opus-5` | 0.95  | — | report | 19/20 first attempts lint clean — target ≥ 0.8 (docs/05), no budget yet · errors: frontmatter: Frontmatter field `description` is 165 characters; the limit is 160 ×1 |
| `agent.write.before.claude-opus-5` | 9 turns | — | report | median reads + calls before the first content.create (7 reads, 1 calls) |
| `agent.write.tokens.claude-opus-5` | 63239 tokens | — | report | median of what the model's context paid per post, cache included · $4.54 for 20 |

CI passes at ≤ 80 % of budget (docs/07 §3), except where a row is a counted design statement rather than a clock, which passes at ≤ budget. Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.


| Model | Topic | First attempt | Errors / warnings | Error rules | Reads + calls before | Model tokens | Ended |
|---|---|---|---|---|---|---|---|
| claude-haiku-4-5-20251001 | What a cold start costs, measured four ways | ❌ | 5 / 0 | unsourced-evidence ×5 | 7 + 1 | 65908 |  |
| claude-haiku-4-5-20251001 | How a draft becomes a published post, and where the human is | ✅ | 0 / 2 |  | 6 + 1 | 62719 |  |
| claude-haiku-4-5-20251001 | Why the only interface is an MCP server | ✅ | 0 / 0 |  | 7 + 1 | 66076 |  |
| claude-haiku-4-5-20251001 | The build budget: two seconds for a hundred posts, and what we do when it slips | ❌ | 2 / 0 | invalid-prop, unsourced-evidence | 7 + 1 | 69216 |  |
| claude-haiku-4-5-20251001 | Three static site generators compared on tokens per page | ✅ | 0 / 1 |  | 6 + 1 | 65235 |  |
| claude-haiku-4-5-20251001 | How the incremental build decides what to re-render | ✅ | 0 / 3 |  | 6 + 1 | 67716 |  |
| claude-haiku-4-5-20251001 | What a theme is allowed to own, and what it is not | ✅ | 0 / 0 |  | 6 + 1 | 70039 |  |
| claude-haiku-4-5-20251001 | Questions people ask about publishing without an admin UI | ✅ | 0 / 1 |  | 6 + 1 | 82597 |  |
| claude-haiku-4-5-20251001 | How `suggest_blocks` finds the chart inside a table | ✅ | 0 / 0 |  | 8 + 1 | 115217 |  |
| claude-haiku-4-5-20251001 | A changelog for the changelog plugin | ✅ | 0 / 0 |  | 8 + 1 | 69152 |  |
| claude-haiku-4-5-20251001 | The twelve lint rules, and the one that fights back | ✅ | 0 / 0 |  | 11 + 1 | 134632 |  |
| claude-haiku-4-5-20251001 | Why every chart is an SVG and not a canvas | ❌ | 5 / 0 | unsourced-evidence ×3, invalid-prop, required-prop | 7 + 1 | 75889 |  |
| claude-haiku-4-5-20251001 | How a push reaches Bing the moment it lands | ✅ | 0 / 0 |  | 7 + 1 | 66510 |  |
| claude-haiku-4-5-20251001 | The write model: one branch for drafts, one for the site | ✅ | 0 / 2 |  | 6 + 1 | 66865 |  |
| claude-haiku-4-5-20251001 | What `tokens.learn` measures and why it has a budget | ❌ | 1 / 0 | invalid-prop | 7 + 1 | 67418 |  |
| claude-haiku-4-5-20251001 | Choosing between a flow and a diagram | ❌ | 2 / 0 | invalid-prop, required-prop | 7 + 1 | 70095 |  |
| claude-haiku-4-5-20251001 | How the preview server picks its port | ✅ | 0 / 1 |  | 6 + 1 | 65411 |  |
| claude-haiku-4-5-20251001 | A post about nothing: what happens when you publish an empty draft | ✅ | 0 / 1 |  | 6 + 1 | 64609 |  |
| claude-haiku-4-5-20251001 | Reading a bench report: which rows are clocks and which are counts | ❌ | 2 / 1 | invalid-prop, unsourced-evidence | 7 + 1 | 67806 |  |
| claude-haiku-4-5-20251001 | Migrating a folder of markdown into primitives, one post at a time | ✅ | 0 / 1 |  | 7 + 1 | 71492 |  |
| claude-sonnet-5 | What a cold start costs, measured four ways | ✅ | 0 / 0 |  | 8 + 3 | 165548 |  |
| claude-sonnet-5 | How a draft becomes a published post, and where the human is | ✅ | 0 / 1 |  | 6 + 1 | 90912 |  |
| claude-sonnet-5 | Why the only interface is an MCP server | ✅ | 0 / 0 |  | 5 + 1 | 83599 |  |
| claude-sonnet-5 | The build budget: two seconds for a hundred posts, and what we do when it slips | ✅ | 0 / 1 |  | 7 + 2 | 108561 |  |
| claude-sonnet-5 | Three static site generators compared on tokens per page | ✅ | 0 / 0 |  | 5 + 1 | 84296 |  |
| claude-sonnet-5 | How the incremental build decides what to re-render | ✅ | 0 / 2 |  | 6 + 1 | 85701 |  |
| claude-sonnet-5 | What a theme is allowed to own, and what it is not | ✅ | 0 / 0 |  | 6 + 1 | 84743 |  |
| claude-sonnet-5 | Questions people ask about publishing without an admin UI | ✅ | 0 / 1 |  | 5 + 1 | 81922 |  |
| claude-sonnet-5 | How `suggest_blocks` finds the chart inside a table | ✅ | 0 / 0 |  | 7 + 1 | 114224 |  |
| claude-sonnet-5 | A changelog for the changelog plugin | ✅ | 0 / 0 |  | 7 + 3 | 122985 |  |
| claude-sonnet-5 | The twelve lint rules, and the one that fights back | ✅ | 0 / 0 |  | 9 + 1 | 129624 |  |
| claude-sonnet-5 | Why every chart is an SVG and not a canvas | ✅ | 0 / 0 |  | 6 + 1 | 84773 |  |
| claude-sonnet-5 | How a push reaches Bing the moment it lands | ✅ | 0 / 1 |  | 7 + 1 | 87914 |  |
| claude-sonnet-5 | The write model: one branch for drafts, one for the site | ✅ | 0 / 0 |  | 6 + 1 | 93975 |  |
| claude-sonnet-5 | What `tokens.learn` measures and why it has a budget | ✅ | 0 / 0 |  | 6 + 1 | 89686 |  |
| claude-sonnet-5 | Choosing between a flow and a diagram | ✅ | 0 / 4 |  | 8 + 4 | 142488 |  |
| claude-sonnet-5 | How the preview server picks its port | ✅ | 0 / 0 |  | 6 + 1 | 85474 |  |
| claude-sonnet-5 | A post about nothing: what happens when you publish an empty draft | ✅ | 0 / 1 |  | 6 + 1 | 83413 |  |
| claude-sonnet-5 | Reading a bench report: which rows are clocks and which are counts | ❌ | 2 / 1 | unsourced-evidence ×2 | 7 + 1 | 111577 |  |
| claude-sonnet-5 | Migrating a folder of markdown into primitives, one post at a time | ✅ | 0 / 2 |  | 6 + 1 | 87984 |  |
| claude-opus-5 | What a cold start costs, measured four ways | ✅ | 0 / 0 |  | 9 + 1 | 64685 |  |
| claude-opus-5 | How a draft becomes a published post, and where the human is | ✅ | 0 / 0 |  | 7 + 2 | 63440 |  |
| claude-opus-5 | Why the only interface is an MCP server | ✅ | 0 / 0 |  | 6 + 1 | 61816 |  |
| claude-opus-5 | The build budget: two seconds for a hundred posts, and what we do when it slips | ✅ | 0 / 0 |  | 7 + 2 | 62462 |  |
| claude-opus-5 | Three static site generators compared on tokens per page | ✅ | 0 / 2 |  | 9 + 1 | 64063 |  |
| claude-opus-5 | How the incremental build decides what to re-render | ✅ | 0 / 0 |  | 7 + 2 | 62198 |  |
| claude-opus-5 | What a theme is allowed to own, and what it is not | ✅ | 0 / 0 |  | 7 + 2 | 65367 |  |
| claude-opus-5 | Questions people ask about publishing without an admin UI | ✅ | 0 / 0 |  | 6 + 1 | 60473 |  |
| claude-opus-5 | How `suggest_blocks` finds the chart inside a table | ✅ | 0 / 0 |  | 7 + 1 | 64028 |  |
| claude-opus-5 | A changelog for the changelog plugin | ❌ | 1 / 1 | frontmatter | 7 + 1 | 63239 |  |
| claude-opus-5 | The twelve lint rules, and the one that fights back | ✅ | 0 / 3 |  | 9 + 2 | 91977 |  |
| claude-opus-5 | Why every chart is an SVG and not a canvas | ✅ | 0 / 0 |  | 8 + 2 | 64576 |  |
| claude-opus-5 | How a push reaches Bing the moment it lands | ✅ | 0 / 0 |  | 7 + 1 | 61550 |  |
| claude-opus-5 | The write model: one branch for drafts, one for the site | ✅ | 0 / 0 |  | 7 + 2 | 61484 |  |
| claude-opus-5 | What `tokens.learn` measures and why it has a budget | ✅ | 0 / 1 |  | 7 + 1 | 64081 |  |
| claude-opus-5 | Choosing between a flow and a diagram | ✅ | 0 / 0 |  | 7 + 1 | 61683 |  |
| claude-opus-5 | How the preview server picks its port | ✅ | 0 / 1 |  | 6 + 1 | 58973 |  |
| claude-opus-5 | A post about nothing: what happens when you publish an empty draft | ✅ | 0 / 0 |  | 6 + 1 | 59177 |  |
| claude-opus-5 | Reading a bench report: which rows are clocks and which are counts | ✅ | 0 / 0 |  | 8 + 1 | 62705 |  |
| claude-opus-5 | Migrating a folder of markdown into primitives, one post at a time | ✅ | 0 / 0 |  | 8 + 1 | 63891 |  |
