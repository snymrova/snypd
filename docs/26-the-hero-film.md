# 26 — The hero film: thirty-eight seconds, cut to the beat, one sentence at a time

**Owner:** PM · **Engineer:** Claude Code · **Decider:** Sunny · **Written:** 18 Sep 2026
**Asked for:** *"plan a hero video for our website, a hype one, good feel, fast"* — then *"use openrouter for narration, and music"* — then *"treat video tasks as greenfield."*
**Status:** confirmed 18 Sep 2026 (§9 answered); build started at F0. Written as a plan: nothing was generated, captured or rendered at the time of writing. The storyboard is a picture, per decision 209: [`mock/26-storyboard.png`](mock/26-storyboard.png) (source [`mock/26-storyboard.html`](mock/26-storyboard.html)). Look at it before reading on.
**Greenfield means:** the R5 film (`r5-hero-video`, `scene.html` + `render.py` + `script.yaml`) is not the base. Its script, scenes, dark ground, ring-and-wordmark reveal and voice-led timeline are all left behind. Two things carry over because they are facts, not film: the narrator mispronounced *snypd*, and OpenRouter calls must run in the foreground on this box.

---

## 1. The stake

The front page's hero is one centred column (docs/25 §11): the sentence, **the film at 1,118 px**, the button, the lede, the window. The film is the page's one big picture, and today it is a 50-second terminal recording behind a poster that is a wall of text. A stranger gives that slot about three seconds.

The R5 film was approved in form and called "amazing", and it is still a 73-second keynote: a voice explains, the picture waits for the voice. *Hype, good feel, fast* is a different machine. **The music is the clock, the picture cuts on it, and the voice is a few short lines dropped into the gaps.**

The site changed under the old film too. It was parked because the footage was dull (the `editorial › paper` post, scrolled). Since then: folio, Ferrule the studio specimen with a showreel in its hero, seven looks, the registry and its `work` type, stats that count up. There is now something worth filming.

---

## 2. The brief

What Sunny said, and what was inferred, kept apart. The inferred group is where corrections live.

**Stated**

| Field | Value | Receipt |
|---|---|---|
| Subject | snypd, for the website's hero | the ask |
| Feel | hype, good feel, fast | the ask |
| Narration and music | OpenRouter | second message |
| Starting point | greenfield | third message |

**Inferred — correct these**

| Field | Value | Why |
|---|---|---|
| Intent | sell, not tour | "hype" |
| Message | **One sentence to your agent, and a real website comes out.** | the front page's own headline, turned into an action |
| Length | 20 bars ≈ 37.5 s, plus a 1.5 s ring-out | fast, and still room for four sentences, three numbers and the mark; a 30 s trim is in §9 |
| Frame | 1920 × 1080, 30 fps, 16:9 | the hero figure takes any ratio from the poster; 16:9 also serves YouTube, the README and Product Hunt's first slot |
| Ground | **light**, the site's own look (`#f9f9f9`, `#121214`, Inter 500, oxblood `#8a3324` for hits only) | every dev-tool launch film is dark with a glow; the page around the film is light, so the film reads as part of the page |
| Playback | click to play, with sound, native controls | decision 181; a narrated film cannot be the muted autoplay loop of decision 184 |
| Works muted | yes: every spoken line is also on screen as type | most first plays are muted; it is also the captions (§8) |
| Voice | `openai/gpt-audio`, voice picked by ear from three one-line auditions | greenfield, so `cedar` is a candidate and not a given |
| Music | `google/lyria-3-pro-preview`, two takes, one chosen | both models are listed on OpenRouter today |
| Tool | HyperFrames 0.8.47, product-launch workflow, storyboard review on | installed skill; HTML compositions, deterministic render, beat analysis built in |

---

## 3. Five directions, and the one recommended

1. **One sentence.** A prompt bar sits at the bottom of the frame like an instrument. Every few bars a sentence goes in and a finished thing slams out on the downbeat: a page, a new look, a studio's site, a publish. *Rides: cuts on the track's measured beat grid, real site captures.*
2. **Delete the dashboard.** An admin screen is taken apart piece by piece on the beat until only a cursor is left, and the cursor builds the site. *Rides: kinetic type, designed UI pieces.*
3. **The speedrun.** A real clock in the corner, split times like a speedrun, the true 4 m 52 s session run at eight times speed from `mkdir` to published. *Rides: the real terminal session, time remapped.*
4. **Three numbers.** 0 KB, 23 ms, 510. Each fills the frame, counts up on a hit, then two seconds of proof. *Rides: count-ups locked to the beat.*
5. **The git log is the film.** A commit log scrolls, and each line opens into the thing it made, then folds shut. It ends on the push. *Rides: one continuous camera move over type.*

