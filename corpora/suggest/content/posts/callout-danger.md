---
title: The one command that deletes the index
date: 2026-04-26
tags: [operations]
---

Every build keeps an index in `.snypd/` and every build trusts it.

> Danger: deleting `.snypd/` while a build is running leaves `dist/` half-written and the next build believing it is complete. Stop the build first, then delete, then build again.

The failure is quiet, which is why it gets a box. A route that never regenerates looks exactly like a route that did not change.
