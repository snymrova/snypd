/**
 * Prompts (docs/03), S16 — the two workflows that make the first hour of snypd feel like a product rather
 * than an API. A prompt is not a tool: it returns the opening turn of a conversation, which the agent then
 * carries out with the tools it already has. So these are written as instructions to the agent, naming the
 * exact resources and calls in the order that works, and saying what to ask the human and when.
 *
 * They are also the honest answer to "there is no UI": onboarding is `get-started`, and the reason the
 * kill test can be eight tool calls is that `write-post` already knows what those eight are.
 */
import type { GetPromptResult, Handlers, Prompt } from "./protocol";

export const PROMPTS: Prompt[] = [
  { name: "get-started",
    description: "Set up a new snypd site here: write snypd.yaml, pick a theme, publish a first post. Start here if snypd://config does not load.",
    arguments: [
      { name: "name", description: "What the site is called", required: false },
      { name: "url", description: "Where it will be served from, e.g. https://example.com", required: false },
    ] },
  { name: "write-post",
    description: "Write a post the way this CMS wants one written: the vocabulary first, prose second, lint clean before a human ever sees it.",
    arguments: [
      { name: "topic", description: "What the post is about", required: false },
      { name: "type", description: "Content type; default `post`", required: false },
    ] },
];

const user = (text: string): GetPromptResult["messages"] => [{ role: "user", content: { type: "text", text } }];

const arg = (args: Record<string, unknown>, k: string): string | undefined => {
  const v = args[k];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
};

function getStarted(args: Record<string, unknown>): GetPromptResult {
  const name = arg(args, "name"), url = arg(args, "url");
  return {
    description: "Set up a new snypd site",
    messages: user(`Set up a snypd site in this repository. Work through it yourself; only stop to ask me the two things you cannot know.

1. **Look before you write.** Read \`snypd://config\`. If it loads, this site already exists — say so, run \`site\` › doctor instead of initialising, and stop.

2. **Ask me for what you cannot infer.** ${name && url ? `I have already told you: name ${JSON.stringify(name)}, url ${JSON.stringify(url)}. Do not ask again.` : `You need${name ? "" : " the site's name,"}${url ? "" : " the URL it will be served from (the feed, sitemap and JSON-LD are all absolute, so this is not optional),"} and one sentence of description. Ask for ${name || url ? "what is missing" : "all three"} in a single message — not one question at a time.`}

3. **Initialise.** Call \`find_tools\` with "set up a new site" to get the \`site\` tool, then \`site\` › init with those values. It writes \`snypd.yaml\` and the content directories. If it says this is not a git repository, tell me — nothing can be versioned or published until it is.

4. **Learn the vocabulary before writing anything.** Read \`snypd://spec/primitives\`. Thirteen primitives; a post that is only prose is a post that wastes them. Read \`snypd://theme\` for what themes are installed and \`snypd://theme/tokens\` for what can be recoloured without writing CSS.

5. **Write one real post.** Not "Hello world" — something true about this site, using at least two primitives. \`content.create\`, then fix whatever the lint it returns tells you to fix. Repeat until it is clean.

6. **Show me.** \`content.render_preview\` and give me the URL, the markdown twin, and the review link. Tell me plainly that publishing is mine to do: an agent drafts, a human approves.

7. **Report.** One short paragraph: what exists now, what the theme is, what I should decide next (theme, tokens, or more posts).`),
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

export function handlers(_root: string): Pick<Handlers, "listPrompts" | "getPrompt"> {
  return {
    async listPrompts() { return PROMPTS; },
    async getPrompt(name, args) {
      if (name === "get-started") return getStarted(args);
      if (name === "write-post") return writePost(args);
      throw new Error(`unknown prompt "${name}" — this server has: ${PROMPTS.map((p) => p.name).join(", ")}`);
    },
  };
}