**Recommended: 1 as the spine, 2 as its three-second cold open, 4 as its break.** The product's whole claim is that a sentence is the interface, so the film's structure is the claim. It also films what changed since R5: the site. **Left behind on purpose:** the dark keynote with a typed terminal, *Meet X*, and a feature list. That is the film every tool ships, and it is the one already made.

---

## 4. The storyboard

Bars at a nominal 128 bpm, 1.875 s each. Lyria will not land on exactly 128, so the real grid is measured from the chosen take (§6) and the seconds below move with it. The bar numbers are the contract.

| # | Bars | ≈ s | Sentence typed | Picture | On-screen words | Voice | Music |
|---|---|---|---|---|---|---|---|
| 01 | 1–2 | 0.0–3.8 | — | Words slam in one per beat over a ghost admin screen that loses a piece on every eighth. One oxblood strike. | A CMS with no dashboard. | No dashboard. No login. No forms. | filtered kick, claps building |
| 02 | 3–4 | 3.8–7.5 | caret only | The prompt bar drops in and stays for the whole film. | Your agent writes it. | Just your agent. | riser, snare roll, half a beat of air |
| 03 | 5–6 | 7.5–11.3 | *Write me a first post.* | The built page slams in on the downbeat and scrolls hard. A flicker of the file it made. | markdown in your repo | One sentence. A real page. | **the drop** |
| 04 | 7–8 | 11.3–15.0 | — | One-beat punch-ins: the chart draws, the flow connects, the stats count up. Fourteen block names as a ribbon. | Charts. Flows. Numbers with sources. | the same words | groove, a pluck per punch-in |
| 05 | 9–10 | 15.0–18.8 | *Switch this site to editorial, the ink look.* | One window, the same page, hard-cut through all seven looks, one per beat. The markdown beside it never moves. | Seven looks. One sentence. | Change the whole look. One sentence. | groove, a stab per look |
| 06 | 11–12 | 18.8–22.5 | *Give the studio a "work" type for case studies.* | Ferrule: the dark hero with its showreel, the work cards, a case page. Vertical whips between them. | Types. Taxonomies. Themes. Plugins. As files. | Everything a CMS has. As files. | fullest bar, then cut to air |
| 07 | 13–15 | 22.5–28.1 | — | One number per bar fills the frame and counts up to land on the downbeat. | 0 KB · 23 ms · 510 — *measured in CI* | Zero JavaScript. Twenty-three milliseconds. Measured in CI, or not claimed. | **break**: drums out, bass and a rising pad |
| 08 | 16 | 28.1–30.0 | — | The one dark frame. A real lint refusal in red (`unsourced-evidence`), then the green pass. | The gate says no. | And a gate that says no. | impact, reverse cymbal |
| 09 | 17–18 | 30.0–33.8 | *Publish.* | Commit lines land one per beat from a real `git log`. The last stamps *landed on main*. | Your repo. Your markdown. | Your repo. Your markdown. Published. | groove, a fill |
| 10 | 19–20 | 33.8–37.5 | becomes `bunx @snypd/cli init` | Everything clears. The serif wordmark lands, the oxblood dot last, on the final hit. | snypd. · Open source · MIT · snypd.rocks | snypd. Give your agent a front door. | final hit, 1.5 s ring-out |

**The voice is sixty words in 38 seconds.** It never explains. It names what just landed.

**Three rules for the cut**

- **Nothing moves off the grid.** A cut, a slam or a count-up ends on a beat. Between beats, things ease. This one rule is most of what "hype" means.
- **The page footage is never small.** Every capture plays at 80 % of the frame or more. The R5 film put a page in a device frame at a third of the screen, and it read as dull.
- **Every page, number and line of terminal text is real** (§5). Only the type, the prompt bar and the moves are drawn.

---

## 5. What gets filmed

All captures at 1920 × 1200 with a device scale of 2, reduced motion off, so count-ups and the reel actually run.

