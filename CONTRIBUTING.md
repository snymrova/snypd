# Contributing to snypd

Thanks for looking. This is a small project with strong opinions, and most of them are written down —
reading the two pages below before proposing something will save you and me the same hour.

- [`docs/00-overview.md`](docs/00-overview.md) — what this is and what it refuses to be.
- [`docs/06-roadmap.md`](docs/06-roadmap.md) — the locked decisions. If a proposal contradicts one of
  those nine, it needs to argue with the decision, not around it.

The rest of [`docs/`](docs/) is the design set: architecture, the MCP surface, the renderer, the
benchmarks, the theme contract, the plugin contract. It is written to be read in order and it is the
answer to "why is it like this".

## Getting set up

```
bun install                     # Bun >= 1.3.14; the CI lanes are 1.3.14 and 1.4.0
bun test                        # the whole suite, ~100 s
bun run typecheck               # tsc --noEmit, must be clean
bun run scratch                 # a real site in sites/, wired to this tree, with dev running
bun run snypd bench --quick     # the token lanes, fast
```

`bun run scratch` is the fastest way to see a change: it builds a site, serves it, opens the Desk, and
the MCP server it registers is this tree, not a published binary.

## The two house rules

Every change here has followed the same two rules since the delivery plan was written
([`docs/07` §4](docs/07-delivery-plan.md)), and a PR that keeps them is much easier to merge:

1. **One PR per piece of work**, with a title that says what changed and a body that says what it found.
   The commit log of this repository is a design record; please write yours that way.
2. **One `bench.compare` from CI on the PR.** Not from your machine — a loaded laptop produces numbers
   that are not comparable, which is why the workflow exists.

## Budgets are part of the contract

These numbers are the product, not a nice-to-have. A PR may move one, but it must say so and say why:

| Budget | Where | Meaning |
|---|---|---|
| `tokens.tools` | `bench` | What an agent pays **every turn**. A new always-listed tool is a big deal; use the catalogue (`find_tools`) instead. |
| `tokens.learn` | `bench` | What an agent pays once per session to learn the site. |
| `page.js.kb` | `bench` | Client JavaScript. **0 by default.** A plugin declares its bytes and is measured against the declaration. |
| `page.a11y.violations` | `bench` | axe-core, 0. Not negotiable for a shipped theme. |
| `build.cold.100` · `mcp.coldStart.binary` | `bench` | Build speed and the number an agent feels first. |

## What goes where

- **A new primitive** is not a pull request. The vocabulary is closed at roughly 35 on purpose
  ([`docs/01`](docs/01-content-and-primitives.md)); open a **Primitive request** issue and make the case
  with real posts that cannot be expressed today. Most good ideas are a *theme* problem, not a
  vocabulary one.
- **A theme or a plugin** belongs in its own repository and on npm as `snypd-theme-*` or
  `snypd-plugin-*`. npm is the registry; this project lists, it does not host. Four first-party plugins
  ship in the binary — one per contract tier — and they exist to prove the contract, not to be the
  ecosystem.
- **The plugin contract is experimental through 0.x.** Every manifest carries `api: 1`, and a change to
  what that means is a documented change, not a surprise.
- **A bug in the renderer, the MCP surface, core or the CLI** is a pull request here, ideally with a
  failing test first.

## Tests

Example tests live beside the code they cover (`*.test.ts`). New behaviour needs a test that would fail
without it; a bug fix needs the test that reproduces the bug. If your change affects what gets written to
disk, prefer an assertion on the bytes — several of this project's sharpest bugs were found by asserting
that two builds are byte-identical.

## Commit and PR style

- Present tense, one line, saying what changed: `P3: stages and events — a transform on a copy, an emit
  through core, and a push that reports what its plugins said`.
- The body is where findings go. "Four things this found" is a normal and welcome section.
- Squashing is fine. Force-pushing a branch under review is not, unless you say so.

## Licence

By contributing you agree that your contribution is licensed under the [MIT Licence](LICENSE), the same
as the rest of the project. There is no CLA.
