---
title: Is a static site enough?
date: 2026-06-16
tags: [agents]
---

### Is a static site enough?

For a publication it is more than enough, and the argument takes a while to make properly, because the word "static" carries twenty years of baggage. A static artefact behind a CDN is the fastest thing a browser can receive: no origin round trip, no template evaluated per request, no cache to warm, no cache to invalidate wrongly. Everything that is not static — search, comments, forms, a login — has a well-understood way of being added at the edge without touching the artefact, and every one of those additions is a choice a site makes rather than a cost every site pays. The question people are actually asking is whether the *authoring* side needs a server, and it does not: the author's harness is the server, and it speaks MCP. What remains is the set of things people believe a CMS must have and a static site cannot, and each of those turns out on inspection to be either a build-time transform, a thing the host does anyway, or a thing nobody actually used once they had it. The list is shorter every year. The one item on it that is real is a site with a hundred thousand pages that change every minute, and that site is a database with a website in front of it, which is a different product.

### What about search?

The honest answer is that search on a small site is a page of links, search on a large one is somebody else's index, and the space between those two is smaller than it looks. A site under a few hundred posts is served better by a well-made archive page and a tag structure than by a search box, because a search box on a small site returns either nothing or everything. A site over a few thousand is indexed by the engines within a day of a push — the IndexNow plugin exists for exactly that — and a search box there is a worse version of the one the reader already has open in another tab. Between those there is a static index file and a few kilobytes of script, which the JavaScript budget can afford when a site chooses to, and the choice is the point: it is declared in the config, measured on every build, and refused when it grows past what was declared. That is the whole position. A static site is not a site without search; it is a site where search is a decision rather than a default, and where the default is the fastest possible page.
