---
title: Rolling a bad release back
date: 2026-04-11
tags: [operations]
---

A release is a git tag and a host build. Rolling one back is undoing both, in the right order.

1. Decide whether the site is wrong or the binary is wrong — a wrong page is content, a wrong build is a release.
2. If the site is wrong, revert the content commit and push; the host rebuilds and you are done.
3. If the binary is wrong, move the host's pin back one release.
4. Unless the pin is already at the previous release, trigger a rebuild; if it is, the pin is not the problem and you go back to step 1.
5. Either way, write down what happened before the next release.

The step everyone skips is the last one.
