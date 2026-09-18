# snypd bench — the registry demo

**Driver** `scripted` · **Steps** 12/12 · **Tool calls** 18 · **Reads** 4 · **Wall** 4222 ms

docs/20 §2.4's twelve steps over Ferrule, the studio specimen: a `work` type declared in fifteen lines of
snypd.yaml, and what every tool says about it. Each step is checked against the sentence the tool should
answer; the site the run leaves is checked under them.

## The twelve steps

| # | The agent | Should see | Saw | |
|---|---|---|---|---|
| 1 | reads `snypd://types` and `snypd://config` | `work` beside `post`, `page`, `author`, with `client` required; the keys the site did not write read *inherited from types.post* | # 13 more untouched: <inherited from types.post> · snypd://types: work with client required | ✅ |
| 2 | `site` › explain_config `types.work.layout` | `"work" ← snypd.yaml:NN, overrides inherited "post"` | `types.work.layout` = "work" ← snypd.yaml:45, overrides inherited "post" (types.post.layout, @snypd/spec default) | ✅ |
| 3 | `content.create` type `work`, no `client` | rule 0: *missing required field `client` — Who it was for. Shown in the facts strip.* | 2 error [frontmatter] Frontmatter is missing required field `client` | ✅ |
| 4 | adds `client`, `service: [product, tooling]`, `industry: hospitality` | on `snypd/drafts`, status `draft`, route `/work/the-ledger/`, lint 0 errors | update work/the-ledger → /work/the-ledger (draft) | ✅ |
| 5 | `content.suggest_blocks` | the table becomes a `chart`, applied — the same upgrade a post gets | applied 1 of 1 to work/the-ledger → /work/the-ledger | ✅ |
| 6 | `content.publish` | refused: *publishing work/the-ledger needs a human*, with `content.render_preview` as the next call | publishing work/the-ledger needs a human | ✅ |
| 7 | a person approves the review page; the agent publishes again, reads the history, then publishes a note | landed on `main`, *approved by a human*; the history shows the approval and both principals; the note lands at once, *approved by policy publish* | landed on main as 1b78422c · landed on main as bbba60bd | ✅ |
| 8 | `content.query` type `work`, `service` = `product`, published | the product cases newest first, the case among them, no draft | 4 items · published work/the-ledger  The ledger  2026-09-18 | ✅ |
| 9 | `content.explain` work/the-ledger | `autolink` ran over it and added a link; the twin and the JSON among its outputs | ✎ autolink stages.transform — changed the tree in place — 1 link added | ✅ |
| 10 | `site` › set_redirect `/posts/the-ledger` → `/work/the-ledger` | written as a 301 and landed on `main` | /posts/the-ledger → /work/the-ledger (301) | ✅ |
| 11 | `site` › build | the lists by name — `/work/` *Work*, `/posts/` *Notes*, the term pages; `/service/product/`, `/industry/hospitality/` and `/studio/credits/` in `dist/`; the feed carries both types | lists: /posts/ Notes (4 post) · /work/ Work (7 work) · 15 term pages | ✅ |
| 12 | `theme` › set `editorial`, `site` › build | *work renders through `post` — editorial declares no `work` layout* | work renders through `post` — editorial declares no `work` layout | ✅ |

## The site it left

| Check | Result | Detail |
|---|---|---|
| the case is on `main`, published, with its client | ✅ | status published, client "Cooperativa do Bonfim" |
| the case carries the chart the table became | ✅ | :::chart present |
| the publish commit carries who approved it | ✅ | Snypd-Approved-By: a human at the review page at 2026-09-17T19:45:00.626Z |
| the note is on `main`, published | ✅ | status published |
| the redirect is in `site.redirects` | ✅ | /posts/the-ledger → /work/the-ledger |
| the theme is `editorial` | ✅ | theme.use = editorial |
| every route the demo names is in `dist/` | ✅ | 8 present, the redirect page included |
| the feed carries both types | ✅ | the case, the note |
| the site lints with no errors | ✅ | 0 errors, 2 warnings |

## Transcript

## Step 1 · reads `snypd://types` and `snypd://config`

### 1. `initialize` · meta · 38.3 ms · 162 tokens back

