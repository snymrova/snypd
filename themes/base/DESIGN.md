# base

The floor, not a look: semantic HTML for every primitive and layout, one `snypd-<name>` class each, and a stylesheet that is behaviour only (popover, dialog, details, footnote cards). Every other theme extends it.

## Use scene
Nobody reads base on purpose. It is what a theme author styles, what Gate B is measured on, and what a reader gets if every stylesheet fails — so it must read as a plain, correct document in whatever the browser's defaults are.

## Visitor mode
Read.

## References
The browser's own stylesheet. The HTML spec's examples.

## The rut
A "minimal starter" that is really a small theme: a font stack, a max-width, a colour, and a child theme spending its first hour undoing them.

## Boldness goes here
Nowhere, deliberately. Its boldness is the markup: one class per primitive and nothing to override.

## Safe / Risk
- Safe: no tokens, so a child declares its own palette and nothing is inherited by accident.
- Safe: behaviour CSS in the `snypd.base` layer, under every theme's own.
- Risk: it looks unfinished to anyone who opens it expecting a theme. The cost is a first impression; `snypd new theme` is the answer.
- Risk: a child that forgets a token renders unstyled rather than half-styled. The cost is a louder first failure, which `check theme`'s contrast rows catch.

## Chosen

## Seed

## Decisions
- 2026-09-19 DESIGN.md written from theme.yaml's header (TF5); nothing about the look changed.
