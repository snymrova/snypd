/**
 * The reference route through the surface (docs/07 S17, D1).
 *
 * This is one careful agent's path, written by hand and checked in — not a recording, and not the
 * shortest path that happens to work. Two things it deliberately does *not* do, because a real agent
 * would not either: it does not apply a suggestion it has not read first when that suggestion has an
 * unmet need (there is no id to `fill` until something returns one), and it does not publish without
 * a human, because that refusal is the product's safety claim and skipping it would test nothing.
 *
 * What the human does is done here over HTTP, against the review page the agent's own
 * `content.render_preview` started. That is exactly the interaction — a person opens a URL and presses
 * a button — and it is deliberately *outside* the tool-call budget: approving is not something the
 * agent can spend calls on.
 *
 * Read the phases as the scoring boundaries they are. D1's "≤ 8 tool calls to a lint-clean draft"
 * is a sentence about one draft, so `write` is the phase that carries that budget; the rest of the run
 * is measured and reported next to it, because "the surface works but takes 16 calls" is the finding
 * this test exists to surface, not something to hide by choosing a friendlier denominator.
 */
import type { Session } from "./session";
import { NEW_POST, THEME, UPGRADES } from "./scenario";

export type Phase = "upgrade" | "theme" | "write" | "publish" | "build";

export interface Driver {
  readonly name: string;
  run(s: Session, ctx: DriverContext): Promise<void>;
}

export interface DriverContext {
  /** Mark where one phase ends and the next begins; the report slices `session.turns` on these. */
  phase(p: Phase): void;
  /** Stand in for the person at the review page: POST the approve form the preview server serves. */
  approve(previewUrl: string, type: string, slug: string): Promise<void>;
}

/** The one fact the prose could not supply: a chart's `source=`. A real agent would ask or cite; we cite. */
const SOURCE = "https://kill.snypd.rocks/bench";

/** Parse `1. lines 11–16  →  \`chart\`` out of what `suggest_blocks` prints, the way an agent reads it. */
const firstId = (text: string): string => text.match(/^(\d+)\.\s+lines/m)?.[1] ?? "1";

/** Parse `snypd://theme/tokens` — a YAML map under `tokens:`; the names are the two-space keys. */
const tokenNames = (yaml: string): string[] =>
  yaml.split("\n").flatMap((l) => l.match(/^ {2}([A-Za-z][\w.-]*):\s*$/)?.[1] ?? []);

/** A value per token we might pick. Kept away from the call so the retune is legible next to the read. */
const RETUNE: Record<string, string> = { "color.accent": "#2f5d62", default: "1.6" };

const BODY = `:::tldr
Four plain posts, three primitives they were already shaped as, one theme swap and two tokens — all of it through the MCP, none of it in an editor.
:::

The point of this post is that it was written the same way the other three were upgraded: from a harness, over a socket, with no editor open at any point.

:::chart{type="bar" source="${SOURCE}" caption="Tool calls per phase of the kill test" unit="calls"}
- { label: Upgrade three posts, value: 5 }
- { label: Swap theme and tokens, value: 3 }
- { label: Write this post, value: 2 }
- { label: Publish everything, value: 5 }
:::

Every bar above is a call an agent had to spend. The interesting one is the last: publishing is four items plus the preview server, and none of it can be shortened by being cleverer, because a human has to look at each one.

:::flow{caption="What the harness does, and where the person is."}
steps:
  - Suggest blocks on a plain post
  - ask: Does the suggestion need a fact the prose lacks?
    yes: { then: fill }
    no: Apply it straight away
  - id: fill
    do: Supply the source and apply
  - Swap the theme and retune two tokens
  - Write this post
  - Human approves each item on the review page
  - Publish
:::

The branch in the middle is the whole cost of the upgrade phase. A suggestion with nothing missing is one call; a suggestion that needs a \`source=\` is two, because the id to fill against does not exist until something has returned it.`;

export const scripted: Driver = {
  name: "scripted",

  async run(s, ctx) {
    // What a fresh session reads before doing anything. Reads, not calls — docs/07 decision 38.
    await s.listTools();
    await s.read("snypd://config");
    await s.read("snypd://spec/primitives");

    // ── upgrade: three plain posts become three primitives ──────────────────
    ctx.phase("upgrade");
    for (const u of UPGRADES) {
      const seen = await s.call("content.suggest_blocks", { type: "post", slug: u.slug });
      const text = seen.content.map((c) => c.text).join("\n");
      const id = firstId(text);
      // The need is named in the suggestion, so the fill is written against what came back rather than
      // against a table in this file. A detector that starts asking for something else still passes.
      const fill: Record<string, Record<string, string>> = {};
      if (/needs source/.test(text)) fill[id] = { source: SOURCE };
      if (/needs caption/.test(text)) fill[id] = { ...fill[id], caption: `${u.why}, drawn` };
      await s.call("content.suggest_blocks", {
        type: "post", slug: u.slug, apply: [id],
        ...(Object.keys(fill).length ? { fill } : {}),
      });
    }

    // ── theme: the half of the test that is not content ─────────────────────
    ctx.phase("theme");
    await s.call("find_tools", { query: "change the theme and its colours" });
    await s.call("theme", { action: "set", name: THEME.to });
    // Read the knobs before turning them. This is free (a resource, decision 38) and it is what a real
    // agent does; the first version of this driver invented `size.measure`, the whole batch was refused
    // as one bad key, and nothing was retuned — a failure the goal checks only caught once they stopped
    // counting the theme's own token *declarations* as overrides.
    const declared = tokenNames(await s.read("snypd://theme/tokens"));
    const pick = [declared.find((t) => t === "color.accent") ?? declared[0], declared.find((t) => !t.startsWith("color.")) ?? declared[1]]
      .filter((t): t is string => !!t);
    if (pick.length < THEME.tokensChanged) throw new Error(`theme ${THEME.to} declares too few tokens to retune (${declared.length})`);
    await s.call("theme", { action: "set_tokens", tokens: Object.fromEntries(pick.map((t) => [t, RETUNE[t] ?? RETUNE.default!])) });

    // ── write: nothing → a lint-clean draft. This is the phase D1 budgets. ──
    ctx.phase("write");
    await s.call("content.create", {
      type: "post", slug: NEW_POST.slug,
      frontmatter: { title: "The kill test, run on itself", date: "2026-04-23", tags: ["benchmarks"], description: "Three plain posts upgraded, a theme swapped and a post written, without an editor." },
      body: BODY,
    });
    await s.call("content.lint", { type: "post", slug: NEW_POST.slug });

    // ── publish: the agent asks, a person decides, the agent merges ─────────
    ctx.phase("publish");
    const slugs = [...UPGRADES.map((u) => u.slug), NEW_POST.slug];
    const prev = await s.call("content.render_preview", { type: "post", slug: slugs[0]! });
    const url = (prev.content.map((c) => c.text).join("\n").match(/https?:\/\/[^\s)]+/) ?? [])[0];
    if (!url) throw new Error("render_preview returned no URL to approve on");
    const origin = new URL(url).origin;
    for (const slug of slugs) await ctx.approve(origin, "post", slug);
    for (const slug of slugs) await s.call("content.publish", { type: "post", slug });

    // ── build: published words are not a site until they render ─────────────
    ctx.phase("build");
    await s.call("site", { action: "build" });
  },
};
