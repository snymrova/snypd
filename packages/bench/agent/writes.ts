/**
 * First-attempt lint pass rate on `write-post` (docs/05 "Agent-friendliness", docs/07 S21).
 *
 * Twenty topics, three models, one question: given the server's own `write-post` prompt and nothing
 * else, how often does a model's *first* `content.create` lint clean? It is the number that says whether
 * the vocabulary and the prompt teach the rules well enough to be followed cold — a rule a model breaks
 * on every first try is a rule the prompt does not teach, or a rule that fights the writing, and either
 * is a finding about the product rather than about the model.
 *
 * The prompt is fetched from the server over `prompts/get`, verbatim, the way a harness gets it; the
 * harness adds one rule of its own to the *system* prompt — create once, then stop — because the metric
 * is the first attempt and the prompt, quite rightly, tells the model to fix what the lint returns.
 * Every run is a fresh copy of the kill corpus with all four plugins on (S21's site), so what the model
 * reads first is the same config the kill test's model reads.
 *
 * Report-only, with docs/05's target of ≥ 80 % beside it and no budget yet: the first published number
 * is what a budget gets set from. Runs on this machine's Claude Code login, not in CI — see claude.ts.
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initRepo } from "@snypd/core";
import { claude, MODELS, type ClaudeUsage, type Model } from "./claude";
import { Session } from "./session";
import type { Metric, Report } from "../src/index";

/** Twenty topics a site like the kill corpus would post about — numbers, sequences, questions, parts, claims: something for every primitive, and prose for none of them by default. */
export const TOPICS: readonly string[] = [
  "What a cold start costs, measured four ways",
  "How a draft becomes a published post, and where the human is",
  "Why the only interface is an MCP server",
  "The build budget: two seconds for a hundred posts, and what we do when it slips",
  "Three static site generators compared on tokens per page",
  "How the incremental build decides what to re-render",
  "What a theme is allowed to own, and what it is not",
  "Questions people ask about publishing without an admin UI",
  "How `suggest_blocks` finds the chart inside a table",
  "A changelog for the changelog plugin",
  "The twelve lint rules, and the one that fights back",
  "Why every chart is an SVG and not a canvas",
  "How a push reaches Bing the moment it lands",
  "The write model: one branch for drafts, one for the site",
  "What `tokens.learn` measures and why it has a budget",
  "Choosing between a flow and a diagram",
  "How the preview server picks its port",
  "A post about nothing: what happens when you publish an empty draft",
  "Reading a bench report: which rows are clocks and which are counts",
  "Migrating a folder of markdown into primitives, one post at a time",
];

/** The harness's one rule. In the system prompt, so the server's prompt goes to the model untouched. */
export const FIRST_ATTEMPT_RULE = `This session is a measurement of first-attempt lint. Read what the prompt tells you to read, plan, then call content.create exactly once. Whatever its lint result is, stop there: do not call content.update, content.lint, content.render_preview or content.publish, and do not fix anything. Reply with one line quoting the lint result.`;

export interface WriteAttempt {
  model: string;
  topic: string;
  slug?: string;
  /** The first `content.create` linted with zero errors. */
  pass: boolean;
  /** No `content.create` was made at all — a stop, a refusal, a wrong turn. */
  noAttempt: boolean;
  errors: number;
  warnings: number;
  /** Rule ids of the errors on the first attempt, one entry per diagnostic. */
  rules: string[];
  /** The same errors as the lint said them, so a rule id comes with what it wanted. */
  messages: string[];
  /** Reads and calls before the first `content.create` — how much the model looked before writing. */
  readsBefore: number;
  callsBefore: number;
  usage: ClaudeUsage;
  ended: string;
}

interface Lint { errors: number; warnings: number; rules: string[]; messages: string[] }

