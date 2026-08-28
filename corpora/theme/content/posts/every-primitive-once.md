---
title: Every primitive, once
date: 2026-08-28
status: published
description: One post that uses all thirteen primitives, so a theme can be reviewed in a single page.
author: sunny
category: engineering
tags: [markdown, agents]
---

::cover{eyebrow="Engineering" subtitle="What a markdown twin actually saves" image="/media/cover.png" alt="Token counts side by side"}

:::tldr
Serving a markdown twin cuts what an agent parses by 92 %. `llms.txt` may do nothing.
:::

## What this page is for

Thirteen primitives and five layouts is the whole vocabulary. A theme is finished when every one of
them has been looked at, in both colour schemes, at a phone width and a desktop one — so they are all
here, in one route, exactly as the spec writes them.

:::callout{kind="warning" title="The caveat"}
`llms.txt` is the most-recommended and least-evidenced item on the list.
:::

:::pullquote{cite="Google Search Central" href="https://developers.google.com/search"}
There is no ranking benefit from llms.txt.
:::

## Blocks that carry data

:::stat-row
::stat{value="92%" label="fewer tokens" source="https://snypd.rocks/bench"}
::stat{value="0" label="Google support for llms.txt" source="https://developers.google.com/search"}
:::

:::chart{type="bar" source="https://snypd.rocks/bench" caption="Tokens per page, HTML vs markdown twin" unit="tokens"}
- { label: HTML, value: 6120 }
- { label: Markdown twin, value: 504 }
:::

:::diagram{direction="lr" caption="Content flows from git to two outputs."}
nodes:
  - { id: md, label: markdown + YAML }
  - { id: build, label: snypd build }
  - { id: html, label: HTML }
  - { id: twin, label: .md twin }
edges:
  - { from: md, to: build }
  - { from: build, to: html }
  - { from: build, to: twin }
:::

:::flow{caption="Publishing is a merge; the agent never touches main."}
steps:
  - Draft on branch snypd/draft-<slug>
  - Run lint
  - ask: Lint clean?
    yes: Open preview
    no: { then: fix }
  - id: fix
    do: Fix the reported rule and re-lint
  - Human approves
  - Merge to main
:::

## Blocks that carry instructions

:::steps{title="Add a markdown twin" time="5 min"}
1. **Build** — `snypd build` writes `index.md` beside every `index.html`.
2. **Serve** — answer `Accept: text/markdown` with the twin.
3. **Verify** — `curl -H 'Accept: text/markdown' https://example.com/post/`.
:::

:::faq
### Does llms.txt help ranking?
No. No search engine has announced support.

### What does help?
A markdown twin served on `Accept: text/markdown`.
:::

## Blocks that carry a thing to look at

::figure{src="/media/twin.png" alt="Side-by-side HTML and markdown of the same post" caption="The `.md` twin is the source file." width="wide"}

::cta{title="Run the bench yourself" body="One binary, one command." button="Install" href="https://snypd.rocks/install"}