```
{"protocolVersion":"2025-11-25","capabilities":{"resources":{},"tools":{"listChanged":true},"prompts":{}},"serverInfo":{"name":"snypd","version":"0.1.0-s16"},"instructions":"Start with the `get-started` prompt: it branches on what this site already is — empty, scaffolded, or established — and names the calls in the order that works. Otherwise: read snypd://config, then snypd://spec/primitives, before writing content — a post that is only prose wastes the vocabulary this CMS exists for. Writes go to a draft branch; publishing a draft-policy type needs a human to approve that exact version on /_snypd, the page this server serves for them."}
```

### 2. `tools/list` · read · 3.2 ms · 2239 tokens back

```
{"tools":[{"name":"content.create","description":"Write a new content file and commit it to the site's drafts branch. Frontmatter is the type's schema (snypd://types/{type}); the body is markdown plus the primitive directives in snypd://spec/primitives — a post that is all prose is a post that wastes the vocabulary. Status is always the site's initial status: this tool cannot publish. Returns the route, the branch and the lint the new file produces, so the fixes come back in the same turn as the writing.","inputSchema":{"type":"object","properties":{"type":{"type":"string","description":"Content type: `post`, `page`, `author` (snypd://types lists them)"},"slug":{"type":"string","description":"Slug to write at; defaults to the title, slugified"},"frontmatter":{"type":"object","description":"Frontmatter fields for the type. `status` is ignored — a new file is always a draft"},"body":{"type":"string","description":"Markdown body, without the frontmatter block"}},"required":["type"]},"annotations":{"readOnlyHint":false,"destructiveHint":false,"idempotentHint":false}},{"name":"content.update","description":"Patch frontmatter and/or replace the body of an existing item, then commit it to the drafts branch. `patch` names only the keys that change (`null` deletes one) and leaves every other key, comment and quote in the file untouched; `body` replaces the markdown wholesale. Use conten
… (8146 more characters)
```

### 3. `resources/read` snypd://types · read · 329.3 ms · 1958 tokens back

```
{
  "post": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "snypd://types/post.json",
    "title": "post",
    "type": "object",
    "properties": {
      "title": {
        "type": "string"
      },
      "slug": {
        "type": "string",
        "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
        "description": "Defaults to the filename"
      },
      "date": {
        "type": "string",
        "format": "date",
        "x-type": "date"
      },
      "updated": {
        "type": "string",
        "format": "date",
        "x-type": "date"
      },
      "status": {
        "type": "string",
        "x-ref": "status",
        "default": "draft"
      },
      "publishAt": {
        "type": "string",
        "format": "date-time",
        "x-type": "datetime"
      },
      "description": {
        "type": "string",
        "x-type": "text",
        "maxLength": 160
      },
      "author": {
        "type": "string",
        "x-ref": "author"
      },
      "category": {
        "type": "string",
        "x-ref": "category"
      },
      "tags": {
        "type": "array",
        "items": {
          "type": "string",
          "x-ref": "tag"
        }
      },
      "cover": {
        "type": "object",
        "properties": {
          "image": {
            "type": "string",
            "x-type": "image"
          },
          "alt": {
        
… (5736 more characters)
```

### 4. `resources/read` snypd://config · read · 91 ms · 2017 tokens back

```
# snypd://config — merged (env: dev). Layers, later wins:
#   1. spec
#   2. theme studio (studio/theme.yaml) — extends base
#   3. plugin autolink (autolink/snypd.yaml) — 0.1.0, plugins/autolink, transforms
#   4. site (snypd.yaml)
#   5. env dev (snypd.dev.yaml) — not found
# Lines without "← file:line" are @snypd/spec defaults; untouched subtrees are collapsed to their snypd://spec/* resource (theme.yaml subtrees to their file:line), and inside a subtree the site wrote into, the keys it did not touch are counted on one line.
snypd: 1 # ← snypd.yaml:4
site: # ← snypd.yaml:6
  name: Ferrule # ← snypd.yaml:7
  url: https://ferrule.snypd.rocks # ← snypd.yaml:8
  description: Ferrule is a product design and engineering studio in Porto. We
    design the thing, and the thing that makes it. # ← snypd.yaml:9
  icon: /media/icon.svg # ← snypd.yaml:10
  redirects: # ← snypd.yaml:12
    /posts/kiln-to-table: /work/kiln-to-table # ← snypd.yaml:13
    /posts/stem: /work/stem # ← snypd.yaml:14
    /posts/sela: /work/sela # ← snypd.yaml:15
    /posts/mares: /work/mares # ← snypd.yaml:16
    /posts/bloco: /work/bloco # ← snypd.yaml:17
    /posts/tarn-and-vale: /work/tarn-and-vale # ← snypd.yaml:18
    /about: /studio # ← snypd.yaml:19
    /credits: /studio/credits # ← snypd.yaml:20
theme: # ← base/theme.yaml
  theme: studio # ← studio/theme.yaml:20 (theme studio), overrides base/theme.yaml:
… (4806 more characters)
```

