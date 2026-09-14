# 12 — What Super.so knows that we don't: a read of the adjacent category

**Owner:** PM · **Engineer:** Claude Code · **Reviewer / decider:** Sunny · **Written:** 13 Sep 2026 · **Inputs:** super.so (marketing site, pricing, features, `/builder`, `/themes`), docs.super.so (`how-super-works`, `template-guidelines`), Super's own blog on Notion Sites and on Notion Sites pricing, Trustpilot, and the competitive set (Potion, Bullet, Sotion, Simple.ink, Popsy). Read against docs/00 §§Principles/Who it's for, docs/09, docs/10 §§5–6, docs/11 §§7b/10/11, and X1's sixteen rules in `packages/render/src/check.ts`.
**Scope:** one company, read properly, because it is the closest structural analogue to this product that has already been run as a business at scale. What is transferable, what is a warning, and what it changes in the twenty-three days before launch.
**Not in scope:** the primitive vocabulary (locked). Anything that moves the Gate D session order. This document proposes; it decides nothing.

---

## 1. The stake, and the opinion in one paragraph

Super.so has 100,000+ creators, a per-site subscription, and a product whose architecture is the same shape as ours: **the content lives in the tool the author already works in, and a renderer turns it into a fast static site with a domain on it.** They picked Notion as that tool; we picked the harness. Everything else — the closed component vocabulary, the theme-styles-blocks-only contract, the static-cache-on-a-CDN delivery, the quality bar for a public theme shelf — they arrived at independently, from the opposite starting point, under commercial pressure. That is worth more than any number of feature comparisons. **The conclusion of this read is that our architecture is confirmed and our positioning is not.** Nothing here should change a line of code before 6 October. Three things it should change are copy, one thing it adds to v0.2, and one thing it tells us to refuse forever.

**Three claims stated up front:**

1. **Freshness is the category's soft underbelly and we have not claimed it.** Super sells sync latency as a price ladder — 24 hours free, 4 hours at $16, 10 minutes at $28 — and even then the refresh is *triggered by a visitor*, who eats the stale page. Our build is 0.79 s and ships an artefact. The gap is three orders of magnitude and it is unmeasured, therefore unclaimable (principle 9). **Proposal: a `publish.toLive` bench lane in v0.2.**
2. **Super Builder is external validation of the closed vocabulary, and we should stop treating that decision as a risk.** Their newest product is 60+ components in named categories, with themes that *"only style blocks and don't affect layout"*. That is docs/01 and docs/09 §4, reached by a team who spent four years trying not to need it.
3. **We must never build a visual designer, and this document is where that gets written down.** Super is building one *because their user cannot write CSS*. Ours has an agent that can. This is the clearest single line between the two products and the most likely thing for a well-meaning advisor to get wrong.

---

## 2. What Super is, stripped to the mechanism

Notion is the CMS. Super is the delivery layer. From their own docs:

> "Notion is your CMS (content manager) … Super is your delivery layer … Super doesn't serve your Notion page directly. It creates a cached, static version of it for speed and performance."

Onboarding is three steps: pick a Notion page, enable *Publish to the Web*, paste the link into Super. The site is then live, with a theme, meta tags, a sitemap, and — on a paid plan — a domain.

Substitute "the harness" for "Notion" and that is our product description. The difference is not the architecture. It is that their author is a person clicking in a Notion page, and ours is an agent calling a tool.

---

## 3. The evidence

### 3.1 Price

| Tier | Price | What it unlocks |
|---|---|---|
| Free Site | $0 | `super.site` subdomain, badge, themes. **One free site per account.** |
| Personal Site | **$16/mo** ($144/yr) | **Custom domain**, custom code, password protection, custom fonts, RSS/Atom, badge removed |
| Pro Site | **$28/mo** ($252/yr) | Manual publishing, advanced search, file uploads, redirects/hidden pages, multi-language, priority support |
| Custom | from $50 + fees | Sub-path hosting (`/docs`, `/blog`), SSO, custom design |

**Priced per site, not per account.** Analytics is billed separately — twelve tiers, **$10 to $400/month** by monthly page views (10 k → 20 M+). Teams are **$5/member/month**.

### 3.2 Freshness, as a product ladder

| Plan | Auto-sync interval |
|---|---|
| Free | **every 24 hours**, "triggered by site visits" |
| Personal | every 4 hours, "triggered by site visits" |
| Pro | every 10 minutes, "triggered by site visits" |

