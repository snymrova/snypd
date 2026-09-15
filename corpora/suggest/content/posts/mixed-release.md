---
title: Cutting a release
date: 2026-05-20
tags: [operations]
---

A release is measured before it is tagged. This is the record from the last one, then the steps.

| Metric | Value (ms) |
| --- | --- |
| Cold build, 100 posts | 292 |
| Cold build, 1000 posts | 2748 |
| Incremental build | 13 |
| MCP cold start | 23 |

1. **Run** the full bench and commit the record.
2. **Tag** the version and push the tag.
3. **Watch** the release workflow publish the binaries.
4. **Move** the host's pin and confirm the site rebuilt.

The order matters: a tag without a record is a claim without a number.
