# `docs/launch/` — the Product Hunt launch, packaged

**Launch:** Tuesday 6 October 2026, 00:01 Pacific · 12:31 IST · Gate D ([docs/10 §7–8](../10-plugins-and-launch.md), [docs/16](../16-launch-campaign.md)). **Made:** S27, 16 Sep 2026.

What is in here:

| File | What it is | Made by |
|---|---|---|
| [`copy.md`](copy.md) | The tagline, the description, the topics, the maker's first comment, the ten FAQ answers | S27; every number is CI's |
| [`show-hn.md`](show-hn.md) | The Show HN title and text, and the rules for replying | S27 |
| [`gallery/`](gallery/) | Five frames at 1270×760 and the 240 thumbnail | `python3 packages/bench/readme/gallery.py` from the README's own pictures |
| `machines/` | Three clean-machine transcripts (S28) | **not yet** — waits on 0.1.5 on npm |

The maker post on snypd.rocks and the first comment are one text in two lengths (docs/16 §3): `copy.md` has the comment; S26 writes the post from it.

---

## The checklist

Owners: **S** is Sunny (an account, a token, a call), **C** is the agent (a file in this repo, a page on the site). A row with a date is due then; a row without one is due before the day.

### Before — the release

| | Owner | Item | State |
|---|---|---|---|
| ☐ | S | Turn the npm token — one setting on npmjs.com | **open since v0.1.4** — the critical path; nothing on snypd.rocks moves for a visitor until it does |
| ☐ | S | Publish 0.1.5 (`bun run release`, CI's provenance) | after the token |
| ☐ | S | Move the host's pin on snypd.rocks to 0.1.5 | after 0.1.5; the menu, the tagline, `/themes`, `/plugins`, `/bench`, the front page all wait on this |
| ☐ | C | S28: three clean-machine runs of the front door — macOS arm64, Windows x64, Linux x64 in a fresh container — transcripts into `machines/` | after 0.1.5 |

### Before — the site (S26)

| | Owner | Item | State |
|---|---|---|---|
| ☐ | C | `pages/home.md` with `home: true` (S25) — hero, three numbers, six looks, primitives, the Desk, the WordPress table, `cta` | |
| ☐ | C | The three clips and five stills into the site's `content/media/` | needs the MP4 URLs — **S drops V1, V2, V4 into the README PR** |
| ☐ | C | Nav: `Posts → /posts`; `Home` implicit | |
| ☐ | C | Publish the U-series post *Six looks, one contract* | overdue since U6b (13 Sep) |
| ☐ | C | Re-read and publish `plugins-five-tiers` (P-series) | `status: draft` since 12 Sep |
| ☐ | C | Draft the maker post from `copy.md`'s comment, under `mcp.write: draft` so S reads it on the review page | publishes on the day |
| ☐ | C | The site footer links the coming-soon page | after S makes it |

### Before — Product Hunt

| | Owner | Item | Due |
|---|---|---|---|
| ☐ | S | Coming-soon page under Sunny's PH account: tagline, thumbnail, `01-editorial-paper.png` | **22 Sep** |
| ☐ | S | Upload V1 to YouTube (unlisted is fine); the URL goes in the video slot | before the day |
| ☐ | S | Fill the form from `copy.md`: tagline · description · topics · links · gallery in order · video URL | any time after the coming-soon page |
| ☐ | S | Self-hunt (docs/16 §4's recommendation) — or name a hunter | **S's call** |
| ☐ | S | Schedule for 00:01 PT, 6 Oct; PH lets you set it ahead | before the day |
| ☐ | C | The README's three `<!-- video -->` comments become the clips | after the MP4 URLs |
| ☐ | C | Reshoot on 0.1.5: S25 made six layouts, and the frames still say five — `corpora/readme`'s post body (*Thirteen primitives and five layouts*, visible in the looks and the phones) and the `check-theme` recording (*5 layouts, 5 parts*). Edit the fixture, `shots.ts` · `strip.py` · the tape, then `gallery.py` | after 0.1.5, before the form is filled |
| ☐ | S | Merge `r0-readme-ground` once 0.1.5 is on npm (the README says `npm i -g @snypd/cli` and it has to be true) | after 0.1.5 |

### The day — Tuesday 6 October 2026

| IST | PT | Who | What |
|---|---|---|---|
| 12:31 | 00:01 | S | The launch goes live (scheduled) |
| 12:31 | 00:01 | S | `content.publish` the maker post from the review page — the one approval a person makes that day; the host builds on push |
| 12:32 | 00:02 | S | Paste the first comment from `copy.md` |
| 12:30–24:30 | | S | Reply. Every number links `/bench`. Every "we don't" has its reason beside it |
| 15:00 | 07:30 | S | Show HN, from `show-hn.md`; the README is the landing |
| 15:00–03:00 | | S | Reply on HN by `show-hn.md`'s rules; twelve hours, then stop |
| | | C | Nothing scheduled that needs a person is scheduled; the post is the only push that day |

### After

| | Owner | Item |
|---|---|---|
| ☐ | C | Record the day in docs/11 §7b: downloads before and after (`@snypd/cli` weekly), stars, issues by people who are not us, `snypd-theme-*` / `snypd-plugin-*` on npm, sites that link back. No telemetry — these are the only signals there are |
| ☐ | C | `migrate-from-wordpress` — the first post-launch session (docs/10 §7.2) |

---

## What is deliberately not here

A launch kit of social posts for other people to share (nobody shares a CMS launch; the posts are the sharing), paid promotion, a newsletter, a Discord, an `og-image` (decision 105) — docs/16 §7.