Manual refresh exists on every tier via a dashboard button. But the default path means the first visitor after the window expires is served the stale page *and pays the latency of the refetch*. This is lazy CDN revalidation, sold as three price points.

### 3.3 The moat list, in their own words

When Notion shipped native Sites in June 2024 — custom domains, navbar, breadcrumbs, favicon — Super published a response naming five differentiators: page-path controls (readable slugs instead of `domain.com/b45b2c95…`), a navbar **and** sidebar **and** footer, custom code (*"any CSS, HTML, or JavaScript"*), *"an extensive gallery of themes created by both our team and our users"*, and breadth (manual publishing, custom fonts, RSS, file uploads, password protection, analytics).

Every item on that list is one quarter of platform roadmap away from being absorbed. Super knows this: the same post announces "Super Designer," a Framer-style visual site editor, and the stated reason is that *"while custom CSS allows people to create amazing themes for Super, those without coding knowledge struggle to make their site look how they want."*

### 3.4 The shelf bar, as a human checklist

Super's template gallery guidelines require, verbatim:

- text must *"pass an accessibility contrast check where possible"*
- *"Headings should not use placeholder text (Lorem ipsum)"*
- primary colours limited to *"1 or 2"*
- *"look great and function as expected on all devices and breakpoints"*
- *"Testing that the template does not have any dead links"*
- *"template code does not have any bugs, warnings or errors"*
- a changelog *"with version numbers, release dates, and updates"*
- credit for *"any non-standard or third-party fonts/scripts/assets"*
- creator contact details, and documentation covering installation and customisation

And, decisively: template designers must *"market, distribute and support their templates"*; Super *"does not take any responsibility for the distribution or sale of any Template."*

### 3.5 What customers complain about

Trustpilot is **2.9/5 across five reviews** — an anecdote, not a dataset, and it should be cited as one. But the complaints are consistent with the pricing structure above, which makes them worth reading:

> "the analytics service incurs an additional $10 per month, with charges increasing if traffic grows"

> "The monthly analytics fees are automatically applied and reconciled at the end of the subscription period without sufficient transparency"

> "You have to manually message and wait for people to reply to you in support to cancel everything"

Praise is consistent too, and it is all for **support responsiveness** and for the core Notion-to-site conversion working well.

---

## 4. Six findings

### 4.1 Freshness is unclaimed ground

*Evidence:* §3.2. *What it changes:* a bench lane.

Super's best tier resolves an edit in ten minutes, lazily. A snypd build is **0.79 s** and then it is a deploy — the artefact is finished before anyone asks for it. There is no revalidation window because there is no cache to revalidate; there is a static site that either has the new page or has not been pushed yet.

That is the strongest single number in the comparison and we cannot use it, because principle 9 says every claim links to `snypd bench` output and this one has no lane. Build time is measured; **edit-to-live is not.**

**Proposal (v0.2):** a `publish.toLive` lane — MCP write → the page readable at the deployed URL, wall clock, in CI, with a budget. It is the only row where a competitor publishes their number and ours is three orders of magnitude better.

### 4.2 Super Builder confirms the closed vocabulary

*Evidence:* `super.so/builder`. *What it changes:* how we talk about docs/01, and nothing else.

Their newest product is a free Notion template with **over 60 drag-and-drop components** in named categories: hero sections, pricing cards, FAQ sections, feature columns, galleries, testimonials, CTA sections, feature cards, ecommerce, feature sections, team sections, stats cards. It ships with six component-based themes that, in their words, *"only style blocks and don't affect layout or limit customizability."*

Read that against docs/00 principle 4 and docs/09 §4: ~35 typed content primitives, themes implement the vocabulary, content never references a theme. **Two products, opposite starting points, the same architecture.** Super began as an unopinionated wrapper around whatever Notion produced and was forced — by designers who could not build a landing page out of paragraphs, and by themes that kept breaking on arbitrary layouts — into a closed component vocabulary with a strict theme/content separation.

The overlap list is also a free sanity check on our 35: stats, FAQ, testimonials, pricing and team all appear on both sides. Worth one pass against docs/01 to see whether anything on their list is a primitive we decided against and should revisit — **not before launch.**

### 4.3 Their shelf bar is our `snypd check theme`, run by hand

