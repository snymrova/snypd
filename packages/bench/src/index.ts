/**
 * `snypd bench` — the harness everything is built inside (docs/05, docs/07 §3).
 * S2 scope: build cold + incremental, MCP cold start, TTFB, tokens/page, tokens-to-learn,
 * corpora 100 / 1k / 10k, bench/latest.{md,json}, compare, breach. S5: lint. S6: cold = no dist, no
 * `.snypd` index; incremental = one post's body edited (a real route re-render), noop = touch only.
 * Budgets: spec defaults ← snypd.yaml › bench.budgets of the corpus root (via @snypd/core); CI enforces 80 %.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { build } from "@snypd/render";
import { serve } from "@snypd/runtime";
import { generate } from "./corpus";
import { countTokens, TOKENIZER } from "./tokens";
import { resources as specResources } from "@snypd/spec";
import { loadConfig, lintSite, MdastCache, INDEX_DIR } from "@snypd/core";

export const BUDGETS = {
  buildPer100: 2000, incremental: 300, mcpColdStart: 50, ttfb: 50,   // ms
  tokensPerPage: 2500, tokensToLearn: 6000,                          // tokens (docs/05)
  mdReduction: 85,                                                   // % (enforced from S7, real HTML)
  lintPer1000: 1000,                                                 // ms, lint stage over 1k posts (S5 gate)
};
export const CI_FACTOR = 0.8;

/** Effective budgets for a site: BUDGETS ← its merged `bench.budgets` (spec defaults + snypd.yaml). */
let ACTIVE = BUDGETS;   // set by run() from the corpus root's merged config
export function budgetsFor(root: string): typeof BUDGETS {
  const b = loadConfig(root).config.bench.budgets as Record<string, number>;
  const num = (k: string, fallback: number) => (typeof b[k] === "number" ? b[k]! : fallback);
  return { buildPer100: num("buildPer100", BUDGETS.buildPer100), incremental: num("incremental", BUDGETS.incremental), mcpColdStart: num("mcpColdStart", BUDGETS.mcpColdStart),
    ttfb: num("ttfb", BUDGETS.ttfb), tokensPerPage: num("tokensPerPage", BUDGETS.tokensPerPage), tokensToLearn: num("tokensToLearn", BUDGETS.tokensToLearn), mdReduction: num("mdReduction", BUDGETS.mdReduction), lintPer1000: num("lintPer1000", BUDGETS.lintPer1000) };
}

/** `higherIsBetter` metrics (e.g. % reduction) breach when value < budget; no 80 % margin. */
export interface Metric { name: string; value: number; unit: string; budget?: number; higherIsBetter?: boolean; note?: string }
export interface Report { version: string; bun: string; date: string; tokenizer: string; metrics: Metric[] }

function median(xs: number[]) { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]!; }
async function medianOf(runs: number, fn: () => Promise<number>) {
  const xs: number[] = [];
  for (let i = 0; i < runs; i++) xs.push(await fn());
  return median(xs);
}

export function corpus(n: number | string) {
  const root = `corpora/${n}`;
  if (!existsSync(join(root, "content"))) generate(Number(n), root);
  return root;
}

export async function runBuild(n: number, runs: number): Promise<Metric> {
  const root = corpus(n);
  let routes = 0;
  const ms = await medianOf(n >= 10000 ? 1 : runs, async () => {   // 10k cold = ~1 min of micromark; one run
    rmSync(join(root, "dist"), { recursive: true, force: true });
    rmSync(join(root, INDEX_DIR), { recursive: true, force: true });
    const r = await build(root); routes = r.routes; return r.ms;
  });
  // Budget scales linearly with corpus size (≤ 2 s / 100 posts, docs/05).
  return { name: `build.cold.${n}`, value: +ms.toFixed(1), unit: "ms", budget: ACTIVE.buildPer100 * (n / 100), note: `${routes} routes, no dist, no index` };
}

/**
 * Lint the corpus (S5). `lint.<n>.cold` = read + parse (micromark) + tree + rules in a fresh cache — the
 * whole validate stage from nothing; `lint.<n>` = tree + rules with the mdast cache warm, which is what a
 * rebuild or an MCP `content.lint` call pays. The budget (≤ 1 s / 1k, docs/07 S5) is on the lint stage;
 * cold parse is reported so the remark-vs-alternatives decision (docs/04, decision 5) has a number.
 */
