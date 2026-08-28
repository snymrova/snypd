---
title: Questions about having no admin UI
date: 2026-04-16
tags: [agents]
---

Every time we describe a CMS whose only interface is an MCP server, the same four questions come back. Here they are with the answers we have.

### What happens when the agent is wrong?

The same thing that happens when a person is wrong, except it is on a branch. Nothing an agent writes reaches the build until a human approves that exact version, and the whole edit is a diff you can read.

### Do I need an agent to change a typo?

No. The files are markdown in a git repository you own. Open one in any editor and commit it — the index notices on the next build and nothing complains.

### Is this not just a static site generator?

It is a static site generator with a vocabulary. The difference shows up when you ask an agent to add a chart: it gets a primitive with a schema and a lint rule, not a blank HTML block and a hope.

### What if the project dies?

You are left with a folder of markdown and YAML, which is what you would have had anyway. That is the point of the format being the product.

Be careful with the second answer. Editing a published file directly is fine, but editing one that is mid-review invalidates the approval, and the publish will refuse until somebody looks again.
