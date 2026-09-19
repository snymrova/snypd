---
title: What a reading column promises
date: 2026-09-12
status: published
description: A long read — twenty-five hundred words of prose, footnotes, a quote, code and a table — for judging measure, rhythm and leading.
author: ada
category: engineering
tags: [field-notes, markdown]
---

A reading column is a promise about attention. It says the page will not move while you read it,
that the next line starts where your eye expects it to, and that nothing on either side is competing
for the same glance. None of this is visible when it works. A reader who finishes a long piece
without once noticing the typography has been served by it, and that invisibility is the standard a
theme is held to.

## The measure

A reading column is a promise about attention. It says the page will not move while you read it,
that the next line starts where your eye expects it to, and that nothing on either side is competing
for the same glance. Headings are where most themes over-design. A heading has one job, which is to
be found by somebody scanning, and a second job, which is to get out of the way of somebody reading.

The measure decides most of that. Too wide and the eye loses its place on the return sweep; too
narrow and every line breaks before a thought has finished, so the rhythm of the prose is replaced
by the rhythm of the column. Space above a heading should be larger than space below it, so the
heading belongs to what follows. When the two are equal the heading floats, and a reader cannot tell
at a glance which paragraph it names.[^1]

Leading is the second decision and it is not independent of the first. A longer line needs more air
between lines, because the return sweep is longer and the eye needs a wider runway to land on the
right one. Links in running text are a tax on reading. Each one asks a question — follow me? — and
the colour and underline decide how loudly it asks. A good theme lets a reader ignore them until
they want one.

## Leading and the return sweep

Headings are where most themes over-design. A heading has one job, which is to be found by somebody
scanning, and a second job, which is to get out of the way of somebody reading. Footnotes are a
courtesy to two readers at once: the one who wants the aside and the one who does not. The mark
should be findable and the note should be one gesture away, and neither should interrupt the line.

Space above a heading should be larger than space below it, so the heading belongs to what follows.
When the two are equal the heading floats, and a reader cannot tell at a glance which paragraph it
names. Dark mode is not the light theme inverted. Pure white on pure black vibrates; the text wants
to come down a step and the background up a step, and the accent usually needs more lightness to
keep its contrast.[^2]

Links in running text are a tax on reading. Each one asks a question — follow me? — and the colour
and underline decide how loudly it asks. A good theme lets a reader ignore them until they want one.
The last paragraph of a long read deserves the same care as the first. It is where a reader decides
whether to keep going, share it, or leave, and a footer that crowds it makes the decision for them.

## Headings that belong

Code in prose is a different register. It wants a face that makes every character distinct, a size
that sits with the text rather than shouting over it, and a background just strong enough to mark
the switch. The measure decides most of that. Too wide and the eye loses its place on the return
sweep; too narrow and every line breaks before a thought has finished, so the rhythm of the prose is
replaced by the rhythm of the column.

Tables are the hardest thing a reading theme meets, because they want width the column does not
have. The honest answers are to let a table scroll inside itself, or to let it break out of the
measure, never to squeeze it. Leading is the second decision and it is not independent of the first.
A longer line needs more air between lines, because the return sweep is longer and the eye needs a
wider runway to land on the right one.[^3]

Footnotes are a courtesy to two readers at once: the one who wants the aside and the one who does
not. The mark should be findable and the note should be one gesture away, and neither should
interrupt the line. Headings are where most themes over-design. A heading has one job, which is to
be found by somebody scanning, and a second job, which is to get out of the way of somebody reading.

> A heading has one job, which is to be found by somebody scanning, and a second job, which is
> to get out of the way of somebody reading.

## Links that wait

Dark mode is not the light theme inverted. Pure white on pure black vibrates; the text wants to come
down a step and the background up a step, and the accent usually needs more lightness to keep its
contrast. Code in prose is a different register. It wants a face that makes every character
distinct, a size that sits with the text rather than shouting over it, and a background just strong
enough to mark the switch.

The last paragraph of a long read deserves the same care as the first. It is where a reader decides
whether to keep going, share it, or leave, and a footer that crowds it makes the decision for them.
Tables are the hardest thing a reading theme meets, because they want width the column does not
have. The honest answers are to let a table scroll inside itself, or to let it break out of the
measure, never to squeeze it.[^4]

None of this is visible when it works. A reader who finishes a long piece without once noticing the
typography has been served by it, and that invisibility is the standard a theme is held to.
Footnotes are a courtesy to two readers at once: the one who wants the aside and the one who does
not. The mark should be findable and the note should be one gesture away, and neither should
interrupt the line.

## Code in the column

A reading column is a promise about attention. It says the page will not move while you read it,
that the next line starts where your eye expects it to, and that nothing on either side is competing
for the same glance. None of this is visible when it works. A reader who finishes a long piece
without once noticing the typography has been served by it, and that invisibility is the standard a
theme is held to.

The measure decides most of that. Too wide and the eye loses its place on the return sweep; too
narrow and every line breaks before a thought has finished, so the rhythm of the prose is replaced
by the rhythm of the column. A reading column is a promise about attention. It says the page will
not move while you read it, that the next line starts where your eye expects it to, and that nothing
on either side is competing for the same glance.

Leading is the second decision and it is not independent of the first. A longer line needs more air
between lines, because the return sweep is longer and the eye needs a wider runway to land on the
right one. The measure decides most of that. Too wide and the eye loses its place on the return
sweep; too narrow and every line breaks before a thought has finished, so the rhythm of the prose is
replaced by the rhythm of the column.

