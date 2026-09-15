---
title: When the deploy goes red
date: 2026-04-08
tags: [operations]
---

The runbook for a failed deploy is short, and every step in it is a decision.

1. Check whether the build failed or the upload failed — the log says which on its first line.
2. If the build failed, read the budget breach it names and fix the page it points at; otherwise go to step 4.
3. Push the fix and start again from step 1.
4. If the upload failed, retry it once; if it fails again, the host is down and there is nothing to fix here.
5. Otherwise, the deploy is green and the route answers — read it before telling anyone.

The runbook exists because the two failures look identical from the outside and need opposite responses.
