---
title: On measuring the wrong thing
date: 2026-03-19
tags: [benchmarks]
---

The first metric we shipped rewarded us for making the HTML worse. It was defined as one minus the ratio of the markdown twin to our own rendered page, which means the easiest way to improve it was to add chrome to the page the ratio was measured against.

Nobody did that deliberately. But the number went up twice in a row for reasons that had nothing to do with the twin getting smaller, and it took a session to notice why. The fix was not a better formula. It was demoting the metric to report-only and gating on the absolute number instead, which cannot be gamed by making something else larger.

There is a general version of this. A ratio between two things you control is a target, not a measurement. If both halves are yours, you have not measured anything; you have chosen a number.
