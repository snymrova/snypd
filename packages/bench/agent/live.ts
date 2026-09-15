/**
 * The kill test with a model at the keyboard (docs/07 S21, D1's "3 models").
 *
 * The scripted driver is one careful agent's route, written down. This one hands the same task to a
 * live model in the words a person would use and records whatever route it takes. `scenario.ts` scores
 * the site both leave behind, so the two are comparable on the numbers that matter and *not* on the
 * transcript — a model that skips `find_tools` because it guessed the tool name is not wrong, and one
 * that lints twice is not wrong either; it is measured.
 *
 * Phases are what `run.ts` slices the cost on, and the scripted driver marks them itself. A model does
 * not, so they are read off the calls: `suggest_blocks` is the upgrade, `theme` is the theme, a write to
 * anything that is not one of the three posts is the write, previews and publishes are the publish, the
 * build is the build. A call that says nothing about where it belongs (`find_tools`, a `content.query`)
 * is charged to the phase of the next call that does, which is where the scripted route puts its own
 * `find_tools`. A model may interleave — lint the new post after publishing an old one — and the marks
 * follow it; `run.ts` adds the pieces up by name. `agent.calls.draft` is therefore *every* call that
 * touched the new post until the run ended, fixes included, which is D1's "nothing → a lint-clean
 * draft" with the fixes counted, as it should be.
 *
 * Under decision 80 the corpus's posts publish without an approval, so the person at the review page
 * is not in this route: the scripted driver still presses the button because it was written when a
 * button was required, and it costs no call. A model that renders a preview anyway has read the tool's
 * description and done what it said; that is a call, and it is counted.
 */
import { claude, type Model } from "./claude";
import { NEW_POST, UPGRADES } from "./scenario";
import type { Driver, Phase } from "./scripted";
import type { Turn } from "./session";

/** D1's task, in the words a person would use — and no more of the route than a person would give. */
export const KILL_PROMPT = `This is a snypd site. Its MCP server is the only tool you have; do everything through it, and stop when the site has been built.

1. The three posts under content/posts are plain prose, and each one is already shaped like one of this CMS's block primitives. Run content.suggest_blocks on each and apply what it finds. If a suggestion needs a fact the prose does not carry — a chart's source — cite https://kill.snypd.rocks/bench.
2. Switch the site's theme to editorial, then change two of its tokens to values of your choosing.
3. Write a new post with the slug the-kill-test about this exercise itself: three plain posts upgraded, a theme swapped, a post written, none of it in an editor. It must carry a chart block and a flow block, and it must lint clean.
4. Publish all four posts.
5. Build the site.

Do not ask me anything; make reasonable choices and keep going.`;

const upgraded = new Set<string>(UPGRADES.map((u) => u.slug));

/** Where a call belongs, or nothing when the call does not say. */
export function phaseOf(t: Turn): Phase | undefined {
  if (t.kind !== "call" || !t.name) return undefined;
  const a = (t.args ?? {}) as Record<string, unknown>;
  const slug = typeof a.slug === "string" ? a.slug : undefined;
  switch (t.name) {
    case "content.suggest_blocks": return "upgrade";
    case "theme": return "theme";
    case "content.create": case "content.update": return slug && upgraded.has(slug) ? "upgrade" : "write";
    case "content.lint": return slug && upgraded.has(slug) ? "upgrade" : "write";
    case "content.render_preview": case "content.publish": case "content.set_status": return "publish";
    case "site": return a.action === "build" ? "build" : undefined;
    default: return undefined;
  }
}

/** Each turn's phase, with the ones that said nothing charged to the next one that did. */
export function phasesFor(turns: Turn[]): (Phase | undefined)[] {
  const own = turns.map(phaseOf);
  const out: (Phase | undefined)[] = new Array(turns.length);
  let next: Phase | undefined;
  for (let i = turns.length - 1; i >= 0; i--) { if (own[i]) next = own[i]; out[i] = own[i] ?? next; }
  // Trailing calls after the last classified one take the last phase seen; leading reads take the first.
  let last: Phase | undefined;
  for (let i = 0; i < out.length; i++) { if (out[i]) last = out[i]; else out[i] = last; }
  return out;
}

export interface LiveDriver extends Driver {
  /** Filled in by `run`, read by the report: what the model's own context paid. */
  usage?: import("./claude").ClaudeUsage;
  ended?: string;
  closing?: string;
}

/** A driver named for the model it runs: `claude:haiku`, `claude:sonnet`, `claude:opus`. */
export function live(model: Model, opts: { maxTurns?: number; maxBudgetUsd?: number; onLine?: (l: string) => void } = {}): LiveDriver {
  const d: LiveDriver = {
    name: `claude:${model}`,
    async run(s, ctx) {
      // The scripted session's opening reads are the model's to make or skip; the harness makes none.
      const r = await claude({ model, root: s.root, prompt: KILL_PROMPT, maxTurns: opts.maxTurns ?? 60, maxBudgetUsd: opts.maxBudgetUsd ?? 10, onLine: opts.onLine });
      d.usage = r.usage; d.ended = r.ended; d.closing = r.text;
      const phases = phasesFor(r.turns);
      let current: Phase | undefined;
      r.turns.forEach((t, i) => {
        const p = phases[i];
        if (p && p !== current) { ctx.phase(p); current = p; }
        s.turns.push({ ...t, n: s.turns.length + 1 });
      });
    },
  };
  return d;
}
