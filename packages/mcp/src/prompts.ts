/**
 * Prompts (docs/03), S16 — the workflows that make the first hour of snypd feel like a product rather than
 * an API. A prompt is not a tool: it returns the opening turn of a conversation, which the agent then
 * carries out with the tools it already has. So these are written as instructions to the agent, naming the
 * exact resources and calls in the order that works, and saying what to ask the human and when.
 *
 * They are also the honest answer to "there is no UI": onboarding is `get-started`, and the reason the
 * kill test can be eight tool calls is that `write-post` already knows what those eight are. `build-theme`
 * (U6b) is the third, and the one that replaces a directory of themes with a sentence. `site-basics` (S36)
 * is the fourth: the icon, the not-found page, the share cards — what a WordPress site gets from plugins.
 *
 * **A prompt's text costs nothing until it is asked for.** `prompts/list` carries the names, descriptions
 * and arguments; the body below is returned by `prompts/get` and only to whoever asked. That is what lets
 * this file be long without moving `tokens.learn`.
 */
import type { GetPromptResult, Handlers, Prompt } from "./protocol";

export const PROMPTS: Prompt[] = [
  { name: "get-started",
    description: "Start here on any snypd site you have not written for yet: it reads what this site already is — nothing, a fresh scaffold, or an established site — and takes the right next step from there, ending with a first post online at a URL the host answered with.",
    arguments: [
      { name: "name", description: "What the site is called. Only used if it does not exist yet", required: false },
      { name: "url", description: "Where it will be served from, e.g. https://example.com. Optional — a placeholder is used until publish", required: false },
    ] },
  { name: "write-post",
    description: "Write a post the way this CMS wants one written: the vocabulary first, prose second, lint clean before a human ever sees it.",
    arguments: [
      { name: "topic", description: "What the post is about", required: false },
      { name: "type", description: "Content type; default `post`", required: false },
    ] },
  { name: "build-theme",
    description: "Build a theme for this site from pieces, the way a studio would: a brief, three different directions — each a set of pieces from the shelf, a seeded palette that passes the contrast gate and one face — seen before they go live and photographed at four widths in light and dark, then one contact sheet for you to pick from. Ends with the pick live and your reasons written down.",
    arguments: [
      { name: "look", description: "How it should read — \"a dense reference theme, mono headings\", \"warm, serif, long-form\". The more specific, the fewer rounds", required: false },
      { name: "name", description: "Theme name; lowercase letters, digits and hyphens. Asked for if absent", required: false },
      { name: "extends", description: "The theme every candidate extends. Default: each candidate starts from the shipped theme on pieces nearest its direction — `editorial`, `technical` or `studio`. Any parent brings every layout and all 14 primitives", required: false },
    ] },
  { name: "site-basics",
    description: "Give the site what every good site has and a CMS usually leaves to a plugin: an icon drawn as SVG, a not-found page in the site's own voice, a share card per page in the theme's look, and a description on every page. Run it once a site has content, and again after a theme change.",
    arguments: [] },
];

const user = (text: string): GetPromptResult["messages"] => [{ role: "user", content: { type: "text", text } }];

const arg = (args: Record<string, unknown>, k: string): string | undefined => {
  const v = args[k];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
};

/**
 * The far side of the restart (S18d, docs/08 decision 62).
 *
 * This prompt was written for exactly one state — MCP loaded, no config — which docs/08 §6 shows is the
 * rarest of the seven. Its step 1 said: *if the config loads, this site already exists, run doctor and
 * stop.* Anyone who has run `snypd init` — under docs/08 §2, everyone — has a config that loads and no
 * content at all, so the majority path restarted its harness, ran the onboarding prompt, and was told to
 * stop with an empty site. It branches three ways now, on a read and one `content.query` it was already
 * making: nothing here, a scaffold with no content, or a site with posts in it.
 *
 * The branch is described to the agent rather than resolved here on purpose. A prompt is the opening turn
 * of a conversation, not a tool result: resolving it would mean reading config and index on `prompts/get`,
 * which is a disk read on a path that has never had one, to save a call the agent makes anyway in step 1.
 */
