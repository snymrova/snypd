# A — How the best prompts, skills and AI design tools get beautiful output

*Research stream A for docs/37 (a whole site from pieces). 25 Sep 2026. Primary sources read in full where marked; token costs are bytes ÷ 4.*

---

## 0. The findings that matter for snypd (read this if nothing else)

1. **Every serious source converges on one mechanism: name the rut, specifically, then make one committed choice.** Models land in the "high-probability centre" of web training data ("distributional convergence", [Anthropic blog](https://claude.com/blog/improving-frontend-design-through-skills)). Generic adjectives ("clean, modern, premium") steer *into* that centre; a specific reference ("a 1970s graduate lecture handout") steers to a point ([google-labs-code/design.md PHILOSOPHY](https://github.com/google-labs-code/design.md/blob/main/PHILOSOPHY.md): *"Adjectives describe a region. A specific reference describes a point."*). → A kit's `line:` and a piece's `refs:` are exactly the right lever; keep them concrete, never adjectival.

2. **Named alternatives become the next defaults.** Anthropic's own cookbook (2025) recommended Space Grotesk, Fraunces, Playfair, IBM Plex, Bricolage Grotesque as "impact choices" ([cookbook](https://github.com/anthropics/claude-cookbooks/blob/main/coding/prompting_for_frontend_aesthetics.ipynb)); by 2026 impeccable lists Fraunces, Playfair, Newsreader, IBM Plex, Instrument Sans, Space Grotesk, Lora, Crimson as "training-data defaults" (local `impeccable/reference/new-work.md` §4) and taste-skill bans Fraunces and Instrument Serif outright ([taste-skill SKILL.md §4.1](https://github.com/leonxlnx/taste-skill/blob/main/skills/taste-skill/SKILL.md)). Anthropic's Dec-2025 skill told models to add "grain overlays, gradient meshes, dramatic shadows" ([skills@00756142](https://github.com/anthropics/skills/blob/00756142/skills/frontend-design/SKILL.md)); its Sep-2026 version instead names the resulting clusters as tells ([skills@main](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)). **Lesson for snypd: taste encoded as *curated, approved pieces* ages better than taste encoded as *prompt word-lists*, because pieces are seen whole and the prompt never names a face to reach for.**

3. **The current AI clusters, per Anthropic's own skill (Sep 2026):** (1) warm cream ground (~#F4F1EA) + high-contrast serif display + terracotta (~#D97757); (2) near-black + one acid-green/vermilion accent; (3) broadsheet: hairline rules, zero radius, dense columns; (4) SaaS card kit; (5) template chrome: tracked ALL-CAPS eyebrow, `A · B · C` meta strings, `WORD — fragment` labels, #0B0B0B near-black, mono for small data labels, `→` on links ([anthropics/skills frontend-design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)). **snypd's `notebook` kit as drafted in docs/37 §4 — "paper, one serif set large … a ruled index", face `instrument-serif` — sits squarely in clusters 1 + 3 + 5.** That is legitimate *if chosen*, but it must be one kit among visibly different ones, and the shelf must also carry kits far from these three corners (saturated grounds, sans display, colour-owned regions).

4. **Deterministic detectors are the part that transfers best to snypd.** impeccable ships 60+ rules that run with no model ([impeccable.style/slop](https://impeccable.style/slop/); local `scripts/detector/registry/antipatterns.mjs`), each a CSS/DOM-measurable tell. snypd's `packages/render/src/taste.ts` already implements ~11 of them; §6(c) lists the rest with thresholds.

5. **Evidence that prompting helps is real but thin.** The only controlled A/B found: Justin Wetch's rewrite of Anthropic's skill won **21 of 28 decisive comparisons (75 %, p = 0.0063 one-sided)** over 50 prompts × 3 model tiers, judged blind by Opus 4.5 — biggest gain on Haiku, least on Opus ([justinwetch.com](https://www.justinwetch.com/blog/improvingclaudefrontend/)). Everything else is before/after screenshots ([cookbook](https://github.com/anthropics/claude-cookbooks/blob/main/coding/prompting_for_frontend_aesthetics.ipynb)), stars, or testimonials ([ruoqijin.com survey](https://ruoqijin.com/blog/frontend-design-skills-ai-agents)).

6. **Taste is personal, so the human approval gate is the right oracle.** 20 professional designers on 12 000 UI pairs agree only at **Krippendorff's α = 0.25**; personalised models beat majority-vote with ~20× fewer examples ([DesignPref, arXiv 2511.20513](https://arxiv.org/abs/2511.20513)). → docs/37 §3·6 (Sunny approves every piece on its board) is not a bottleneck to engineer away; it *is* the taste model. gstack's taste-profile (approved/rejected fonts, colours, layouts with decay) is a cheap way to make it cumulative (local `design-shotgun/SKILL.md` Step 2).

7. **Grounding in real references beats the model's own style knowledge.** PRISM retrieves design knowledge clustered from real design collections and beats VLM priors (avg rank 1.49; designers preferred it) because VLM style knowledge is "too general and misaligned" ([PRISM, arXiv 2601.11747](https://arxiv.org/abs/2601.11747)). → supports docs/37 §3·2 (`refs:` per piece).

8. **Token economics: the good skills are small at the top and load the rest on demand.** Anthropic's frontend-design ≈ 400 tokens originally, ≈ 2.3k now; impeccable's always-read core (SKILL + craft-floor) ≈ 3.6k, the rest routed; ui-ux-pro-max keeps a 4k SKILL and puts 2 MB of data behind a search script; gstack's design skills are 14–22k tokens each, ~40 % of it shared boilerplate. taste-skill is 22k in one file. **For a ≤ 50k-token agent path, the taste brief must be ≤ 600 tokens and everything checkable must come back as tool output, not sit in the prompt.**

9. **One screenshot round plus one confirm round is the consensus ceiling.** impeccable: "inspect once with a batched round (desktop and mobile together), fix everything … confirm with at most one more round" (local `SKILL.md`, `new-work.md` §7); OpenAI calls a Playwright render loop the thing that "significantly improves" polish ([OpenAI GPT-5.4 frontend blog](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4)); the June-2026 survey calls a visual verification loop "the single highest-leverage addition" ([ruoqijin.com](https://ruoqijin.com/blog/frontend-design-skills-ai-agents)). This matches docs/37 §6 (≤ 5 images).

10. **The commercial builders' prompts are mostly guardrails, not taste.** v0: 3–5 colours, ≤ 2 families, no gradients unless asked, no purple, no emoji icons, no decorative blobs, semantic tokens only ([v0 prompt](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/blob/main/v0%20Prompts%20and%20Tools/Prompt.txt)); Lovable, conversely, tells the model to define `--gradient-primary` and `--primary-glow` and "leverage colors and animations" ([Lovable prompt](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/blob/main/Lovable/Agent%20Prompt.txt)) — a plausible source of the glow look. The shared move all of them make, and snypd already makes structurally: **components may not type raw colours; everything goes through tokens.**

---

## 1. Method

- Local skills read in full: `~/.claude/skills/impeccable/SKILL.md` + references `craft-floor`, `craft`, `routing`, `new-work`, `typeset`, `layout`, `colorize`, `bolder`, `quieter`, `polish` (head), `critique` (structure + rubric); the detector registry (`scripts/detector/registry/antipatterns.mjs`, all rule descriptions printed). Frontend-design plugin skill (`~/.claude/plugins/cache/claude-plugins-official/frontend-design/*/skills/frontend-design/SKILL.md`, identical 9 390 B across 14 cached versions, equal to anthropics/skills main). gstack `design-consultation`, `design-shotgun`, `design-review` (design-specific sections; preambles skimmed), `design-html` (outline).
- Web: raw files from GitHub via `gh api`/`curl` (Anthropic skills history, cookbook notebook, google-labs-code/design.md spec + philosophy, VoltAgent awesome-design-md, ui-ux-pro-max data, taste-skill, x1xhlol leaked prompts, Vercel web-interface-guidelines); WebFetch for blogs and arXiv abstracts.
- snypd context: docs/37 §3 and §6; `packages/render/src/taste.ts` (to avoid proposing what exists); the face shelf in `packages/shelf/src/files.gen.ts`.

---

## 2. Local skills

### 2.1 impeccable (Paul Bakaus), v4.0.4 — local, [github.com/pbakaus/impeccable](https://github.com/pbakaus/impeccable)

**What it says.**
- *Modes by visitor success*: Persuade / Operate / **Read** / Experience. A docs index or a blog is Read: "Structure for comprehension, then make the reading experience worth staying in" (SKILL.md). Most snypd sites are Read with Persuade front pages.
- *Colour strategy chosen before colours*: Restrained (neutrals + one accent; default for Read/Operate), Committed (one saturated colour carries 30–60 % of the surface), Full palette (3–4 named roles), Drenched (the surface is the colour). "Color commits at page scale: fields that own whole regions, not accents scattered over a neutral ground." Light vs dark is chosen from "one sentence of physical scene (who uses this, where, under what light)" (new-work §4). This maps 1:1 onto snypd's `seed.strategy`.
- *Face list that means "you stopped looking"*: Fraunces, Playfair Display, Cormorant, Lora, Crimson, Newsreader, Syne, Space Grotesk, Space Mono, IBM Plex, Inter-as-display, DM Sans, DM Serif, Outfit, Plus Jakarta Sans, Instrument Sans — naming one requires "a reason no other face could satisfy, and a subject association is never that reason: books wanting a serif … tech wanting a mono are the associations the list exists to break." Read/Operate surfaces "are well served by system stacks and workhorse UI faces" (new-work §4).
- *Calibration*: AI clusters are "warm cream ground, high-contrast serif display, terracotta or signal-red accent; near-black with one neon accent and glowing edges; broadsheet-editorial hairlines, italic display serif, and small tracked mono labels." Self-check: "if someone could guess your aesthetic from the category alone … rework". It also names its *own* rendition prior: bookish/warm subjects come out cream + serif italic + lamplight; "treat that first palette as already spent."
- *Craft floor* (the one file read immediately before editing, ~950 tokens): contrast ≥ 4.5:1 body / 3:1 large; on coloured surfaces tint secondary text from the hue, never grey; shadows carry offset + soft blur ("a zero-offset colored halo is decoration"); more space above a heading than below; body measure 65–75ch; display max 6rem; tracking floor −0.04em; "one authored moment" of motion, exponential ease-out from an already-visible default. **Refuse list**: identical icon+heading+text cards as page structure, nested cards, the hero-metric template, **kicker/eyebrow above a heading (a ban "no brief earns back")**, 01/02/03 section numbers unless sequence matters, gradient text, decorative glass/blur, coloured `border-left/right` > 1px on cards/callouts, hard offset shadows outside real neobrutalism, mono "as a costume for technical", a system display face as display voice, emoji/unicode as icons, light/dark picked by category.
- *Typeset*: ≥ 1rem body; 45–75ch; line-height inversely tuned to measure; on dark grounds compensate "on all three perceptual axes: slightly more line height, a touch more tracking, and one step more weight"; paragraph spacing **or** first-line indent, not both; a second family only for "a clear role it alone can perform."
- *Layout*: squint test; group by proximity before containers; "rhythm through deliberate contrast between tight and generous intervals"; a 4-unit base "provides the useful middle steps that an 8-only scale misses"; "Variation is not a goal by itself."
- *Colorize*: OKLCH for new palettes; "vary lightness and reduce chroma near white and black"; prefer explicit colours over stacked translucent overlays (contrast becomes context-dependent); dark mode designed, not inverted.
- *Bolder*: "the reflex answer, reaching for more effects, is the opposite of bold"; amplify what the system already owns; "If every element got louder, the section got flatter"; the **skeleton test** — strip the copy; does structure alone still say what the section is?
- *Quieter*: never "make everything the same size/weight"; "Quiet without intent collapses to generic."
- *Process*: two isolated assessments (design review vs detector) so detector output doesn't anchor judgment; a fresh-context finish reviewer that does not inherit the builder's transcript ("inherits your framing, your optimism"); a concept-seed dice roll so the top-ranked (= most typical) direction isn't always built.
- *Detector* (~60 rules; full list in §6c): each rule is a measurable CSS/DOM signature with a one-line fix.

**Transferable to pieces-on-tokens.** Nearly all of the craft floor and the detector is piece-level CSS: measure, heading rhythm, tracking floors, radius consistency, shadow shape, no side-stripes, tinted secondary text. Strategy (Restrained/Committed/Drenched) is a seed switch. The "mode" split tells the agent that a snypd site is Read-first. The concept-seed idea transfers as: *don't always start from the nearest kit — offer the nearest plus one deliberately far kit on the board.*

**Token cost.** Core always-read ≈ 3.6k (SKILL 2.7k + craft-floor 0.95k); new-work 7.1k; critique 10k; each sub-command 1–2k. Routing keeps a single request ≈ 5–12k. The detector costs zero prompt tokens (it's a script; only findings return).

**Evidence.** None published by the author (the slop page gives no derivation: [impeccable.style/slop](https://impeccable.style/slop/)). Community preference only ([ruoqijin.com](https://ruoqijin.com/blog/frontend-design-skills-ai-agents): "a meticulous design lead"). Internally it claims visualising three comps first "is proven to produce the most compositional and ambitious work" (new-work §5) — no data given.

### 2.2 frontend-design (Anthropic) — local plugin = [anthropics/skills main](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)

**What it says (Sep 2026 version, 9.4 KB ≈ 2.3k tokens).** Persona: design lead at a studio whose client "already rejected proposals that felt cliché or templated". Ground in the subject's "industry, subject matter, materials, and vernacular". Type: "one family or two, and if two, make them clearly distinct"; scale per *The Elements of Typographic Style*; lines < 80ch; serif body gets slightly more line-height. **Avoid**: accenting a single word in a headline (italic/colour), all-caps labels, unnecessary labels above content. "Visual structure is information" — numbering only for real sequences. Motion: one orchestrated moment; "fade-and-slide-up entrances on each section and hover transitions on every card are the generic default." The five clusters (see §0.3). Process: a compact plan (4–6 named colours, type roles, ASCII layout, principles) → review the plan against "the generic default you would produce for any similar page" → build → screenshot critique. "Spend your boldness in one place." "Chanel's advice: … remove one accessory."

**History (important).** Dec 2025 ([00756142](https://github.com/anthropics/skills/blob/00756142/skills/frontend-design/SKILL.md), ≈ 1.1k tokens): "Pick an extreme", "Asymmetry. Overlap. Diagonal flow", "gradient meshes, noise textures … grain overlays", "NEVER converge on common choices (Space Grotesk, for example)". Jun 2026 ([2235be7c](https://github.com/anthropics/skills/blob/2235be7c/skills/frontend-design/SKILL.md)): three clusters named, "Signature: the single unique element this page will be remembered by". Sep 2026 ([41bbe19d](https://github.com/anthropics/skills/commits/main/skills/frontend-design/SKILL.md) "avoid generic design defaults"): five clusters incl. template chrome; one-accessory restraint. **The trajectory is from "be bold, add texture" to "be specific, cut chrome."**

**Transferable.** The five-cluster calibration paragraph is the single most token-efficient anti-slop text found (~150 tokens). "Spend boldness in one place" = snypd's "one bold rule set in theme.css" (docs/37 §6 step 5). The plan-then-self-review step maps onto `compose` → `look` → one change.

**Evidence.** Before/after images only ([cookbook](https://github.com/anthropics/claude-cookbooks/blob/main/coding/prompting_for_frontend_aesthetics.ipynb)); Wetch's A/B on a variant (§3.2).

### 2.3 gstack design-consultation / design-shotgun / design-review / design-html — local

**What they say.**
- *Memorable-thing forcing question*: "What's the one thing you want someone to remember …? … Design that tries to be memorable for everything is memorable for nothing" (consultation Phase 1).
- *SAFE / RISK proposal*: every proposal lists 2–3 category-baseline choices and ≥ 2 deliberate risks with what each costs (Phase 3). "Coherence is table stakes — every product in a category can be coherent and still look identical."
- *Coherence validation* between axes (e.g. brutalist + expressive motion → flag, never block).
- *Taste profile*: `taste-profile.json` with approved/rejected fonts, colours, layouts, aesthetics, confidence decaying 5 %/week; bias generation to top-3 approvals, avoid top-3 rejections (shotgun Step 2).
- *Anti-convergence in variants*: each variant must differ in family, palette and layout; "if someone could swap the headline text between two variants without noticing, they're too similar."
- *Design-review rubric*: 10 categories, letter grades, weights (hierarchy 15 %, typography 15 %, spacing 15 %, colour 10 %, states 10 %, responsive 10 %, content 10 %, slop 5 %, motion 5 %, perf 5 %), plus a standalone **AI Slop grade**. Checks include scale ratio 1.25/1.333, line-height 1.5 body / 1.15–1.25 headings, measure 45–75 (66 ideal), ≥ 2 weights, `text-wrap: balance`, curly quotes, `…`, tabular-nums, no letter-spacing on lowercase, ≤ 12 non-grey colours, warm-or-cool neutrals not mixed, radius hierarchy, inner radius = outer − gap, dark-mode text ≈ #E0E0E0, accent desaturated 10–20 % in dark. Slop blacklist of 11 items credited to the OpenAI GPT-5.4 blog.
- *Font advice contradicts impeccable*: it recommends Fraunces, Instrument Serif, Geist, DM Sans, Plus Jakarta, Outfit as display/body picks and blacklists Inter/Roboto/Poppins/Space Grotesk as primary (consultation Phase 3).

**Transferable.** The taste profile (cheap, cumulative, per-user) is the best idea here for snypd: record Sunny's board approvals/rejections per piece and per face as data the agent reads as one line. SAFE/RISK is a good *kit line* discipline ("safe: ruled index; risk: saturated ground"). The review rubric's typographic micro-checks are machine-checkable.

**Token cost.** 14–22k tokens each (~700 lines of shared preamble per skill: telemetry, AskUserQuestion format, voice, etc.). Poor fit for a 50k budget; mine the rules, not the format.

**Evidence.** None published.

---

## 3. Web sources

### 3.1 Anthropic — "Prompting for frontend aesthetics" cookbook + "Improving frontend design through Skills"

[Cookbook notebook](https://github.com/anthropics/claude-cookbooks/blob/main/coding/prompting_for_frontend_aesthetics.ipynb) · [blog](https://claude.com/blog/improving-frontend-design-through-skills)

- Three strategies "we've found … consistently produce better results": **guide specific dimensions** (type, colour, motion, backgrounds separately), **reference inspirations** ("IDE themes or cultural aesthetics"), **call out common defaults**.
- Distilled prompt (~400 tokens): "You tend to converge toward generic, 'on distribution' outputs … Dominant colors with sharp accents outperform timid, evenly-distributed palettes … one well-orchestrated page load with staggered reveals … creates more delight than scattered micro-interactions … Vary between light and dark themes".
- Isolated typography prompt: "Use extremes: 100/200 weight vs 800/900, not 400 vs 600. Size jumps of 3x+, not 1.5x." (Useful for display moments; wrong for Read surfaces.)
- Blog: skills give "just-in-time context" because "too many tokens in the context window can result in degradation of performance"; the skill ≈ 400 tokens.
- **Transferable**: dimension-by-dimension guidance = snypd's slot-by-slot pieces; "dominant colour with sharp accents" = Committed strategy; "call out defaults" = the taste brief's rut paragraph.
- **Caution**: its named "impact" fonts (Space Grotesk, Fraunces, Playfair, IBM Plex, Bricolage) are now on others' overused lists (§0.2).
- **Evidence**: three before/after pairs, no metric.

### 3.2 Justin Wetch — rewriting Anthropic's skill, with an eval

[justinwetch.com/blog/improvingclaudefrontend](https://www.justinwetch.com/blog/improvingclaudefrontend/)

- Removed "NEVER converge … across generations" because the model "cannot access previous generations"; replaced "pick an extreme" with "commit to a distinct direction"; replaced adjectives ("beautiful, unique, interesting") with actionable type guidance; added an **"INSTEAD" block pairing each avoid with a positive alternative**.
- Eval: 50 prompts × Opus/Sonnet/Haiku, Puppeteer screenshots, blind Opus 4.5 judge on 5 criteria. **75 % win rate (21/28 decisive), p = 0.0063.** Haiku gained most, Opus least.
- **Transferable**: (a) "avoid X" alone is weaker than "avoid X, instead Y"; (b) cross-generation rules are meaningless without memory — snypd *has* memory (DESIGN.md, the site's prior themes, taste profile), so anti-convergence can be real: pass the last theme's kit/face to `compose`; (c) the eval harness (N prompts → screenshots → blind pairwise judge) is cheap to replicate for kits.

### 3.3 Google Stitch DESIGN.md + google-labs-code/design.md

[Spec](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md) · [Philosophy](https://github.com/google-labs-code/design.md/blob/main/PHILOSOPHY.md) · [Stitch docs](https://stitch.withgoogle.com/docs/design-md/format) · [Google blog](https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-design-md/)

- Format: YAML front-matter tokens (colors, typography, rounded, spacing, components; `{path.to.token}` refs; oklch allowed) + prose sections in fixed order: Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, **Do's and Don'ts**. Alpha; Apache-2.0; a linter checks WCAG contrast.
- Philosophy (the most useful 1.6k tokens found): *"The quality of a generated design is determined less by the precision of its values than by how clearly the intent is described."* "A specific reference carries more than a list of adjectives." **"Negative constraints arrive for free when the reference is specific enough … A long rambling list is often a sign the description was too vague."** Example don'ts are superbly concrete: "Don't reach for an italic standfirst beneath a large title. That is the Substack register." "Do trust modest size differences. The section title is only ~1.9× body, not 5× body." "A page that ends two-thirds of the way down is correct, not under-filled." "Keep vermilion inside diagrams. Its scarcity outside is what makes its presence inside meaningful."
- **Transferable**: snypd already writes DESIGN.md with a genome; adopt the section order and the **role-scoped colour sentence** pattern ("accent appears only in X, never on Y") as a `needs:`-like contract in piece.yaml — e.g. `accent: [links, active-nav]` — which a checker can verify.
- **Evidence**: none quantitative.

### 3.4 VoltAgent awesome-design-md (and awesome-claude-design)

[github.com/VoltAgent/awesome-design-md](https://github.com/voltagent/awesome-design-md) · [OSS Insight](https://ossinsight.io/blog/design-md-protocol-2026)

- 74 DESIGN.md files extracted from brand sites (Stripe, Apple, Linear, …); 35k stars in 10 days. Mean size **29 KB ≈ 7k tokens per file** (measured over the tree). Each has a "Key Characteristics" list and brand micro-signatures, e.g. Stripe: display at weight 300 with −1.4px tracking, `ss01` globally, `tnum` on every money cell, one filled CTA per band ([stripe/DESIGN.md](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/stripe/DESIGN.md)).
- **Transferable**: the *signature micro-detail* idea — every good system has 2–4 tiny, repeated, specific moves (a stylistic set, tabular figures, a weight, a tracking). Pieces can carry one each (e.g. `prose/book` turns on `onum` + `hanging-punctuation`). Also: "one filled CTA per band" is a good scarcity rule.
- **Caution**: these are imitations of brands (impersonation risk for a public shelf) and 7k tokens each — too heavy per theme; the *pattern*, not the files.

### 3.5 ui-ux-pro-max (nextlevelbuilder)

[github.com/nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (≈ 130k stars)

- 4k-token SKILL.md; the knowledge lives in CSVs behind `search.py`: 79 styles, 192 product palettes, 74 font pairings, 1 934 Google fonts, 119 UX rules; `--design-system` aggregates product→style→palette→type with "reasoning rules" and three dials (`--variance`, `--motion`, `--density`).
- **Token architecture is excellent**: small skill, retrieval returns a few rows, so a design system costs ~1–2k tokens of results.
- **Content is the category centre**: pairing #1 is Playfair Display + Inter, #2 Poppins + Open Sans, #3 Space Grotesk + DM Sans; Inter appears 50× in `typography.csv`; palette #1 "SaaS (General)" is Tailwind blue-600 + orange, #2 "Micro SaaS" indigo-500. Lookup by product type *is* "guess your aesthetic from the category" — the thing impeccable's self-check forbids.
- **Evidence**: a 100-page showcase with GLM 4.7 ([benchmark repo](https://github.com/hylarucoder/benchmark-skill-ui-ux-pro-max)) — no control, no scoring.
- **Transferable**: the retrieval shape (small resource + searchable shelf) is exactly `snypd://theme/kits` + `pieces/<slot>`; do **not** index kits by product category ("SaaS → X"), index them by *reference* and *use scene*.

### 3.6 OpenAI — "Designing delightful frontends with GPT-5.4" (Mar 2026)

[developers.openai.com](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4)

- Hard rules: first viewport reads as **one composition**; brand is a hero-level signal; hero budget = brand, one headline, one sentence, one CTA group, one dominant image; no overlays/chips on hero media; **"Default: no cards. Never use cards in the hero"**; one job per section; ≤ 2 typefaces; one accent.
- Anti-patterns: SaaS card grid first; pill clusters, stat strips, icon rows; decorative gradients without product context; carousel with no narrative purpose.
- Litmus: "Can page be understood scanning headlines only?" "Would design feel premium removing decorative shadows?"
- Process: define tokens (background, surface, primary text, muted text, accent; display/headline/body/caption) up front; provide references/mood board; **"Low and medium reasoning levels often lead to stronger front-end results"**; Playwright render loop.
- **Transferable**: "no cards by default" and "headlines-only scan" are directly testable on a snypd front page; the token list is a subset of snypd's ~40.

### 3.7 Leaked / published builder system prompts

[x1xhlol/system-prompts-and-models-of-ai-tools](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools)

| Tool | Design content | Notable |
|---|---|---|
| **v0** ([Prompt.txt](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/blob/main/v0%20Prompts%20and%20Tools/Prompt.txt), design section ≈ 1.3k tok) | "ALWAYS use exactly 3-5 colors total"; 1 brand + 2–3 neutrals + 1–2 accents; "NEVER use purple or violet prominently"; "Avoid gradients entirely unless explicitly asked"; if used: analogous hues, 2–3 stops, never opposing temperatures; max 2 families; body line-height 1.4–1.6; `text-balance`/`text-pretty` on titles; no decorative blobs; no emoji icons; semantic tokens only, no `bg-white`; "Ship something interesting rather than boring, but never ugly"; calls a `GenerateDesignInspiration` tool before any design work | a separate *inspiration* call produces the brief — the brief is not in the system prompt |
| **Lovable** ([Agent Prompt](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/blob/main/Lovable/Agent%20Prompt.txt)) | "The design system is everything … never write custom styles in components"; semantic tokens; defines `--gradient-primary`, `--primary-glow`, coloured shadows; "leverage colors and animations" | encourages exactly the glow/gradient tells |
| **Same.dev** ([Prompt](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/blob/main/Same.dev/Prompt.txt)) | "Avoid using purple, indigo, or blue colors unless specified"; "If an image is attached, use the colors from the image"; analyse font/colour/spacing before coding | reference image beats palette invention |
| **Orchids** ([System Prompt](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/blob/main/Orchids.app/System%20Prompt.txt)) | a `design_system_reference` is injected; "always use @theme to define semantic design tokens"; `var(--color-muted)` everywhere | same token discipline |
| **Bolt** ([Prompt](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/blob/main/Open%20Source%20prompts/Bolt/Prompt.txt)) | essentially no aesthetic guidance | |
| **Leap** ([Prompts](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/blob/main/Leap.new/Prompts.txt)) | "subtle animations … consistent spacing … subtle accent colors using Tailwind's standard palette" | standard palette = category centre |

Origin of the purple default, per a widely cited post: Tailwind UI's demo `bg-indigo-500` saturated tutorials and training data; Adam Wathan's Aug-2025 apology ([prg.sh](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website)) — anecdotal but consistent with ui-ux-pro-max's own palette #2.

**Figma Make**: no leaked prompt found; Figma's own guidance for guideline files says "be specific and imperative — 'Do not use small text for anything except captions' is better than 'Use small text sparingly'" and "more context is not always better and can confuse the model" ([Figma help](https://help.figma.com/hc/en-us/articles/33665861260823-Add-guidelines-to-Figma-Make), [developers.figma.com](https://developers.figma.com/docs/code/write-design-system-guidelines/)).

**Transferable**: numeric caps (colour count, family count, stop count) are the cheapest effective rules; snypd already enforces the strongest one structurally (pieces may not type colours). v0's pattern — *inspiration comes from a tool, not from the system prompt* — is the kit-board path.

### 3.8 taste-skill (Leonxlnx) and forks

[github.com/leonxlnx/taste-skill](https://github.com/leonxlnx/taste-skill) · [tasteskill.dev](https://www.tasteskill.dev/)

- One-line **"Design Read"** before generating: "Reading this as: <page kind> for <audience>, with a <vibe> language, leaning toward <system/aesthetic>." Ask one question only when the read diverges.
- **Three dials** VARIANCE / MOTION / DENSITY (1–10) with presets (Editorial/Blog 6/4/3; public-sector 3/2/5).
- Hard layout rules that are *countable*: max 1 eyebrow per 3 sections ("#1 violated rule in production tests"), no more than 2 consecutive image/text zigzags, a layout family at most once per page, bento cell count = content count, hero ≤ 4 text elements, subtext ≤ 20 words, nav one line, nav ≤ 80px, one radius system, one accent locked page-wide, no split header by default, no duplicate CTA intent.
- Premium-consumer palette ban with **explicit hex families**: cream grounds (#f5f1ea, #f7f5f1, #fbf8f1, #efeae0 …), brass/clay/oxblood accents (#b08947, #b6553a, #9a2436 …), espresso text (#1a1714 …) — plus seven alternative families (Cold Luxury, Forest, Black & Tan, Cobalt + Cream, Terracotta + Slate, Olive + Brick + Paper, mono + one pop).
- "Serif is very discouraged as the default"; bans Fraunces and Instrument Serif as defaults; **em-dash banned completely** (and en-dash as separator); middle-dot rationed to 1 per line; no decorative status dots, no scroll cues, no locale/weather strips, no "Field notes"-style poetic labels, no version stamps on marketing pages, no div-built fake product UI, no pills over images, no `border-t`+`border-b` on every row.
- Its own `minimalist-skill` sub-file contradicts it: recommends Instrument Serif / Newsreader / Playfair, stagger reveals on every block and a drifting radial blob ([minimalist-skill](https://github.com/leonxlnx/taste-skill/blob/main/skills/minimalist-skill/SKILL.md)) — the preset encodes the slop the main file bans.
- **Token cost**: 87 KB ≈ 22k tokens for the main file (v1 was 21 KB). **Evidence**: "production tests" claimed, not published; a `research/laziness` folder with literature notes.
- **Transferable**: the countable rules (eyebrow ratio, layout-family repetition, one accent, one radius system) are directly machine-checkable at page level; the Design Read line is a 30-token commitment device the agent can write into DESIGN.md.

### 3.9 Refactoring UI (Wathan & Schoger)

[book summary, sglavoie.com](https://www.sglavoie.com/posts/2023/09/09/book-summary-refactoring-ui/) · [archive excerpt](https://archive.org/stream/RefactoringUIStartWithTooMuchWhiteSpace/Refactoring%20UI%20-%20Start%20with%20too%20much%20white%20space_djvu.txt)

- Hierarchy via weight and colour, not only size; **de-emphasise the competitors** rather than emphasise the hero; labels are secondary (smaller, lighter, lower contrast) or merged into values ("12 left in stock").
- Start with too much white space and remove; more space between groups than within.
- Hand-picked constrained scales (type and space), not pure ratios; 45–75ch (20–35em); taller line-height for small text, shorter for large; left-align text, right-align numbers.
- Colour: 8–10 greys, greys carry a temperature (blue = cool, yellow/orange = warm); increase saturation as lightness moves from 50 %; on coloured grounds use the hue, not grey; rotate hue rather than only lightness to brighten.
- Fewer borders: use spacing, background tints, or shadow instead.
- **Aged advice**: "accent borders on cards/alerts", "gradients within 30°", "replace bullets with icons" — the 2018 flourishes are 2026 slop tells (side-tab, gradient washes, icon tiles). **Principles survive; flourishes don't.**

### 3.10 Vercel Web Interface Guidelines

[vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines)

- Typographic polish: curly quotes, `…`, `tabular-nums` for comparisons, `&nbsp;` in units and names, optical alignment ±1px, balance icon/text weight in lockups, **nested radii concentric (child ≤ parent)**, **hue consistency** (tint borders/shadows/text toward the ground's hue on non-neutral grounds), interactions *increase* contrast, `color-scheme: dark`, prefer APCA, layered shadows (ambient + direct).
- Contradiction: "Crisp borders. Combine borders & shadows" vs impeccable's `gpt-thin-border-wide-shadow` slop rule. Resolution: a hairline *plus a tight* shadow is craft; a hairline plus a *wide diffuse* shadow is the tell.

### 3.11 Published slop lists

- [impeccable.style/slop](https://impeccable.style/slop/) — 67 patterns in 8 categories (design-system drift, visual details, typography, colour, layout, motion, copy, imagery, quality); no derivation stated.
- [Developers Digest, 16 patterns](https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it); [925studios](https://www.925studios.co/blog/ai-slop-design-tells); [Medium, Aug 2026](https://mohitphogat.medium.com/ai-design-slop-why-every-ai-built-interface-looks-the-same-and-how-to-fix-it-bf874e0b470c) — same core: violet/indigo gradient, Inter everywhere, three identical icon cards, emoji icons, centred hero with badge, glass with neon glow, serif italics for accent words, coloured left borders, numbered steps, stat banners, all-caps section labels, dark mode with low-contrast body.

### 3.12 Research on measuring design quality

- **DesignPref** — α = 0.25 among 20 pro designers; personalised > aggregate ([arXiv 2511.20513](https://arxiv.org/abs/2511.20513)).
- **PRISM** — data-grounded style knowledge beats VLM priors ([arXiv 2601.11747](https://arxiv.org/abs/2601.11747)).
- **AesCode / OpenDesign** — aesthetic reward agents (executability + static + interactive aesthetics) train a 4B model past GPT-4o/4.1; OpenDesign ranks agree with Design Arena human rankings ([arXiv 2510.23272](https://arxiv.org/abs/2510.23272)).
- **WebGen-Bench** — GPT-4o-rated appearance 1–5; Claude 3.5 Sonnet led at 3.0 ([arXiv 2505.03733](https://arxiv.org/html/2505.03733v1)).
- Implication: model judges are usable as a *coarse* filter (and snypd's `look` already renders facts first), but final taste is a person's; approve kits and pieces, not per-site outputs.

---

## 4. Synthesis — what actually produces beauty, and what doesn't

**What works (mechanisms, with the source that shows it):**

| Mechanism | Where it appears | snypd analogue |
|---|---|---|
| A specific reference instead of adjectives | design.md PHILOSOPHY; cookbook "reference inspirations"; PRISM | kit `line:`, piece `refs:` |
| Naming the rut concretely (clusters, hexes, faces) | Anthropic skill 2026; impeccable calibration; taste-skill hex bans | the taste brief's rut paragraph + `taste.ts` |
| Strategy before values (Restrained / Committed / Drenched; one accent) | impeccable new-work §4; v0 3–5 colours; OpenAI one accent | `seed.strategy` |
| One bold move, everything else quiet | Anthropic "spend boldness in one place"; impeccable bolder; OpenAI hero budget | one bold rule set in theme.css |
| Countable caps | v0, OpenAI, taste-skill, gstack review | gates in `check theme` |
| Deterministic detector, isolated from the judge | impeccable detector + dual assessment | `taste.ts` + `look` facts-first |
| Bounded visual loop (≤ 2 rounds, desktop+mobile together) | impeccable; OpenAI; survey | `look {tour}` ≤ 5 images |
| Human-approved, cumulative taste | DesignPref; gstack taste profile | board approvals (decisions 209, 221) |
| Avoid → *instead* pairs | Wetch A/B (75 %) | each checklist row carries its fix |

**What fails or decays:**
- *Named "good" fonts become the new default within a year* (§0.2). Word-lists of faces to reach for are self-defeating; lists of faces to *justify* are better; approved pieces + a curated face shelf are best.
- *Style presets encode the slop* (taste-skill's minimalist file; ui-ux-pro-max's category palettes).
- *Rules contradict across sources* — e.g. serif-by-default (gstack recommends Instrument Serif/Fraunces) vs serif-discouraged (taste-skill); border+shadow craft (Vercel) vs slop (impeccable); stagger reveals as delight (cookbook) vs generic (Anthropic 2026, impeccable). A system that takes rules from many sources must pick and record its own.
- *Cross-generation "vary!" rules without memory* (Wetch).
- *Always-loaded long rulebooks* — 20k-token skills exceed the whole theme budget; Figma notes more context can confuse.

**Where snypd is already ahead:** the agent never writes palette/size CSS (pieces read tokens; v0/Lovable/Orchids can only *ask* for that); `taste.ts` already checks gradient text, side stripes, overused faces, untinted neutrals, `transition: all`, radius soup, eyebrows, tiny text, measure, flat hierarchy, monotonous spacing; DESIGN.md already has "Use scene / Visitor mode / The rut / Boldness goes here / Safe / Risk".

**Where snypd is exposed:**
1. The face shelf (`packages/shelf`: barlow-condensed, big-shoulders, bitter, bricolage-grotesque, crimson-pro, gloock, ibm-plex-{mono,sans,serif}, instrument-{sans,serif}, lora, source-{sans-3,serif-4}, work-sans, young-serif) — 7 of 16 are on at least one source's "training-data default" list (IBM Plex ×3, Instrument Sans, Instrument Serif, Lora, Crimson Pro; Bricolage was a cookbook "impact choice"). They are not wrong faces; they are the faces a reviewer will read as "AI picked this". Rebalance the shelf toward less-sampled faces with character, and let `taste.ts`'s overused list follow the shelf, not the reverse.
2. `notebook` as the first kit is AI cluster 1/3/5. Keep it, but launch the kit shelf with at least one kit per strategy (Restrained, Committed, Drenched) and at least one sans-display and one saturated-ground kit, so "the nearest kit" is not always paper + serif.
3. Pieces carved from four themes will share their origin's rhythm; docs/37 §3·3 (three token sets) is the right test — add "one saturated Committed set" explicitly to catch pieces that only work on paper.

---

## 5. Token budget recommendation for the agent path

| Item | Tokens | Where |
|---|---|---|
| Taste brief (§6b) | ≤ 600 | in the `build-theme` prompt, always |
| Kits index | ≤ 700 | `snypd://theme/kits` (docs/37) |
| Taste/anti-slop findings | ~100–300 | returned by `look`/`check` as facts, only when fired |
| Everything else (rules §6a, full checklist §6c) | 0 in prompt | lives in piece authoring docs and `taste.ts` |

Do **not** paste impeccable, taste-skill, gstack or DESIGN.md collections into the agent path; their value is already compiled into pieces and checks.

---

## 6. Deliverables

### (a) Beauty rules for piece authors (CSS-level, ≤ 40)

*Typography*
1. Body ≥ 1rem (`--size-body`); nothing functional below 0.75rem; nothing below 0.6875rem ever.
2. Prose measure 60–72ch via `max-inline-size: var(--measure)`; never let a paragraph run container-wide.
3. Line-height is set per role: body 1.5–1.65 (serif body +0.05 over sans), headings 1.05–1.25, small text taller than body. Never a single global value.
4. Adjacent roles differ by ≥ 1.2× in size **or** ≥ 200 in weight **or** a family change; two of the three for h1 vs body.
5. Display tracking tightens with size (−0.01em to −0.03em), never below −0.04em; body and lowercase text get 0 tracking; caps labels (if any) +0.04–0.08em.
6. `text-wrap: balance` on headings and titles; `text-wrap: pretty` on prose.
7. Display size capped (`clamp()` max ≤ 6rem); a long title (> 8 words) steps down a size rather than taking three lines.
8. Paragraph rhythm by space **or** first-line indent, never both.
9. Numbers that compare (dates in lists, counts, prices) use `font-variant-numeric: tabular-nums`; prose may use `oldstyle-nums` if the face has them.
10. Curly quotes, `…`, and `hanging-punctuation: first` where supported, in prose pieces.
11. On dark grounds: +0.05 line-height, +0.01em tracking, and one weight step up on body if the face is thin.
12. At most two families on a page (`font.body`, `font.heading`/`font.display` may be the same); mono only for code, data and measurement, never as a "technical" costume.
13. Emphasis inside a headline uses the same family (weight or italic), never a second face or a colour on one word.

*Space and structure*
14. Use only `--space-1..6`; neighbours inside a group take a step ≤ 2, groups are separated by a step ≥ 4 — tight within, generous between.
15. Space above a heading ≥ 1.5× the space below it.
16. Group by proximity first; add a border, fill or card only when proximity cannot carry the grouping. Never a container inside a container.
17. A list is ruled **or** spaced, not both; one hairline between rows, not above and below each.
18. Equal-weight grids only for genuinely equal items; a repeated card grid is a list piece's last resort, not its default.
19. Alignment: text left-aligned by default; centred only for a short, single-idea block (cover title, empty state).
20. The page is allowed to end short — do not pad sections to equal height.

*Colour (tokens only)*
21. The accent has a job list (links, current nav, one primary action, one feature moment); a piece declares which it uses and uses it nowhere else.
22. Secondary text on a tinted or coloured ground derives from that ground's hue (`color-mix(in oklch, var(--ink) X%, var(--ground))`), never a neutral grey.
23. Borders and shadows on tinted grounds are tinted toward the ground's hue.
24. Prefer explicit mixed tokens over stacked translucent layers; contrast must be computable.
25. Hover/focus states raise contrast, never lower it; focus is visible (`:focus-visible` outline ≥ 2px, offset).
26. A Committed or Drenched strategy fills whole regions (masthead band, cover, footer) — never sprinkled chips.

*Shape and depth*
27. One radius family per piece, from `--radius`; nested radii concentric (inner = outer − gap); full-round only for pills/avatars.
28. Shadows: y-offset + soft blur, neutral or ground-tinted; never a zero-offset coloured glow; never a hairline border plus a wide diffuse shadow on the same box.
29. No coloured `border-inline-start` > 1px on filled boxes (blockquote rule on unfilled prose is fine).
30. No gradient text; gradients only as a declared, analogous (≤ 30° hue span) surface, never as decoration.

*Chrome and content*
31. No kicker/eyebrow label above a heading; if a category must show, it goes in the meta line after the title or in the nav.
32. Section numbers only for real sequences (steps, chapters).
33. Meta strings: at most one separator character per line; prefer structure (line breaks, columns) over `·` chains.
34. No emoji or unicode glyphs as icons; icons are one drawn set at one stroke weight.
35. No decorative background grids, radial halos, blobs, noise overlays, or marquees in a piece unless the piece's `line:` *is* that idea.

*Motion and states*
36. One motion moment per page at most; ease-out-expo/quart; transform/opacity only; content visible at rest; `prefers-reduced-motion` zeroes it.
37. No bounce/elastic easing; no image zoom on hover; no `transition: all`.
38. Every interactive state (hover, focus, open, current) is designed and visible at 390 and 1280.

*The piece as a whole*
39. One idea, stated in `line:` as a specific reference ("a ruled index, the date in the margin"), never as adjectives; two or three `refs:` to real pages with what was taken.
40. Give the piece one signature micro-detail (a stylistic set, tabular dates, a hanging initial, a rule weight) and only one.

### (b) Taste brief for the agent (draft, ≈ 590 tokens: 450 words, 2.5 KB)

> **Taste.** You are choosing, not drawing. The pieces already carry the craft; your job is to pick a combination that belongs to *this* site and could not be mistaken for another.
>
> **1. Read the site first.** Write one line into DESIGN.md before any call: *"Reading this as: ⟨what the site is⟩ for ⟨who⟩, read ⟨where, under what light⟩; the one thing a visitor should remember is ⟨X⟩."* Light or dark follows the scene, never the category.
>
> **2. Name the rut, then leave it.** Generated sites cluster in five places: cream ground + big serif + terracotta; near-black + one acid accent; broadsheet hairlines + tiny tracked mono labels; identical rounded cards with soft grey shadows; template chrome (eyebrow labels above headings, `A · B · C` meta strings, `→` on links). If a stranger could guess your theme from the site's category alone, choose again. A kit in one of these corners is allowed only when the brief or the content asks for it — say which in DESIGN.md.
>
> **3. Start from a kit, not from nothing.** Pick the kit whose *line* is the nearest reference to this site, and look at the board with the nearest kit and one deliberately distant kit side by side. Change one to three slots, each for a reason you can state in one sentence about this site's content.
>
> **4. Strategy before colour.** Choose Restrained (neutrals + one accent), Committed (one colour owns 30–60 % of the surface) or Drenched (the ground is the colour). The accent has a job — links, current place, one feature moment — and nothing else. A seed is a point, not a mood: derive it from something in the site's world (a material, an object, a print tradition), not from "trust" or "modern".
>
> **5. Faces.** One family, or two that are clearly different. A serif is not required by "writing", a mono is not required by "technical". Prefer a face from the shelf that is *not* on the overused list; if you choose one that is, write the reason no other face would do.
>
> **6. Spend boldness once.** One slot, or one rule set in theme.css, is allowed to be loud. Everything around it stays quiet so the loud thing reads. Adding effects is not boldness.
>
> **7. Look once, fix once.** Take one tour (front page, a list, the richest page, at 1280 and 390). Read the facts first — gates, pairs, taste findings — then the picture. Fix everything in one batch; confirm with at most one more look. Stop.
>
> **8. When unsure, subtract.** Before you finish, remove one thing.

### (c) Anti-slop checklist a machine could check

`✔` = already in `packages/render/src/taste.ts` (static or rendered); `+` = proposed. Thresholds are proposals unless a source is cited.

**Static (CSS text of theme.css + pieces + resolved tokens)**

| # | Check | Rule | Source | |
|---|---|---|---|---|
| S1 | Gradient text | `background-clip:text` with a gradient | impeccable `gradient-text` | ✔ |
| S2 | Side stripe | coloured `border-left/right` > 1px on a filled box | impeccable `side-tab`; gstack #8 | ✔ |
| S3 | Overused face | lead family ∈ list (Inter, Roboto, Geist, Fraunces, Space Grotesk, Plus Jakarta) — **extend** with Instrument Serif, Playfair, Newsreader, DM Sans, Outfit, Poppins, Montserrat, system-ui as display; warn not fail | impeccable, taste-skill, gstack | ✔/+ |
| S4 | Untinted neutrals | grey (C ≈ 0) ground under a hued accent | impeccable colorize | ✔ |
| S5 | `transition: all` | literal | gstack review §7 | ✔ |
| S6 | Radius soup | > 3 distinct radii | taste-skill shape lock | ✔ |
| S7 | Literal colours/sizes in pieces | any hex/rgb/oklch/px font-size outside tokens | snypd contract | ✔ (generator) |
| S8 | AI palette | accent hue 265–305° with C > 0.12, or a gradient spanning violet↔cyan/blue | impeccable `ai-color-palette`; v0; Same | + |
| S9 | Cream ground | ground L 0.92–0.97, C 0.01–0.035, h 60–95 **and** serif display **and** accent h 25–50 → "cluster 1" warn | Anthropic skill; impeccable `cream-palette`; taste-skill hex list | + |
| S10 | Dark + neon | ground L < 0.2 and exactly one accent with C > 0.2 and glow shadows | Anthropic cluster 2; impeccable `dark-glow` | + |
| S11 | Coloured glow | box/text-shadow with 0 offset and chromatic colour, or coloured blur on dark ground | impeccable `dark-glow` | + |
| S12 | Hairline + wide shadow | same rule has `border: 1px` and shadow blur ≥ 24px | impeccable `gpt-thin-border-wide-shadow` | + |
| S13 | Radial halo / spotlight | radial-gradient accent → transparent on a section/hero background | impeccable `radial-halo`, `radial-spotlight-glow` | + |
| S14 | Decorative grid bg | tiled `linear-gradient` hairlines with fixed px cell | impeccable `codex-grid-background` | + |
| S15 | Bounce easing | cubic-bezier with y > 1 or < 0; `bounce`/`elastic` names | impeccable `bounce-easing` | + |
| S16 | Layout animation | transition/animation on width/height/padding/margin/top/left | impeccable `layout-transition`; gstack §7 | + |
| S17 | Image hover transform | `:hover img { transform: scale|rotate }` | impeccable `image-hover-transform` | + |
| S18 | Justified text without hyphens | `text-align: justify` and not `hyphens: auto` | impeccable `justified-text` | + |
| S19 | Wide tracking on body | letter-spacing > 0.05em on non-uppercase text | impeccable `wide-tracking`; gstack | + |
| S20 | Crushed tracking | letter-spacing < −0.04em | impeccable `extreme-negative-tracking`; craft-floor | + |
| S21 | Missing focus | `outline: none` without a `:focus-visible` replacement | gstack §5; Vercel | + |
| S22 | Reduced motion | any animation without a `prefers-reduced-motion` branch | gstack §7; craft-floor | + |
| S23 | Family count | > 2 font families resolved on a page | v0; OpenAI; gstack | + |
| S24 | Colour count | > 5 distinct non-neutral colours resolved (tokens + derived) | v0 3–5 | + |
| S25 | Dark scheme | dark ground without `color-scheme: dark` | Vercel; gstack | + |

**Rendered (measured by `shoot` at 390 and 1280)**

| # | Check | Rule | Source | |
|---|---|---|---|---|
| R1 | Eyebrow | small tracked caps/small-caps block directly above a heading | impeccable `kicker-above-heading`; taste-skill ≤ 1 per 3 sections | ✔ |
| R2 | Tiny text | body < 12px; functional text < 11px | impeccable `tiny-text`, `undersized-ui-text` | ✔ |
| R3 | Measure | prose line > 80ch (warn > 75) | impeccable `line-length` | ✔ |
| R4 | Flat hierarchy | adjacent heading/body size ratio < 1.2 | impeccable `flat-type-hierarchy` (≥ 1.25) | ✔ |
| R5 | Monotonous spacing | one gap value dominates vertical rhythm | impeccable `monotonous-spacing` | ✔ |
| R6 | Heading rhythm | space above heading ≤ space below | impeccable `heading-rhythm`; craft-floor | + |
| R7 | Tight leading | multi-line text line-height < 1.3× | impeccable `tight-leading` | + |
| R8 | Low contrast | text < 4.5:1 (large < 3:1), incl. hover/focus states | WCAG; craft-floor | + |
| R9 | Grey on colour | text C ≈ 0 on a ground with C > 0.04 | impeccable `gray-on-color`; RefUI | + |
| R10 | Nested cards | bordered/filled box inside bordered/filled box | impeccable `nested-cards`; OpenAI | + |
| R11 | Identical card grid | ≥ 3 siblings same size, each icon/heading/text | gstack #2; impeccable `icon-tile-stack` | + |
| R12 | Icon tile above heading | small rounded filled square directly above an h2/h3 | impeccable `icon-tile-stack` | + |
| R13 | Numbered section labels | `01`/`02`… labels next to ≥ 3 section headings | impeccable; Anthropic skill | + |
| R14 | Emoji as icon | emoji codepoints in headings, list markers, nav | v0; gstack #7 | + |
| R15 | Separator chains | > 1 `·` (or `—`/`|` used as separator) per line in meta strings | Anthropic cluster 5; taste-skill | + |
| R16 | Centred everything | > 60 % of text blocks `text-align:center` | gstack #4 | + |
| R17 | Italic serif display hero | first h1 is italic serif ≥ 3rem | impeccable `italic-serif-display` | + |
| R18 | Oversized long h1 | h1 > 8 words and > 3 lines at 1280 | impeccable `oversized-h1`; taste-skill | + |
| R19 | Overflow / occlusion | horizontal scroll at 390; text under another box | impeccable `text-overflow`, `text-occlusion` | + (docs/36 pairs cover part) |
| R20 | Content hidden at rest | > 20 % of text at opacity 0 after load | impeccable `content-hidden-at-rest` | + |
| R21 | Body at viewport edge | paragraph inline padding < 16px at 390 | impeccable `body-text-viewport-edge` | + |
| R22 | Touch targets | interactive < 44×44 at 390 | gstack; ui-ux-pro-max | + |
| R23 | Layout repetition | same section structure used > 1× on the front page (warn) | taste-skill section-repetition ban | + |
| R24 | Accent spread | accent colour appears in > N distinct roles (e.g. > 3: links, nav, buttons, badges…) | design.md "role-scoped colour"; taste-skill colour lock | + |
| R25 | Headline-only scan | h1/h2 texts alone ≥ 2 and not all generic ("Latest", "Posts") — advisory | OpenAI litmus | + (advisory) |

**Copy (content lint, advisory — content is the author's, but pieces must not inject it)**

| # | Check | Source |
|---|---|---|
| C1 | Piece-injected labels ("Scroll", "Field notes", "Index of work", version stamps, locale/weather strips) — pieces must emit no invented copy | taste-skill §9.F |
| C2 | Em-dash saturation ≥ 8 per page at ~1/500 chars (warn) | impeccable `em-dash-overuse` |
| C3 | Buzzwords (elevate, seamless, unleash, empower, supercharge, world-class, next-gen) | impeccable `marketing-buzzword`; taste-skill |
| C4 | Straight quotes / `...` in rendered prose | Vercel; gstack |

---

## 7. Sources (all)

Local: `~/.claude/skills/impeccable/**` (v4.0.4); `~/.claude/plugins/cache/claude-plugins-official/frontend-design/*/skills/frontend-design/SKILL.md`; `~/.claude/skills/design-{consultation,shotgun,review,html}/SKILL.md`; `/home/sunny/Projects/snypd/packages/render/src/taste.ts`; `/home/sunny/Projects/snypd/packages/shelf/src/files.gen.ts`; `/home/sunny/Projects/snypd/docs/37-a-whole-site-from-pieces.md`.

Web:
- https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md (+ history 00756142, 2235be7c, 41bbe19d)
- https://github.com/anthropics/claude-cookbooks/blob/main/coding/prompting_for_frontend_aesthetics.ipynb
- https://claude.com/blog/improving-frontend-design-through-skills
- https://www.justinwetch.com/blog/improvingclaudefrontend/
- https://github.com/google-labs-code/design.md (docs/spec.md, PHILOSOPHY.md) · https://stitch.withgoogle.com/docs/design-md/format · https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-design-md/
- https://github.com/voltagent/awesome-design-md · https://github.com/VoltAgent/awesome-claude-design · https://ossinsight.io/blog/design-md-protocol-2026
- https://github.com/nextlevelbuilder/ui-ux-pro-max-skill · https://github.com/hylarucoder/benchmark-skill-ui-ux-pro-max
- https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4
- https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools (v0, Lovable, Same.dev, Bolt, Orchids, Leap)
- https://help.figma.com/hc/en-us/articles/33665861260823-Add-guidelines-to-Figma-Make · https://developers.figma.com/docs/code/write-design-system-guidelines/
- https://github.com/leonxlnx/taste-skill · https://www.tasteskill.dev/
- https://github.com/pbakaus/impeccable · https://impeccable.style/slop/
- https://www.sglavoie.com/posts/2023/09/09/book-summary-refactoring-ui/ · https://archive.org/stream/RefactoringUIStartWithTooMuchWhiteSpace/Refactoring%20UI%20-%20Start%20with%20too%20much%20white%20space_djvu.txt
- https://github.com/vercel-labs/web-interface-guidelines
- https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website
- https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it · https://www.925studios.co/blog/ai-slop-design-tells · https://mohitphogat.medium.com/ai-design-slop-why-every-ai-built-interface-looks-the-same-and-how-to-fix-it-bf874e0b470c
- https://ruoqijin.com/blog/frontend-design-skills-ai-agents
- https://arxiv.org/abs/2511.20513 (DesignPref) · https://arxiv.org/abs/2601.11747 (PRISM) · https://arxiv.org/abs/2510.23272 (AesCode/OpenDesign) · https://arxiv.org/html/2505.03733v1 (WebGen-Bench)
