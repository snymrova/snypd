---
title: Adding a markdown twin to an existing site
date: 2026-03-06
tags: [how-to]
---

This takes about five minutes on any static site that already emits HTML.

1. **Build** — run `snypd build` so `index.md` lands beside every `index.html`.
2. **Serve** — answer requests carrying `Accept: text/markdown` with the twin.
3. **Announce** — add a `link rel="alternate"` pointing at it.
4. **Verify** — check it with `curl -H 'Accept: text/markdown'`.

The twin is the file you already wrote, so there is nothing to keep in sync.
