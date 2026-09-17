/**
 * `snypd bench agent` — the kill test, run and scored (docs/07 D1).
 *
 * The run happens in a throwaway copy of `corpora/kill` that is made into its own git repository, for
 * the reason git.ts's header gives: a site is git-backed only when it *is* the top level, so a corpus
 * left in place would exercise none of the draft-branch path, and one that failed to become its own
 * repo would commit the whole snypd tree. `initRepo` refuses that; this just gives it somewhere safe.
 *
 * Three numbers come out, and they are deliberately not one number:
 *  - `agent.calls.draft` — nothing → a lint-clean draft of the new post. **Gated at 8**, which is D1's
 *    sentence taken literally: it is about one draft.
 *  - `agent.calls` — the whole kill test. Reported with a budget set from the reference route, so a
 *    surface that gets *less* smooth shows up as a breach even though D1 never named this number.
 *  - `agent.goal` — the fraction of scenario.ts's checks the run left true. This is the pass/fail.
 * Plus `agent.tokens`, because eight calls returning four thousand tokens each is not a smooth surface,
 * and without it the call budget is trivially gamed by batching.
 */
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initRepo } from "@snypd/core";
import { Session, type Turn } from "./session";
import { assess, passed, type Check } from "./scenario";
import { scripted, type Driver, type Phase } from "./scripted";
import type { LiveDriver } from "./live";
import type { ClaudeUsage } from "./claude";
import type { Metric, Report } from "../src/index";

export const DRAFT_BUDGET = 8;
/**
 * What the reference route costs today. Not a budget in the `bench` sense and deliberately not carried as
 * one: budgets there are continuous measurements gated at 80 % so a drift fails before a breach, and 80 %
 * of a tool call is not a thing. The exact gate lives in the test, where "19 calls, not 18.4" is sayable.
 */
export const REFERENCE_CALLS = 18;
/** One call of slack over the reference; more than this and the surface has got less smooth. */
export const TOTAL_GATE = 19;

/** The order phases are reported in — the scripted route's, which is also the task's. */
export const PHASES: Phase[] = ["upgrade", "theme", "write", "publish", "build"];

export interface AgentRun {
  driver: string;
  checks: Check[];
  turns: Turn[];
  phases: { phase: Phase; calls: number; reads: number; tokensIn: number; tokensOut: number; ms: number }[];
  calls: number;
  draftCalls: number;
  wallMs: number;
  lint: { errors: number; warnings: number };
  /** `tokens.learn` on this site — the corpus with all four plugins on (S21, D4). */
  learn: number;
  learnBudget: number;
  /** A live model's own accounting (S21): present only when the driver was one. */
  model?: ClaudeUsage & { ended: string; closing: string };
}

/** A disposable copy of the corpus that is its own repo, with the three plain posts already committed. */
function stage(): string {
  const root = mkdtempSync(join(tmpdir(), "snypd-kill-"));
  cpSync("corpora/kill", root, { recursive: true });
  const repo = initRepo(root, { name: "Kill test", email: "kill@snypd.rocks" });
  repo.commit(["."], "the three plain posts, as they arrived");
  return root;
}

/** Press the button a person presses. Not a tool call — see scripted.ts's header. The registry demo (registry.ts) presses the same one. */
export async function approve(origin: string, type: string, slug: string) {
  const res = await fetch(`${origin}/_snypd/approve/${type}/${slug}`, { method: "POST", redirect: "manual" });
  if (res.status !== 303 && !res.ok) throw new Error(`approve ${type}/${slug}: HTTP ${res.status}`);
}

