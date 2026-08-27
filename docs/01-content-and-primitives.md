# 01 — Content model and the primitive vocabulary

## Three layers

```
CONTENT     markdown + YAML frontmatter in git. Theme-agnostic. Uses primitives by name.
PRIMITIVES  a closed, versioned vocabulary of typed blocks. "What content can contain."
THEME       implements every primitive + layouts + tokens. "What each block looks like."
```

Swap the theme, nothing in content changes. The MCP exposes the vocabulary as resources so an agent learns it in one read.

## Why a closed vocabulary

Free-form MDX/HTML from an agent is inconsistent, unthemeable and unlintable. A small, described vocabulary gives content that renders identically across themes, fails loudly on unknown blocks, can be described back to the agent (`snypd://spec/primitives/stat-row`), survives theme upgrades, and stays readable as plain markdown — the source file *is* the agent `.md` twin.

## Syntax

Markdown directives (`remark-directive`). Leaf `::name{props}`, container `:::name{props} … :::`, inline `:name[text]{props}`. Plain markdown with zero directives is a valid post. Unknown directive → lint error, never silent passthrough. Fenced-code aliases (```` ```callout ````) for the five most common blocks are an open question (06-roadmap).

```md
---
title: Making a Site Agent-Readable
status: draft
category: engineering
tags: [ai, agents]
cover: { image: /media/cover.png, eyebrow: Engineering }
---

:::tldr
Serving a markdown twin cuts what an agent parses by 92%. llms.txt may do nothing.
:::

:::stat-row
::stat{value="92%" label="fewer tokens" source="https://…/measurement"}
::stat{value="0" label="Google support for llms.txt" source="https://…"}
:::

:::callout{kind="warning" title="The caveat"}
`llms.txt` is the most-recommended and least-evidenced item on the list.
:::

::chart{type="bar" src="./data/tokens.yaml" source="https://…" caption="HTML vs .md tokens"}
```

## The vocabulary (v1, ~35)

Each primitive is a YAML file in `@snypd/spec/primitives/` with `name, purpose, props (typed), slots, intent, anti-intent, example, schema-emit`. Grouped:

**Structure** — `cover` (title, subtitle?, image?, eyebrow?, date, author, readTime?) · `toc` (depth) · `section` (id?, title?, variant) · `divider` (variant) · `series-nav` (series)

**Emphasis** — `callout` (kind: note|tip|warning|danger|quote-me, title?) · `pullquote` (cite?) · `aside` (side) · `tldr` · `key-takeaways`

**Evidence** — `stat` (value, label, **source required**, delta?) · `stat-row` (2–4 stats) · `comparison` (columns, rows) · `chart` (type, data|src, **source required**, caption) · `citation` (url, title, author?, date?, quote?) · `receipt` (kind: screenshot|log|diff|commit, src, caption)

**Media** — `figure` (src, **alt required**, caption?, width: content|wide|full) · `gallery` (layout) · `video` (src|youtube|vimeo, poster?) · `embed` (url) · `code` (lang, title?, highlight?) · `file` (src, label) · `before-after` (before, after, alt)

**Interaction & conversion** — `faq` (→ FAQPage schema) · `steps` (→ HowTo schema) · `tabs` · `accordion` · `cta` (title, body?, button, href, variant) · `newsletter` (provider) · `author-card` · `related` (strategy: cluster|tags|manual) · `share` · `discussion` (slot for a comments plugin)

**Meta (frontmatter, not rendered)** — `series`, `cluster`, `canonical`, `noindex`, `publishAt`, `status`, `updatedNote`.

Deliberately absent: `grid`, `columns`, `hero-with-three-cards`. Layout is the theme's job; the author never says "grid."

## Field types (used by frontmatter schemas and primitive props)

`string, text, markdown, number, boolean, date, datetime, url, image, ref(type), list(of), enum(values), object(fields)` with `required, default, description, min, max, pattern`. Plugins may register field types with a YAML manifest.

## Variants and patterns

- **Variants** are declared by the *theme*, hinted by *content* (`::callout{variant="soft"}`), ignored when the theme lacks them. Never required. This is the back door to theme coupling; lint warns when a post uses more than N variants.
- **Patterns** are theme-provided compositions (`launch-post: [cover, tldr, stat-row, section, faq, cta]`) exposed via `snypd://theme/patterns`; the agent inserts one and edits.

## Editorial lint (the vocabulary's rules, enforced)

Unknown block · missing required prop · unsourced `stat`/`chart` · image without alt · dead internal link · heading hierarchy skips · `dateModified` older than a substantive edit · slop-phrase list · more than N callouts per 1,000 words · a slug change without a redirect · a tag used once. Each rule has an id, a severity, and a fix hint the agent can act on.

## Versioning

`spec: 1` in `snypd.yaml`. v1.x may add primitives; v2 may remove with mandatory fallbacks. Plugin primitives are namespaced (`::acme/pricing-table`) and must ship schema + fallback so `describe` and degradation always work.
