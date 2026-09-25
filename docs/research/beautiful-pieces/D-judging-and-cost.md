# D · Evaluation and efficiency for the pieces path

Research stream D for docs/37, 25 Sep 2026. It covers four questions: (1) machine judgement of design quality usable as a gate or ranker, (2) how to make an agent design loop cheap, (3) retrieving a piece or kit from a brief, and (4) capturing Sunny's taste from board picks. It ends with recommendations (a) a gate stack, (b) the cheapest loop with a token budget, and (c) a tagging schema.

The anchor is docs/37 §1: the trial's pieces agent used 127k tokens and 38 calls and lost on sight. The loser was **flat**: one narrow column, headings in the body face a size up, pictures at column width, a third of the 1280 screen empty. The winner (hand-written CSS, 172k tokens, 48 calls) had a display face, photographs breaking out of the column, a centred measure and dated rows. The target is ≤ 50k tokens, ≤ 15 calls, ≤ 5 images, and a page that looks beautiful.

---

## 1. Automated judgement of design quality

### 1.1 What exists, and what each one actually catches

| Work | What it is | Numbers | Runs locally? | Use for snypd |
|---|---|---|---|---|
| **UIClip** (Wu et al., UIST '24) — [arXiv:2404.12500](https://arxiv.org/abs/2404.12500), weights [biglab/uiclip_jitteredwebsites-2-224-paraphrased_webpairs_humanpairs](https://huggingface.co/biglab/uiclip_jitteredwebsites-2-224-paraphrased_webpairs_humanpairs) | CLIP ViT-B/32 (151M params) fine-tuned on 2.3M synthetic "jittered" web pages plus 892 designer-rated pairs (BetterApp). Score = image·text similarity with the prefix `"ui screenshot. well-designed. <description>"` | Pairwise accuracy on held-out designer pairs: **73.9 %** (75.1 % web-only variant), against **GPT-4V 51.6 %** and LLaVA-1.6-13B 54.6 %. Inter-designer α = 0.37 | **Yes.** It is about 600 MB and runs on CPU in tens of ms per image. Input is 224 px, so it sees gestalt only | A **ranker, not a gate**. It is trained on jitter defects (bad spacing, clashing colour, misalignment), so it catches *broken*, not *flat*. Use it to order board cells and to flag regressions in CI (a piece change that drops the specimen's score) |
| **UICrit** (Duan et al., UIST '24) — [arXiv:2407.08850](https://arxiv.org/abs/2407.08850) | 3,059 critiques with bounding boxes and quality ratings on 983 mobile UIs from 7 designers | Few-shot plus visual prompting gave a **55 % gain** in LLM critique quality | Dataset only | Few-shot exemplars if a VLM critic is ever used |
| **Duan et al., CHI '24** — "Generating Automatic Feedback on UI Mockups with LLMs", [arXiv:2403.13139](https://arxiv.org/abs/2403.13139) | GPT-4 heuristic evaluation in a Figma plugin (Nielsen, CrowdCrit visual principles, grouping guidelines) | 51 UIs, 12 designers. Useful for "subtle errors, text, UI semantics", but **"feedback also decreased in utility over iterations"** | API | This is evidence against long critique loops: repeated critique rounds bring diminishing returns |
| **Duan et al., iterative visual prompting** — [arXiv:2412.16829](https://arxiv.org/abs/2412.16829) | Critiques with bounding boxes, refined iteratively by the LLM | Closes **50 %** of the gap to human critique quality | API | Critique grounded in regions matches `look`'s crop-per-slot idea |
| **ArtifactsBench** (Tencent, 2025) — [arXiv:2507.04952](https://arxiv.org/abs/2507.04952), [code](https://github.com/Tencent-Hunyuan/ArtifactsBenchmark) | 1,825 tasks. The harness renders each artifact, interacts with it, and takes **3 screenshots over time**. An MLLM judge (Gemini-2.5-Pro; Qwen2.5-VL-72B as the open option) scores against a **per-task checklist of atomic checks** | **94.4 % ranking consistency with WebDev Arena**, > 90 % pairwise agreement with human experts. Generalist models beat code-specialists | Qwen2.5-VL-72B needs a big GPU; not on this box | The method to copy is **checklist-guided judging**: atomic yes/no checks derived from the brief, not a free 1–10 score |
| **Design2Code** — [arXiv:2403.03163](https://arxiv.org/abs/2403.03163) | 484 real pages; metrics are CLIP similarity plus block-match, text, position and colour of matched blocks | Models lag mainly on layout and element recall | Yes (metrics) | Only for *reference* comparison, i.e. carve zero-diff. Not for taste, because there is no reference |
| **WebGen-Bench** — [arXiv:2505.03733](https://arxiv.org/abs/2505.03733) / **WebGen-Agent** — [arXiv:2509.22644](https://arxiv.org/abs/2509.22644) | Sites built from scratch. A GUI agent tests function and a VLM gives a 1–5 appearance score. WebGen-Agent feeds screenshot scores back and uses **backtracking + select-best** | Claude-3.5-Sonnet accuracy **26.4 → 51.9 %**, appearance **3.0 → 3.9** with the visual-feedback loop plus select-best | API | Selection among candidates is where the gain came from (see §2.4) |
| **WebGen-V** — [arXiv:2510.15306](https://arxiv.org/abs/2510.15306) | Judges each **section** from its own screenshot, not the whole page | — | — | Supports judging **per slot crop**, which is also cheaper in pixels |
| **DesignBench** — [arXiv:2506.06251](https://arxiv.org/abs/2506.06251) | Generate / edit / **repair** across React, Vue, Angular and vanilla | — | — | Repair is a real task; `check`'s fix loop is one |
| **FrontendBench** — [arXiv:2506.13832](https://arxiv.org/abs/2506.13832) | 148 prompt+test pairs with automatic evaluation | **90.54 %** agreement with experts | — | Functional, not aesthetic |
| **UI-Bench** — [arXiv:2508.20410](https://arxiv.org/abs/2508.20410) | 10 text-to-app tools, 30 prompts, 300 sites, **4,000+ expert pairwise judgements** fitted with a **TrueSkill-style** model | Leaderboard at uibench.ai | — | Shows that the gold standard for design quality is still *human pairwise* judgement, aggregated with a rating model |
| **WebDev Arena** (LMArena) — [blog](https://arena.ai/blog/webdev-arena) | Two apps side by side, humans vote, **Bradley-Terry** scores | 18 % of votes are "both bad", mostly from broken builds; 26 % ties. Website design is 15.3 % of prompts. Unconstrained output beat structured output by +13 to +89 points | — | The first thing that wins is *it works*; then visual polish decides |
| **DesignRepair** (ICSE '25) — [arXiv:2411.01606](https://arxiv.org/abs/2411.01606) | Two streams: code plus the rendered page (Playwright), checked against a Material Design knowledge base, then RAG repair | Better guideline adherence and accessibility | Partly (the Playwright analysis) | The *rendered-page* stream is what `check` already is. Extend it with the design lints in §5a |
| **AesEval-Bench** (ICLR '26) — [arXiv:2603.01083](https://arxiv.org/abs/2603.01083) | Graphic-design aesthetics: 4 dimensions, 12 indicators, tasks for judgement, region selection and localisation | Clear gaps for every VLM, including reasoning ones | — | VLMs are weakest exactly where taste lives |
| **PRISM** — [arXiv:2606.00592](https://arxiv.org/abs/2606.00592) | Principle-by-principle evaluation (readability, contrast, alignment, overlap, coherence): lightweight scorers, then a tuned VLM, then prompt reasoning | 100k training samples from Crello | Scorer tier yes | The same **tiered** shape recommended in §5a: cheap measurable principles first, a VLM only for what is left |
| **MLLM as a UI Judge** — [arXiv:2510.08783](https://arxiv.org/abs/2510.08783) | GPT-4o, Claude and Llama against crowd ratings on 30 UIs | "approximate human preferences on some dimensions but diverge on others" | — | Do not gate on a VLM's absolute score |

### 1.2 Classical computational aesthetics (deterministic, local, cheap)

- **Reinecke et al., CHI '13** — "Predicting users' first impressions of website aesthetics with a quantification of perceived visual complexity and colorfulness" ([ACM](https://dl.acm.org/doi/10.1145/2470654.2481281)). 450 sites, 548 raters. Models of **colourfulness** and **visual complexity**, together with demographics, explain about **half the variance** of 500 ms appeal ratings. Appeal is inverted-U in complexity and depends on the viewer's colourfulness preference. Colourfulness uses the Hasler–Süsstrunk formula (about 10 lines of numpy). Complexity uses counts of text and image areas plus a quadtree decomposition.
- **Miniukovich & De Angeli, CHI '15** — "Computation of Interface Aesthetics" ([ACM](https://dl.acm.org/doi/10.1145/2702123.2702575)). Eight metrics: visual clutter, colour range, dominant colours, figure–ground contrast, contour congestion, **symmetry**, **grid quality**, **white space**. They explain up to **49 %** of webpage aesthetics variance (32 % for apps).
- **Aalto Interface Metrics (AIM)** — [github.com/aalto-ui/aim](https://github.com/aalto-ui/aim), MIT licence, Python. Implements about 17 of these (clutter, symmetry, contour congestion, figure–ground contrast, grid quality, colour variability, white space…) from a screenshot. It can run in CI on the stills.
- **Lavie & Tractinsky 2004** ([PDF](https://www.ise.bgu.ac.il/faculty/noam/papers/04_tl_nt_ijhcs.pdf)). Perceived web aesthetics has two factors. **Classical**: clean, clear, pleasant, symmetrical. **Expressive**: original, sophisticated, fascinating, creative, special effects. This matters for snypd because **B's page was classical-only**. Contrast, overlap, axe and CLS all measure classical order. Nothing in today's gates rewards *expressive* moves, so an agent optimising against the gates converges on flat. The gate stack needs at least one expressive signal, or kits must supply expressiveness by construction.

### 1.3 How VLM judges fail: pairwise vs absolute, and known biases

- **Pairwise aligns best with humans, absolute scoring diverges.** MLLM-as-a-Judge ([arXiv:2402.04788](https://arxiv.org/abs/2402.04788)): MLLMs show "remarkable human-like discernment in Pair Comparison" but "significant divergence … in Scoring Evaluation and Batch Ranking".
- **Pairwise is less stable under distraction.** "Pairwise or Pointwise?" ([arXiv:2504.14716](https://arxiv.org/abs/2504.14716)): pairwise preferences **flip in ~35 %** of cases under distractors, against **9 %** for absolute scores. Another study ([arXiv:2606.13685](https://arxiv.org/abs/2606.13685)) finds mean flip rates of 13.6 %, with 28 % of items above 20 %. The fix is to run both orders and count only consistent verdicts.
- **Position bias.** LLaVA copies the order `ABCD` in 88 % of batch rankings (2402.04788). WiserUI-Bench finds UI preference prediction still position-sensitive. Randomise cell order on boards shown to any model.
- **Verbosity bias.** GPT-4V and Gemini give +0.6 and +0.75 for longer text (2402.04788). The visual analogue is **busier pages look "more designed" to a judge**, so a judge will push against "calm".
- **Self-preference and family bias** ([arXiv:2604.11589](https://arxiv.org/abs/2604.11589)). The agent that composed the theme should not be its own gate.
- **Pattern-completion bias** ([arXiv:2608.03691](https://arxiv.org/abs/2608.03691)). MLLMs favour pattern-consistent over correct output. It is harmless here but explains why agents repeat the kit they saw first.
- **Designers disagree too.** Among professionals, α = 0.25 in DesignPref ([arXiv:2511.20513](https://arxiv.org/abs/2511.20513)) and α = 0.37 in UIClip. A universal beauty gate cannot exist. *Personal* rankers are the productive direction (§4).

**Conclusion for §1.** Deterministic metrics catch *broken* and *unbalanced*. A small learned model (UIClip) ranks *better/worse* at about 74 % pairwise on its own domain. VLM judges are useful only pairwise, order-swapped and checklist-driven, and never as the builder's own gate. None of them reliably catches *flat but correct*. That needs either explicit structural lints (display face present, width variety, fold usage) or kits that are expressive by construction.

---

## 2. Making the agent design loop cheap

### 2.1 Image tokens: the real numbers (Claude, Sep 2026)

From the [vision docs](https://platform.claude.com/docs/en/build-with-claude/vision):

- **Cost = ⌈w/28⌉ × ⌈h/28⌉ visual tokens** (28 px patches). The older rule of thumb, `w·h/750`, gives nearly the same numbers.
- **Claude 4.7 and later (so Opus 5.5)**: long edge ≤ **2576 px**, ≤ **4784 tokens**, then downscaled. Older models: 1568 px / 1568 tokens. The high-resolution tier can cost "up to roughly three times" more for the same image.
- **Bytes do not matter; pixels do.** WebP quality changes request size and latency, not tokens.
- A **tall full-page screenshot is capped and silently shrunk**. A 1280×6000 page is scaled to about 549×2576 (≈ 1,840 tokens) and body text becomes illegible. Crops beat full pages.
- A request with more than 20 images forces every image to ≤ 2000 px.
- Adding images invalidates the cache from the messages level onward, but only after the point where the image is added. Earlier turns stay cached.

| Image | Tokens |
|---|---|
| 390×844 phone viewport | **434** |
| 640×400 (a 1280 page at ½ scale, one board cell) | **345** |
| 1280×800 desktop viewport | **1,334** |
| 1568×880 board or contact sheet | **1,792** |
| 1600×1000 tour sheet | **2,088** |
| 1920×1080 | **2,691** |
| 2576×1449 (cap) | **4,784** |
| 224×224 (what UIClip sees) | 64 |

**So one contact sheet is always cheaper than N images.** A 2×2 board of ½-scale front pages (1280×800 total) costs 1,334 tokens. Four separate 1280 viewports cost 5,336. A ½-scale layout is legible for **structure and look**: column, fold, image breakout, display face. It is not legible for 16 px body copy, which the agent does not need to read.

### 2.2 Turns are the cost, and they grow quadratically

Every call re-sends the whole conversation, so cumulative input ≈ Σ context at each turn ≈ n × average context. Trial B, with 38 calls and a context growing to ~127k, processed roughly **2.4M input tokens** in total. A 12-call run ending at 40k processes about **0.3M**. Halving calls cuts cost by about 4× because context also stays shorter.

Prompt caching softens but does not remove this ([prompt caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)):

- **Opus 5.5**: base $4/MTok, 5-minute write $5 (1.25×), 1-hour write $8 (2×), **read $0.20 (0.05×)**. Minimum cacheable prefix is 512 tokens. Up to 4 breakpoints, and automatic caching moves the breakpoint forward.
- The lookback window is **20 blocks**. A run of consecutive tool_use or tool_result blocks counts as 1.
- **Any change to tool definitions invalidates everything.** snypd's `tools/list` must be **byte-stable** across a session: no timestamps, no per-site dynamic descriptions, stable ordering. Per MEMORY, `tools/list` is about 67k per session and unmeasured. If a client loads it eagerly, that one item exceeds the whole 50k target. Defer it (`find_tools` exists) or cut the surface to ~3 tools.
- The TTL runs from the start of each request. Long human pauses (Sunny's board sitting) will expire a 5-minute cache, so use 1-hour TTL where the client allows it.

### 2.3 What Anthropic's engineering guidance says, with numbers

- **Writing effective tools for agents** ([post](https://www.anthropic.com/engineering/writing-tools-for-agents)):
  - Consolidate: use `schedule_event` instead of list_users + list_events + create_event.
  - Offer a `response_format` of `concise` or `detailed`: **72 vs 206 tokens** in the Slack example.
  - Claude Code truncates tool results at **25k tokens**.
  - Return semantic names, not IDs. Namespace tools.
  - Iterate on tools with evals.
- **Effective context engineering** ([post](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)):
  - Aim for "the smallest possible set of high-signal tokens".
  - Retrieve just in time via lightweight identifiers (paths, links). Context rot means recall degrades with length.
  - Clear tool results as the lightest form of compaction.
  - Sub-agents return 1–2k-token summaries.
- **Code execution with MCP** ([post](https://www.anthropic.com/engineering/code-execution-with-mcp)):
  - Progressive disclosure of tool definitions plus filtering data before it reaches the model: **150,000 → 2,000 tokens (−98.7 %)**.
  - "The agent sees five rows instead of 10,000."
- **Advanced tool use** ([post](https://www.anthropic.com/engineering/advanced-tool-use)):
  - The Tool Search Tool cut ~72k of upfront tool definitions to ~8.7k (**−85 %**) and raised MCP-eval accuracy (Opus 4: 49 → 74 %).
  - **Programmatic tool calling**: average −37 % tokens (43,588 → 27,297), and "eliminates 19+ inference passes" when 20 calls run in one code block.
  - Tool-use examples improved parameter accuracy from **72 → 90 %**. This bears directly on `seed`'s argument names, which were "found by trial" in docs/37 §1.
- **MCP 2025-06-18** ([spec summary](https://forgecode.dev/blog/mcp-spec-updates/)):
  - `resource_link` content lets a tool point at a URI without inlining it. Stills cost nothing until opened.
  - `structuredContent` plus `outputSchema` provide typed facts. Put gate results there and keep `content` text to a ~150-token summary.

**The same lesson from every source:** move loops *into the server*. The agent should make one decision per call, and the server should do the N renders, N gate runs and ranking in between. This is the programmatic-tool-calling idea applied at the MCP layer.

### 2.4 Best-of-N then judge, or iterate?

- **WebGen-Agent** ([2509.22644](https://arxiv.org/abs/2509.22644)): screenshot feedback plus **backtracking and select-best** doubled Claude-3.5's accuracy and raised appearance from 3.0 to 3.9.
- **Iterative Agent Decoding** ([2504.01931](https://arxiv.org/abs/2504.01931)): combining iterate-and-select beats plain best-of-N by **3–6 points** on Sketch2Code.
- **Duan CHI '24**: critique utility **decreases over iterations**.
- **"Vibe design agents"** ([2609.15078](https://arxiv.org/abs/2609.15078)): separating **spec sampling** (theme or style choice, with typicality scores) from **realisation** increased coverage and variation without destabilising generation, across 1,255 pairs per temperature and 300k online tasks.

**For snypd:** breadth first, in *one* call and *one* image. Render N candidates (kits, or a kit with one slot varied) server-side, pre-rank them with cheap metrics, and show them as one board. The agent picks. Then allow at most 1–2 targeted refinement rounds, because gains fall with each round. This is best-of-N whose "judge" is the agent looking once, while the server's metrics veto the broken candidates. It maps exactly onto docs/37 §5–6 (board, compose, tour).

---

## 3. Retrieving a design from a brief, with few tokens

### 3.1 The research

- **Luminate** (Suh et al., CHI '24) — [arXiv:2310.12953](https://arxiv.org/abs/2310.12953). The LLM first generates **dimensions** of the design space (each with values), then generates responses tagged by those dimensions. Users explore by filtering and sorting on dimensions. Users converge less early.
- **DesignWeaver** (CHI '25) — [arXiv:2502.09867](https://arxiv.org/abs/2502.09867). **Dimensional scaffolding**: dimensions (geometry, style, colour, material) are extracted from images the user curates into a "dimension palette" of toggles. Experts steer with **visual references, not written descriptions**. Novices (N=52) wrote longer prompts with more domain vocabulary and got more diverse designs.
- **GenQuery** (CHI '24) — [arXiv:2310.01287](https://arxiv.org/abs/2310.01287). Abstract intent is turned into concrete search directions. Designers generatively edit an image and search by similarity. N=16 felt they expressed intent more accurately.
- **LEGOUI** — [arXiv:2608.04293](https://arxiv.org/abs/2608.04293). UI built from **DSL bricks in staged steps** (requirements → dimensions → composition). Requirement capture was above 95 % accurate on 40 prompts. Users reported more control than with one-shot generation. This is close to snypd's slots and pieces and supports "decide per slot, staged".
- **Lavie & Tractinsky**: classical vs expressive (§1.2). **Osgood's semantic differential** gives three universal axes: evaluation, **potency** (strong–weak) and **activity** (calm–lively). Potency and activity make good, brief-independent mood axes.

### 3.2 What practitioners ship

- **ui-ux-pro-max** skill ([github](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)):
  - A CSV database of styles (79 searchable, 50 active), 192 palettes, 74 font pairings and 34 landing patterns, with **BM25 search** over `keywords`, `mood` and `best-for` columns.
  - 192 "industry reasoning rules" map a product type to style, palette, type mood and anti-patterns.
  - It is a CLI script the agent calls, so only matched rows enter context.
  - **No embeddings**: keyword and BM25 retrieval is enough at hundreds of rows.
- **Refero Styles** ([styles.refero.design](https://styles.refero.design/)): references extracted from real sites, searchable by **brand, mood (minimal, editorial, playful, high-contrast), colour, typography, URL**. Each ships a **DESIGN.md** (colours, type scale, spacing, components) for agents. The Refero library tags by **page type × UX pattern × UI element**, plus fonts and industry.
- **Style tiles** (Samantha Warren, [styletil.es](https://styletil.es/)): approve the *visual language* (fonts, colours, interface elements) before any layout, "like paint chips". A kit's still is a style tile for a whole site.

### 3.3 What this means at snypd's scale

The shelf will hold about 50 pieces and 5–10 kits. At that size **retrieval is reading**. A kits table with 6 short tag columns is about 700 tokens, and the agent (an LLM) maps the brief to it better than cosine similarity would. Embeddings pay off only past a few hundred items or for image-by-example search (GenQuery-style: "make it like this URL"). What *does* pay off:

1. **Fixed ordinal axes** on every kit and piece, so the brief → axes → nearest-kit step is mechanical. The agent writes `{calm:2, classical:1, density:-1, voice:serif}` and `compose` or `kits?near=` sorts. That is one call and no image.
2. **A `words:` field** for BM25-style matching of brief adjectives ("paper", "notebook", "architect", "ledger"), as in ui-ux-pro-max.
3. **Anti-tags / `avoid:`** from Sunny's park reasons, e.g. `bands: avoid [calm]`. In the trial, B had to *discover* that `bands` was "the loud agency look the brief was running from". A tag would have said so in 10 tokens.

---

## 4. Capturing Sunny's taste

### 4.1 How design teams run approval

- **GV Design Sprint "sticky decision"** ([Design Sprint Kit](https://designsprintkit.withgoogle.com/methodology/phase4-decide/heatmap-voting), [GV Library](https://library.gv.com/sprint-week-wednesday-900fe3f2c26e)): art museum (everything taped up side by side), silent **heat map** (dots on the *parts* you like), speed critique, **straw poll** (one dot each), then the **Decider's supervote**. For snypd, Sunny is the Decider. The heat map is the useful part: it records *which region* earned the vote, not only which cell.
- **Style tiles**: settle the visual language before layouts. For snypd, approve kits' palette and face pairing on one sheet, separately from slot layout boards.

### 4.2 Few-shot preference learning

- **DesignPref** — [arXiv:2511.20513](https://arxiv.org/abs/2511.20513):
  - 12k pairwise UI comparisons from 20 professional designers, α = 0.25.
  - **Personalised models beat majority-vote aggregate models using 20× fewer examples.** About 5 % of the data per designer (~600 pairs spread across 20 people, i.e. dozens per person) suffices. RAG with the designer's own annotations also works.
- **Efficient Personalization of Generative UIs** — [arXiv:2604.09876](https://arxiv.org/abs/2604.09876):
  - 20 people, 600 pairs, α = 0.25.
  - A **few pairwise judgements weight prior users' preference models** instead of fitting from scratch.
  - It beat pretrained UI evaluators and larger MLLMs offline. In the online study, 12 new users preferred it to shared guidelines and to *their own written preferences*. So picks beat self-description.
- **Linear probes on VLM features** — [arXiv:2604.11374](https://arxiv.org/abs/2604.11374). For personalised aesthetics, **linear regression on VLM hidden states beats few-shot prompting and fine-tuning**. PIAA work routinely uses **10-shot and 100-shot** settings ([2607.15752](https://arxiv.org/abs/2607.15752)).
- **Bradley-Terry with active pairing** — Maystre & Grossglauser, "Just Sort It!" ICML '17 ([arXiv:1502.05556](https://arxiv.org/abs/1502.05556)). With adaptive pairs, **O(n log n)** comparisons recover a BT ranking. Random pairs need Ω(n²). Pairing uncertain items speeds convergence. Arena (BT) and UI-Bench (TrueSkill) use the same machinery.

### 4.3 Could Sunny's board picks train a ranker? Yes, if it is small

- **Features:** for each board cell, a 512-d UIClip or CLIP image embedding, plus about 20 interpretable features (the §5a metrics and tag axes).
- **Model:** logistic or BT regression on *feature differences* of pairs, with L2 regularisation. Start with interpretable features only, because 50 picks cannot fit 512 dimensions. Add the embedding once there are about 150 picks.
- **Data per sitting:** a W4 board sitting covers about 10 slots × 3–4 variants × 3 token sets. If each row yields one "best" pick plus approve/park, that is about 30–60 pairwise facts per hour. By DesignPref's numbers, **2–3 sittings** give a personal ranker that beats any generic judge *for Sunny*.
- **What it is for:** ordering boards so the likely-best cell comes first, pre-filtering the agent's candidates, and choosing which pairs to show Sunny next (active learning). It must never auto-approve (decision 278 stands).
- **Explainable by construction:** the weights on interpretable features read as "Sunny likes display faces (+), dislikes full-bleed bands on calm briefs (−)". Those weights can be written back into the kits' `line:` guidance and the prompt's *how pieces combine* note.

---

## 5. Recommendations for snypd

### (a) A piece-quality gate stack beyond contrast and overlap

There are four tiers. Each runs only if the tier below it passed. **Hard gates** are deterministic. **Soft signals** rank and warn but never block.

| Tier | Where | Signal | Kind | Catches |
|---|---|---|---|---|
| **T0 (have)** | `check`, CI pairs | contrast, overlap, overflow, axe, CLS | hard | broken |
| **T1 structure lints** (new, DOM plus computed style, ~ms each, in `look` facts) | `look`, `check`, CI | **Type contrast**: the h1 face differs from body, *or* h1/body ≥ 2.0 and h2/body ≥ 1.4. This catches B's "headings the body face a size up"<br>**Measure**: prose 45–85 ch<br>**Fold use at 1280**: content bounding box ≥ 55 % of viewport width *or* intentionally centred (\|left − right margin\| < 5 %). This catches B's "a third of the screen empty, column set left"<br>**Width variety** on long pages: ≥ 2 distinct block widths in `main` when the page has figures (the breakout)<br>**Families** ≤ 3, weights ≤ 4<br>**Spacing from the scale**: ≥ 90 % of margins and gaps equal a `space.*` token<br>**Tap targets** ≥ 24 px at 390<br>**Rhythm**: distinct heading sizes ≤ 5 | hard for measure, families and tap targets; soft for the rest | flat and sloppy |
| **T2 computational aesthetics** (screenshot, numpy or AIM, ~100 ms) | stills in CI, `look` facts | **Colourfulness** (Hasler–Süsstrunk), **visual complexity** (quadtree), **white-space %**, **symmetry / balance** (centre of visual mass offset), **grid quality** (alignment-line count), dominant colours | soft. Checked against the kit's tags: a `calm` kit with colourfulness above its band gets a warning | off-mood, cluttered, lopsided |
| **T3 learned ranker** (UIClip locally, then Sunny's personal BT model) | board ordering, CI regression | UIClip score on slot crops and ½-scale fronts. A delta of −x after a piece change raises a flag. Later, Sunny's ranker score | soft, rank only | "worse than before", "not Sunny" |
| **T4 VLM checklist judge** (offline, W7 and nightly, never inside the build agent) | trial benchmark | Pairwise A vs B, **both orders**, counted only when consistent. **Atomic checklist** from the brief ("serif display face? paper-toned? reading first? figures wider than text?") in ArtifactsBench style. A different model family from the builder. Cheap model (Haiku-class) on ½-scale sheets | report | brief-fit and "which is better", as a second opinion to Sunny |
| **T5 Sunny** | board sitting | approve/park, heat-map dots, best-of-row | the gate (decision 278) | taste |

Emit T1 and T2 as **text facts first** in `look` (structuredContent), for example `type: body-face heads ×1.2 → FLAT; fold: 62 % used, left-set; widths: 1`. The agent then often does not need to *see* the problem, and a text fact costs about 30 tokens against about 1,300 for an image. Each T1 lint turns something the trial found only by eye into text.

### (b) The cheapest agent loop, with a token budget

Principles:
- 3 tools: `theme`, `look`, and one resource read. Everything else is deferred.
- Every server response is facts first, image last.
- Every image is a **sheet**.
- N candidates are rendered inside one call.
- The tool list is byte-stable so the prefix stays cached.
- `response_format: concise` is the default.

| # | Call | Returns | Image px → tokens | Context added (in + out, incl. the agent's reasoning ~300–600) |
|---|---|---|---|---|
| 0 | (prefix) system + **deferred** snypd tools (`theme`, `look`, `find_tools` only) + short prompt | — | — | **~8–10k** fixed. Must be measured; if `tools/list` loads eagerly (~67k) the budget is gone |
| 1 | `read snypd://theme/kits` (with axis columns, §c) | ~700-token table; stills as `resource_link` | 0 | **~1.2k** |
| 2 | `theme › compose { kits: [notebook, reference, folio], preview: "board" }`. The server renders the site's own front page × 3 kits, runs T0–T2 on each, and orders them by T3 | facts per candidate (~80 tokens each) + **one** 1568×880 sheet | 1,792 | **~2.8k** |
| 3 | `theme › compose { kit: notebook, change: { home: split }, name }`, which writes theme.yaml. A `vary: home` option returns a 3-variant home board in the same call | ~300 facts + one 1568×880 sheet | 1,792 | **~2.6k** |
| 4 | `look { theme, tour: true }`: /, a list and a feature page at 1280 (½ scale) + 390, as one sheet | ~250 facts (T0–T2, coverage "work × 6 → feature: facts") + 1600×1000 | 2,088 | **~3.0k** |
| 5–6 | ≤ 2 fix rounds: `compose { change }` returning **only the changed slot's crop** at 1280 and 390 (~800×500 → ~520 tokens), or text facts alone if a lint was the issue | facts + small crop | ≤ 2 × 520 | **~2 × 1.5k = 3k** |
| 7 | optional `theme › rule` (one bold rule, ≤ 400 B CSS), answered with facts + crop | | 520 | **~1.2k** |
| 8 | `theme › set { check: true }` (check folded into set; it refuses on a T0/T1 hard fail) | ~150 facts | 0 | **~0.5k** |
| | **Total** | 8 calls (limit 10) | **4 sheets + ≤ 3 crops ≈ 7–8k image tokens** | **~22k on top of the prefix → final context ~30–32k; cumulative input ≈ 8 × ~22k ≈ 0.18M (mostly 0.05× cache reads)** |

This leaves about 18k of headroom under 50k and is roughly 13× cheaper in cumulative input than trial B. The largest savings, in order:

1. N candidates per call with a board: removes about 20 calls.
2. Facts-first lints: removes "look again to find what's wrong" rounds.
3. `look { theme }` without going live: removes set/unset churn.
4. Deferred tools and a stable prefix.
5. Crops instead of full sheets on fix rounds.

Keep "≤ 5 images" as the gate and count a sheet as one image.

### (c) A tagging schema for pieces and kits

Authored fields are few and ordinal. Computed fields are written by `pieces stills` and CI. The kits resource shows axes as columns so the agent picks by reading.

```yaml
# piece.yaml — additions (authored)
piece: home/index
line: The front page is the ruled list — a line of intro above.       # have
axes:                     # −2 … +2, same five on every piece and kit
  energy: -2              # calm ↔ loud        (Osgood activity)
  weight: -1              # light ↔ heavy      (Osgood potency: rule weight, type weight, solid fills)
  expressive: 0           # classical ↔ expressive (Lavie & Tractinsky)
  density: 1              # airy ↔ dense       (items per 1280 viewport)
  imagery: -2             # text-led ↔ image-led
voice: [serif, sans]      # faces it is proven with: serif | sans | mono | display
fits: [post, log, work]   # content types / route kinds it serves well
words: [index, ledger, notebook, archive, ruled, dated]   # 4–8, BM25 matching of briefs
avoid: []                 # brief words it must not be offered for, e.g. bands: [calm, reading]
refs:                     # have (docs/37 §3·2)
  - { url: …, took: "date in the margin" }
pairs: …                  # have
# computed — written by stills/CI, never by hand
metrics: { colourfulness: 11.2, whitespace: 0.58, complexity: 0.31, uiclip: 0.27 }
approved: { by: sunny, on: 2026-10-02, board: b-0412 }
taste: { bt: 1.34, n: 18 }      # Sunny's ranker score, number of comparisons
```

```yaml
# kits/notebook.yaml — additions
axes: { energy: -2, weight: -1, expressive: 0, density: 0, imagery: 0 }
voice: serif-display
for: [portfolio, studio, journal]           # site kinds
words: [paper, architect, notebook, calm, reading, serif]
avoid: [loud, agency, dashboard]
```

How it is used:
- `snypd://theme/kits` renders **one line per kit**: `notebook · calm·light·classical·mid·balanced · serif-display · paper, architect, notebook · "An architect's notebook…"`. That is about 60 tokens per kit, so 10 kits cost about 600.
- `compose { near: { energy: -2, voice: serif } }` or `{ brief: "…" }` does server-side BM25 over `words` and `line`, filters `avoid`, then takes the nearest axes. It returns the top 3 already on one board (step 2 of (b)).
- On the board, **park reasons become `avoid:` words**, and picks update `taste`.
- The axes are the ranker's interpretable features, so Sunny's learned weights read in these words.

**Sizes to hold to:**
- The kits index ≤ 700 tokens and the per-slot index ≤ 400, with stills always as `resource_link`.
- Stills: `still-1280.webp` at 640×400 (345 tokens) and `still-390.webp` at 195×422 (≈ 112 tokens), so opening one is nearly free.

---

## Sources (primary)

UIClip [2404.12500](https://arxiv.org/abs/2404.12500) · UICrit [2407.08850](https://arxiv.org/abs/2407.08850) · Duan CHI '24 [2403.13139](https://arxiv.org/abs/2403.13139) · Duan visual prompting [2412.16829](https://arxiv.org/abs/2412.16829) · ArtifactsBench [2507.04952](https://arxiv.org/abs/2507.04952) · Design2Code [2403.03163](https://arxiv.org/abs/2403.03163) · WebGen-Bench [2505.03733](https://arxiv.org/abs/2505.03733) · WebGen-Agent [2509.22644](https://arxiv.org/abs/2509.22644) · WebGen-V [2510.15306](https://arxiv.org/abs/2510.15306) · DesignBench [2506.06251](https://arxiv.org/abs/2506.06251) · FrontendBench [2506.13832](https://arxiv.org/abs/2506.13832) · UI-Bench [2508.20410](https://arxiv.org/abs/2508.20410) · WebDev Arena [blog](https://arena.ai/blog/webdev-arena) · DesignRepair [2411.01606](https://arxiv.org/abs/2411.01606) · AesEval-Bench [2603.01083](https://arxiv.org/abs/2603.01083) · PRISM [2606.00592](https://arxiv.org/abs/2606.00592) · MLLM as UI Judge [2510.08783](https://arxiv.org/abs/2510.08783) · MLLM-as-a-Judge [2402.04788](https://arxiv.org/abs/2402.04788) · Pairwise or Pointwise [2504.14716](https://arxiv.org/abs/2504.14716) · Coin Flip Judge [2606.13685](https://arxiv.org/abs/2606.13685) · Model preference bias [2604.11589](https://arxiv.org/abs/2604.11589) · Pattern over Pixels [2608.03691](https://arxiv.org/abs/2608.03691) · Reinecke CHI '13 [ACM](https://dl.acm.org/doi/10.1145/2470654.2481281) · Miniukovich CHI '15 [ACM](https://dl.acm.org/doi/10.1145/2702123.2702575) · AIM [github](https://github.com/aalto-ui/aim) · Lavie & Tractinsky [PDF](https://www.ise.bgu.ac.il/faculty/noam/papers/04_tl_nt_ijhcs.pdf) · Claude vision [docs](https://platform.claude.com/docs/en/build-with-claude/vision) · Prompt caching [docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) · Writing tools for agents [post](https://www.anthropic.com/engineering/writing-tools-for-agents) · Context engineering [post](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) · Code execution with MCP [post](https://www.anthropic.com/engineering/code-execution-with-mcp) · Advanced tool use [post](https://www.anthropic.com/engineering/advanced-tool-use) · MCP 2025-06-18 [summary](https://forgecode.dev/blog/mcp-spec-updates/) · IAD [2504.01931](https://arxiv.org/abs/2504.01931) · Vibe design agents [2609.15078](https://arxiv.org/abs/2609.15078) · Luminate [2310.12953](https://arxiv.org/abs/2310.12953) · DesignWeaver [2502.09867](https://arxiv.org/abs/2502.09867) · GenQuery [2310.01287](https://arxiv.org/abs/2310.01287) · LEGOUI [2608.04293](https://arxiv.org/abs/2608.04293) · ui-ux-pro-max [github](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) · Refero Styles [site](https://styles.refero.design/) · Style Tiles [styletil.es](https://styletil.es/) · GV sprint heat map [kit](https://designsprintkit.withgoogle.com/methodology/phase4-decide/heatmap-voting) · DesignPref [2511.20513](https://arxiv.org/abs/2511.20513) · GenUI personalization [2604.09876](https://arxiv.org/abs/2604.09876) · PIAA linear probe [2604.11374](https://arxiv.org/abs/2604.11374) · PreferMerge [2607.15752](https://arxiv.org/abs/2607.15752) · Just Sort It [1502.05556](https://arxiv.org/abs/1502.05556)

*Caveats: the numbers for papers published in 2026 come from abstracts (WebFetch summaries), not full-text reads. The 67k `tools/list` figure is from MEMORY and has not been re-measured. The budget table is an estimate to verify in W7.*