function getStarted(args: Record<string, unknown>, n: Counts): GetPromptResult {
  const name = arg(args, "name"), url = arg(args, "url");
  const told = [name && `name ${JSON.stringify(name)}`, url && `url ${JSON.stringify(url)}`].filter(Boolean).join(", ");
  return {
    description: "Set up a snypd site, write its first post, and put it online",
    messages: user(`Get this snypd site to its first post, and put it online. Work through it yourself; stop to ask me only what you cannot know.

**1. Find out which of three situations you are in.** Read \`snypd://config\`, then call \`content.query\` with no arguments. Those two answers pick the branch, and the rest of this only applies to one of them:

- config does not load → **A**, there is no site here yet.
- config loads, zero items → **B**, the site was scaffolded and nothing has been written. This is the usual one: somebody ran \`snypd init\` and restarted their harness, which is why you are here.
- config loads, items exist → **C**, this is somebody's site.

---

**A · no site here yet.**${told ? ` I have already told you: ${told} — do not ask again.` : ""}

Ask me${told ? " for anything above that is missing, and" : ""} for the site's name and one sentence about it, in a **single** message — not one question at a time. Do **not** ask for the URL: \`site\` › init takes a placeholder, and the first \`site\` › deploy reads the real one back from the host.

Then \`find_tools\` with "set up a new site" to unlock the \`site\` tool, and \`site\` › init with what you have. It writes \`snypd.yaml\`, the content directories and \`.mcp.json\`, and creates the git repository if this directory is empty. Read what it returns — it says what is still unfinished. Then continue at **B**.

---

**B · scaffolded, nothing written yet. Do not run init.** The site exists; initialising over it would fail and asking me to confirm what I already did wastes the turn.

1. **Learn the vocabulary first.** Read \`snypd://spec/primitives\`. ${n.primitives} primitives — a post that is only prose is a post that wastes every one of them. Read \`snypd://theme\` for what is installed, and \`snypd://theme/tokens\` for what can be recoloured without writing CSS.
2. **Write one real post.** Not "Hello world" — something true about this site, using at least two primitives. \`content.create\`, then fix whatever the lint it hands back tells you to fix, and repeat until it is clean. The hints are there to be acted on, not relayed to me.
3. **Show me, then publish it — or hand it to me.** \`content.render_preview\` and give me the URL, the markdown twin and the review link. Then \`content.publish\`. It publishes unless this type's \`mcp.write\` is \`draft\` — then the refusal says so, and you give me the review URL and I approve that exact version there. A placeholder \`site.url\` does not stop a publish; step 4 resolves it. Say which of the two happened.
4. **Put it online.** \`find_tools\` with "put it online" unlocks the \`site\` tool; then \`site\` › deploy, one call. It builds, uploads through the host's own CLI and answers with the URL. Two things it may do on the way, and both are its to do, not yours to prepare for: on a machine the host has never seen it runs \`wrangler login\` and waits for me to click *allow* in the tab that opens — tell me that is what the pause is; and when \`site.url\` is the placeholder it sets it from the host's answer, builds again and uploads again, so the first deploy is two uploads. Do not ask me for a URL, a repository or an account: nothing is needed that the call does not get for itself. If it refuses, read the refusal — every one names its next action — and do that, or relay it to me when the action is mine (\`deploy.push\` is \`human\`; a site that deploys on push, where \`site\` › push is the call instead).
5. **Report**, in one short paragraph: the URL, what exists now, what the theme is, and what I should decide next — theme, tokens, more posts, or backing the repository up on GitHub (say so and it is one call).

---

**C · this is already a site.** Do not initialise and do not write anything yet.

Run \`site\` › doctor and tell me what it found, in plain sentences rather than a dump. Then say what is here — how many items, of which types, on what theme, and whether it is online: doctor's host rows say where it deploys, when it last went up from this machine, and whether \`site.url\` is the address the host answered with. A site that has never been deployed is one \`site\` › deploy from a URL — offer that. Then ask what I want written. If I have already told you a topic, use the \`write-post\` prompt instead of this one; it is the shorter path for exactly that. If doctor's basics rows are unfinished — no icon, no not-found page, no share cards — offer the \`site-basics\` prompt.`),
  };
}

