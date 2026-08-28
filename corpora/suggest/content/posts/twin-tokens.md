---
title: What a markdown twin actually saves
date: 2026-03-04
tags: [benchmarks]
---

TL;DR: serving the markdown twin cuts what an agent parses by roughly nine tenths, and the llms.txt file next to it does nothing we can measure.

We ran the same post through four representations and counted o200k tokens on each.

| Representation | Tokens |
| --- | --- |
| Raw HTML | 6120 |
| Readability extract | 2840 |
| Markdown twin | 504 |
| llms.txt entry | 61 |

The gap between the second and third rows is the whole argument. Readability strips the chrome but keeps the markup; the twin is the file the author wrote.
