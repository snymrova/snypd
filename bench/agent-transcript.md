# snypd bench — the kill test

**Driver** `scripted` · **Tool calls** 18 (draft 2/8) · **Goal** 11/11 · **Wall** 1153 ms

The scenario is docs/06's v0.1 test: three plain posts upgraded with `suggest_blocks`, the theme swapped
and retuned, a new post written with a chart and a flow, everything approved by a person and published.
Checks read the finished site, never this transcript — a driver passes by leaving the repository right.

## Goal

| Check | Result | Detail |
|---|---|---|
| cold-start carries a `chart` | ✅ | :::chart present (a four-row table of one measurement per row) |
| publishing-a-draft carries a `flow` | ✅ | :::flow present (a numbered list that branches and loops back) |
| why-only-mcp carries a `faq` | ✅ | :::faq present (a run of question headings with answers under them) |
| a new post `the-kill-test` was written | ✅ | present |
| the new post carries a `chart` | ✅ | :::chart present |
| the new post carries a `flow` | ✅ | :::flow present |
| the theme is `editorial` | ✅ | theme.use = editorial |
| at least 2 tokens retuned | ✅ | 2 overridden: color.accent, font.body |
| every post is published | ✅ | 4/4 published |
| the site lints clean | ✅ | 0 errors, 3 warnings |
| the site builds | ✅ | dist/index.html present |

## Cost by phase

| Phase | Tool calls | Reads | Tokens out |
|---|---|---|---|
| upgrade | 6 | 0 | 473 |
| theme | 3 | 1 | 2133 |
| write | 2 | 0 | 52 |
| publish | 5 | 0 | 212 |
| build | 2 | 0 | 167 |

## Transcript

### 1. `initialize` · meta · 22.2 ms · 162 tokens back

```
{"protocolVersion":"2025-11-25","capabilities":{"resources":{},"tools":{"listChanged":true},"prompts":{}},"serverInfo":{"name":"snypd","version":"0.1.0-s16"},"instructions":"Start with the `get-started` prompt: it branches on what this site already is — empty, scaffolded, or established — and names the calls in the order that works. Otherwise: read snypd://config, then snypd://spec/primitives, before writing content — a post that is only prose wastes the vocabulary this CMS exists for. Writes go to a draft branch; publishing a draft-policy type needs a human to approve that exact version on /_snypd, the page this server serves for them."}
```

### 2. `tools/list` · read · 1.8 ms · 2230 tokens back

```
{"tools":[{"name":"content.create","description":"Write a new content file and commit it to the site's drafts branch. Frontmatter is the type's schema (snypd://types/{type}); the body is markdown plus the primitive directives in snypd://spec/primitives — a post that is all prose is a post that wastes the vocabulary. Status is always the site's initial status: this tool cannot publish. Returns the route, the branch and the lint the new file produces, so the fixes come back in the same turn as the writing.","inputSchema":{"type":"object","properties":{"type":{"type":"string","description":"Content type: `post`, `page`, `author` (snypd://types lists them)"},"slug":{"type":"string","description":"Slug to write at; defaults to the title, slugified"},"frontmatter":{"type":"object","description":"Frontmatter fields for the type. `status` is ignored — a new file is always a draft"},"body":{"type
… (8598 more characters)
```

### 3. `resources/read` · read · 147.6 ms · 478 tokens back

```
{"contents":[{"uri":"snypd://config","mimeType":"application/yaml","text":"# snypd://config — merged (env: dev). Layers, later wins:\n#   1. spec\n#   2. theme base (base/theme.yaml)\n#   3. site (snypd.yaml)\n#   4. env dev (snypd.dev.yaml) — not found\n# Lines without \"← file:line\" are @snypd/spec defaults; untouched subtrees are collapsed to their snypd://spec/* resource (theme.yaml subtrees to their file:line).\nsnypd: 1 # ← snypd.yaml:8\nsite: # ← snypd.yaml:9\n  name: Kill test # ← snypd.yaml:10\n  url: https://kill.snypd.rocks # ← snypd.yaml:11\n  description: Three plain posts, upgraded, restyled and published without opening\n    an editor. # ← snypd.yaml:12\ntheme: # ← base/theme.yaml\n  theme: base # ← base/theme.yaml:3 (theme base)\n  version: 0.1.0 # ← base/theme.yaml:4 (theme base)\n  spec: ^1 # ← base/theme.yaml:5 (theme base)\n  layouts: <theme base default — base/theme
… (570 more characters)
```

### 4. `resources/read` · read · 28 ms · 570 tokens back

