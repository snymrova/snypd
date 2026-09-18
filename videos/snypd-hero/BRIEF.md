---
workflow: general-video
flow: companion
storyboard: yes
message: "One sentence to your agent, and a real website comes out."
destination: site-embed
aspect: 1920x1080
language: en
audience: "developers who already have Claude Code, Cursor or Codex open"
length: 38s
angle: "One sentence. — a prompt bar stays on screen; a sentence goes in, a finished thing slams out on the downbeat"
---

## Intent

The hero film for snypd.rocks and the README. Sunny's words: "a hype one, good feel, fast." A sell, not a
tour. The music is the clock, the picture cuts on the beat, the voice is sixty words dropped into the gaps.
The full plan, the storyboard table and the rules of the cut are `docs/26-the-hero-film.md`; the board is
`docs/mock/26-storyboard.png`. Confirmed by Sunny on 18 Sep 2026: light ground, under 45 seconds (hard
ceiling), the film takes the terminal session's place in the site hero, and it takes the README hero too.

## Assets

- ../../sites/snypd.rocks/content/media/snypd-wordmark.svg — the serif wordmark with the oxblood dot; beat 10.
- ../../sites/snypd.rocks/themes/folio/fonts/inter-latin.woff2 — Inter 500, the display face of the site.
- ../../examples/studio — Ferrule, the studio specimen; beat 06 is captured from its dev server.
- ../../corpora/theme — the fixture every bundled look is photographed on; beat 05.
- assets/audio/ — the bed and the voice, made through OpenRouter (see Notes).

## Customizations

- Cuts, slams and count-ups land on the chosen music take's measured beat grid; the storyboard bends to the track.
- Count-ups on 0 KB, 23 ms and 510, one per bar, in the break.
- Every page on screen is a real capture at 80 % of the frame or more; typed sentences are the film's own type.
- Every spoken line is also on screen as type: the film works muted and is its own captions.
- A 480p animatic on the real audio before the full build.
- By-product at render: bars 5–10, silent, at most 10 s and 1 MB — the hero loop of decision 203.

## Notes

- Narration and music come from OpenRouter, on Sunny's word: `openai/gpt-audio` and `google/lyria-3-pro-preview`.
  The key is passed as `OPENROUTER_API_KEY` in the shell for each run and is written to no file. HeyGen and the
  local engines are not used.
- "snypd" is said with "sny" as in "sky": it sounds like "sniped", not "snipped" (Sunny, 18 Sep 2026). The model is sent "sniped"; the screen and the transcript show "snypd".
- Look: ground #f9f9f9, ink #121214, muted #6a6a6e, hairline #e2e2e4, oxblood #8a3324 for hits only, Inter 500
  tight-tracked for display, system mono for the prompt bar and terminal text.
- Never name WordPress or any other CMS. Every number is CI's (`bench/latest.md`), never this box's.
- Flashing stays under three changes a second; the seven-look montage is held inside a window.
- Greenfield: nothing is taken from `r5-hero-video`.