## Step 2 · `site` › explain_config `types.work.layout`

### 5. **find_tools** · call · 49.2 ms · 925 tokens back
```json
{
  "query": "where did a config value come from"
}
```

```
1 tool ready to call:

## site
Change the site itself rather than a post: one config key, a menu, a redirect for a URL that moved, a health report, a build, or a request to put the site live. Config writes are validated before they stick — a patch that would not load is rolled back and the diagnostics come back instead, so a wrong key cannot leave the site broken. Read snypd://config first: it is the merged result with provenance, so it already says where every value came from; snypd://nav is the menus.

input: {"type":"object","properties":{"action":{"type":"string","description":"`init` a new site here · `set_config` one key · `explain_config` where a value came from · `set_nav` a menu · `set_redirect` for a moved URL · `set_deploy` to add a host's config to a site that has none · `doctor` for a health report · `build` the site to dist/ · `push` to put it live (or, with `preview`, to push the drafts branch for a preview)","enum":["init","set_config","explain_config","set_nav","set_redirect","set_deploy","doctor","build","push"]},"path":{"type":"string","description":"`set_config`/`explain_config`: a dotted path into the config, e.g. `site.name`, `theme.use`, `types.post.urlPattern`. Bracket a key that contains dots"},"value":{"description":"`set_config`: the new value — any JSON. `null` deletes the key and restores whatever it was overriding"},"location":{"type":"string","des
… (2295 more characters)
```

### 6. **site** · call · 34.5 ms · 34 tokens back
```json
{
  "action": "explain_config",
  "path": "types.work.layout"
}
```

```
`types.work.layout` = "work" ← snypd.yaml:45, overrides inherited "post" (types.post.layout, @snypd/spec default)
```

## Step 3 · `content.create` type `work`, no `client`

### 7. **content.create** · call · 165.9 ms · 77 tokens back
```json
{
  "type": "work",
  "slug": "the-ledger",
  "frontmatter": {
    "title": "The ledger",
    "date": "2026-09-18",
    "description": "A bookkeeping tool for a cooperative of makers, on one screen the whole floor can read."
  },
  "body": "The cooperative kept its books in three notebooks and a drawer. We built the tooling that replaced them: one ledger on a screen in the kitchen that the whole floor can read, and a printed sheet every Sunday for the members who would rather hold it.\n\n| Month | Hours logged |\n| --- | --- |\n| May | 41 |\n| June | 58 |\n| July | 66 |\n| August | 72 |\n\nEvery hour above is one the cooperative used to count by hand on a Sunday evening, and the rise is the members trusting the screen."
}
```

```
create work/the-ledger → /work/the-ledger (draft)
committed b81ac705 on snypd/drafts (from main)
lint: 1 error, 0 warnings
  2 error [frontmatter] Frontmatter is missing required field `client`
    ↳ Add `client:` — Who it was for. Shown in the facts strip.
```

## Step 4 · adds `client`, `service: [product, tooling]`, `industry: hospitality`

### 8. **content.update** · call · 82.2 ms · 41 tokens back
```json
{
  "type": "work",
  "slug": "the-ledger",
  "patch": {
    "client": "Cooperativa do Bonfim",
    "service": [
      "product",
      "tooling"
    ],
    "industry": "hospitality"
  }
}
```

```
update work/the-ledger → /work/the-ledger (draft)
committed 68d46ee6 on snypd/drafts (from main)
lint: 0 errors, 0 warnings
```

## Step 5 · `content.suggest_blocks`