export async function runLint(n: number, runs: number): Promise<Metric[]> {
  const root = corpus(n);
  const cold = await medianOf(runs, async () => lintSite(root, { cache: new MdastCache() }).ms);
  const cache = new MdastCache();
  lintSite(root, { cache });
  const warm = await medianOf(runs, async () => lintSite(root, { cache }).ms);
  const res = lintSite(root, { cache });
  const scale = n / 1000;
  return [
    { name: `lint.${n}`, value: +warm.toFixed(1), unit: "ms", budget: ACTIVE.lintPer1000 * scale, note: `${res.errors} errors · ${res.warnings} warnings; mdast cache warm` },
    { name: `lint.${n}.cold`, value: +cold.toFixed(1), unit: "ms", note: "parse (micromark) + lint from an empty cache; report-only" },
  ];
}

/**
 * Edit one post's body (append a paragraph), rebuild without clearing anything: the post's route re-renders,
 * everything else is a route-cache hit. `build.noop.<n>` (report-only) touches the mtime only — the floor.
 */
export async function runIncremental(n: number, runs: number): Promise<Metric[]> {
  const root = corpus(n);
  await build(root);
  const post = join(root, "content", "posts", "post-00001.md");
  const original = readFileSync(post, "utf8");
  let last: { rendered: number; cached: number } = { rendered: 0, cached: 0 };
  const edit = await medianOf(runs, async () => {
    writeFileSync(post, `${original}\nEdited at ${performance.now()} for the incremental benchmark.\n`);
    const r = await build(root); last = r;
    writeFileSync(post, original); await build(root);   // restore, untimed
    return r.ms;
  });
  const noop = await medianOf(runs, async () => {
    const now = new Date(); utimesSync(post, now, now);
    return (await build(root)).ms;
  });
  return [
    { name: `build.incremental.${n}`, value: +edit.toFixed(1), unit: "ms", budget: ACTIVE.incremental, note: `one body edit → ${last.rendered} rendered, ${last.cached} cached` },
    { name: `build.noop.${n}`, value: +noop.toFixed(1), unit: "ms", note: "touch only (mtime): stat + one hash, nothing rendered; report-only" },
  ];
}

export async function runMcpColdStart(runs: number): Promise<Metric> {
  const ms = await medianOf(runs, async () => {
    const t0 = performance.now();
    const proc = Bun.spawn([process.execPath, "packages/mcp/src/server.ts"], { stdin: "pipe", stdout: "pipe", stderr: "ignore" });
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "bench", version: "0" } } }) + "\n");
    proc.stdin.flush();
    const reader = proc.stdout.getReader();
    await reader.read();
    const t = performance.now() - t0;
    proc.kill();
    return t;
  });
  return { name: "mcp.coldStart", value: +ms.toFixed(1), unit: "ms", budget: ACTIVE.mcpColdStart };
}

/** Time-to-first-byte (headers received) against the static server, median of `requests` after 5 warm-ups. */
export async function runTtfb(n: number, requests: number): Promise<Metric> {
  const root = corpus(n);
  if (!existsSync(join(root, "dist"))) await build(root);
  const s = serve(root);
  try {
    const url = `${s.url}/posts/post-00001/`;
    for (let i = 0; i < 5; i++) await (await fetch(url)).text();
    const xs: number[] = [];
    for (let i = 0; i < requests; i++) {
      const t0 = performance.now();
      const res = await fetch(url);
      xs.push(performance.now() - t0);
      await res.text();
    }
    return { name: "serve.ttfb", value: +median(xs).toFixed(2), unit: "ms", budget: ACTIVE.ttfb };
  } finally { s.stop(); }
}

/** Tokens per page: `.md` twin vs HTML over every built route; median of each and the % reduction. */
export function runTokensPerPage(n: number | string): Metric[] {
  const root = corpus(n);
  const posts = join(root, "dist", "posts");
  if (!existsSync(posts)) throw new Error(`build ${root} first`);
  const md: number[] = [], html: number[] = [];
  for (const slug of readdirSync(posts)) {
    const d = join(posts, slug);
    if (!existsSync(join(d, "index.md"))) continue;
    md.push(countTokens(readFileSync(join(d, "index.md"), "utf8")));
    html.push(countTokens(readFileSync(join(d, "index.html"), "utf8")));
  }
  const mMd = median(md), mHtml = median(html);
  return [
    { name: "tokens.page.md", value: mMd, unit: "tokens", budget: ACTIVE.tokensPerPage },
    { name: "tokens.page.html", value: mHtml, unit: "tokens" },
    { name: "tokens.page.reduction", value: +((1 - mMd / mHtml) * 100).toFixed(1), unit: "%", higherIsBetter: true,
      note: `real theme HTML from S6; budget ${BUDGETS.mdReduction} % enforced from S7 (twins + llms.txt)` },
  ];
}

