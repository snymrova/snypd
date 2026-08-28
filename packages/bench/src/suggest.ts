/**
 * `snypd bench suggest` (docs/07 S15, exit gate ≥ 0.80 precision) — `suggest_blocks` against twenty
 * hand-labelled posts in `corpora/suggest`.
 *
 * Precision is the gated number and recall rides beside it, report-only, because the two fail in
 * opposite directions and only one of them is dangerous: a missed upgrade costs the author nothing they
 * did not already have, while a wrong one rewrites their post into something they did not mean. Seven of
 * the twenty posts are labelled with no upgrade at all, so a detector that fires on every table pays for
 * it here rather than looking excellent on a corpus of slam dunks.
 *
 * A label anchors on text (`at:`), not a line, so editing a post's opening paragraph cannot silently
 * relabel what follows it.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { suggestBlocks, candidates, parseMarkdown, loadConfig, type Suggestion } from "@snypd/core";
import type { Metric } from "./index";

export const SUGGEST_CORPUS = "corpora/suggest";
export interface Label { primitive: string; at: string }
export interface Judged { file: string; suggestion: Suggestion; matched?: Label }
export interface SuggestScore {
  precision: number; recall: number;
  suggested: number; correct: number; expected: number;
  /** A suggestion no label claims — the number the gate exists to hold down. */
  falsePositives: Judged[];
  /** A label nothing matched. */
  missed: { file: string; label: Label }[];
  files: number; ms: number;
}

export function scoreSuggest(root = SUGGEST_CORPUS): SuggestScore {
  const labels = parseYaml(readFileSync(join(root, "labels.yaml"), "utf8")) as Record<string, Label[] | null>;
  const dir = join(root, "content", "posts");
  const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
  const cfg = loadConfig(root);
  const type = cfg.config.types.post!;
  const t0 = performance.now();

  let correct = 0, suggested = 0, expected = 0;
  const falsePositives: Judged[] = [];
  const missed: { file: string; label: Label }[] = [];

  for (const f of files) {
    const src = readFileSync(join(dir, f), "utf8");
    const want = labels[f] ?? [];
    if (!(f in labels)) throw new Error(`${f} is not in labels.yaml — every post in the corpus is labelled, including the ones whose answer is []`);
    expected += want.length;
    const unclaimed = [...want];
    const got = suggestBlocks(src, { type: { fields: type.fields as never, taxonomies: type.taxonomies }, statuses: Object.keys(cfg.config.statuses), vocabulary: type.vocabulary });
    suggested += got.length;
    for (const s of got) {
      const i = unclaimed.findIndex((l) => l.primitive === s.primitive && s.replaces.includes(l.at));
      if (i >= 0) { correct++; unclaimed.splice(i, 1); }
      else falsePositives.push({ file: f, suggestion: s });
    }
    for (const l of unclaimed) missed.push({ file: f, label: l });
  }

  return {
    precision: suggested ? +(correct / suggested).toFixed(3) : 1,
    recall: expected ? +(correct / expected).toFixed(3) : 1,
    suggested, correct, expected, falsePositives, missed, files: files.length, ms: performance.now() - t0,
  };
}

export function suggestMetrics(root = SUGGEST_CORPUS): Metric[] {
  if (!existsSync(join(root, "labels.yaml"))) return [];
  const s = scoreSuggest(root);
  return [
    { name: "suggest.precision", value: s.precision, unit: "", budget: 0.8, higherIsBetter: true,
      note: `${s.correct}/${s.suggested} suggestions matched a label over ${s.files} posts, 7 of which are labelled with no upgrade` },
    { name: "suggest.recall", value: s.recall, unit: "", note: `${s.correct}/${s.expected} labelled upgrades found; report-only — a miss costs the author nothing, a false positive rewrites their post` },
    { name: "suggest.ms", value: +(s.ms / s.files).toFixed(2), unit: "ms", note: "per post: parse + shapes + score + verify (the verify pass lints each candidate against the document it would land in)" },
  ];
}

/** What the gate will not tell you: which suggestions were wrong, and which upgrades were left on the floor. */
export function formatSuggestScore(s: SuggestScore): string {
  const fp = s.falsePositives.map((j) => `  ✗ ${j.file}:${j.suggestion.line} suggested \`${j.suggestion.primitive}\` (${j.suggestion.confidence}) — ${j.suggestion.because[0] ?? "no signal"}`);
  const ms = s.missed.map((m) => `  ○ ${m.file} missed \`${m.label.primitive}\` at “${m.label.at}”`);
  return [
    `precision ${s.precision.toFixed(3)} (${s.correct}/${s.suggested})  ·  recall ${s.recall.toFixed(3)} (${s.correct}/${s.expected})  ·  ${s.files} posts  ·  ${(s.ms / s.files).toFixed(2)} ms/post`,
    ...(fp.length ? ["", "false positives:", ...fp] : []),
    ...(ms.length ? ["", "missed:", ...ms] : []),
  ].join("\n");
}

/**
 * `snypd bench suggest --facts` — every candidate the shapes found in a corpus, with the facts it
 * publishes. This is the reference a detector YAML is written against: `require:` and `signals:` name
 * these keys, so without a way to print them the "one YAML file and no code" claim (docs/07 decision 35)
 * would only be true for whoever wrote the extractors.
 */
export function factsReport(root = SUGGEST_CORPUS, opts: { shape?: string } = {}): string {
  const dir = join(root, "content", "posts");
  const out: string[] = [];
  const seen = new Map<string, Set<string>>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".md")).sort()) {
    const src = readFileSync(join(dir, f), "utf8");
    const cs = candidates(parseMarkdown(src), src).filter((c) => !opts.shape || c.shape === opts.shape);
    if (!cs.length) continue;
    out.push(`\n${f}`);
    for (const c of cs) {
      const keys = seen.get(c.shape) ?? seen.set(c.shape, new Set()).get(c.shape)!;
      for (const k of Object.keys(c.facts)) keys.add(k);
      const facts = Object.entries(c.facts)
        .map(([k, v]) => `${k}=${typeof v === "string" ? JSON.stringify(v.length > 40 ? `${v.slice(0, 40)}…` : v) : v}`)
        .join(" ");
      out.push(`  L${String(c.line).padStart(3)}–${String(c.endLine).padEnd(3)} ${c.shape.padEnd(16)} ${facts}`);
    }
  }
  const index = [...seen].sort().map(([shape, keys]) => `  ${shape.padEnd(16)} ${[...keys].sort().join(", ")}`);
  return [`# facts by shape — the keys a detector YAML may name in require: and signals:`, ...index, ...out].join("\n");
}