### 9. **content.suggest_blocks** · call · 80 ms · 106 tokens back
```json
{
  "type": "work",
  "slug": "the-ledger"
}
```

```
1. lines 15–20  →  `chart`  (0.83)
   · One number per row is one comparison
   · Few enough bars to read without a legend
   · The numbers move in one direction
   · Three or more points make a shape a reader can see at a glance
   ! needs source — Lint rule 3 fails a chart or a stat with no checkable source — a number whose origin cannot be clicked is an opinion, and the prose does not carry one
```

### 10. **content.suggest_blocks** · call · 84 ms · 64 tokens back
```json
{
  "type": "work",
  "slug": "the-ledger",
  "apply": [
    "1"
  ],
  "fill": {
    "1": {
      "source": "https://ferrule.snypd.rocks/ledger/hours"
    }
  }
}
```

```
applied 1 of 1 to work/the-ledger → /work/the-ledger
  1. lines 15–20 → `chart` (0.83)
committed 7c163de8 on snypd/drafts (from main)
lint: 0 errors, 0 warnings
```

## Step 6 · `content.publish`

### 11. **content.publish** — refused · call · 61.2 ms · 66 tokens back
```json
{
  "type": "work",
  "slug": "the-ledger"
}
```

```
publishing work/the-ledger needs a human
↳ Call content.render_preview for work/the-ledger: it returns /_snypd/review/work/the-ledger as a URL on a running preview, which is the page a human approves this exact version on. Give them that URL, then call content.publish again.
```

### 12. **content.render_preview** · call · 888.6 ms · 91 tokens back
```json
{
  "type": "work",
  "slug": "the-ledger"
}
```

```
http://localhost:4322/work/the-ledger
markdown twin: http://localhost:4322/work/the-ledger/index.md
review + approve: http://localhost:4322/_snypd/review/work/the-ledger
The preview rebuilds on change and includes drafts; it is the same build that publishes.
Started for this session — it stops when the harness does. `snypd dev` gives it to the person instead.
```

## Step 7 · a person approves the review page; the agent publishes again, reads the history, then publishes a note

### 13. **content.publish** · call · 128.2 ms · 32 tokens back
```json
{
  "type": "work",
  "slug": "the-ledger"
}
```

```
published work/the-ledger → /work/the-ledger
landed on main as 1b78422c
approved by a human at the review page
```

### 14. `resources/read` snypd://history/work/the-ledger · read · 59.3 ms · 382 tokens back

```
{
  "path": "content/work/the-ledger.md",
  "git": true,
  "commits": [
    {
      "sha": "be869ac024b0cd8ef6e51d72bc70f97189000b1d",
      "date": "2026-09-18T01:15:00+05:30",
      "subject": "content: publish work/the-ledger",
      "principal": "agent:claude-code/sunny",
      "approvedBy": "a human at the review page at 2026-09-17T19:45:00.626Z"
    },
    {
      "sha": "7c163de8eba860f9aef7661b4499771b202844af",
      "date": "2026-09-18T01:14:59+05:30",
      "subject": "content: suggest_blocks work/the-ledger (chart)",
      "principal": "agent:claude-code/sunny"
    },
    {
      "sha": "68d46ee6c819f65618553036f9e8723fd79e5732",
      "date": "2026-09-18T01:14:59+05:30",
      "subject": "content: update work/the-ledger",
      "principal": "agent:claude-code/sunny"
    },
    {
      "sha": "b81ac705dcd4ee636d85b9ac2ccf09688b32650a",
      "date": "2026-09-18T01:14:59+05:30",
      "subject": "content: create work/the-ledger",
      "principal": "agent:claude-code/sunny"
    }
  ]
}
```

### 15. **content.create** · call · 96.5 ms · 40 tokens back
```json
{
  "type": "post",
  "slug": "counting-hours",
  "frontmatter": {
    "title": "Why we count hours",
    "date": "2026-09-18",
    "author": "ines-carvalho",
    "tags": [
      "process"
    ],
    "description": "A number on a facts strip is a number somebody wrote down that day."
  },
  "body": "We count hours because the kiln does. A firing is a fixed number of them, and every case in the registry carries the ones it took — so the number on a facts strip is a number somebody wrote down that day, not one we guessed at the end."
}
```