```
{"contents":[{"uri":"snypd://spec/primitives","mimeType":"text/markdown","text":"# snypd spec v1 — primitives (13)\n\nRead `snypd://spec/primitives/{name}` for props, intent and an example. Unknown blocks fail lint.\n\n- **callout** (container, emphasis) `:::callout{…} … :::` — A boxed aside that must not be skipped — a warning, a tip, a note, or a line you want quoted.\n- **chart** (container, evidence) `:::chart{…} … :::` required: type, source, caption — A small static chart rendered to inline SVG at build time from inline data or a YAML file.\n- **cover** (leaf, structure) `::cover{…}` — The post header — title block with optional eyebrow, subtitle and image.\n- **cta** (leaf, interaction) `::cta{…}` required: title, button, href — One call to action — a title, a line of body and a single button.\n- **diagram** (container, evidence) `:::diagram{…} … :::` required: caption — A box-and
… (1157 more characters)
```

### 5. **content.suggest_blocks** · call · 55.6 ms · 118 tokens back
```json
{
  "type": "post",
  "slug": "cold-start"
}
```

```
1. lines 11–16  →  `chart`  (1.00)
   · One number per row is one comparison
   · A column header naming a unit is a measurement
   · Few enough bars to read without a legend
   · The numbers move in one direction
   · Three or more points make a shape a reader can see at a glance
   ! needs source — Lint rule 3 fails a chart or a stat with no checkable source — a number whose origin cannot be clicked is an opinion, and the prose does not carry one
```

### 6. **content.suggest_blocks** · call · 56.3 ms · 61 tokens back
```json
{
  "type": "post",
  "slug": "cold-start",
  "apply": [
    "1"
  ],
  "fill": {
    "1": {
      "source": "https://kill.snypd.rocks/bench"
    }
  }
}
```

```
applied 1 of 1 to post/cold-start → /posts/cold-start
  1. lines 11–16 → `chart` (1)
committed 94729b22 on snypd/drafts (from main)
lint: 0 errors, 0 warnings
```

### 7. **content.suggest_blocks** · call · 14.8 ms · 93 tokens back
```json
{
  "type": "post",
  "slug": "publishing-a-draft"
}
```

```
1. lines 9–13  →  `flow`  (0.90)
   · Two or more steps turn on a condition
   · The prose asks a question the reader has to answer before the next step
   · A step sends the reader back to an earlier one
   ! needs caption — `flow` requires a caption saying what the procedure is, and there is no heading or short lead paragraph above the list to take one from
```

### 8. **content.suggest_blocks** · call · 39.8 ms · 68 tokens back
```json
{
  "type": "post",
  "slug": "publishing-a-draft",
  "apply": [
    "1"
  ],
  "fill": {
    "1": {
      "caption": "a numbered list that branches and loops back, drawn"
    }
  }
}
```

```
applied 1 of 1 to post/publishing-a-draft → /posts/publishing-a-draft
  1. lines 9–13 → `flow` (0.9)
committed aca5a0b1 on snypd/drafts (from main)
lint: 0 errors, 0 warnings
```

### 9. **content.suggest_blocks** · call · 18.3 ms · 66 tokens back
```json
{
  "type": "post",
  "slug": "why-only-mcp"
}
```

```
1. lines 9–25  →  `faq`  (0.95)
   · Every heading in the run is a question
   · Three or more Q-and-A pairs is the shape FAQPage schema exists for
   · Each answer is a paragraph
   · These sit below the post's own sections
```

### 10. **content.suggest_blocks** · call · 38.3 ms · 67 tokens back
```json
{
  "type": "post",
  "slug": "why-only-mcp",
  "apply": [
    "1"
  ]
}
```

```
applied 1 of 1 to post/why-only-mcp → /posts/why-only-mcp
  1. lines 9–25 → `faq` (0.95)
committed fa362c4f on snypd/drafts (from main)
lint: 0 errors, 1 warning
```

### 11. **find_tools** · call · 2.1 ms · 338 tokens back
```json
{
  "query": "change the theme and its colours"
}
```

```
1 tool ready to call:

## theme
Change how the site looks: switch theme, retune its tokens, or scaffold a new one. A theme in snypd is `theme.yaml` plus one stylesheet — no components are required, because every primitive and layout resolves up the `extends:` chain — so `scaffold` gives you a working theme you only have to restyle. Read snypd://theme for what is installed, snypd://theme/tokens for every knob and its default, and snypd://theme/coverage for which primitives the active theme actually implements. Nothing here rebuilds the site: call content.render_preview to look at the result.

