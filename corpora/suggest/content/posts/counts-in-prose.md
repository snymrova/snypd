---
title: What a session costs
date: 2026-07-01
tags: [benchmarks]
---

A session is roughly four hundred lines of code, six tests and one decision, and it takes a morning. The tests are the part that does not scale down: a session with two tests is a session that did not find anything.

The decision count is the one to watch. A session with three decisions is usually a session that found a problem it did not expect, and those are the good ones. A session with none was execution, which is fine, and which is what most of them are.

Costs in tokens are published on the bench page for the agent runs; for the human sessions there is no meter, only the log.