/** What the first `content.create` said. Claude Code hands a model the structured result as JSON; the text line is the fallback. */
export function readLint(text: string): Lint | undefined {
  try {
    const j = JSON.parse(text) as { lint?: { errors?: number; warnings?: number; diagnostics?: { rule: string; severity: string; message: string }[] } };
    if (j.lint) {
      const errs = (j.lint.diagnostics ?? []).filter((d) => d.severity === "error");
      return { errors: j.lint.errors ?? 0, warnings: j.lint.warnings ?? 0, rules: errs.map((d) => d.rule), messages: errs.map((d) => d.message) };
    }
  } catch { /* not JSON */ }
  const m = text.match(/lint: (\d+) errors?, (\d+) warnings?/);
  return m ? { errors: +m[1]!, warnings: +m[2]!, rules: [], messages: [] } : undefined;
}

function stage(): string {
  const root = mkdtempSync(join(tmpdir(), "snypd-writes-"));
  cpSync("corpora/kill", root, { recursive: true });
  initRepo(root, { name: "Writes", email: "writes@snypd.rocks" }).commit(["."], "the three plain posts, as they arrived");
  return root;
}

export async function runWrite(model: Model, topic: string, opts: { keep?: boolean; onLine?: (l: string) => void } = {}): Promise<WriteAttempt> {
  const root = stage();
  const s = new Session(root);
  try {
    await s.start();
    const prompt = await s.prompt("write-post", { topic });
    s.stop();
    const r = await claude({ model, root, prompt, system: FIRST_ATTEMPT_RULE, maxTurns: 12, maxBudgetUsd: 2, onLine: opts.onLine });
    const i = r.turns.findIndex((t) => t.kind === "call" && t.name === "content.create");
    const first = i >= 0 ? r.turns[i]! : undefined;
    const before = r.turns.slice(0, Math.max(i, 0));
    const lint = first?.ok ? readLint(first.text) : undefined;
    const args = (first?.args ?? {}) as { slug?: string };
    return {
      model: r.usage.model, topic, slug: typeof args.slug === "string" ? args.slug : undefined,
      pass: !!first?.ok && !!lint && lint.errors === 0,
      noAttempt: !first,
      errors: first && !first.ok ? 1 : lint?.errors ?? 0, warnings: lint?.warnings ?? 0,
      rules: first && !first.ok ? ["refused"] : lint?.rules ?? [],
      messages: first && !first.ok ? [first.text.split("\n")[0] ?? ""] : lint?.messages ?? [],
      readsBefore: before.filter((t) => t.kind === "read").length,
      callsBefore: before.filter((t) => t.kind === "call").length,
      usage: r.usage, ended: r.ended,
    };
  } finally {
    s.stop();
    if (!opts.keep) rmSync(root, { recursive: true, force: true });
  }
}

export interface WritesOptions {
  models?: Model[];
  /** How many of `TOPICS`, from the top — or a 1-based inclusive range, `[15, 20]`, to run a slice again; all twenty by default. */
  topics?: number | [number, number];
  /**
   * Keep the record's other attempts and replace only the ones this run repeats (same model id, same
   * topic). A run that hit the rate limit leaves "no attempt" rows, and the honest fix is to run those
   * topics again rather than the lane — the record's date is the merge's, and the rows keep their own.
   */
  merge?: boolean;
  keep?: boolean;
  onProgress?: (a: WriteAttempt, done: number, total: number) => void;
  write?: boolean;
}

export async function runWrites(opts: WritesOptions = {}): Promise<WriteAttempt[]> {
  const models = opts.models ?? [...MODELS];
  const topics = Array.isArray(opts.topics) ? TOPICS.slice(opts.topics[0] - 1, opts.topics[1]) : TOPICS.slice(0, opts.topics ?? TOPICS.length);
  const out: WriteAttempt[] = [];
  const total = models.length * topics.length;
  for (const model of models) for (const topic of topics) {
    const a = await runWrite(model, topic, { keep: opts.keep });
    out.push(a);
    opts.onProgress?.(a, out.length, total);
  }
  return out;
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : 0; };
const slug = (m: string) => m.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();

