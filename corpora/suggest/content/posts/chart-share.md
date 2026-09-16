---
title: Where the build spends its time
date: 2026-04-02
tags: [benchmarks]
---

We instrumented every phase of a cold build over the hundred-post corpus and asked one question: where does the time go?

| Phase | Share (%) |
| --- | --- |
| Parse | 76 |
| Render HTML | 10 |
| Write | 5 |
| Weigh | 3 |
| Index | 1 |

Three quarters of a build is the parser, which is the one number that decides what is worth optimising and what is not. Everything below ten percent is noise until the parser moves.
