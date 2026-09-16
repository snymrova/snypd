# Show HN

**When:** launch day, ~15:00 IST (07:30 Pacific — HN's US morning). **Who:** Sunny, from his account. **Landing:** the README, not the Product Hunt page — HN reads a README and distrusts a launch page. **Plan:** [docs/16 §4](../16-launch-campaign.md).

HN's rules for a Show HN, applied: the title says what it is and nothing else; the text is a comment, not a pitch — what it is, why it exists, what it is made of, what it does not do, and the question you actually want answered. No numbers without the row they came from. No "excited to".

## Title

*≤ 80 characters.*

> Show HN: Snypd – a CMS whose only interface is MCP

(47. HN strips "Show HN:" from the count in practice; the en dash is HN's house style for the separator.)

## URL

`https://github.com/snymrova/snypd`

## Text

*The first comment, posted with the submission.*

I built a CMS with no dashboard. The only interface is MCP: you open Claude Code (or Cursor, or Codex — anything that reads `.mcp.json`) on a directory, say "write me a first post", and the agent writes, lints, previews and publishes it. Content is markdown with YAML frontmatter in a git repo you own; the product is one Bun binary; the output is static HTML with no JavaScript on the page.

The front door is:

    mkdir field-notes && cd field-notes
    bunx @snypd/cli init
    claude

and then the sentence.

Why: I already write in a harness, and the CMS tab was the one thing I still left it for. Every CMS claims no lock-in; this is the one where you can check with `ls`.

What it is made of, since that is the interesting part:

- The content vocabulary is closed: thirteen typed primitives (chart, diagram, flow, steps, stat, faq, …), each with a schema, an intent, an anti-intent and a fallback. A `chart` is inline SVG drawn at build time from inline data; a `flow` is a laid-out graph; a `stat` without a source fails lint. Themes implement the vocabulary; content never references a theme.
- The MCP surface is small on purpose. `tools/list` is `content.*` plus `find_tools`, which hands over theming, config and the bench when asked — 2,230 tokens a turn, and a whole site costs an agent under 6,000 tokens to learn. Every page is built with a `.md` twin beside it, so an agent reads a page for ~510 tokens instead of parsing HTML.
- The bench fails CI. Cold build at 1,000 posts is 2.7 s (2.7 ms a page) and 27.7 s at 10,000; an incremental rebuild after one edit is 13 ms; spawn to `initialize` on the release binary is 23 ms; `page.js.kb` is 0 on every route of every shipped theme and the build refuses a page that breaks it. Every number has a budget and a row in `bench/latest.md`, and the numbers are CI's, not my laptop's.
- It is tested against live models, not mocks. The kill test hands a model the MCP surface and three plain posts and asks for a themed, published site with a new post carrying a chart and a flow; it is fifteen assertions over the finished repo, never over the transcript, and passes 15/15 on haiku, sonnet and opus. Separately, a first-attempt post lints clean 70 % / 95 % / 95 % of the time over twenty topics.
- Themes are CSS and tokens over a `base` that brings every layout; `snypd check theme` judges one by seventeen rules, including the WCAG ratio of every colour pair on every look. One webfont, self-hosted, subsetted, ≤ 40 KB, or none.
- Plugins are a directory with a `snypd.yaml`: declare types, decorate slots, transform the document tree, react to publish/push, expose one tool. Four ship in the binary. npm is the registry. There is no sandbox, and I would rather say that than imply one.

What it is not: there is no dashboard and there will not be a visual designer. There is no marketplace (npm), no hosted version, no telemetry (nothing leaves your machine that you did not push). A person stays in the loop per type (`mcp.write: draft` — the agent stops at a review URL) or per deploy (one Push button on `/_snypd`); by default the agent drafts, publishes and pushes.

The thing I am least sure of and would like to hear about: whether a *closed* vocabulary is the right call. Thirteen blocks is enough for every post I have written with it, and it is what makes an agent's first attempt lint clean nine times in ten, but it is also the first thing someone will want to add to. The alternative — content that depends on a plugin to render — is the WordPress shortcode, and I refused it on purpose.

MIT. The design docs (`docs/`) are the answer to "why is it like this"; they are long because I wrote them before the code and kept them honest after.

## Replies — the rules for the day

- Every reply that names a number links `bench/latest.md` (or `snypd.rocks/bench`).
- "It's just a static site generator with extra steps" — agree with the first half. The generator is the part you do not see; the product is the surface an agent reads and the lint that keeps its first attempt honest.
- "Why not a Hugo/Astro plugin" — because the surface is the product: `tools/list` at 2,230 tokens, a `.md` twin per page, a `stat` that fails without a source. Those are not a plugin's to decide.
- "No sandbox" is not a defence: say it, link docs/10 §4, move on.
- Do not argue with "I don't want an agent writing my site". They are right for them. The Desk and `mcp.write: draft` are the answer for the ones in between.
- Twelve hours. Then stop.
