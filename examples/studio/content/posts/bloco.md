---
title: Bloco, wayfinding for a building that forgot it was one
date: 2026-03-27
status: published
description: A sign system for a 1970s concrete hospital wing that had grown four additions and no map. Three sign types, one rule, and a fall in missed appointments.
author: marta-sa
category: space
tags: [wayfinding, type]
cover: { image: /media/bloco-cover.webp, alt: "A person walking through a tall concrete colonnade, framed by the columns", eyebrow: Space }
---

::cover{eyebrow="Space · Hospital de Santo Tirso" subtitle="Three sign types and one rule for a concrete building that had grown four additions and no map." image="/media/bloco-cover.webp" alt="A person walking through a tall concrete colonnade, framed by the columns"}

:::tldr
The outpatient wing at Santo Tirso is a 1970s concrete block with four later additions, and people got lost in it badly enough that appointments were missed. We replaced two hundred signs with ninety, in three types, under one rule: every sign says where you are before it says where anything else is.
:::

## The building

::figure{src="/media/bloco-interior.webp" alt="A bare concrete interior with a single round column and a long empty wall" caption="Level 1 of the original block. Every corridor looks like this one, which is the problem." width="wide"}

The original block is a grid of identical corridors. The additions each have their own floor numbering, so Level 2 of the 1988 wing meets Level 1 of the 1974 block through a door with no sign at all. There were two hundred and six signs in the wing when we counted. Forty-one of them contradicted another one.

:::stat-row
::stat{value="206" label="signs before, 41 of them contradicting another" source="https://ferrule.snypd.rocks/posts/bloco/#the-building"}
::stat{value="90" label="signs after" source="https://ferrule.snypd.rocks/posts/bloco/#three-types"}
::stat{value="−38 %" label="missed outpatient appointments, six months on" source="https://ferrule.snypd.rocks/posts/bloco/#what-changed"}
:::

## One rule

Every sign states where you are, in the largest type on it, before it points anywhere. A visitor who is lost does not need a direction; they need a position. The direction is only useful once they have one.

:::callout{kind="warning" title="The rule the hospital argued with"}
The consultants' names came off the signs. A sign that says *Dr Almeida, Room 214* is wrong the week Dr Almeida moves and useless to the person looking for Room 214. The rooms have numbers; the doors have the numbers; the people are on a board at reception that a clerk can change.
:::

## Three types

:::diagram{direction="tb" caption="The three sign types and what each one is allowed to say."}
nodes:
  - { id: here, label: "Position: you are on Level 1, Block A", kind: box }
  - { id: dir, label: "Direction: Blocks B and C, this way", kind: rounded }
  - { id: door, label: "Door: Room 214", kind: pill }
edges:
  - { from: here, to: dir, label: at every junction }
  - { from: dir, to: door, label: at every corridor end }
:::

::figure{src="/media/bloco-stair.webp" alt="A concrete stairwell looking up, with a handrail spiralling towards a skylight" caption="The 1974 stair. Its position sign is the largest in the building, because it is the only thing all five levels share."}

The face is a heavy grotesque cut to survive being read at a slant under fluorescent light. It has one weight. There is no italic, because there is nothing on a hospital sign that needs one.

## What changed

::figure{src="/media/bloco-platform.webp" alt="A long concrete platform under a coffered ceiling, strip lights running to a vanishing point" caption="The 1988 wing's main corridor after the old signs came down and before the new went up. Forty metres of nothing to read." width="wide"}

Six months after the signs went up, the outpatient department's missed appointments were down by thirty-eight per cent against the same six months the year before. The hospital counts a missed appointment as one where the patient checked in but did not reach the room. That was the number that mattered and it is the one we report.

:::chart{type="bar" source="https://ferrule.snypd.rocks/posts/bloco/#what-changed" caption="Appointments missed after check-in, per month, in the six months before and after the signs." unit="appointments"}
- { label: "Before", value: 142, series: "Month 1" }
- { label: "Before", value: 151, series: "Month 2" }
- { label: "Before", value: 139, series: "Month 3" }
- { label: "After", value: 96, series: "Month 1" }
- { label: "After", value: 88, series: "Month 2" }
- { label: "After", value: 84, series: "Month 3" }
:::

:::pullquote{cite="Dr Helena Pires, outpatient director" href="/posts/bloco/"}
Nobody asked us for a map. They asked us for a sign that said where they were.
:::

::cta{title="Have a building people get lost in?" body="We count the signs first. Then we take most of them down." button="Write to us" href="mailto:hello@ferrule.example?subject=Wayfinding"}
