---
title: One binary, one interface
date: 2026-09-16
status: published
description: What is inside the snypd binary and what comes out of it, drawn by the diagram primitive.
author: sunny
category: engineering
tags: [agents]
---

:::diagram{direction="lr" caption="A harness speaks MCP over stdio to one binary; the binary writes markdown to a git repo you own and renders it to a static directory."}
nodes:
  - { id: harness, label: "Claude Code · Cursor · Codex", kind: pill }
  - { id: mcp, label: "MCP server" }
  - { id: content, label: "markdown + YAML in git" }
  - { id: render, label: "renderer + spec + themes" }
  - { id: index, label: "SQLite index" }
  - { id: html, label: "HTML, 0 KB JS", kind: rounded }
  - { id: twin, label: ".md twins · llms.txt · feeds · JSON", kind: rounded }
edges:
  - { from: harness, to: mcp, label: stdio }
  - { from: mcp, to: content, label: writes }
  - { from: content, to: render }
  - { from: render, to: index }
  - { from: render, to: html }
  - { from: render, to: twin }
:::

The diagram is the `diagram` primitive: nodes and edges declared in YAML, laid out at build time,
rendered to inline SVG. No coordinates were typed.
