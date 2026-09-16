---
title: A CMS whose only interface is your agent
status: published
home: true
description: The front page, under the home layout — a page's body, then the latest posts.
---

:::tldr
Write in the harness you already have open. The site is markdown in git, built to static HTML with no script on the page.
:::

:::stat-row
::stat{value="13" label="primitives" source="https://snypd.rocks/posts/every-primitive-once/"}
::stat{value="6" label="layouts" source="https://snypd.rocks/themes/"}
::stat{value="0 KB" label="JavaScript" source="https://snypd.rocks/bench/"}
:::

## How it starts

:::steps{title="Four lines"}
1. `mkdir site && cd site`
2. `bunx @snypd/cli init`
3. `claude`
4. *Write me a first post.*
:::

::figure{src="/media/twin.png" alt="Side-by-side HTML and markdown of the same post" caption="Every page ships its markdown twin." width="wide"}

::cta{title="Read the posts" button="All posts" href="/posts/"}
