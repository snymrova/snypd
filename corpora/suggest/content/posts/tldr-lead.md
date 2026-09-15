---
title: Why the parser stays
date: 2026-05-17
tags: [benchmarks]
---

In short: the alternative renderer is ninety-five times faster and cannot do the job, so the parser stays and the ratio is published beside it.

The job is a tree. Lint needs line numbers, the block builder needs typed nodes, the suggestion tool needs shapes, and the markdown twin needs the source the author wrote. A renderer that returns a string has none of those, and adding them back costs the ninety-five times.

So the row is in every record as a ceiling, and the next parser is measured against it.
