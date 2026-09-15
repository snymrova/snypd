---
title: Moving a folder of markdown into a site
date: 2026-04-14
tags: [how-to]
---

The migration is four commands, in order, and none of them is clever.

1. **Init** — run `snypd init my-site` in an empty directory so the config and the content folders exist.
2. **Copy** — move every `.md` file into `content/posts/`, keeping the filenames; the filename is the slug.
3. **Lint** — run `snypd lint` and fix what it names, which is usually a missing `date` and a tag used once.
4. **Build** — run `snypd build` and open `dist/` to see the site as a host will serve it.

Frontmatter that the type does not declare is ignored with a warning, so a folder from another generator builds on the first try more often than not.
