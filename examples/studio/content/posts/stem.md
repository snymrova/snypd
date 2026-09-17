---
title: Stem, a lamp that is mostly a hinge
date: 2026-02-03
status: published
description: A task lamp for Lumo with one machined hinge, no visible screws and a light that stays where you put it for ten years. Ondular makes it.
author: tomas-reis
category: product
tags: [lighting, tooling]
cover: { image: /media/stem-cover.webp, alt: A bare bulb in a white ceramic pendant shade against a pale wall, eyebrow: Product }
---

::cover{eyebrow="Product · Lumo, made by Ondular" subtitle="A task lamp that is one hinge, one arm and one head, and stays exactly where you left it." image="/media/stem-cover.webp" alt="A bare bulb in a white ceramic pendant shade against a pale wall"}

:::tldr
Lumo wanted a task lamp with no springs, no knobs and no droop. We designed a hinge that carries the whole arm on friction, tooled it so Ondular can turn it in Braga, and tested it to fifty thousand movements. The rest of the lamp is what the hinge allows.
:::

## The problem with every task lamp

An anglepoise stays up because of springs, and springs sag. A gas strut stays up until it does not. A friction hinge stays up for as long as the friction lasts, which in most lamps is about a year, because the hinge is a plastic washer between two stampings.

We wanted the friction to come from two machined faces of aluminium bronze under a preload that does not relax. That is a bearing, not a hinge, and it is why the project took nine months.

::figure{src="/media/stem-press.webp" alt="A machinist's oil-blackened hands guiding a part into a drill press in a dark workshop" caption="The first hinge bodies were drilled on the studio's press before Ondular turned the batch." width="wide"}

## What we measured

:::stat-row
::stat{value="50,000" label="arm movements on the rig, no measurable droop" source="https://ferrule.snypd.rocks/posts/stem/#what-we-measured"}
::stat{value="1.8 N·m" label="holding torque, set once at the factory" source="https://ferrule.snypd.rocks/posts/stem/#what-we-measured"}
::stat{value="0" label="visible fasteners" source="https://ferrule.snypd.rocks/posts/stem/#the-parts"}
:::

:::chart{type="area" source="https://ferrule.snypd.rocks/posts/stem/#what-we-measured" caption="Holding torque of the hinge over the rig test. A spring-arm lamp we bought for comparison is the lower line." unit="N·m"}
- { label: "0", value: 1.80, series: "Stem" }
- { label: "10k", value: 1.79, series: "Stem" }
- { label: "20k", value: 1.79, series: "Stem" }
- { label: "30k", value: 1.78, series: "Stem" }
- { label: "40k", value: 1.78, series: "Stem" }
- { label: "50k", value: 1.77, series: "Stem" }
- { label: "0", value: 1.40, series: "Spring arm" }
- { label: "10k", value: 1.21, series: "Spring arm" }
- { label: "20k", value: 1.02, series: "Spring arm" }
- { label: "30k", value: 0.88, series: "Spring arm" }
- { label: "40k", value: 0.74, series: "Spring arm" }
- { label: "50k", value: 0.61, series: "Spring arm" }
:::

## The parts

:::diagram{direction="lr" caption="Five parts, one supplier each. The hinge is the only one we tool ourselves."}
nodes:
  - { id: base, label: Cast iron base, kind: rounded }
  - { id: hinge, label: Bronze hinge, kind: box }
  - { id: arm, label: Extruded arm, kind: rounded }
  - { id: head, label: Spun head, kind: rounded }
  - { id: led, label: LED module, kind: pill }
edges:
  - { from: base, to: hinge }
  - { from: hinge, to: arm }
  - { from: arm, to: head }
  - { from: head, to: led }
:::

::figure{src="/media/stem-desk.webp" alt="A phone lying on a desk under the warm pool of a lamp, the lamp reflected on its screen" caption="A pool of light 40 cm across at the desk, which is what a task lamp is for."}

:::callout{kind="note" title="Why the head is spun and not cast"}
A spun aluminium head is 90 g. A cast one is 240 g. Every gram at the head is torque at the hinge, and torque at the hinge is the number the whole lamp is designed around.
:::

## The one that lost

::figure{src="/media/stem-cage.webp" alt="A bare bulb inside a black wire cage hanging in a dim room" caption="The second prototype had a cage. It photographed well and cast a shadow on the page. It lost."}

::figure{src="/media/stem-field.mp4" alt="A field of thin lamps glowing at their tips in a dim room" poster="/media/stem-field.webp" autoplay=true caption="The lighting show in Milan where Lumo first showed Stem, a hundred of them in a field." width="wide"}

## How to adjust it

:::steps{title="Setting the arm" time="1 min"}
1. **Move it** — hold the head, not the arm, and put the light where you want it.
2. **Let go** — it stays. That is the whole procedure.
3. **If it ever droops** — a single 4 mm hex key under the base sets the preload. We have not needed to tell anyone this yet.
:::

::cta{title="Have a mechanism that sags?" body="We build the test rig first and the product second." button="Write to us" href="mailto:hello@ferrule.example?subject=Stem"}
