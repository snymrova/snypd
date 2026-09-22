# The judge's few-shot pairs

Three before/after pairs from this repository's own theme work, each with the finding that produced the
fix, written in the shape [`rubric.md`](../../mcp/src/rubric.md) asks for. They exist because a critique
step with no examples writes criticism that sounds right and names nothing: "improve the visual
hierarchy" is not a finding, and a model that has seen three real ones stops producing it (UICrit's
result, docs/28 §5).

**Nothing imports this directory.** It is read by an agent at step 8 of `build-theme`, and by a person
deciding whether the judge is any good. The PNGs cost the binary nothing.

## The pairs

| Pair | What it teaches | Provenance |
|---|---|---|
| `technical-u6b` | Three defects that every gate was green on: a stray `/` at the head of a wrapped line, a sub-heading quieter than its own paragraph, pills off their baseline | **Reconstructed.** The fixes were made on sight before the theme was first committed, so there is no "before" commit; `before.png` is today's theme with exactly those three reverted |
| `studio-u10` | A gradient standing in for a decision, a stat row with no grouping, two things claiming to be the top of the page | **Git history.** `c0fd84c` (U8) against today, one camera |
| `folio-s34` | An approved mockup refused on sight the day it was built, and why: an empty half reads as air in a mockup and as a missing element in a page | **`docs/mock/`.** The mockup Sunny picked, against the page as built |

Each pair's findings, fixes and the exact route, width and scheme are in [`pairs.json`](pairs.json).

## How they were made

```
# technical: today's theme, three fixes reverted, shot beside today's
cp -r themes/technical themes/technical-u6b-before      # then revert the three (pairs.json says which)
snypd shoot corpora/specimen --theme=technical-u6b-before,technical \
  --route=/posts/every-primitive-once/ --width=390 --scheme=light

# studio: the stylesheet as it was at U8, shot beside today's
mkdir themes/studio-u8-before && git archive c0fd84c themes/studio | tar -x --strip-components=2 -C themes/studio-u8-before
snypd shoot corpora/specimen --theme=studio-u8-before,studio --route=/ --width=1280 --scheme=light
```

Both temporary themes were deleted afterwards. The renderer is today's in every shot, which is the point
of a fixture and not a defect in it: what each pair isolates is the stylesheet.

## Adding one

A pair earns its place when a defect was **found by looking** and is **invisible to `check theme` and
`bench page`**. Anything a gate already catches belongs in the gate, not here. Keep the finding in the
rubric's shape — region, what it costs the reader, then the change as a token or one rule — and say in
`provenance` whether the "before" is history or a reconstruction. A fixture that quietly pretends to be
history teaches the model that provenance does not matter.
