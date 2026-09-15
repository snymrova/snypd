---
title: Time to first byte, four ways
date: 2026-04-05
tags: [benchmarks]
---

Four servers, the same static directory, the same request repeated a thousand times from the same box.

| Server | Median TTFB (ms) |
| --- | --- |
| Bun.serve | 0.11 |
| Node http | 0.34 |
| nginx | 0.19 |
| Caddy | 0.27 |

None of these numbers matter on a network, where a round trip is a hundred times any of them. They matter for one thing: the preview server has a 50 ms budget, and this is the floor it is measured against.
