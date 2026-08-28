---
title: What we actually pay for a cold start
date: 2026-04-02
tags: [benchmarks]
---

Every millisecond before an agent's first tool call is a millisecond it spends doing nothing, and we had never measured ours honestly. So we spawned the server four hundred times and recorded the gap between the process starting and `initialize` coming back.

The numbers below are medians on a quiet four-core box. The variance is real but small; the ordering never changed across runs.

| Import | Cold cost |
| --- | --- |
| Protocol layer only | 3 |
| Plus the config loader | 28 |
| Plus the YAML parser | 58 |
| Plus the official SDK | 172 |

The last row is the whole reason we wrote our own JSON-RPC. A hundred and seventy milliseconds is three times the budget and it buys us a class hierarchy we do not use.

The fix is not clever. Nothing that is not needed to answer `initialize` is imported until something asks for it, which in practice means the first `resources/read`. An agent that only ever writes a post never pays for the benchmark suite.
