---
title: How fast, measured
date: 2026-09-16
status: published
description: The build clock at three sizes, drawn by the chart primitive from the bench record.
author: sunny
category: engineering
tags: [agents]
---

:::tldr
A cold build renders about 2.7 ms a page and an edit rebuilds one page in 13.1 ms. Every number here is a row in the bench record.
:::

:::stat-row
::stat{value="23 ms" label="MCP cold start, release binary" source="https://github.com/snymrova/snypd/blob/main/bench/latest.md"}
::stat{value="13.1 ms" label="one edit, rebuilt" source="https://github.com/snymrova/snypd/blob/main/bench/latest.md"}
::stat{value="0 KB" label="JavaScript on the page" source="https://github.com/snymrova/snypd/blob/main/bench/latest.md"}
:::

:::chart{type="bar" source="https://github.com/snymrova/snypd/blob/main/bench/latest.md" caption="A cold build — no `dist/`, no index — at 100, 1 000 and 10 000 posts. The clock is CI's, 4 vCPUs." unit="ms"}
- { label: "100 posts", value: 292.5 }
- { label: "1,000 posts", value: 2748 }
- { label: "10,000 posts", value: 27720.5 }
:::

The chart above is not an image file. It is the `chart` primitive rendered to inline SVG at build time from the
rows under it, which came from `bench/latest.md` when this fixture was generated. Regenerate the fixture and
the chart follows the record.
