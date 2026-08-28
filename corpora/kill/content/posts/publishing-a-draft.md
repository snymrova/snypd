---
title: How a draft becomes a published post
date: 2026-04-09
tags: [operations]
---

An agent can write, and an agent cannot publish. Everything interesting about our write path is in the space between those two sentences.

1. The agent writes the file. It lands on a branch of its own, named for the item, with the principal in a commit trailer.
2. Lint runs on the same call. If it returns errors the agent fixes them and commits again, still on that branch.
3. A human opens the review page and reads the rendered draft.
4. If they approve, the approval names that exact version by hash. If they ask for changes, the agent goes back to step 2 and the old approval stops matching.
5. The agent calls publish. The branch merges and the post goes live.

The hash in step 4 is the part people miss. An approval is not a permission granted to an agent, it is a signature on one version of one file. Edit after approving and the publish is refused rather than quietly shipping words nobody read.

Nothing here needs an admin panel. The review page is a page in the site, served by the same preview server the agent already started.
