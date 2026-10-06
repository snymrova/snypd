# editorial

Long-form reading: one serif column at a comfortable measure, generous leading, a single accent used sparingly, and figures, charts, diagrams and flows that break out of the column while nothing else does.

## Use scene
Someone reading one essay start to finish, on a laptop at a desk or a phone in bed, light or dark as their system says. The page follows the reader's scheme (`color.scheme: light dark`); the `ink` and `broadsheet` variations commit to one.

## Visitor mode
Read.

## References
A well-set book page. The long reads of a serious newspaper's web edition, with the chrome taken away — taken away, not capitalised: the header and footer are quiet because they are small, sans and muted, never because they shout in 13 px caps.

## The rut
Cream paper, a terracotta accent, a serif, a hairline under the masthead — "the cosy literary blog".

## Boldness goes here
The column itself: Source Serif 4 at 21 px on a 37rem measure with generous leading — larger than the web's habit, because the habit came from interfaces and an essay is not a form. Everything else defers to the prose.

## Safe / Risk
- Safe: a text serif for body, because reading is the job.
- Safe: one accent, used for links and very little else.
- Risk: one webfont (30 KB) where a system serif would load free. The cost is the font budget, declared and gated (decision 118).
- Risk: a narrow column wastes a wide screen. The cost is a page that looks empty at 1440 to anyone skimming.

## Chosen
- taste.eyebrow: the kicker is the author's (`cover.eyebrow`), set only when a post asks for one; a magazine column wants it.
- taste.side-stripe: the tldr and callout carry a rule down their side on a tint — held as shipped before TF5; revisit on sight (decision 209).

## Seed

## Decisions
- 2026-09-19 DESIGN.md written from theme.yaml's header and personality (TF5); nothing about the look changed.
- 2026-09-23 The scale rebuilt on one ratio — 21 · 24.8 · 35 · 54.4 at the desktop end, `size.small` 13 → 14 px, `measure` 34 → 37rem so the line still holds 62–66 characters (decisions 235–236). The chrome's capitals removed (237), link underlines drawn at a third of their own colour (238), and a listing's title made larger than its description (239). The rut above is still the rut; none of this moved the palette.
