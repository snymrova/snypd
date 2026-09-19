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
    description: "Start here on any snypd site you have not written for yet: it reads what this site already is — nothing, a fresh scaffold, or an established site — and takes the right next step from there, ending in a first post with a review URL.",
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
    description: "Build a theme for this site: scaffold from an existing one, retune the tokens, override a part if the markup needs it, and look at the result at a phone width and a desktop one before calling it done.",
    arguments: [
      { name: "look", description: "How it should read — \"a dense reference theme, mono headings\", \"warm, serif, long-form\". The more specific, the fewer rounds", required: false },
      { name: "name", description: "Theme name; lowercase letters, digits and hyphens. Asked for if absent", required: false },
      { name: "extends", description: "The theme it extends; default `base`, which brings every layout and all 14 primitives", required: false },
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
    description: "Set up a snypd site and write its first post",
    messages: user(`Get this snypd site to its first post. Work through it yourself; stop to ask me only what you cannot know.

**1. Find out which of three situations you are in.** Read \`snypd://config\`, then call \`content.query\` with no arguments. Those two answers pick the branch, and the rest of this only applies to one of them:

- config does not load → **A**, there is no site here yet.
- config loads, zero items → **B**, the site was scaffolded and nothing has been written. This is the usual one: somebody ran \`snypd init\` and restarted their harness, which is why you are here.
- config loads, items exist → **C**, this is somebody's site.

---

**A · no site here yet.**${told ? ` I have already told you: ${told} — do not ask again.` : ""}

Ask me${told ? " for anything above that is missing, and" : ""} for the site's name and one sentence about it, in a **single** message — not one question at a time. Do **not** ask for the URL: \`site\` › init takes a placeholder and the real origin is only needed at publish, which is a long way from here.

Then \`find_tools\` with "set up a new site" to unlock the \`site\` tool, and \`site\` › init with what you have. It writes \`snypd.yaml\`, the content directories and \`.mcp.json\`, and creates the git repository if this directory is empty. Read what it returns — it says what is still unfinished. Then continue at **B**.

---

**B · scaffolded, nothing written yet. Do not run init.** The site exists; initialising over it would fail and asking me to confirm what I already did wastes the turn.

1. **Learn the vocabulary first.** Read \`snypd://spec/primitives\`. ${n.primitives} primitives — a post that is only prose is a post that wastes every one of them. Read \`snypd://theme\` for what is installed, and \`snypd://theme/tokens\` for what can be recoloured without writing CSS.
2. **Write one real post.** Not "Hello world" — something true about this site, using at least two primitives. \`content.create\`, then fix whatever the lint it hands back tells you to fix, and repeat until it is clean. The hints are there to be acted on, not relayed to me.
3. **Show me, then publish it — or hand it to me.** \`content.render_preview\` and give me the URL, the markdown twin and the review link. Then \`content.publish\`. It publishes unless this type's \`mcp.write\` is \`draft\` — then the refusal says so, and you give me the review URL and I approve that exact version there — or unless \`site.url\` is still a placeholder, which is step 4's to report. Say which of the three happened.
4. **Report**, in one short paragraph: what exists now, what the theme is, and what I should decide next — theme, tokens, or more posts. If \`site.url\` is still a placeholder, say so here and tell me it is needed before anything publishes. Do not ask for it earlier.

---

**C · this is already a site.** Do not initialise and do not write anything yet.

Run \`site\` › doctor and tell me what it found, in plain sentences rather than a dump. Then say what is here — how many items, of which types, on what theme — and ask what I want written. If I have already told you a topic, use the \`write-post\` prompt instead of this one; it is the shorter path for exactly that. If doctor's basics rows are unfinished — no icon, no not-found page, no share cards — offer the \`site-basics\` prompt.`),
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

**Show me the result, then publish it — or hand it to me.** \`content.render_preview\`: the page, the markdown twin, the review URL. Then \`content.publish\`, unless this type's \`mcp.write\` is \`draft\` — the refusal says so — in which case give me the review URL and I approve that exact version there. Tell me in two sentences what the post argues and which primitives it uses, and which of the two happened. If this site has share cards (\`content/media/cards/\` exists), say that \`snypd cards\` will draw this post's — or run it, if you have a shell — and that the PNG needs committing.`),
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
 * The third workflow (docs/10 §5.3, U6b) — *"ask your agent for a theme"*, which is the sentence that
 * replaces a theme directory.
 *
 * It is written after `technical` rather than before it, and that is deliberate: U6b was the session that
 * found out whether the contract is enough to build a second theme from, and this prompt is that finding
 * written for an agent. Every step below is a step that session actually took, in the order it took them,
 * including the two it got wrong — the contents list that has to come from `page.headings` rather than
 * from a second pass over the markdown, and the responsive table trick that costs the table its role.
 *
 * The one instruction with teeth is the last one: **look at it**. A theme is the only thing in this
 * product whose defects are invisible to every other gate — the build is green, the lint is clean, the
 * tokens validate, and the masthead still wraps into three lines on a phone with a slash stranded at the
 * start of one of them. `technical` shipped three fixes that came from nothing but a screenshot.
 */
