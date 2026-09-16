---
title: Vendoring a variable font
date: 2026-04-17
tags: [how-to]
---

A theme that ships a webfont ships one file, and this is how that file is made.

1. **Fetch** the variable TTF from the foundry's release page, not from a CDN.
2. **Subset** it to Latin with `pyftsubset`, keeping the weight axis.
3. **Convert** the subset to WOFF2 with `woff2_compress`.
4. **Measure** the result and write the size, rounded up, into `theme.yaml` as `font.kb`.
5. **Declare** a metric-matched fallback so the text does not jump when the face arrives.

The declared size is a budget the bench holds the file to, so step four is the one with teeth.