function writePost(args: Record<string, unknown>): GetPromptResult {
  const topic = arg(args, "topic"), type = arg(args, "type") ?? "post";
  return {
    description: `Write a ${type} that lints clean on the first pass`,
    messages: user(`Write a ${type}${topic ? ` about ${JSON.stringify(topic)}` : ""} for this snypd site.

**Read first, in this order.** \`snypd://spec/primitives\` — the vocabulary, and the whole reason to use this CMS instead of a folder of markdown. \`snypd://types/${type}\` — the frontmatter this type requires. \`content.query\` — what already exists, so you neither duplicate a post nor invent a tag that connects to nothing.

**Then plan the shape before the prose.** For each thing you are going to say, ask which primitive says it: numbers that compare → \`chart\`; a sequence with a decision in it → \`flow\`; parts and how they connect → \`diagram\`; a claim worth pulling out → \`callout\`; questions a reader will actually ask → \`faq\`; the summary they will read instead of the post → \`tldr\`. Prose is what carries the argument between them, not the default for everything.

**Then read the sheet of every primitive in the plan** — \`snypd://spec/primitives/<name>\`, one read each, before writing a line of it. The index names them; the sheet is what the lint checks — which props are required, what the body is (a \`flow\` is YAML steps with a \`do:\` each, a \`diagram\` is YAML nodes and edges, a \`stat\` needs a \`source\` that is a URL or a site path), and an example that passes. A first draft written from the index alone fails on exactly those, and every one of those failures is a read you skipped.

**Write it.** \`content.create\` with the frontmatter and body. Every taxonomy term you use should be one the site already uses — a tag used once connects nothing, and the lint will say so.

**Fix what the lint returns.** \`content.create\` hands back diagnostics with a fix hint on every one. Act on them yourself rather than reporting them to me; that is what the hints are for. If a rule fights you, say which one and why — that is a real finding about the vocabulary.

**If you were given prose to work from** rather than writing it fresh, call \`content.suggest_blocks\` on it first: it finds the table that is already a chart and the numbered list that is already a flow, and applies the ones you accept.

**Show me the result, then publish it — or hand it to me.** \`content.render_preview\`: the page, the markdown twin, the review URL. Then \`content.publish\`, unless this type's \`mcp.write\` is \`draft\` — the refusal says so — in which case give me the review URL and I approve that exact version there. Tell me in two sentences what the post argues and which primitives it uses, and which of the two happened. A publish is a commit, not an upload: \`site\` › deploy is what puts the published version online (one call; \`find_tools\` "put it online" unlocks it), or \`site\` › push on a site that deploys on push — do that, and give me the URL. If this site has share cards (\`content/media/cards/\` exists), say that \`snypd cards\` will draw this post's — or run it, if you have a shell — and that the PNG needs committing.`),
  };
}

/**
 * The fourth workflow (S36): the things a site is judged on before anyone reads it — the tab's icon, the
 * page a broken link lands on, the picture a shared link shows, the line under the title in a search
 * result. The build emits every tag for them already; what it cannot do is *make* them, because each is
 * a small act of design in the site's own voice. So this is an agent's job, described precisely enough
 * that the icon is legible at 16 px and the not-found page is not three words and a sad face.
 *
 * Each step checks before it acts, so the prompt is safe to run on a site that has half of these.
 */