| For | Source | How |
|---|---|---|
| 03–04 the post | a fresh site made by the four lines, its first post with a chart, a flow and a stat row | Playwright scroll capture of the built page, 60 fps source |
| 05 seven looks | `corpora/theme` under each bundled look | one capture per look at an identical scroll offset, so the cut is a pure restyle |
| 06 Ferrule | `examples/studio` on the dev server | the front page with `reel.mp4` playing, `/work/`, one case page |
| 07 the numbers | `bench/latest.md` from CI | the three rows the front page already cites; if CI's record moved, the film says CI's number |
| 08 the gate | a real `snypd lint` on a post with an unsourced `stat`, then the fixed run | the text is copied out and set in the film's mono, so it is sharp at 1080p |
| 09 publish | a real `git log --oneline` from the same fresh site | as above |
| 10 the mark | `content/media/snypd-wordmark.svg` | as is |

The typed sentences are the film's own type, not a recorded terminal. They are the same sentences the front page quotes, and each one is run for real against the MCP before it goes in the film, so the result shown is the result it gives.

---

## 6. Sound

**Music first, because it is the clock.**

- **Prompt, first draft:** *Uplifting, driving electronic track for a fast product film. 128 bpm, 4/4, major key. Four bars of filtered drums and claps building with a riser, a half-beat of silence, then a full drop at bar five: punchy four-on-the-floor kick, bright plucked synth hook, warm sidechained bass, crisp hats. A three-bar breakdown at bar thirteen with no drums, bass and a rising pad, a big impact at bar sixteen, back to the full groove, and a clean final hit at bar twenty with a short ring-out. Feel-good, confident, no vocals, nothing melodic in the speaking range. About 40 seconds.*
- **Two takes, pick by ear.** Then measure the chosen take: tempo, downbeats, where the drop and the final hit actually are. That measured grid replaces §4's nominal seconds. If the take's structure is off by a bar, the storyboard bends to the track, not the other way round.
- Lyria returns a longer piece than asked. The edit is a cut on a downbeat and the ring-out, nothing smarter.

**Voice second, fitted into the gaps.**

- Three one-line auditions of the outro line in three voices. Sunny picks by ear.
- Direction, first draft: *fast, bright, smiling, a little breathless, like the good part of a trailer. Short lines, hard stops, land the last word. Never a documentary, never sleepy.*
- One take per line, a transcript check on each, two retakes allowed per line.
- **The name is spoken once**, in the last line. *snypd* is said with **"sny" as in "sky"**, so it sounds like **"sniped"**, not "snipped" (Sunny, 18 Sep 2026, correcting an earlier "yes snipped"): the model is sent "sniped", the screen and the transcript show *snypd*, and the transcript check compares against the spoken form.
- The bed ducks 6 dB under each line and comes back on the beat after it. Master at −14 LUFS integrated, true peak under −1 dB.

**Cost.** The key is live. It has about $3.70 left under a $10 cap. A voice line costs around a cent and Lyria's preview is listed at zero, so the plan fits several times over. The key goes in the shell environment for each run and in no file, script, log or commit.

---

## 7. How it is built