export async function runAgent(opts: { driver?: Driver; keep?: boolean } = {}): Promise<AgentRun> {
  const driver = opts.driver ?? scripted;
  const root = stage();
  const s = new Session(root);
  const marks: { phase: Phase; from: number }[] = [];
  const t0 = performance.now();
  try {
    await s.start();
    await driver.run(s, { phase: (p) => marks.push({ phase: p, from: s.turns.length }), approve });
    // The lint the *agent* was shown, not one this file recomputes — scenario.ts's header says why.
    const lintResult = await s.call("content.lint", {});
    const lint = (lintResult.structuredContent ?? {}) as { errors?: number; warnings?: number };
    const wallMs = +(performance.now() - t0).toFixed(0);
    const counts = { errors: lint.errors ?? 0, warnings: lint.warnings ?? 0 };

    // Summed by name: the scripted driver marks each phase once, a live model may come back to one
    // (live.ts's header), and a phase is a kind of work, not a stretch of the transcript.
    const sums = new Map<Phase, AgentRun["phases"][number]>();
    marks.forEach((m, i) => {
      const slice = s.turns.slice(m.from, marks[i + 1]?.from ?? s.turns.length);
      const p = sums.get(m.phase) ?? { phase: m.phase, calls: 0, reads: 0, tokensIn: 0, tokensOut: 0, ms: 0 };
      p.calls += slice.filter((t) => t.kind === "call").length;
      p.reads += slice.filter((t) => t.kind === "read").length;
      p.tokensIn += slice.reduce((a, t) => a + t.tokensIn, 0);
      p.tokensOut += slice.reduce((a, t) => a + t.tokensOut, 0);
      p.ms = +(p.ms + slice.reduce((a, t) => a + t.ms, 0)).toFixed(0);
      sums.set(m.phase, p);
    });
    const phases = PHASES.flatMap((p) => sums.get(p) ?? []);
    // D4 on this site, not on the theme corpus: the four plugins grow the config an agent reads first.
    const { learnSurface, budgetsFor } = await import("../src/index");
    const { countTokens } = await import("../src/tokens");
    const learn = Object.values(learnSurface(root)).reduce((a, t) => a + countTokens(t), 0);
    const learnBudget = budgetsFor(root).tokensToLearn;
    const l = driver as LiveDriver;
    return {
      driver: driver.name, checks: assess(root, counts), turns: s.turns, phases,
      calls: s.calls, draftCalls: sums.get("write")?.calls ?? 0,
      wallMs, lint: counts, learn, learnBudget,
      ...(l.usage ? { model: { ...l.usage, ended: l.ended ?? "success", closing: l.closing ?? "" } } : {}),
    };
  } finally {
    s.stop();
    if (!opts.keep) rmSync(root, { recursive: true, force: true });
  }
}

export function agentMetrics(r: AgentRun): Metric[] {
  const ok = r.checks.filter((c) => c.ok).length;
  const failed = r.checks.filter((c) => !c.ok);
  return [
    { name: "agent.goal", value: +(ok / r.checks.length).toFixed(3), unit: "", budget: 1, higherIsBetter: true,
      note: failed.length ? `${ok}/${r.checks.length} — failed: ${failed.map((c) => c.id).join(", ")}` : `${ok}/${r.checks.length} checks, driver \`${r.driver}\`` },
    { name: "agent.calls.draft", value: r.draftCalls, unit: "calls", budget: DRAFT_BUDGET,
      note: "D1 literally: nothing → a lint-clean draft of the new post" },
    { name: "agent.calls", value: r.calls, unit: "calls",
      note: `${r.phases.map((p) => `${p.phase} ${p.calls}`).join(" · ")} · +1 final lint — reference route ${REFERENCE_CALLS}, gated exactly at ${TOTAL_GATE} in the test` },
    { name: "agent.reads", value: r.turns.filter((t) => t.kind === "read").length, unit: "reads",
      note: "resources and tools/list — free by decision 38, counted so the split stays honest" },
    { name: "agent.tokens", value: r.turns.reduce((a, t) => a + t.tokensIn + t.tokensOut, 0), unit: "tokens",
      note: `o200k both directions — ${r.turns.reduce((a, t) => a + t.tokensIn, 0)} sent, ${r.turns.reduce((a, t) => a + t.tokensOut, 0)} returned` },
    { name: "agent.wallMs", value: r.wallMs, unit: "ms", note: "spawn → published site, report-only (build and preview dominate)" },
    // Measured on the site the run *left* — editorial, retuned, four plugins — because that is the site
    // the next session learns, and it is the larger number. `exact`: a token count has no runner noise,
    // and the 6,000 is docs/05's own sentence, so the line is the budget and not 80 % of it.
    { name: "tokens.learn.kill", value: r.learn, unit: "tokens", budget: r.learnBudget, exact: true,
      note: "D4 on the site the kill test leaves, all four plugins on (S21): config + spec + primitives + theme, the way `tokens.learn` counts them" },
    ...(r.model ? [
      { name: "agent.model.tokens", value: r.model.tokensIn + r.model.tokensOut, unit: "tokens",
        note: `what \`${r.model.model}\`'s own context paid — ${r.model.tokensIn} in (cache included), ${r.model.tokensOut} out, ${r.model.turns} turns, $${r.model.costUsd}; ended \`${r.model.ended}\`; report-only` },
    ] : []),
  ];
}