function siteBasics(): GetPromptResult {
  return {
    description: "An icon, a not-found page, share cards and descriptions",
    messages: user(`Give this snypd site its basics. Work through each step yourself; stop to ask me only when a step needs a choice only I can make, and say which.

**0. Look at what is there.** Read \`snypd://config\` (\`site.icon\`, \`site.image\`, \`theme.use\`), \`snypd://theme/tokens\` for the colours in use, and call \`content.query\` with no arguments. Note: whether \`site.icon\` is set; whether a \`page\` with slug \`404\` exists; which items have no \`description\`. Skip any step below that is already done well.

**1. The icon — an SVG you draw.** Write \`content/media/icon.svg\`. The rules, because a favicon is read at 16 px:
- \`viewBox="0 0 32 32"\`, square, and nothing outside it. No \`width\`/\`height\` attributes.
- One mark: the site's initial or a glyph drawn from its name or logo — not the whole name. At 16 px a letter is about ten pixels tall.
- Paths, rects and circles only. **No \`<text>\`** (it renders in whatever font the browser has), no \`<image>\`, no external references, no script.
- Strokes and gaps at least 2 units wide at this viewBox; anything thinner disappears on a tab.
- Colours from the theme's tokens, written as hex values (an icon cannot read CSS variables): the text colour for the mark, the accent for one detail if the site's logo has one.
- Readable on both a light and a dark tab: add \`<style>@media (prefers-color-scheme: dark) { … }</style>\` inside the SVG to flip a dark mark light.
- Under 1 KB. Then \`site\` › set_config \`site.icon\` = \`/media/icon.svg\`. The shell links it as \`image/svg+xml\` on every page.

**2. The not-found page.** Every build writes \`/404.html\` — a plain one when the site has none. Replace it with the site's own: \`content.create\` type \`page\`, slug \`404\`, a title in the site's voice (not "404"), and a \`description\`. The body, in three or four short lines: say plainly that nothing lives at this address; offer the two or three places a reader most likely wanted — the front page and the archives the header menu links (\`snypd://nav\` has them); and, if the site has a feed or a start page, that too. No apology paragraph, no joke that needs explaining. It is written to \`/404.html\` as well as \`/404/\`, marked \`noindex\`, and kept out of the sitemap and \`llms.txt\` automatically. Publish it like any page.

**3. Descriptions.** Every item with no \`description\` gets one, through \`content.update\`: 120 to 160 characters, one or two sentences that say what the page gives a reader, in the page's own terms — it is the line under the title in a search result, the text on a share card, and the summary in \`llms.txt\` and the feed. Not a restatement of the title, not "In this post…".

**4. Share cards.** Tell me to run \`snypd cards\` in the site's directory — or run it yourself if you have a shell. It draws a 1200 × 630 card for every page that has no \`cover.image\`, in the active theme (its face, its colours, the theme's \`logo\` setting or the icon), plus \`/favicon.ico\` and \`/apple-touch-icon.png\` from the icon. It needs Chrome on this machine and never on the host: the PNGs are written to \`content/media/cards/\` and \`content/media/icons/\`, and **they have to be committed** for the host to serve them. It redraws only what changed, so run it again after new posts or a theme change. A theme that wants its own card styles \`.snypd-card\`, \`.snypd-card-site\`, \`-eyebrow\`, \`-title\`, \`-description\` and \`-url\` in its stylesheet.

**5. Check.** \`site\` › doctor — the basics rows should all be ✅ — then \`content.render_preview\` on one post and on \`/404\`, and tell me in a few lines what you drew for the icon and what the not-found page says.`),
  };
}

/**
 * The third workflow (docs/10 §5.3, U6b), rewritten as the factory's script (TF6, docs/29 §7.1).
 *
 * It was written after `technical` rather than before it — U6b was the session that found out whether
 * the contract is enough to build a second theme from, and this prompt was that finding written for an
 * agent. What TF1–TF5 added is everything between the brief and the look: a palette solved to its
 * contrast targets rather than guessed (`theme` › seed), a camera that photographs a whole theme in one
 * call (`bench` › shoot), sixteen faces with their licences (the shelf), and a lint that names the six
 * looks every AI-built theme ships (`check theme`). So the prompt is no longer *"write a theme and look
 * at it"*; it is ten steps that end with three rendered candidates on one contact sheet and a human
 * choosing between them (decision 221).
 *
 * Three things in here are load-bearing and none of them is code:
 *
 * - **Three candidates, not one.** A single theme is judged against the agent's own intention, which it
 *   always meets. Three are judged against each other, which is the only comparison that finds the rut.
 * - **The judge never gates** (decision 224, §7.2). It reads the shots against `rubric.md` — inlined
 *   below so a harness with no design skills still gets it — and proposes at most five changes, twice.
 * - **Step 9 stops.** The pick is the owner's, on a picture, and their reasons are written back into the
 *   site's taste log (§7.3) so the next run starts where this one ended.
 *
 * The taste rules are inline rather than behind a skill on purpose: `impeccable` and `frontend-design`
 * are a boost, not a requirement, and most harnesses have neither.
 *
 * W0 (docs/37 §6, 25 Sep 2026): rewritten pieces-first, the interim before kits and `compose`. The trial
 * that asked for it: the old script never named the shelf (step 5 was "one stylesheet per candidate"),
 * so an agent wrote 12 KB of CSS by hand in 48 calls; the one told to use pieces wrote 1.9 KB in 38 and
 * lost on sight to holes in the shelf. So the candidates are now pieces over a shipped parent, seen with
 * `look { name }` before any goes live, fixed by swapping a piece before writing a rule — and step 6 is
 * the layer note, the one thing about how pieces combine that three fix rounds were spent finding.
 */