A HyperFrames project at `videos/snypd-hero/` (the tool's own convention), untracked until Sunny says commit; it goes on its own branch then, so the uncommitted S34/S35 work is not carried along. Renders, takes and captures are git-ignored. The brief, the storyboard, the compositions and the capture scripts are committed.

| Step | What | Output | Sunny looks? |
|---|---|---|---|
| F0 | This plan confirmed, §9 answered | `videos/snypd-hero/BRIEF.md` | **yes** |
| F1 | Music: two takes, one chosen, grid measured | `assets/bed.mp3`, `audiomap.json` | **by ear** |
| F2 | Voice: three auditions, then ten lines | `assets/vo-NN.wav`, transcript check | **by ear** |
| F3 | Captures (§5) | `assets/captures/` | no |
| F4 | Wireframe pass: every beat as a still on the real grid, with the real audio under it | an animatic MP4, 480p | **yes — the cheap place to change the cut** |
| F5 | Full build: type, moves, transitions | compositions | no |
| F6 | Render, loudness, encode, poster, the loop cut (§8) | `hero.mp4`, `hero-poster.webp`, `hero-loop.mp4` | **yes** |
| F7 | On the site: `home.md` through the MCP, gate, captures at 1440 and 390 | the front page, drafts branch | **yes, then his commit** |

F4 is the step that matters. The R5 film cost twenty minutes a render and was judged only when finished. An animatic costs one minute, and it is where *fast* is either true or not.

**Where the build stands (18 Sep 2026).** F0 done: `videos/snypd-hero/` holds the project, `BRIEF.md` and `scripts/audio.py`. F1 made, not chosen: two Lyria takes at eight cents each, 52.8 s and 70.4 s, both with the same shape — a drop near 8 s, a long break, a second drop near 37.6 s — and both past the 45 s ceiling, so each is cut on beat lines to the storyboard's shape (39.9 s and 38.2 s). Take 2 holds a steady 129 bpm and ends on a hit with a ring-out; take 1 has a half-time feel the beat tracker reads as 86 or 172, and ends on a hard stop. F2 auditions made: `cedar`, `marin`, `ash`, each reading the first line and the last, under a cent each, all three transcripts exact. **Sunny listens at `videos/snypd-hero/listen.html` and picks a take and a voice.** F3 done while that waits: the real first-post site (`.scratch/field-notes-v1`, the post an agent wrote in the recorded session) built under all seven bundled looks and photographed as full-page plates at 1920 × 2, with the position of its chart, flow, stat row and FAQ recorded per look; Ferrule's front page, work archive and the Stem case the same way; the real `git log` of that site; and the real lint refusal, which says it better than the storyboard did — *`stat` has no checkable source … a stat without one is an opinion*. Beat 08 uses that sentence. The linter's millisecond count is this box's clock and stays out of the film. **Chosen by ear, 18 Sep 2026: take 2 cut, and `marin`.** F2 done: ten lines in `marin`, every transcript exact, about five cents; two lines (04, 07) run at 1.06× to sit inside their bars. F4 done: `videos/snypd-hero/index.html` is the whole film as one composition on the measured grid — 129.2 bpm, bar 1 at 0.60 s, the drop at 8.10 s, the break from 22.87 s, the second drop at 30.32 s, the last hit at 34.09 s — with hard cuts and slams only; `hyperframes check` passes (lint 0 errors, 70/70 contrast checks); the rough cut is `videos/snypd-hero/renders/rough-cut-2.mp4`, 38.2 s, 1080p draft quality, mastered to −14 LUFS, two minutes a render. Changed from the storyboard on sight of the stills: beat 01's strike crossed out the sentence itself, so it is gone and the word *no* takes the oxblood instead. Known rough edges, for F5: beat 05's window is narrower than the 80 % rule asks, beat 06 has no showreel playing yet, punch-ins are stills with a slow push and not a drawn chart, and there is no file-tree flicker beyond the path pill. **Sunny's notes on the rough cut (18 Sep 2026): "too fast, music was not going with the video, the sound is up down at many places, script was loose."** Read as four defects, one fix each, and a second cut made the same day (`renders/cut-2.mp4`, 44.8 s): (1) *too fast* — ten ideas and a cut on every beat became **seven ideas, two to four bars each, cuts on bar lines**; the seven looks flip once every two beats; (2) *music not with the video* — the take was 129 bpm with a long break and two splices; the new bed is **110 bpm, a steady groove with no breakdown** (`bedv2-2`), used with one join, at film bar 16, under the cut to the dark gate frame, and it **stops dead on the wordmark**; (3) *sound up and down* — ten separately generated lines each levelled on their own and the bed ducking ten times became **one continuous take** (`take2-marin-1`, 36 s, cut at its own pauses and placed on the bars), the bed at **one static level** with one slow swell through the looks where nobody speaks, the quiet intro lifted 8 dB so the voice never stands alone, a static master gain and a limiter instead of a dynamic normaliser — measured: the voice within 0.4 dB from first line to last, the bed rising 5 dB over the film as the track builds; (4) *loose script* — nine full sentences making one argument: *Every CMS was built for a person at a dashboard. But you have an agent now. So we threw the dashboard away. This is snypd. One sentence in. A finished page out. Charts, diagrams, sourced numbers. Static HTML, zero JavaScript. Want a new look? Just say so. A blog, case studies, a whole studio site. All of it, files in your repo. And it checks the agent's work. A number with no source? Refused. Your repo. Your markdown. Your site. snypd. Give your agent a front door.* The words on screen are those sentences. The mix is one file (`scripts/mix.py`), so the composition carries a single `<audio>` and nothing is levelled at render. The 23 ms and 510 numbers are out; 0 KB stays.

**Approved, 18 Sep 2026 ("looks great").** F6 done: full-quality render, encoded for the web as `hero.mp4` (1080p, CRF 23, 3.5 MB, −14 LUFS); `hero-poster.webp` (the page landing under *Write me a first post.*, 1440 wide, 31 KB); `hero-loop.mp4`, bars 5–9 silent (8.8 s, 378 KB) — the loop decision 203 budgets, cut and not yet used. F7 done on disk, not through the MCP and not committed: the three files in `content/media/`, `home.md`'s hero figure is the film (caption *Forty-five seconds, with sound. Every page in it is real.*), and the real session `front-door.mp4` moved down to *How things will go. Four lines.* as the steps' proof. Gate: lint 0 errors (rule 20 warns on `hero.mp4` at 3.5 MB and on the unreferenced loop, as expected); page suite eight routes × 1280/390: js 0, font 17.37/18, axe 0 across 16 pairs, cls 0, `page.media.kb` 150.85 (the poster and stills; no clip before play). Looked at: 1440 and 390 first screens. **Live, 18 Sep 2026.** Sunny said *deploy the site*. npm still has only 0.1.3 and that build refuses the site (verified on a copy), so the path was: the site repo committed on `snypd/drafts` (`fd9fff3`), main fast-forwarded and both pushed, a production `dist/` built from main with the tree's CLI, and `wrangler deploy` from this box after Sunny's `wrangler login` — version 96e2516f. The host's own build will fail on every push until 0.1.5 is published and the dashboard's build command names it. **Owed:** `home.md` went by file, not through `content.update`, so the footer's claim is one page short until the next MCP write; the monorepo (this doc, `videos/`, docs/11, docs/25) is uncommitted; the README slot (`r0-readme-ground`) and the MP4 upload to GitHub's asset host are his; the loop's use is a separate call.

The measured shape moves §4's seconds: the drop is at 7.6–8.1 s, the break runs from about 22.9 s, the second drop lands near 30–32 s and the last hit near 34–35 s.

---

## 8. On the page

- **The film takes the hero figure. The 50-second real session moves down** to *How things will go. Four lines.*, where it is the proof of the steps beside it. The hero sells, the steps band shows the unedited truth, and the caption under each says which is which.
- **Poster:** beat 03's hit, the sentence over the built page, as WebP at 120 KB or under. It shows a product, where today's poster shows a transcript.
- **Size:** target 4 MB or under at 1080p. Flat grounds and type encode small, and R5 was 7.6 MB for twice the length. Nothing is fetched before play (181), so `page.media.kb` moves only by the poster.
- **Rule 20 will warn on it**, as it does on all three clips today. Whether clips stay in the repo or move to object storage is already Sunny's open call (docs/23 §6.2). The film does not force it.
- **Captions:** `figure` has no `<track>`, and adding one is a renderer change. The film carries its own words on screen, line for line, so it is captioned without one. The `alt` says what happens and the caption links a transcript.
- **Flashing:** a cut per beat at 128 bpm is 2.1 changes a second, under WCAG's three. The seven-look montage alternates light and dark, so it is held inside a window and never flips the full frame. Beat 08 is one flash.
- **The by-product the site has been owed since S32:** bars 5–10 with no sound, 10 s and 1 MB or under, is the hero loop decision 203 budgets. Cut it at F6. Using it is a separate call.

---

## 9. Sunny's calls

1. ~~How is *snypd* said?~~ **Answered 18 Sep 2026: "sny" as in "sky" — it sounds like "sniped". Not "snipped".**
2. ~~Light or dark?~~ **Answered 18 Sep 2026: light.**
3. ~~38 seconds or 30?~~ **Answered 18 Sep 2026: under 45 seconds.** The 20-bar cut with its ring-out is about 39 s; 45 s is the hard ceiling when the storyboard bends to the measured track.
4. ~~Does the film replace the terminal session in the hero (§8)?~~ **Answered 18 Sep 2026: yes, it comes out of the hero.** Assumed, as §8 says: the session moves down to the steps band and is not deleted. Checked with Sunny at F7, on the built page.
5. **Voice:** pick from the three auditions at F2. No answer needed now.
6. ~~The README~~ **Answered 18 Sep 2026: yes, this film takes the README's hero slot too.** One film, both places; the README edit lives on `r0-readme-ground` and Sunny uploads the MP4 to GitHub's asset host himself.

---

## 10. Not in this plan

Square and vertical cuts for social. A `<track>` on `figure`. Any change to the hero's layout. A second language. Retaking the README's other clips.
