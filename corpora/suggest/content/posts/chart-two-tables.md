---
title: The two tables in every post-mortem
date: 2026-05-23
tags: [operations]
---

Every incident write-up has two tables, and only one of them is a chart.

| Minute | Requests failing (%) |
| --- | --- |
| 0 | 0 |
| 5 | 12 |
| 10 | 41 |
| 15 | 38 |
| 20 | 3 |

| Action | Owner | Ticket |
| --- | --- | --- |
| Add the busy timeout | Runtime | [#412](https://example.com/412) |
| Document the WAL setting | Docs | [#413](https://example.com/413) |
| Alert on lock waits | Ops | [#414](https://example.com/414) |

The first is a shape the reader should see. The second is a list of links the reader should click, and it stays a table.