```
create post/counting-hours → /posts/counting-hours (draft)
committed ec1b007f on snypd/drafts (from main)
lint: 0 errors, 0 warnings
```

### 16. **content.publish** · call · 161.9 ms · 26 tokens back
```json
{
  "type": "post",
  "slug": "counting-hours"
}
```

```
published post/counting-hours → /posts/counting-hours
landed on main as bbba60bd
approved by policy publish
```

## Step 8 · `content.query` type `work`, `service` = `product`, published

### 17. **content.query** · call · 58.4 ms · 85 tokens back
```json
{
  "type": "work",
  "taxonomy": "service",
  "term": "product",
  "status": "published"
}
```

```
4 items
published work/the-ledger  The ledger  2026-09-18
published work/kiln-to-table  Kiln to table  2026-05-14
published work/stem  Stem, a lamp that is mostly a hinge  2026-02-03
published work/sela  Sela, one chair in three woods  2025-08-08
```

## Step 9 · `content.explain` work/the-ledger

### 18. **content.explain** · call · 553.6 ms · 257 tokens back
```json
{
  "type": "work",
  "slug": "the-ledger"
}
```

```
work/the-ledger → /work/the-ledger

declared, in `plugins:` order — 1 plugin loaded:
  autolink — transforms: stages transform

what ran over /work/the-ledger, in order:
  ✎ autolink stages.transform — changed the tree in place — 1 link added

16 more hook runs on other routes this build — a filter runs wherever its value is read, so a list this item appears in ran its own.

route key: d7aa9595952f1cd0b13b5fc222412db50cfeb70a
  # the whole input to whether this page re-renders: its source, the theme's bytes, the plugins' bytes, the config, and — while a transform is on — every term the site uses, because adding a term elsewhere changes this page (decision 95).
outputs: work/the-ledger/index.html, work/the-ledger/index.md, api/work/the-ledger.json

no plugin has reacted to a publish on this machine yet (snypd://<plugin>/last is one plugin's own rows).

built 34 routes + 25 artefacts in a scratch directory, which is gone — dist/ and the site's index are untouched.
```

## Step 10 · `site` › set_redirect `/posts/the-ledger` → `/work/the-ledger`

### 19. **site** · call · 139.3 ms · 52 tokens back
```json
{
  "action": "set_redirect",
  "from": "/posts/the-ledger",
  "to": "/work/the-ledger"
}
```

```
/posts/the-ledger → /work/the-ledger (301)
committed 9308299c → main cb276869
The next build writes `_redirects` and a meta-refresh page at the old route, so it works on any static host.
```

## Step 11 · `site` › build

### 20. **site** · call · 450.8 ms · 53 tokens back
```json
{
  "action": "build"
}
```

```
built 34 routes in 442 ms
  99 rendered, 0 from cache, 26 artefacts, 39 media
  lists: /posts/ Notes (4 post) · /work/ Work (7 work) · 15 term pages
```

## Step 12 · `theme` › set `editorial`, `site` › build

### 21. **theme** · call · 308.9 ms · 44 tokens back
```json
{
  "action": "set",
  "name": "editorial"
}
```

```
theme studio → editorial
committed f997be1e → main 264f7c26
Look at it with content.render_preview; snypd://theme/coverage says which primitives this theme implements itself.
```

### 22. **site** · call · 201.5 ms · 73 tokens back
```json
{
  "action": "build"
}
```

```
built 34 routes in 196 ms
  59 rendered, 40 from cache, 26 artefacts, 39 media, 1 removed
  lists: /posts/ Notes (4 post) · /work/ Work (7 work) · 15 term pages
  work renders through `post` — editorial declares no `work` layout
```

### 23. **content.lint** · call · 60.7 ms · 109 tokens back
```json
{}
```

```
34 files · 0 errors · 2 warnings
content/work/bloco.md:8 warning [tag-once] industry `healthcare` is used only here
    ↳ A industry used once connects nothing — reuse one of `hospitality`, `manufacturing` or drop it
content/work/tarn-and-vale.md:8 warning [tag-once] industry `publishing` is used only here
    ↳ A industry used once connects nothing — reuse one of `hospitality`, `manufacturing` or drop it
```
