# technical

Reference: a wide measure for scanning, mono headings and chrome, a contents list from the heading tree, and tables and code blocks that take the width they need.

## Use scene
A developer with an editor in the other window, scanning docs, notes or a release log for the one line they need — mostly on a desktop, often in dark mode, rarely reading top to bottom.

## Visitor mode
Operate.

## References
Good reference docs: a man page's density, a changelog's rhythm, a spec's contents list.

## The rut
The docs-kit page: a left sidebar, a blue accent, an admonition box with a coloured stripe for every note, and Inter.

## Boldness goes here
The monospace: every heading and every piece of chrome is set in it, at a tighter tracking. It is the single most opinionated line in the theme.

## Safe / Risk
- Safe: no webfont — the system monospace is excellent on every platform a reader has.
- Safe: a contents list from the heading tree, because reference is navigated, not read.
- Risk: mono headings read as "terminal" to some. The cost is a theme that is not for essays; editorial is.
- Risk: a wider measure (44rem) than reading wants. The cost is prose that runs long at desktop widths.

## Chosen
- taste.measure: reference is scanned and a code line is longer than a sentence; the 44rem measure is the theme's argument (theme.yaml `measure`).
- taste.eyebrow: the kicker is the author's (`cover.eyebrow`), set only when a post asks for one.
- taste.side-stripe: the toc, tldr and callout carry a rule down their side on a tint — held as shipped before TF5; revisit on sight (decision 209).
- taste.untinted-neutral: the light page is #fbfbfc, a hair off pure grey — held as shipped; a trace of the accent's hue is a one-token change.

## Seed

## Decisions
- 2026-09-19 DESIGN.md written from theme.yaml's header and personality (TF5); nothing about the look changed.
