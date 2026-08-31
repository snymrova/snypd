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