/** One row per model, and the rules that failed most, so the number comes with the reason. */
export function writesMetrics(attempts: WriteAttempt[]): Metric[] {
  const byModel = new Map<string, WriteAttempt[]>();
  for (const a of attempts) byModel.set(a.model, [...(byModel.get(a.model) ?? []), a]);
  return [...byModel].flatMap(([model, as]) => {
    const passed = as.filter((a) => a.pass).length;
    // Counted by what the rule asked for, not by rule alone: `required-prop` nine times says less than
    // "`chart` needs `source`" nine times, and the second is the sentence a prompt fix is written from.
    const rules = new Map<string, number>();
    for (const a of as) a.rules.forEach((r, i) => { const k = `${r}: ${a.messages[i] ?? ""}`; rules.set(k, (rules.get(k) ?? 0) + 1); });
    const top = [...rules].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([r, n]) => `${r} ×${n}`).join(" · ");
    const tag = slug(model);
    return [
      { name: `agent.write.pass.${tag}`, value: +(passed / as.length).toFixed(3), unit: "", higherIsBetter: true,
        note: `${passed}/${as.length} first attempts lint clean — target ≥ 0.8 (docs/05), no budget yet${as.some((a) => a.noAttempt) ? ` · ${as.filter((a) => a.noAttempt).length} made no attempt` : ""}${top ? ` · errors: ${top}` : ""}` },
      { name: `agent.write.before.${tag}`, value: median(as.map((a) => a.readsBefore + a.callsBefore)), unit: "turns",
        note: `median reads + calls before the first content.create (${median(as.map((a) => a.readsBefore))} reads, ${median(as.map((a) => a.callsBefore))} calls)` },
      { name: `agent.write.tokens.${tag}`, value: median(as.map((a) => a.usage.tokensIn + a.usage.tokensOut)), unit: "tokens",
        note: `median of what the model's context paid per post, cache included · $${as.reduce((s, a) => s + a.usage.costUsd, 0).toFixed(2)} for ${as.length}` },
    ];
  });
}

export const VERSION_SUITE = "writes";

export async function writes(opts: WritesOptions = {}): Promise<{ report: Report; attempts: WriteAttempt[] }> {
  const { VERSION, toMarkdown } = await import("../src/index");
  let attempts = await runWrites(opts);
  if (opts.merge && existsSync("bench/writes.json")) {
    const prior = (JSON.parse(readFileSync("bench/writes.json", "utf8")) as { attempts?: WriteAttempt[] }).attempts ?? [];
    const fresh = new Set(attempts.map((a) => `${a.model}\n${a.topic}`));
    attempts = [...prior.filter((a) => !fresh.has(`${a.model}\n${a.topic}`)), ...attempts]
      .sort((a, b) => MODELS.findIndex((m) => a.model.includes(m)) - MODELS.findIndex((m) => b.model.includes(m)) || TOPICS.indexOf(a.topic) - TOPICS.indexOf(b.topic));
  }
  const report: Report = { version: VERSION, bun: Bun.version, date: new Date().toISOString(), tokenizer: "o200k_base", suite: VERSION_SUITE, metrics: writesMetrics(attempts) };
  if (opts.write !== false) {
    writeFileSync("bench/writes.json", JSON.stringify({ ...report, attempts }, null, 2));
    writeFileSync("bench/writes.md", `${toMarkdown(report)}\n\n${formatAttempts(attempts)}\n`);
  }
  return { report, attempts };
}

export function formatAttempts(attempts: WriteAttempt[]): string {
  const counted = (xs: string[]) => { const m = new Map<string, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return [...m].map(([k, n]) => (n > 1 ? `${k} ×${n}` : k)).join(", "); };
  const rows = attempts.map((a) => `| ${a.model} | ${a.topic} | ${a.noAttempt ? "— no attempt" : a.pass ? "✅" : "❌"} | ${a.noAttempt ? "" : `${a.errors} / ${a.warnings}`} | ${counted(a.rules)} | ${a.readsBefore} + ${a.callsBefore} | ${a.usage.tokensIn + a.usage.tokensOut} | ${a.ended === "success" ? "" : a.ended} |`);
  return ["| Model | Topic | First attempt | Errors / warnings | Error rules | Reads + calls before | Model tokens | Ended |", "|---|---|---|---|---|---|---|---|", ...rows].join("\n");
}