function buildTheme(args: Record<string, unknown>, n: Counts): GetPromptResult {
  const look = arg(args, "look"), name = arg(args, "name"), parent = arg(args, "extends") ?? "base";
  return {
    description: `Build a theme${name ? ` called ${name}` : ""} for this site`,
    messages: user(`Build a theme for this snypd site${look ? `. How it should read: ${JSON.stringify(look)}` : ""}. Work through it yourself; stop to ask me only what you cannot know.

**1. Read what a theme already is, before writing one.** \`snypd://theme\` — what is installed and what the active one reads like. \`snypd://theme/coverage\` — the ${n.primitives} primitives and ${n.parts} parts, and which of them the active theme renders itself rather than inheriting. \`snypd://theme/tokens\` — the palette, with a \`kind\` and a description on every entry. \`snypd://theme/variations\` and \`snypd://theme/settings\` if the parent has them.

Two things in there decide most of the work. **A theme is \`theme.yaml\` plus one stylesheet**: every layout and every primitive resolves up \`extends:\`, so you inherit semantic markup with one \`snypd-<name>\` class per block and you style it — you do not rewrite it. And **every value in the stylesheet is a \`var()\`**: a colour typed into \`theme.css\` is a colour no site can ever change, which is the one mistake that cannot be fixed later without breaking somebody's site.

**2. Scaffold it.** \`find_tools\` with "make a new theme" to unlock the \`theme\` tool, then \`theme\` › scaffold with ${name ? `\`name: ${JSON.stringify(name)}\`` : "the name"} and \`extends: ${JSON.stringify(parent)}\`.${name ? "" : " Ask me for the name first if I have not given you one — it is the directory name and renaming it later is a move, not an edit."} It writes \`themes/<name>/\` with a \`theme.yaml\`, a starter \`theme.css\` and a \`package.json\`, and it does **not** switch the site over — do that when there is something to see.

**3. Declare the tokens before writing any CSS.** Redeclare in \`tokens:\` every value the look depends on — colour, type, the measure, the space scale — each with \`customisable: true\`, a \`kind\`, and a one-line \`description\` written for whoever will change it. Colour in \`light-dark()\` pairs, so dark mode costs nothing and is not a second palette to keep in sync; where a value is genuinely derived from another, derive it — \`oklch(from var(--color-bg) calc(l + 0.045) c h)\` is "the background, lifted" and stays true as the background moves, where a second hex is a number somebody has to remember to change.

**4. Write the stylesheet.** One file. Values are \`var(--token-name)\` — a token \`color.bg\` is \`--color-bg\`. Style the block classes the parent emits, not markup you wish it emitted. Zero JavaScript: if a thing you want needs a script, it is not a theme feature — and most of what a script used to do, the markup already does: the header menu is a \`popover\` behind \`.snypd-menu-button\` on a phone, every \`figure\` opens in a \`<dialog>\` (\`.snypd-lightbox\`, its \`::backdrop\` is yours to paint), an \`faq\` is one \`<details>\` per question (\`.snypd-faq-item\`, animate \`::details-content\`), a footnote's text sits beside its mark in \`.snypd-fn-card\` (a hover card by default; a sidenote in the margin if your column leaves one), and a title carries the same \`view-transition-name\` on the list and on the post, so \`@view-transition { navigation: auto }\` morphs one into the other. \`base\`'s own sheet makes all of that *work*; yours says what it looks like. The rule for anything newer than Baseline: two engines → under \`@supports\` and never for something the reader needs; one engine → only where the fallback is nothing happening. \`snypd check theme\` names every use outside a guard.

**5. Override a part only when the markup, not the styling, is wrong.** \`parts: { header: ./parts/header.tsx }\` in \`theme.yaml\` replaces one file and keeps the other four. **Never fork a layout.** A layout is the markup contract; a copy of it drifts from the original the first time the original changes, and \`snypd://theme/coverage\` is where somebody will see that you did.

**6. Let the site choose the things that are not colour.** \`settings:\` declares what a site may set without writing CSS — a logo, a date format, a link list — and a part reads it with \`settingText\` / \`settingFlag\` / \`settingLinks\`. \`variations:\` ships named complete looks over your own tokens, which is the cheapest breadth there is: two variations is two screenshots and about thirty lines.

**7. Look at it. This is the step that finds the bugs.** Switch the site over with \`theme\` › set, then \`content.render_preview\` on a post that uses several primitives **and** on one that is only prose, and open both at a phone width and a desktop one, in light and in dark. Check specifically: does anything scroll sideways; does the masthead still read when it wraps; is any text at all below 4.5:1 against what is behind it; does a heading in a wide face still fit. Then, if you have a shell: **\`snypd check theme <name>\`** answers most of that list by rule and prints the number for every colour pair on every look you shipped — including the ones you did not open — and \`snypd bench page\` is the other half, where zero JavaScript, zero axe violations and no layout shift are gates rather than aspirations. Neither replaces looking: the three defects that made \`technical\` worth shipping were all invisible to both.

**8. Report** in one short paragraph: what it reads like, which parts you overrode and why, what a site can now change without CSS, and anything you wanted and did not build. Say which of those you looked at yourself, and paste the one line \`snypd check theme\` ends on — a theme is not finished while any rule is still red, and the \`personality:\` sentence is one of them.`),
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
      if (name === "build-theme") return buildTheme(args, await counts());
      if (name === "site-basics") return siteBasics();
      const added = await pluginPrompts();
      const p = added.find((x) => x.name === name);
      if (p) return { description: p.description, messages: user(p.render(args)) };
      throw new Error(`unknown prompt "${name}" — this server has: ${[...PROMPTS.map((x) => x.name), ...added.map((x) => x.name)].join(", ")}`);
    },
  };
}