```ts
export function measure(ch: number): string {
  // 60–75 characters is the range most sources agree on for a single column of body text
  return `${Math.min(75, Math.max(60, ch))}ch`;
}
```

## When the table is wider

Headings are where most themes over-design. A heading has one job, which is to be found by somebody
scanning, and a second job, which is to get out of the way of somebody reading. Space above a
heading should be larger than space below it, so the heading belongs to what follows. When the two
are equal the heading floats, and a reader cannot tell at a glance which paragraph it names.

Space above a heading should be larger than space below it, so the heading belongs to what follows.
When the two are equal the heading floats, and a reader cannot tell at a glance which paragraph it
names. Links in running text are a tax on reading. Each one asks a question — follow me? — and the
colour and underline decide how loudly it asks. A good theme lets a reader ignore them until they
want one.

Links in running text are a tax on reading. Each one asks a question — follow me? — and the colour
and underline decide how loudly it asks. A good theme lets a reader ignore them until they want one.
Code in prose is a different register. It wants a face that makes every character distinct, a size
that sits with the text rather than shouting over it, and a background just strong enough to mark
the switch.

| Width | Measure | Leading | Body size | Notes |
|---|---|---|---|---|
| 390 | 34ch | 1.55 | 17px | a phone held upright, the column is the viewport |
| 768 | 60ch | 1.6 | 18px | a tablet, the first width with a margin worth using |
| 1280 | 66ch | 1.65 | 19px | a laptop, where the sidebar question is asked |
| 1440 | 68ch | 1.65 | 20px | a desktop, where the measure must stop growing |

## Asides

Code in prose is a different register. It wants a face that makes every character distinct, a size
that sits with the text rather than shouting over it, and a background just strong enough to mark
the switch. Dark mode is not the light theme inverted. Pure white on pure black vibrates; the text
wants to come down a step and the background up a step, and the accent usually needs more lightness
to keep its contrast.

Tables are the hardest thing a reading theme meets, because they want width the column does not
have. The honest answers are to let a table scroll inside itself, or to let it break out of the
measure, never to squeeze it. The last paragraph of a long read deserves the same care as the first.
It is where a reader decides whether to keep going, share it, or leave, and a footer that crowds it
makes the decision for them.

Footnotes are a courtesy to two readers at once: the one who wants the aside and the one who does
not. The mark should be findable and the note should be one gesture away, and neither should
interrupt the line. None of this is visible when it works. A reader who finishes a long piece
without once noticing the typography has been served by it, and that invisibility is the standard a
theme is held to.

- An aside that is a list item, which is where many themes forget the measure
- A second, longer item that wraps onto another line so the hanging indent can be judged against the text above it
- A third, with `inline code` and a [link](/posts/every-primitive-once/)

## After dark

Dark mode is not the light theme inverted. Pure white on pure black vibrates; the text wants to come
down a step and the background up a step, and the accent usually needs more lightness to keep its
contrast. Leading is the second decision and it is not independent of the first. A longer line needs
more air between lines, because the return sweep is longer and the eye needs a wider runway to land
on the right one.

The last paragraph of a long read deserves the same care as the first. It is where a reader decides
whether to keep going, share it, or leave, and a footer that crowds it makes the decision for them.
Headings are where most themes over-design. A heading has one job, which is to be found by somebody
scanning, and a second job, which is to get out of the way of somebody reading.

None of this is visible when it works. A reader who finishes a long piece without once noticing the
typography has been served by it, and that invisibility is the standard a theme is held to. Space
above a heading should be larger than space below it, so the heading belongs to what follows. When
the two are equal the heading floats, and a reader cannot tell at a glance which paragraph it names.

## Ending well

A reading column is a promise about attention. It says the page will not move while you read it,
that the next line starts where your eye expects it to, and that nothing on either side is competing
for the same glance. Tables are the hardest thing a reading theme meets, because they want width the
column does not have. The honest answers are to let a table scroll inside itself, or to let it break
out of the measure, never to squeeze it.

The measure decides most of that. Too wide and the eye loses its place on the return sweep; too
narrow and every line breaks before a thought has finished, so the rhythm of the prose is replaced
by the rhythm of the column. Footnotes are a courtesy to two readers at once: the one who wants the
aside and the one who does not. The mark should be findable and the note should be one gesture away,
and neither should interrupt the line.

Leading is the second decision and it is not independent of the first. A longer line needs more air
between lines, because the return sweep is longer and the eye needs a wider runway to land on the
right one. Dark mode is not the light theme inverted. Pure white on pure black vibrates; the text
wants to come down a step and the background up a step, and the accent usually needs more lightness
to keep its contrast.

[^1]: A footnote long enough to wrap: note 1 is here to show whether the theme sets notes smaller than the body, with the same care, and one gesture from the mark.
[^2]: A footnote long enough to wrap: note 2 is here to show whether the theme sets notes smaller than the body, with the same care, and one gesture from the mark.
[^3]: A footnote long enough to wrap: note 3 is here to show whether the theme sets notes smaller than the body, with the same care, and one gesture from the mark.
[^4]: A footnote long enough to wrap: note 4 is here to show whether the theme sets notes smaller than the body, with the same care, and one gesture from the mark.
