---
title: Deploying on a Friday
date: 2026-03-05
tags: [operations]
---

We do deploy on Fridays. Here is the procedure that makes it boring.

1. Run the full test suite against the release branch.
2. If the suite is red, stop and page the author. Otherwise tag the release.
3. Push the tag and watch the build.
4. When the health check fails twice, roll back to the previous tag and go back to step 1.
5. Announce the release in the channel.

Nothing here is clever. The value is that the branch points are written down instead of remembered.
