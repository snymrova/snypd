/**
 * Prompts (docs/03), S16 — the workflows that make the first hour of snypd feel like a product rather than
 * an API. A prompt is not a tool: it returns the opening turn of a conversation, which the agent then
 * carries out with the tools it already has. So these are written as instructions to the agent, naming the
 * exact resources and calls in the order that works, and saying what to ask the human and when.
 *
 * They are also the honest answer to "there is no UI": onboarding is `get-started`, and the reason the
 * kill test can be eight tool calls is that `write-post` already knows what those eight are. `build-theme`
 * (U6b) is the third, and the one that replaces a directory of themes with a sentence.
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
      { name: "extends", description: "The theme it extends; default `base`, which brings every layout and all 13 primitives", required: false },
    ] },
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
function getStarted(args: Record<string, unknown>): GetPromptResult {
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

1. **Learn the vocabulary first.** Read \`snypd://spec/primitives\`. Thirteen primitives — a post that is only prose is a post that wastes every one of them. Read \`snypd://theme\` for what is installed, and \`snypd://theme/tokens\` for what can be recoloured without writing CSS.
2. **Write one real post.** Not "Hello world" — something true about this site, using at least two primitives. \`content.create\`, then fix whatever the lint it hands back tells you to fix, and repeat until it is clean. The hints are there to be acted on, not relayed to me.
3. **Show me.** \`content.render_preview\` and give me the URL, the markdown twin and the review link. Say plainly that publishing is mine: an agent drafts, a human approves the exact version on that page.
4. **Report**, in one short paragraph: what exists now, what the theme is, and what I should decide next — theme, tokens, or more posts. If \`site.url\` is still a placeholder, say so here and tell me it is needed before anything publishes. Do not ask for it earlier.

---

**C · this is already a site.** Do not initialise and do not write anything yet.

Run \`site\` › doctor and tell me what it found, in plain sentences rather than a dump. Then say what is here — how many items, of which types, on what theme — and ask what I want written. If I have already told you a topic, use the \`write-post\` prompt instead of this one; it is the shorter path for exactly that.`),
  };
}

function writePost(args: Record<string, unknown>): GetPromptResult {
  const topic = arg(args, "topic"), type = arg(args, "type") ?? "post";
  return {
    description: `Write a ${type} that lints clean on the first pass`,
    messages: user(`Write a ${type}${topic ? ` about ${JSON.stringify(topic)}` : ""} for this snypd site.

**Read first, in this order.** \`snypd://spec/primitives\` — the vocabulary, and the whole reason to use this CMS instead of a folder of markdown. \`snypd://types/${type}\` — the frontmatter this type requires. \`content.query\` — what already exists, so you neither duplicate a post nor invent a tag that connects to nothing.

**Then plan the shape before the prose.** For each thing you are going to say, ask which primitive says it: numbers that compare → \`chart\`; a sequence with a decision in it → \`flow\`; parts and how they connect → \`diagram\`; a claim worth pulling out → \`callout\`; questions a reader will actually ask → \`faq\`; the summary they will read instead of the post → \`tldr\`. Prose is what carries the argument between them, not the default for everything.

**Write it.** \`content.create\` with the frontmatter and body. Every taxonomy term you use should be one the site already uses — a tag used once connects nothing, and the lint will say so.

**Fix what the lint returns.** \`content.create\` hands back diagnostics with a fix hint on every one. Act on them yourself rather than reporting them to me; that is what the hints are for. If a rule fights you, say which one and why — that is a real finding about the vocabulary.

**If you were given prose to work from** rather than writing it fresh, call \`content.suggest_blocks\` on it first: it finds the table that is already a chart and the numbered list that is already a flow, and applies the ones you accept.

**Show me the result.** \`content.render_preview\`: the page, the markdown twin, the review URL. Then tell me in two sentences what the post argues and which primitives it uses — and that it is a draft until I approve it.`),
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
function buildTheme(args: Record<string, unknown>): GetPromptResult {
  const look = arg(args, "look"), name = arg(args, "name"), parent = arg(args, "extends") ?? "base";
  return {
    description: `Build a theme${name ? ` called ${name}` : ""} for this site`,
    messages: user(`Build a theme for this snypd site${look ? `. How it should read: ${JSON.stringify(look)}` : ""}. Work through it yourself; stop to ask me only what you cannot know.

**1. Read what a theme already is, before writing one.** \`snypd://theme\` — what is installed and what the active one reads like. \`snypd://theme/coverage\` — the 13 primitives and 5 parts, and which of them the active theme renders itself rather than inheriting. \`snypd://theme/tokens\` — the palette, with a \`kind\` and a description on every entry. \`snypd://theme/variations\` and \`snypd://theme/settings\` if the parent has them.

Two things in there decide most of the work. **A theme is \`theme.yaml\` plus one stylesheet**: every layout and every primitive resolves up \`extends:\`, so you inherit semantic markup with one \`snypd-<name>\` class per block and you style it — you do not rewrite it. And **every value in the stylesheet is a \`var()\`**: a colour typed into \`theme.css\` is a colour no site can ever change, which is the one mistake that cannot be fixed later without breaking somebody's site.

**2. Scaffold it.** \`find_tools\` with "make a new theme" to unlock the \`theme\` tool, then \`theme\` › scaffold with ${name ? `\`name: ${JSON.stringify(name)}\`` : "the name"} and \`extends: ${JSON.stringify(parent)}\`.${name ? "" : " Ask me for the name first if I have not given you one — it is the directory name and renaming it later is a move, not an edit."} It writes \`themes/<name>/\` with a \`theme.yaml\`, a starter \`theme.css\` and a \`package.json\`, and it does **not** switch the site over — do that when there is something to see.

**3. Declare the tokens before writing any CSS.** Redeclare in \`tokens:\` every value the look depends on — colour, type, the measure, the space scale — each with \`customisable: true\`, a \`kind\`, and a one-line \`description\` written for whoever will change it. Colour in \`light-dark()\` pairs, so dark mode costs nothing and is not a second palette to keep in sync; where a value is genuinely derived from another, derive it — \`oklch(from var(--color-bg) calc(l + 0.045) c h)\` is "the background, lifted" and stays true as the background moves, where a second hex is a number somebody has to remember to change.

**4. Write the stylesheet.** One file. Values are \`var(--token-name)\` — a token \`color.bg\` is \`--color-bg\`. Style the block classes the parent emits, not markup you wish it emitted. Zero JavaScript: if a thing you want needs a script, it is not a theme feature.

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
      if (name === "get-started") return getStarted(args);
      if (name === "write-post") return writePost(args);
      if (name === "build-theme") return buildTheme(args);
      const added = await pluginPrompts();
      const p = added.find((x) => x.name === name);
      if (p) return { description: p.description, messages: user(p.render(args)) };
      throw new Error(`unknown prompt "${name}" — this server has: ${[...PROMPTS.map((x) => x.name), ...added.map((x) => x.name)].join(", ")}`);
    },
  };
}