/**
 * Tokens to learn the site = the resources an agent reads at session start (docs/05):
 * `config` + `spec` + `spec/primitives` + every `spec/primitives/{name}` + `theme` (S13).
 * Counting every primitive is the conservative upper bound; the index alone is what a harness
 * must read, the per-primitive YAML is what it reads before using a block.
 */
export function learnSurface(root: string): Record<string, string> {
  const out: Record<string, string> = { "snypd://config": loadConfig(root).render() };
  for (const r of specResources()) if (r.uri === "snypd://spec" || r.uri.startsWith("snypd://spec/primitives")) out[r.uri] = r.text();
  return out;
}
export function runTokensToLearn(n: number | string): Metric {
  const surface = learnSurface(corpus(n));
  const total = Object.values(surface).reduce((a, s) => a + countTokens(s), 0);
  return { name: "tokens.learn", value: total, unit: "tokens", budget: ACTIVE.tokensToLearn, note: `${Object.keys(surface).length} resources` };
}

export async function run(opts: { quick?: boolean } = {}): Promise<Report> {
  const runs = opts.quick ? 3 : 7;
  const sizes = opts.quick ? [100] : [100, 1000, 10000];
  const metrics: Metric[] = [];
  ACTIVE = budgetsFor(corpus(100));
  const cold = await runMcpColdStart(runs);   // first: measured from a quiet process, before the builds thrash the page cache (S4)
  for (const n of sizes) metrics.push(await runBuild(n, runs));
  metrics.push(...await runIncremental(100, runs));
  for (const n of sizes.filter((n) => n <= 1000)) metrics.push(...await runLint(n, runs));
  metrics.push(cold);
  metrics.push(await runTtfb(100, opts.quick ? 20 : 100));
  metrics.push(...runTokensPerPage(100));
  metrics.push(runTokensToLearn(100));
  const report: Report = { version: "0.1.0-s6", bun: Bun.version, date: new Date().toISOString(), tokenizer: TOKENIZER, metrics };
  mkdirSync("bench", { recursive: true });
  writeFileSync("bench/latest.json", JSON.stringify(report, null, 2));
  writeFileSync("bench/latest.md", toMarkdown(report));
  return report;
}

export function status(m: Metric): "report" | "ok" | "ci" | "budget" {
  if (m.budget === undefined) return "report";
  if (m.higherIsBetter) return m.value >= m.budget ? "ok" : "budget";
  return m.value <= m.budget * CI_FACTOR ? "ok" : m.value <= m.budget ? "ci" : "budget";
}

export function toMarkdown(r: Report) {
  const label = { report: "report", ok: "✅", ci: "⚠️ over CI (80 %)", budget: "❌ over budget" };
  const rows = r.metrics.map((m) => {
    const b = m.budget !== undefined ? `${m.higherIsBetter ? "≥ " : ""}${m.budget} ${m.unit}` : "—";
    return `| \`${m.name}\` | ${m.value} ${m.unit} | ${b} | ${label[status(m)]} | ${m.note ?? ""} |`;
  });
  return `# snypd bench — latest\n\n**Version** ${r.version} · **Bun** ${r.bun} · **Date** ${r.date} · **Tokenizer** ${r.tokenizer}\n\n| Metric | Value | Budget | Status | Note |\n|---|---|---|---|---|\n${rows.join("\n")}\n\nCI passes at ≤ 80 % of budget (docs/07 §3). Corpora are deterministic (\`bun run corpus <n>\`); 10k is generated on demand, not checked in.\n`;
}

/** Names of metrics over the CI threshold. */
export function breaches(r: Report) { return r.metrics.filter((m) => status(m) !== "ok" && status(m) !== "report").map((m) => m.name); }

export function compare(a: Report, b: Report, threshold = 0.10) {
  const out: { name: string; a: number; b: number; delta: number; regressed: boolean }[] = [];
  for (const m of b.metrics) {
    const prev = a.metrics.find((x) => x.name === m.name);
    if (!prev || prev.value === 0) continue;
    const delta = (m.value - prev.value) / prev.value;
    out.push({ name: m.name, a: prev.value, b: m.value, delta, regressed: m.higherIsBetter ? delta < -threshold : delta > threshold });
  }
  return out;
}

export function load(path: string): Report { return JSON.parse(readFileSync(path, "utf8")); }