input: {"type":"object","properties":{"action":{"type":"string","description":"`set` a different theme · `set_tokens` to retune the active one · `scaffold` a new theme that extends an existing one","enum":["set","set_tokens","scaffold"]},"name":{"type":"string","description":"`set`: the theme to use.
… (491 more characters)
```

### 12. **theme** · call · 93.7 ms · 46 tokens back
```json
{
  "action": "set",
  "name": "editorial"
}
```

```
theme base → editorial
committed 06e7de82 → main 6bb22b7a
Look at it with content.render_preview; snypd://theme/coverage says which primitives this theme implements itself.
```

### 13. `resources/read` · read · 16.4 ms · 1668 tokens back

```
{"contents":[{"uri":"snypd://theme/tokens","mimeType":"application/yaml","text":"# Tokens of theme `editorial`. 38 of 38 can be set from snypd.yaml\n# with `theme` › set_tokens; the rest are structure, not taste. Every one is emitted as a CSS custom\n# property (`color.accent` → `--color-accent`), which is what a theme's stylesheet reads.\ntokens:\n  color.accent:\n    value: \"light-dark(#8a3324, #e0785f)\"\n    kind: color\n    description: \"Links and the one emphatic colour.\"\n  color.bg:\n    value: \"light-dark(#fdfcfa, #12110f)\"\n    kind: color\n    description: \"Page background.\"\n  color.border:\n    value: \"light-dark(#ddd7cb, #2e2b26)\"\n    kind: color\n    description: \"Hairlines and block edges.\"\n  color.muted:\n    value: \"light-dark(#6b655c, #9a9287)\"\n    kind: color\n    description: \"Dates, captions, secondary labels.\"\n  color.on-accent:\n    value: \"lig
… (3980 more characters)
```

### 14. **theme** · call · 88 ms · 81 tokens back
```json
{
  "action": "set_tokens",
  "tokens": {
    "color.accent": "#2f5d62",
    "font.body": "1.6"
  }
}
```

```
2 tokens set
  color.accent: light-dark(#8a3324, #e0785f) → #2f5d62
  font.body: 'Iowan Old Style', 'Palatino Linotype', Palatino, Charter, Georgia, ui-serif, serif → 1.6
committed 4d6057b1 → main 0974edb6
```

### 15. **content.create** · call · 37 ms · 42 tokens back
```json
{
  "type": "post",
  "slug": "the-kill-test",
  "frontmatter": {
    "title": "The kill test, run on itself",
    "date": "2026-04-23",
    "tags": [
      "benchmarks"
    ],
    "description": "Three plain posts upgraded, a theme swapped and a post written, without an editor."
  },
  "body": ":::tldr\nFour plain posts, three primitives they were already shaped as, one theme swap and two tokens — all of it through the MCP, none of it in an editor.\n:::\n\nThe point of this post is that it was written the same way the other three were upgraded: from a harness, over a socket, with no editor open at any point.\n\n:::chart{type=\"bar\" source=\"https://kill.snypd.rocks/bench\" caption=\"Tool calls per phase of the kill test\" unit=\"calls\"}\n- { label: Upgrade three posts, value: 5 }\n- { label: Swap theme and tokens, value: 3 }\n- { label: Write this post, value: 2 }\n- { label: Publish everything, value: 5 }\n:::\n\nEvery bar above is a call an agent had to spend. The interesting one is the last: publishing is four items plus the preview server, and none of it can be shortened by being cleverer, because a human has to look at each one.\n\n:::flow{caption=\"What the harness does, a
```

```
create post/the-kill-test → /posts/the-kill-test (draft)
committed b0607ec6 on snypd/drafts (from main)
lint: 0 errors, 0 warnings
```

### 16. **content.lint** · call · 34.2 ms · 10 tokens back
```json
{
  "type": "post",
  "slug": "the-kill-test"
}
```

```
1 file · 0 errors · 0 warnings
```

### 17. **content.render_preview** · call · 114.5 ms · 91 tokens back
```json
{
  "type": "post",
  "slug": "cold-start"
}
```

```
http://localhost:4321/posts/cold-start
markdown twin: http://localhost:4321/posts/cold-start/index.md
review + approve: http://localhost:4321/_snypd/review/post/cold-start
The preview rebuilds on change and includes drafts; it is the same build that publishes.
Started for this session — it stops when the harness does. `snypd dev` gives it to the person instead.
```

### 18. **content.publish** · call · 71 ms · 29 tokens back
```json
{
  "type": "post",
  "slug": "cold-start"
}
```

```
published post/cold-start → /posts/cold-start
landed on main as 47cb9c2a
approved by policy publish
```

### 19. **content.publish** · call · 66.1 ms · 31 tokens back
```json
{
  "type": "post",
  "slug": "publishing-a-draft"
}
```

```
published post/publishing-a-draft → /posts/publishing-a-draft
landed on main as f23e560a
approved by policy publish
```

### 20. **content.publish** · call · 68.7 ms · 33 tokens back
```json
{
  "type": "post",
  "slug": "why-only-mcp"
}
```

```
published post/why-only-mcp → /posts/why-only-mcp
landed on main as 07a9c95b
approved by policy publish
```

### 21. **content.publish** · call · 67.1 ms · 28 tokens back
```json
{
  "type": "post",
  "slug": "the-kill-test"
}
```

```
published post/the-kill-test → /posts/the-kill-test
landed on main as ea71555b
approved by policy publish
```

### 22. **site** · call · 39.4 ms · 27 tokens back
```json
{
  "action": "build"
}
```

```
built 8 routes in 39 ms
  18 rendered, 0 from cache, 10 artefacts, 0 media
```

### 23. **content.lint** · call · 12.3 ms · 140 tokens back
```json
{}
```

```
4 files · 0 errors · 3 warnings
content/posts/publishing-a-draft.md:4 warning [tag-once] tag `operations` is used only here
    ↳ A tag used once connects nothing — reuse one of `benchmarks` or drop it
content/posts/why-only-mcp.md:4 warning [tag-once] tag `agents` is used only here
    ↳ A tag used once connects nothing — reuse one of `benchmarks` or drop it
content/posts/why-only-mcp.md:12 warning [heading-skip] Heading level jumps from h1 to h3
    ↳ Use h2, or promote this heading
```
