---
title: A CMS whose only interface is your agent
status: published
home: true
description: The front page, under the home layout — a page's body, then the latest posts.
---

::cover{subtitle="Publish a website from the harness you already have open." media="/media/showreel.mp4" poster="/media/showreel.png" autoplay=true}

:::tldr
Write in the harness you already have open. The site is markdown in git, built to static HTML with no script on the page.
:::

## How it starts

:::stat-row
::stat{value="13" label="primitives" source="https://snypd.rocks/posts/every-primitive-once/"}
::stat{value="6" label="layouts" source="https://snypd.rocks/themes/"}
::stat{value="0 KB" label="JavaScript" source="https://snypd.rocks/bench/"}
:::

:::steps{title="Four lines"}
1. `mkdir site && cd site`
2. `bunx @snypd/cli init`
3. `claude`
4. *Write me a first post.*
:::

::figure{src="/media/twin.png" alt="Side-by-side HTML and markdown of the same post" caption="Every page ships its markdown twin." width="wide"}

## Runs on it

:::logo-wall{layout="marquee"}
- [![Acme](/media/logo-acme.png)](https://acme.example)
- ![Globex](/media/logo-globex.png)
- [![Initech](/media/logo-initech.png)](https://initech.example)
- ![Umbrella](/media/logo-umbrella.png)
:::

::cta{title="Read the posts" button="All posts" href="/posts/"}
