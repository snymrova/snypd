---
title: Where the build time actually goes
date: 2026-03-21
tags: [benchmarks]
---

A cold build of a hundred posts spends most of its time in one place, and it is not the place anyone guesses.

| Stage | Milliseconds |
| --- | --- |
| Parse | 412 |
| Render | 88 |
| Emit | 24 |
| Index | 11 |

Parsing is four fifths of it. To reproduce the measurement:

1. Delete the `dist` directory and the `.snypd` index.
2. Run `snypd bench --quick` and record the cold number.
3. Repeat the run five times and take the median.
4. Compare against the previous session with `snypd bench compare`.

The median matters more than the run. A single cold build on a loaded box tells you about the box.
