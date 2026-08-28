---
title: Two questions we could not answer quickly
date: 2026-03-18
tags: [agents]
---

## Why not use an existing parser?

We tried three. The first had no AST, which rules it out for lint and for the markdown twin, both of which need to walk the document rather than render it. The second had an AST but no directive support, and adding directives to it meant forking the tokenizer. The third had both and parsed at a fifth of the speed we needed on the thousand-post corpus, which we only discovered after building two stages on top of it. What we use now is the same parser as the second option with the directive extension the ecosystem already ships, which is the answer we should have reached in an afternoon rather than a fortnight.

## Why is the vocabulary closed?

An open vocabulary means every consumer has to handle a block it has never seen, and the only safe way to handle an unknown block is to drop it or to pass it through as a div. Dropping it loses the author's meaning silently. Passing it through means the theme cannot style it, the schema emitter cannot describe it, and the markdown twin cannot round-trip it. A closed vocabulary is a promise that every block has a renderer, a schema mapping and a fallback, and that promise is what makes the twin trustworthy enough to serve to an agent.