async function buildTheme(args: Record<string, unknown>, n: Counts): Promise<GetPromptResult> {
  const rubric = await judgeRubric();
  const look = arg(args, "look"), name = arg(args, "name"), parent = arg(args, "extends");
  const stem = name ?? "<name>";
  const cands = ["a", "b", "c"].map((x) => `${stem}-${x}`);
  return {
    description: `Build a theme${name ? ` called ${name}` : ""} for this site from pieces — three candidates, one contact sheet, your pick`,
    messages: user(`Build a theme for this snypd site${look ? `. How it should read: ${JSON.stringify(look)}` : ""}. You will build **three candidates from pieces** and photograph them; I pick one. Work through it yourself and stop to ask me only what you cannot know — and stop at step 8, which is mine.

---

**1. Read, before writing anything.**

- \`snypd://theme/pieces\` — **the shelf.** A theme is assembled from pieces, one per slot (masthead, cover, prose, blocks, entries, home, footer…); each piece is carved from a shipped theme, reads only the contract's tokens, and styles the markup every theme shares. The index is one line per piece; \`snypd://theme/pieces/<slot>\` is the whole of a slot — each piece's line, its switches, the tokens it \`needs:\`, what it pairs with.
- \`snypd://theme\` — what is installed and what each shipped theme reads like; \`snypd://theme/coverage\` — the ${n.primitives} primitives and ${n.parts} parts, and which of this site's types each theme draws. \`snypd://theme/tokens\` only when you retune one.
- **The taste log.** \`DESIGN.md\` at the site root, \`## Taste\`: what this site's owner has already refused or picked *on sight*, in their words, dated. Read it before you have any ideas — a candidate that repeats a refusal is a round wasted.
- **Your own design skills, if your harness has any** (\`impeccable\`, \`frontend-design\`): a boost, not a requirement.

---

**2. The brief.** Fill \`DESIGN.md\` in each candidate's directory once it is scaffolded (step 4 writes it with its questions). **Ask me at most three questions, and only if the use scene, the visitor mode or the references are missing.** The sections that do the work: **Use scene** (who reads, where, in what light — this picks light or dark, the category never does), **Visitor mode** (Read · Persuade · Operate · Experience), **The rut** (the page this category always ships, named so you avoid it), **Boldness goes here** (exactly one place), **Safe / Risk**.

---

**3. Three direction cards, as pieces.** Before any file, write three cards and show me the three lines. A card is: the shipped theme it starts from, **the slots it changes and to which piece**, a seed colour and strategy, a face from the shelf, and the one bold move — a display face set large, a full-bleed cover, a colour that owns the masthead.

- **The anti-sibling test.** Swap the headlines between two cards; if you cannot tell which is which, they are one direction in three coats of paint. Three cards on the same parent with the same slots are one card.
- **Keep off the five clusters:** cream + terracotta; near-black + acid accent; hairline broadsheet; the SaaS-card kit; tracked-caps eyebrow + middot meta + "→" links. A card that lands on one has found the rut.
- **Spend the boldness once.** Everything else takes the pieces as they are, so the one move reads.

---

**4. Scaffold, choose pieces, seed.** \`find_tools\` with "make a new theme" unlocks the \`theme\` tool.

- \`theme\` › scaffold \`${cands.join("`, `")}\`, each ${parent ? `\`extends: ${JSON.stringify(parent)}\`` : "`extends:` the shipped theme its card starts from — `editorial` (reading), `technical` (reference) or `studio` (a portfolio): each is on pieces and declares every token its pieces read"}. The site is not switched. Over a parent on pieces the new \`theme.css\` has no rules; leave it so until step 6.
- **Pieces:** in each \`theme.yaml\`, \`pieces:\` names only the slots the card changes — \`pieces: { home: bands, entries: rows, cover: { use: display } }\` — and every other slot is the parent's. A switch is \`{ use: <piece>, <switch>: <value> }\`. \`snypd check theme <name>\` fails a piece whose tokens the chain does not declare, and lists them.
- \`theme\` › seed once per candidate: \`name\` (the candidate), \`seed\` (the accent, \`oklch(0.55 0.13 252)\` or \`#1f5fbf\`), \`strategy\` (\`restrained\` · \`balanced\` · \`expressive\`), \`scheme\` (\`both\` by default), optional \`ratio\` (\`1.2:1.25\`) and \`base\` (\`17:19\`), and \`face\` — a shelf id, copied into the theme with its licence and a metric-matched fallback; an unknown id is answered with the list. The palette is solved to the contrast targets, so it passes the gate by construction.

---

**5. Look at each — before any CSS.** \`theme\` › look with \`name: "${cands[0]}"\` renders a candidate that is not live, on this site's own pages: facts as text first, one cropped picture, the full page as a link. Look at \`/\` and at the longest page of the site's richest type, at 1280 and 390, one \`slot\` at a time when a slot is the question. **The first fix for anything that looks wrong is another piece in that slot**, or a switch — read \`snypd://theme/pieces/<slot>\` and look again. A rule is the last resort.

---

**6. How pieces combine — read this before writing a rule.** The sheet is five cascade layers, in order: \`snypd.tokens\` < \`snypd.base\` < \`snypd.pieces\` (one sublayer per slot, in the shelf's order) < \`snypd.theme\` (your \`theme.css\`) < \`snypd.site\`. A later layer wins **whatever the specificity**. So:

- A rule in \`theme.css\` beats every piece. \`a { color: … }\` there repaints every piece's link *and* the pill button in \`blocks\`; \`main { width: … }\` undoes the column piece's grid. Scope a rule to the class you mean, and keep the sheet to the one bold move — under 2 KB.
- \`base\`'s behaviour — which of a cover's clip and its still shows, the phone menu's popover, the lightbox — lives in \`snypd.base\`. A \`display:\` of yours on those classes overrides it both ways.
- A piece's \`needs:\` are tokens beyond the contract, with the value it was carved at; redeclare one in \`tokens:\` to move it. Values are always \`var(--token-name)\` — a colour typed into \`theme.css\` is one no site can change.
- \`snypd check theme <name>\` names every rule of yours that takes over a piece (\`pieces.residue\`). **Never fork a layout**; a part only when the markup, not the styling, is wrong.

---

**7. Shoot the three, then the gates.** \`bench\` › shoot with \`themes: ${JSON.stringify(cands)}\` photographs every candidate on the site's routes at four widths, light and dark, into one sheet per route; **read the PNGs**, side by side. Then per candidate:

- \`snypd check theme <name>\` — **a fail blocks.** Every colour pair on every look, the pieces' tokens, the residue.
- \`bench\` › run \`suite: "page"\`, \`themes: ["<name>"]\` — **a fail blocks.** This site's pages under that theme: zero JavaScript, zero axe violations, no layout shift, the font budget.
- **Taste lint warns** (\`gradient-text\`, \`overused-font\`, \`eyebrow\`, \`measure\`, \`flat-hierarchy\`, …): fix it, or name it in that theme's \`## Chosen\` with the reason the brief overrides it.

One fix round — a piece first, a rule second — re-look, and at most one more. Then one critique round, **advisory, and it never gates**: the contact sheet against this rubric, as somebody who did not build it.

${rubric}

---

**8. Hand it to me, and stop.** Send me \`shots/contact.html\` with **one line per candidate**: its pieces, where its boldness went, and the one thing you are unsure about; then what the gates said, a line each. **Wait.** Do not pick. Do not polish a favourite while you wait — the choice is mine, on a picture (decision 221).

---

**9. Polish the pick, then report.** Once I have picked and said why:

- Delete the two losers, and rename the pick to \`${stem}\` (directory, \`theme.yaml\` \`theme:\`, \`package.json\`).
- Apply what I asked for and nothing I did not. A thing I liked in a loser comes over as its **piece** where it is one — demoted so the pick keeps one bold place.
- Write my reasons, in my words and dated, into that theme's \`DESIGN.md\` \`## Decisions\` and the site's root \`DESIGN.md\` \`## Taste\` — what was *refused* as well as what was picked; the next run reads it in step 1.
- Re-run both gates, and \`theme\` › set it live.
- Report in one short paragraph: what it reads like, its pieces, the rules of its own and why, what a site can change without CSS — and the line \`snypd check theme\` ends on.`),
  };
}