/** Where a driver's record goes: the scripted route is CI's `bench/agent.*`; a model's is named for it. */
export function recordPaths(driver: string): { report: string; json: string; transcript: string } {
  const tag = driver === "scripted" ? "" : `.${driver.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  return { report: `bench/agent${tag}.md`, json: `bench/agent${tag}.json`, transcript: `bench/agent-transcript${tag}.md` };
}

export const VERSION_SUITE = "agent";

export async function agent(opts: { driver?: Driver; keep?: boolean; write?: boolean } = {}): Promise<{ report: Report; run: AgentRun }> {
  const { VERSION, toMarkdown } = await import("../src/index");
  const run = await runAgent(opts);
  const report: Report = { version: VERSION, bun: Bun.version, date: new Date().toISOString(), tokenizer: "o200k_base", suite: VERSION_SUITE, metrics: agentMetrics(run) };
  if (opts.write !== false) {
    const paths = recordPaths(run.driver);
    writeFileSync(paths.json, JSON.stringify({ ...report, checks: run.checks, phases: run.phases, ...(run.model ? { model: run.model } : {}) }, null, 2));
    writeFileSync(paths.report, `${toMarkdown(report)}\n\n${run.checks.map((c) => `- ${c.ok ? "✅" : "❌"} **${c.what}** — ${c.detail}`).join("\n")}\n`);
    writeTranscript(run, paths.transcript);
  }
  return { run, report };
}

/** The transcript D1 asks to have checked in: what was called, what came back, what it cost. */
export function transcript(r: AgentRun): string {
  const head = [
    `# snypd bench — the kill test`, "",
    `**Driver** \`${r.driver}\`${r.model ? ` (${r.model.model})` : ""} · **Tool calls** ${r.calls} (draft ${r.draftCalls}/${DRAFT_BUDGET}) · **Goal** ${r.checks.filter((c) => c.ok).length}/${r.checks.length} · **Wall** ${r.wallMs} ms`, "",
    ...(r.model ? [`**The model's own context** ${r.model.tokensIn} tokens in (cache included), ${r.model.tokensOut} out, ${r.model.turns} turns, $${r.model.costUsd}, ended \`${r.model.ended}\`.`, "", `> ${r.model.closing.trim().split("\n").join("\n> ")}`, ""] : []),
    `The scenario is docs/06's v0.1 test: three plain posts upgraded with \`suggest_blocks\`, the theme swapped`,
    `and retuned, a new post written with a chart and a flow, everything approved by a person and published.`,
    `Checks read the finished site, never this transcript — a driver passes by leaving the repository right.`, "",
    `## Goal`, "", `| Check | Result | Detail |`, `|---|---|---|`,
    ...r.checks.map((c) => `| ${c.what} | ${c.ok ? "✅" : "❌"} | ${c.detail} |`), "",
    `## Cost by phase`, "", `| Phase | Tool calls | Reads | Tokens out |`, `|---|---|---|---|`,
    ...r.phases.map((p) => `| ${p.phase} | ${p.calls} | ${p.reads} | ${p.tokensOut} |`), "",
    `## Transcript`, "",
  ];
  return [...head, ...r.turns.map((t) => turnMarkdown(t))].join("\n");
}

/** One turn as the transcripts print it — what was called, with what, and what came back, trimmed. Shared with the registry demo's transcript (registry.ts). */
export function turnMarkdown(t: Turn, keep = 900): string {
  const label = t.kind === "call" ? `**${t.name}**` : `\`${t.method}\`${t.kind === "read" && t.name ? ` ${t.name}` : ""}`;
  const args = t.args ? `\n\`\`\`json\n${JSON.stringify(t.args, null, 2).slice(0, 1200)}\n\`\`\`` : "";
  const out = t.text.length > keep ? `${t.text.slice(0, keep)}\n… (${t.text.length - keep} more characters)` : t.text;
  return `### ${t.n}. ${label} ${t.ok ? "" : "— refused "}· ${t.kind} · ${t.ms} ms · ${t.tokensOut} tokens back${args}\n\n\`\`\`\n${out}\n\`\`\`\n`;
}

export function writeTranscript(r: AgentRun, file = "bench/agent-transcript.md") {
  writeFileSync(file, transcript(r));
}
