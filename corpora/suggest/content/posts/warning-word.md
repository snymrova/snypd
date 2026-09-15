---
title: The warning that is not a warning
date: 2026-06-25
tags: [operations]
---

The build prints a warning for a frontmatter field the type does not declare, and people read it as an error.

It is not one. The field is ignored, the page builds, and the warning exists so that a typo in `descripton` is found before a reader notices the missing description. Silencing it means declaring the field on the type, which is a two-line change in `snypd.yaml`.

The doctor lists the same warnings, so a site with a hundred of them can see them in one place.