*Evidence:* §3.4 against `packages/render/src/check.ts`. *What it changes:* the shelf's marketing line, which is already true.

Compare the two lists:

| Super's guideline | Our rule (X1, 13 Sep) |
|---|---|
| text must pass an accessibility contrast check | `contrast.text` / `contrast.muted` / `contrast.accent` / `contrast.on-accent` — 7 pairs × every look × both sides of `light-dark()`, min 4.5:1 |
| headings must not use placeholder text | `meta.personality` / `meta.description` via `isPlaceholder` (decision 143) |
| a changelog with version numbers and dates | `meta.version` only — **gap** |
| credit third-party fonts/scripts/assets | **gap** |
| no dead links | **gap** |
| responsive at all breakpoints | **gap, and probably permanent** (needs a browser; see decision 140's doctrine) |
| code has no bugs, warnings or errors | partially — `contract.loads`, `contract.yaml`, `coverage.*` |

We converge on their bar without having read it. The difference is the enforcement: **theirs is a human reading a submission, ours is `snypd check theme`, exit code 1, in CI** — and Super explicitly disclaims responsibility for what ends up on their gallery, while decision 123 makes our check *the* gate for the shelf.

That is the shelf's entire pitch and it needs no engineering to say. The three real gaps, in ascending cost: **changelog required**, **third-party asset credit and licence**, **dead internal links**. All v0.2; log them against docs/06, do not touch H2.

### 4.4 The real price is 2–3× the headline, and the agency case is indefensible

*Evidence:* §3.1 against docs/00 "Who it's for". *What it changes:* one paragraph of README.

docs/00 names our secondary audience as **"agencies running 5–20 client sites from one workspace."** Under Super's pricing that agency pays **$320–$560 per month in site plans alone**, before analytics, before seats. Twenty sites is twenty subscriptions.

It pays snypd nothing, because snypd is one binary and a git repo per site.

Note also what sits behind the $16 line: **a custom domain.** On a static artefact served by Cloudflare, a domain costs the provider nothing. Whatever the optional paid cloud in docs/00 eventually becomes, **a domain must never be inside it** — that is the single clearest "we are not them" signal available, and it is free.

### 4.5 Distribution is a guides library, and ours writes itself

*Evidence:* `super.so/guides`, `/blog`, `/faqs`, `/templates`, `/create`.

Super ranks by owning the long tail of *Notion's own* keyword surface — hundreds of task-shaped pages ("how to create a product roadmap site with Notion and Super", "is Notion good for SEO", "why is Notion slow"). Unglamorous, and it evidently works: it is how a wrapper product gets discovered by people searching for the thing it wraps.

The 2026 equivalent is the agent-read surface, and **snypd generates it on every build** — `.md` twins, `llms.txt`, feeds, a public read-only MCP. We already publish snypd.rocks over MCP. For us the dogfood and the distribution channel are the same activity, which is not true for anyone else in this category. Worth stating out loud in launch copy; worth a guides-shaped section on snypd.rocks after launch.

### 4.6 Their weakest point is the thing we already own

Super's users cannot take their site anywhere. The content is in Notion blocks, the design is in Super's theme system, the analytics are in Super's meter, and — per §3.5 — leaving requires a support conversation.

Ours is markdown + YAML in a git repo the user owns, MIT, rendered by a binary they have a copy of. "No lock-in" is a claim every CMS makes. **Ours is the only one where it is checkable by `ls`.** That belongs in the README next to the agency arithmetic.

---

## 5. What we should not copy

1. **A visual designer.** Super is building one because their user cannot write CSS. Our user has an agent that can, and `snypd new theme` → `snypd check theme` already closes that loop with real contrast numbers. A dashboard or a WYSIWYG would contradict principle 1 outright and solve a problem we do not have. **This is the most likely piece of well-meant competitive advice we will receive, and the answer is no.**
2. **Per-site pricing.** It punishes exactly the customer docs/00 wants (§4.4).
3. **Metered analytics.** Traffic-scaled billing on a static site is rent on someone else's success, and it is the loudest complaint in §3.5.
4. **Freshness as a tier.** Selling latency is only possible if your architecture has latency. Ours does not; introducing it to have something to sell would be self-inflicted.
5. **Cancellation friction.** Self-evident, but worth writing down before there is ever a billing system to put it in.

---

## 6. What this changes

### Before 6 October — copy only, roughly an hour, no engineering

1. **The tagline.** Super's is *"The #1 tool for turning a Notion document into a website"* — it names the input and the output in nine words. Ours, *"Your CMS is wherever your agent is,"* names neither; it names a **location**, which is a second-order idea the reader must already accept the premise of. It is a good line for someone who already understands the product and a weak one for a Product Hunt visitor reading for four seconds. **Worth one deliberate pass before launch copy freezes** — and this document does not propose a replacement, because that is Sunny's call.
2. **The agency arithmetic in the README** — twenty sites, $320+/month versus $0 (§4.4).
3. **The ownership line** — markdown and YAML in your repo, checkable by `ls` (§4.6).

Nothing else. docs/11 §11 has eight sessions left before launch and the merge train is still parked behind PR #19; this document must not cost a session.

### After launch — candidates for docs/06 v0.2

4. **`publish.toLive` bench lane** (§4.1). Highest value of anything here.
5. **Three rules for `snypd check theme`**: changelog required, third-party asset credit, dead internal links (§4.3).
6. **A `migrate-from-notion` prompt**, beside `migrate-from-wordpress` (see §7).
7. **The shelf as a gated marketplace** — submit, CI runs `check`, green means listed — which is docs/10 §6's plan, strengthened by knowing the incumbent does this with human review and a disclaimer.
8. **One pass of their 60-component list against docs/01's 35 primitives** (§4.2), to see whether anything we declined is worth revisiting.

---

## 7. The one genuinely new idea: `migrate-from-notion`

There are 100,000+ Super creators, plus the user bases of Potion ($10/mo), Bullet, Sotion, Simple.ink and Popsy. As an acquisition target this cohort is unusually well qualified:

- **They have proven they will pay** $16–28/month for exactly this product shape.
- **They are on record complaining** about price, metered analytics and exit friction (§3.5).
- **They cannot leave** without a migration, which is the problem we would be solving.
- **Their content is already block-structured** — Notion's API and markdown export map onto our primitives far more cleanly than WordPress's HTML soup ever will, and docs/00 already commits us to writing the WordPress one.

It needs sizing and it is not a launch item. But it is the highest-leverage new thing in this read: a named, reachable, pre-qualified audience reached by a migration that is *easier* than one we have already agreed to build.

---

## 8. Open questions for Sunny

- **Q1.** Does the tagline get a pass before launch copy freezes, or does it ship as it stands? (§6.1)
- **Q2.** Is "a domain is never behind a paywall" a standing commitment we write into docs/00's business-shape paragraph now, or a decision deferred until there is a paid tier to decide about? (§4.4)
- **Q3.** Does `migrate-from-notion` go on docs/06 v0.2, or v0.3? (§7)
- **Q4.** Is §5.1 — never build a visual designer — worth minting as a numbered decision, so that the next person to suggest it gets an argument rather than a shrug?

---

## 9. Sources

All read 13 September 2026.

- super.so — [home](https://super.so/) · [pricing](https://super.so/pricing) · [features](https://super.so/features) · [themes](https://super.so/themes) · [Super Builder](https://super.so/builder)
- docs.super.so — [how Super works](https://docs.super.so/how-super-works) · [template guidelines](https://docs.super.so/template-guidelines)
- Super's blog — [Notion Sites and Super](https://super.so/blog/notion-sites-and-super) · [Notion Sites pricing](https://super.so/blog/notion-sites-pricing) · [Is Notion good for SEO](https://super.so/blog/is-notion-good-for-seo)
- [Getting started guide](https://super.so/guides/how-to-connect-a-custom-domain-to-your-super-website) · [first site walkthrough](https://super.so/guides/how-to-get-started-with-super-and-notion)
- [Trustpilot — super.so](https://www.trustpilot.com/review/super.so) (5 reviews; anecdote, not data)
- Competitive set — [Bullet.so review of Super](https://bullet.so/blog/super-so-review/) · [Bullet.so: Super alternatives](https://bullet.so/blog/super-so-alternatives/) · [Sotion: 12 Notion website builders](https://sotion.so/blog/notion-website-builders) · [MakerStack review](https://makerstack.co/reviews/super-so-review/)
- [AlternativeTo — Notion launches Notion Sites, June 2024](https://alternativeto.net/news/2024/6/notion-launches-notion-sites-to-convert-notion-pages-into-customizable-public-websites)
