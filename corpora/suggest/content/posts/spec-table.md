---
title: The thirteen primitives
date: 2026-03-17
tags: [agents]
---

The whole vocabulary, with what each one needs and what it emits.

| Primitive | Kind | Group | Required props | Emits |
| --- | --- | --- | --- | --- |
| chart | container | evidence | source, caption | inline SVG |
| stat | leaf | evidence | value, label, source | text |
| flow | container | evidence | caption | inline SVG |
| faq | container | interaction | none | FAQPage |
| steps | container | interaction | none | HowTo |

Anything not on this list fails lint rather than passing through as a div.