/**
 * A plugin's prompts (P4, tier 4), named `<plugin>.<name>` so nothing a plugin declares can shadow the
 * two above. Resolved once per session and only when asked: `prompts/list` is not on the `initialize`
 * path, so this costs a config read on a call a client makes once — and nothing at all on a site whose
 * plugins do not speak.
 */
/**
 * The vocabulary's size, read from the spec and the renderer rather than typed into the text (docs/29 TF1):
 * "Thirteen" outlived the fourteenth primitive by a release. Imported on `prompts/get`, never on `initialize`.
 */
/**
 * The judge's rubric (TF6, docs/29 §7.2) — a document rather than a string literal, because it is edited
 * by eye and read by a human as often as by a model. Inlined into `build-theme`'s step 8 at `prompts/get`
 * and never on `initialize`, the same rule the counts follow.
 */
let rubricText: Promise<string> | undefined;
// Demoted a level on the way in: the file is a document with an h1, and the prompt it lands in is a
// numbered script whose steps are bold lines, not headings.
const judgeRubric = (): Promise<string> => (rubricText ??= import("./rubric.md", { with: { type: "text" } }).then((m) => m.default.replace(/^#/gm, "###").trim()));
interface Counts { primitives: number; parts: number }
let counted: Promise<Counts> | undefined;
export const counts = (): Promise<Counts> => (counted ??= Promise.all([import("@snypd/spec"), import("@snypd/render")])
  .then(([spec, render]) => ({ primitives: spec.primitiveNames().length, parts: render.PART_NAMES.length })));

type PromptSets = Awaited<ReturnType<typeof import("@snypd/core").loadPluginPrompts>>["sets"];

export function handlers(root: string): Pick<Handlers, "listPrompts" | "getPrompt"> {
  // Session-scoped, not module-scoped: one process can serve two roots, and neither may see the other's
  // plugins — the same rule `find_tools`'s unlocked set follows (tools.ts).
  let speaking: Promise<PromptSets> | undefined;
  const pluginPrompts = async (): Promise<PromptSets> => (speaking ??= (async () => {
    try {
      const c = await import("@snypd/core");
      const cfg = c.loadConfig(root);
      if (!cfg.plugins.some((p) => p.loaded && p.prompts)) return [];
      return (await c.loadPluginPrompts(root, cfg)).sets;
    } catch { return []; }   // a config that does not load is every other surface's error to report, not this one's
  })());
  return {
    async listPrompts() {
      const added = await pluginPrompts();
      if (!added.length) return PROMPTS;
      return [...PROMPTS, ...added.map((p) => ({ name: p.name, description: `${p.description} (from the \`${p.plugin}\` plugin)`, arguments: p.arguments }))];
    },
    async getPrompt(name, args) {
      if (name === "get-started") return getStarted(args, await counts());
      if (name === "write-post") return writePost(args);
      if (name === "build-theme") return await buildTheme(args, await counts());
      if (name === "site-basics") return siteBasics();
      const added = await pluginPrompts();
      const p = added.find((x) => x.name === name);
      if (p) return { description: p.description, messages: user(p.render(args)) };
      throw new Error(`unknown prompt "${name}" — this server has: ${[...PROMPTS.map((x) => x.name), ...added.map((x) => x.name)].join(", ")}`);
    },
  };
}
