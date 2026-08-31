/**
 * `snypd bench` — the harness everything is built inside (docs/05, docs/07 §3).
 * S2 scope: build cold + incremental, MCP cold start, TTFB, tokens/page, tokens-to-learn,
 * corpora 100 / 1k / 10k, bench/latest.{md,json}, compare, breach. S5: lint. S6: cold = no dist, no
 * `.snypd` index; incremental = one post's body edited (a real route re-render), noop = touch only.
 * Budgets: spec defaults ← snypd.yaml › bench.budgets of the corpus root (via @snypd/core); CI enforces 80 %.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { build } from "@snypd/render";
import { preview } from "@snypd/render/preview";
import { serve } from "@snypd/runtime";
import { compile } from "./compile";
import { generate, generateTheme } from "./corpus";
import { countTokens, TOKENIZER } from "./tokens";
import { resources as specResources } from "@snypd/spec";
import { loadConfig, lintSite, MdastCache, SiteIndex, renderThemeSummary, INDEX_DIR } from "@snypd/core";
import { pageSuite } from "./page";
import { suggestMetrics, scoreSuggest, formatSuggestScore, SUGGEST_CORPUS } from "./suggest";
import { renderChart, renderDiagram, renderFlow, CHART_TYPES, MAX_POINTS, MAX_NODES, type ChartRow, type ChartType } from "@snypd/viz";

export const BUDGETS = {
  buildPer100: 2000, incremental: 300, mcpColdStart: 50, ttfb: 50,   // ms
  tokensPerPage: 2500, tokensToLearn: 6000, tokensTools: 3000,        // tokens (docs/05; tokensTools is S16, decision 38)
  mdReduction: 85,                                                   // % (enforced from S7, real HTML)
  lintPer1000: 1000,                                                 // ms, lint stage over 1k posts (S5 gate)
  chartRenderMs: 3, chartSvgKb: 12,                                  // D3, per chart (spec: chart.budget)
  diagramRenderMs: 15, diagramSvgKb: 25,                             // D3, per diagram (spec: diagram.budget)
  flowRenderMs: 15, flowSvgKb: 25,                                   // D3, per flow (spec: flow.budget)
};
export const CI_FACTOR = 0.8;
export const VERSION = "0.1.0-s18c";

/** Effective budgets for a site: BUDGETS ← its merged `bench.budgets` (spec defaults + snypd.yaml). */
let ACTIVE = BUDGETS;   // set by run() from the corpus root's merged config
export function budgetsFor(root: string): typeof BUDGETS {
  const b = loadConfig(root).config.bench.budgets as Record<string, number>;
  const num = (k: string, fallback: number) => (typeof b[k] === "number" ? b[k]! : fallback);
  /** Per-primitive budgets are nested (`budgets.chart.renderMs`), because that is the shape the spec declares. */
  const per = (k: string, sub: string, fallback: number) => { const o = b[k] as unknown as Record<string, unknown> | undefined; return o && typeof o === "object" && typeof o[sub] === "number" ? o[sub] as number : fallback; };
  return { buildPer100: num("buildPer100", BUDGETS.buildPer100), incremental: num("incremental", BUDGETS.incremental), mcpColdStart: num("mcpColdStart", BUDGETS.mcpColdStart),
    ttfb: num("ttfb", BUDGETS.ttfb), tokensPerPage: num("tokensPerPage", BUDGETS.tokensPerPage), tokensToLearn: num("tokensToLearn", BUDGETS.tokensToLearn), tokensTools: num("tokensTools", BUDGETS.tokensTools), mdReduction: num("mdReduction", BUDGETS.mdReduction), lintPer1000: num("lintPer1000", BUDGETS.lintPer1000),
    chartRenderMs: per("chart", "renderMs", BUDGETS.chartRenderMs), chartSvgKb: per("chart", "svgKb", BUDGETS.chartSvgKb),
    diagramRenderMs: per("diagram", "renderMs", BUDGETS.diagramRenderMs), diagramSvgKb: per("diagram", "svgKb", BUDGETS.diagramSvgKb),
    flowRenderMs: per("flow", "renderMs", BUDGETS.flowRenderMs), flowSvgKb: per("flow", "svgKb", BUDGETS.flowSvgKb) };
}

/** `higherIsBetter` metrics (e.g. % reduction) breach when value < budget; no 80 % margin. */
export interface Metric { name: string; value: number; unit: string; budget?: number; higherIsBetter?: boolean; note?: string }
export interface Report { version: string; bun: string; date: string; tokenizer: string; metrics: Metric[]; /** Which suite ran; `bench compare` reads reports of the same suite. */ suite?: string }

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

/**
 * Spawn → the first byte of the `initialize` response. One sample.
 *
 * The read runs to a newline rather than taking the first chunk: a framed JSON-RPC reply is one line, and
 * a lane that stops early would be measuring the pipe rather than the server.
 */
async function initializeOnce(cmd: string[]): Promise<number> {
  const t0 = performance.now();
  const proc = Bun.spawn(cmd, { stdin: "pipe", stdout: "pipe", stderr: "ignore" });
  proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "bench", version: "0" } } }) + "\n");
  proc.stdin.flush();
  const reader = proc.stdout.getReader();
  let buf = "";
  while (!buf.includes("\n")) { const { value, done } = await reader.read(); if (done) break; buf += new TextDecoder().decode(value); }
  const t = performance.now() - t0;
  proc.kill();
  await proc.exited;   // the next sample must not start in the wake of this one still tearing down
  if (!buf.includes('"result"')) throw new Error(`initialize did not answer: ${cmd.join(" ")}\n${buf.slice(0, 300)}`);
  return t;
}

/**
 * D2's cold start, on both lanes, **interleaved** (S18c).
 *
 * `mcp.coldStart.binary` carries the budget and `mcp.coldStart` reports, which is decision 48 applied to
 * the metric that motivated it: until S18c the 50 ms was measured on `bun packages/mcp/src/server.ts` —
 * a command no user runs — and the artefact answering the same request took 224 ms. The source lane stays
 * because it is the inner loop, and because the *gap* between the two is the thing that regresses silently.
 *
 * One round samples both, so the two numbers are comparable to each other even on a box under load — which
 * this one is, routinely, and which is why a session's absolute numbers are worth less than its deltas.
 * The compile is setup, not measurement: it happens once, before either lane is timed.
 */
export async function runColdStarts(runs: number): Promise<Metric[]> {
  // Deliberately more samples than the other lanes take. One sample is a ~60 ms spawn, so twenty-one rounds
  // cost about four seconds against a full run that spends a hundred on the 10k build — and the median of
  // three, which `--quick` would otherwise give this, moved by 2× between consecutive runs on a loaded box.
  const rounds = Math.max(15, runs * 3);
  const bin = join(mkdtempSync(join(tmpdir(), "snypd-bench-bin-")), "snypd");
  await compile(bin);
  const root = corpus(100);
  const src: number[] = [], art: number[] = [];
  try {
    // The order alternates. A lane that always spawns second always starts behind the other one's teardown,
    // and on a four-core box under load that bias is worth more than the difference being measured — the first
    // S18c bench run put the binary 29 % *above* the source lane, where a controlled interleave had them equal.
    for (let i = 0; i < rounds; i++) {
      const source = () => initializeOnce([process.execPath, "packages/mcp/src/server.ts"]);
      const artefact = () => initializeOnce([bin, "serve", root]);
      if (i % 2 === 0) { src.push(await source()); art.push(await artefact()); }
      else { art.push(await artefact()); src.push(await source()); }
    }
  } finally { rmSync(dirname(bin), { recursive: true, force: true }); }
  return [
    { name: "mcp.coldStart.binary", value: +median(art).toFixed(1), unit: "ms", budget: ACTIVE.mcpColdStart,
      note: `the artefact a release ships (\`bun build --compile --splitting\`), spawn → \`initialize\`; D2's lane since S18c · median of ${rounds} interleaved rounds` },
    { name: "mcp.coldStart", value: +median(src).toFixed(1), unit: "ms",
      note: "report-only since S18c: `bun packages/mcp/src/server.ts`, the dev loop, not the thing anyone installs — interleaved with the binary lane, so the delta between the two rows is real even when the box is loaded" },
  ];
}

/**
 * Time-to-first-byte against the preview server (S11; `snypd dev` since S18e) — the server the budget is written for
 * (docs/05: preview/SSR), median of `requests` after 5 warm-ups, on an unchanged tree. A changed tree
 * costs one incremental build on the first request after the change; that is `build.incremental`,
 * measured separately, and pretending otherwise would hide which of the two moved.
 */
export async function runPreviewTtfb(n: number, requests: number): Promise<Metric> {
  const root = corpus(n);
  const s = await preview(root, { port: 0, watch: false });
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
    const draft = await fetch(`${s.url}/_snypd/review/post/post-00001`);
    return { name: "preview.ttfb", value: +median(xs).toFixed(2), unit: "ms", budget: ACTIVE.ttfb, note: `the preview server (\`snypd dev\`), unchanged tree, drafts included; review page ${draft.status === 200 ? "served" : `HTTP ${draft.status}`}` };
  } finally { s.stop(); }
}

/** The S2 static floor: `dist/` over Bun.serve with no rebuild check. Report-only — nothing ships it. */
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
    return { name: "serve.ttfb", value: +median(xs).toFixed(2), unit: "ms", note: "static dist/ over Bun.serve — the floor the preview server is measured against" };
  } finally { s.stop(); }
}

/** Tokens per page: `.md` twin vs HTML over every built route; median of each and the % reduction. */
export function runTokensPerPage(n: number | string, opts: { dist?: string; label?: string; gate?: boolean } = {}): Metric[] {
  const root = corpus(n);
  const posts = join(opts.dist ?? join(root, "dist"), "posts");
  if (!existsSync(posts)) throw new Error(`build ${root} first`);
  const md: number[] = [], html: number[] = [];
  for (const slug of readdirSync(posts)) {
    const d = join(posts, slug);
    if (!existsSync(join(d, "index.md"))) continue;
    md.push(countTokens(readFileSync(join(d, "index.md"), "utf8")));
    html.push(countTokens(readFileSync(join(d, "index.html"), "utf8")));
  }
  const mMd = median(md), mHtml = median(html);
  const where = opts.label ? ` (${opts.label})` : "";
  return [
    // The twin is the source file byte for byte, so this number is the same under every theme; it is here
    // once, from whichever lane ran, and has been comparable since S2.
    { name: "tokens.page.md", value: mMd, unit: "tokens", budget: ACTIVE.tokensPerPage },
    { name: `tokens.page.html${opts.label ? `.${opts.label}` : ""}`, value: mHtml, unit: "tokens", note: opts.label ? `${opts.label} theme` : undefined },
    { name: `tokens.page.reduction${opts.label ? `.${opts.label}` : ""}`, value: +((1 - mMd / mHtml) * 100).toFixed(1), unit: "%", higherIsBetter: true,
      budget: opts.gate ? ACTIVE.mdReduction : undefined,
      // Report-only on purpose (docs/07 decision 15, rewritten in S13 with the editorial lane measured):
      // as defined this ratio rewards fat HTML, and the gated agent-cost line is `tokens.page.md`.
      note: `vs this theme's own HTML${where} — how thin this theme already is, not what an agent saves; low is good (docs/07 decision 15)` },
  ];
}

/**
 * The editorial lane (S13). The same 100 posts, rendered by the styled theme, into their own `dist` and
 * their own index — `corpora/100` keeps building under `base`, because every build and lint number in the
 * report has been comparable back to S2 and a theme swap would break that line for a reason that has
 * nothing to do with speed. The lane exists for the two metrics that are *about* the theme: what a page of
 * real HTML costs an agent, and what the theme adds to `tokens.learn`.
 * `SNYPD_ENV=editorial` is not a special case — it is the config layering the product already has
 * (`snypd.<env>.yaml`, docs/02), so the lane is one four-line file in the corpus.
 */
export async function editorialLane(n: number | string = 100): Promise<{ root: string; dist: string; cfg: ReturnType<typeof loadConfig> }> {
  const root = corpus(n);
  const cfg = loadConfig(root, { env: "editorial" });
  const dist = join(root, "dist-editorial");
  const index = await SiteIndex.open(root, join(root, INDEX_DIR, "index.editorial.sqlite"));
  try { await build(root, { out: dist, cfg, index }); } finally { index.close(); }
  return { root, dist, cfg };
}

/**
 * D3 (docs/07 decision 4): per-primitive render time and bytes. Measured on the worst shape the spec's
 * intent allows — 12 points, long labels, and the grouped two-series variant — not on a friendly one, and
 * reported as the worst type rather than the mean: a budget that only the easy chart meets is not a budget.
 * The unit under test is the geometry (`renderChart`), which is what the spec's `budget.renderMs` covers;
 * the theme's 20 lines of JSX around it are measured by `build.*`.
 */
export function runViz(runs: number): Metric[] {
  const long = (i: number) => `a fairly long category ${i + 1}`;
  const shapes: Array<{ name: string; rows: ChartRow[] }> = [
    { name: "12 points", rows: Array.from({ length: MAX_POINTS }, (_, i) => ({ label: long(i), value: 1234.56 * (i + 1) })) },
    { name: "6 × 2 series", rows: Array.from({ length: 12 }, (_, i) => ({ label: long(i % 6), value: 987.6 * (i + 1), series: i % 2 ? "cold" : "warm" })) },
  ];
  const per: Array<{ type: ChartType; ms: number; kb: number }> = [];
  for (const type of CHART_TYPES) {
    let ms = 0, kb = 0;
    for (const shape of shapes) {
      const input = { type, data: shape.rows, unit: "milliseconds", caption: "Tokens per page, HTML vs the markdown twin" };
      renderChart(input);   // warm the code path; the budget is steady-state, not first-call JIT
      const xs: number[] = [];
      for (let i = 0; i < runs * 8; i++) { const t = performance.now(); renderChart(input); xs.push(performance.now() - t); }
      ms = Math.max(ms, median(xs));
      kb = Math.max(kb, Buffer.byteLength(renderChart(input)!.svg) / 1024);
    }
    per.push({ type, ms, kb });
  }
  const worstMs = per.reduce((a, b) => (b.ms > a.ms ? b : a));
  const worstKb = per.reduce((a, b) => (b.kb > a.kb ? b : a));
  const note = per.map((p) => `${p.type} ${p.ms.toFixed(2)} ms / ${p.kb.toFixed(1)} KB`).join(" · ");
  return [
    { name: "viz.chart.renderMs", value: +worstMs.ms.toFixed(2), unit: "ms", budget: ACTIVE.chartRenderMs, note: `worst type (${worstMs.type}) on the worst shape — ${note}` },
    { name: "viz.chart.svgKb", value: +worstKb.kb.toFixed(1), unit: "KB", budget: ACTIVE.chartSvgKb, note: `worst type (${worstKb.type}); zero JS, zero CSS` },
    ...runVizDiagram(runs),
    ...runVizFlow(runs),
  ];
}

/**
 * D3 for `diagram` (S9), measured at the spec's 40-node cap on three shapes that stress different phases of
 * the layout: a deep chain (many ranks, long edges to route), a wide bipartite layer (the crossing-reduction
 * sweeps and the transpose), and a graph with feedback edges (cycle breaking). The worst shape is reported,
 * not the mean, and the layout cache is defeated per measurement — a budget that only measures a cache hit
 * would say nothing about the first build of a site.
 */
export function runVizDiagram(runs: number): Metric[] {
  const label = (i: number) => `stage ${i} of the pipeline`;
  const nodes = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: label(i) }));
  const shapes: Array<{ name: string; data: { nodes: unknown[]; edges: unknown[] } }> = [
    { name: "chain", data: { nodes: nodes(MAX_NODES), edges: Array.from({ length: MAX_NODES - 1 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}`, label: i % 5 === 0 ? "then" : undefined })) } },
    { name: "wide", data: { nodes: nodes(MAX_NODES), edges: Array.from({ length: 20 }, (_, i) => [{ from: `n${i}`, to: `n${20 + ((i * 3) % 20)}` }, { from: `n${i}`, to: `n${20 + ((i * 7 + 5) % 20)}` }]).flat() } },
    { name: "feedback", data: { nodes: nodes(MAX_NODES), edges: Array.from({ length: MAX_NODES }, (_, i) => (i % 6 === 5 ? { from: `n${i}`, to: `n${i - 5}`, label: "again" } : { from: `n${i}`, to: `n${(i + 1) % MAX_NODES}` })) } },
  ];
  const per: Array<{ shape: string; ms: number; kb: number }> = [];
  for (const shape of shapes) {
    // A fresh caption per run is not enough — the layout cache is keyed on the geometry, so the node ids
    // carry the run number and every measured render lays the graph out from scratch.
    const fresh = (k: number) => ({
      nodes: (shape.data.nodes as Array<{ id: string; label: string }>).map((x) => ({ ...x, id: `${x.id}r${k}` })),
      edges: (shape.data.edges as Array<{ from: string; to: string; label?: string }>).map((x) => ({ ...x, from: `${x.from}r${k}`, to: `${x.to}r${k}` })),
    });
    renderDiagram({ data: fresh(-1), caption: "warm" });   // warm the code path; the budget is steady-state
    const xs: number[] = [];
    for (let i = 0; i < runs * 4; i++) { const t = performance.now(); renderDiagram({ data: fresh(i), caption: "How a post becomes a page" }); xs.push(performance.now() - t); }
    per.push({ shape: shape.name, ms: median(xs), kb: Buffer.byteLength(renderDiagram({ data: shape.data, caption: "How a post becomes a page" })!.svg) / 1024 });
  }
  const worstMs = per.reduce((a, b) => (b.ms > a.ms ? b : a));
  const worstKb = per.reduce((a, b) => (b.kb > a.kb ? b : a));
  const note = per.map((p) => `${p.shape} ${p.ms.toFixed(2)} ms / ${p.kb.toFixed(1)} KB`).join(" · ");
  return [
    { name: "viz.diagram.renderMs", value: +worstMs.ms.toFixed(2), unit: "ms", budget: ACTIVE.diagramRenderMs, note: `worst shape (${worstMs.shape}) at the ${MAX_NODES}-node cap, layout cache defeated — ${note}` },
    { name: "viz.diagram.svgKb", value: +worstKb.kb.toFixed(1), unit: "KB", budget: ACTIVE.diagramSvgKb, note: `worst shape (${worstKb.shape}); zero JS, zero CSS` },
  ];
}

/**
 * D3 for `flow` (S10), at the spec's 40-node cap on three shapes that stress the desugar as well as the
 * layout: a ladder of decisions whose branches rejoin (the join edges are what a flow has and a diagram does
 * not), a retry loop where every third decision jumps back to an earlier step (cycle breaking through the
 * sugar), and nested decisions inside branches (recursion depth). Worst shape reported, layout cache
 * defeated per measurement — the same rules as `diagram`, because it is the same painter underneath.
 */
export function runVizFlow(runs: number): Metric[] {
  const step = (i: number) => `stage ${i} of the publishing pipeline`;
  /** ~40 nodes each: the cap is on nodes, and a decision plus its two branches is three of them. */
  const shapes: Array<{ name: string; data: { steps: unknown[] } }> = [
    { name: "ladder", data: { steps: Array.from({ length: 10 }, (_, i) => [step(i * 2), { ask: `is stage ${i} clean?`, yes: step(i * 2 + 1), no: `fix stage ${i} and retry` }]).flat() } },
    { name: "retry loop", data: { steps: Array.from({ length: 8 }, (_, i) => [
      { id: `s${i}`, do: step(i) },
      { ask: `did stage ${i} pass?`, yes: [`record stage ${i}`, `publish stage ${i}`], no: i % 3 === 2 ? { then: `s${Math.max(0, i - 2)}` } : `fix stage ${i}` },
    ]).flat() } },
    // Four rounds of nine nodes plus a four-step tail: 40 exactly, the cap the budget is stated at.
    { name: "nested", data: { steps: [...Array.from({ length: 4 }, (_, i) => [step(i), {
      ask: `is stage ${i} ready?`,
      yes: [{ ask: `is stage ${i} signed off?`, yes: `ship stage ${i}`, no: `ask a human about stage ${i}` }],
      no: [`fix stage ${i}`, { ask: `did the fix work for ${i}?`, yes: `re-run stage ${i}`, no: `escalate stage ${i}` }],
    }]).flat(), ...Array.from({ length: 4 }, (_, i) => step(20 + i))] } },
  ];
  const per: Array<{ shape: string; ms: number; kb: number; nodes: number }> = [];
  for (const shape of shapes) {
    // The layout cache is keyed on the geometry, so every measured render carries the run number in its
    // words — different labels, different box widths, a layout that has to be computed.
    const fresh = (k: number) => JSON.parse(JSON.stringify(shape.data).replaceAll("stage ", `stage ${k}.`)) as { steps: unknown[] };
    renderFlow({ data: fresh(-1), caption: "warm" });   // warm the code path; the budget is steady-state
    const xs: number[] = [];
    for (let i = 0; i < runs * 4; i++) { const t = performance.now(); renderFlow({ data: fresh(i), caption: "How a draft becomes a post" }); xs.push(performance.now() - t); }
    const one = renderFlow({ data: shape.data, caption: "How a draft becomes a post" })!;
    per.push({ shape: shape.name, ms: median(xs), kb: Buffer.byteLength(one.svg) / 1024, nodes: one.nodes.length });
  }
  const worstMs = per.reduce((a, b) => (b.ms > a.ms ? b : a));
  const worstKb = per.reduce((a, b) => (b.kb > a.kb ? b : a));
  const note = per.map((p) => `${p.shape} ${p.nodes} steps ${p.ms.toFixed(2)} ms / ${p.kb.toFixed(1)} KB`).join(" · ");
  return [
    { name: "viz.flow.renderMs", value: +worstMs.ms.toFixed(2), unit: "ms", budget: ACTIVE.flowRenderMs, note: `worst shape (${worstMs.shape}) at the ${MAX_NODES}-node cap, layout cache defeated — ${note}` },
    { name: "viz.flow.svgKb", value: +worstKb.kb.toFixed(1), unit: "KB", budget: ACTIVE.flowSvgKb, note: `worst shape (${worstKb.shape}); zero JS, zero CSS` },
  ];
}

/**
 * `corpora/theme` — the fixture the browser suite runs against (S13): every primitive, every layout, two
 * posts, an author, a page, two terms and two real rasters. Generated on demand like every other corpus,
 * and committed, because a theme review has to be able to look at the same site twice.
 */
export function themeFixture(): string {
  const root = "corpora/theme";
  if (!existsSync(join(root, "content"))) generateTheme(root);
  return root;
}

/**
 * `snypd bench page` (S13, Phase-3 exit): the built site in a real browser — zero JavaScript, zero axe
 * violations, and the bytes and vitals beside them. Runs against the theme fixture, not `corpora/100`:
 * a11y and coverage are claims about the *vocabulary*, and the generated corpus uses eight of thirteen
 * primitives and three of five layouts.
 */
export async function page(opts: { root?: string; quick?: boolean } = {}): Promise<Report> {
  const root = opts.root ?? themeFixture();
  ACTIVE = budgetsFor(root);
  await build(root);
  const { metrics, browser } = await pageSuite({ root, label: "editorial" });
  metrics.push(...(await deskLane(root)));
  const report: Report = { version: VERSION, suite: "page", bun: Bun.version, date: new Date().toISOString(), tokenizer: TOKENIZER, metrics };
  mkdirSync("bench", { recursive: true });
  writeFileSync("bench/page.json", JSON.stringify({ ...report, browser }, null, 2));
  writeFileSync("bench/page.md", toMarkdown(report));
  return report;
}

/**
 * The Desk under the same browser the public routes get (S18b, decisions 44–45).
 *
 * `/_snypd` is a live preview route rather than a file in `dist`, so this lane starts the preview
 * server and hands `pageSuite` its URL. The metrics are namespaced `desk.*` rather than folded into
 * `page.*`: the editorial lane's worst-of has been comparable session to session since S13, and
 * quietly widening what it covers would be exactly the kind of gate that changes meaning without
 * changing name (decision 48).
 *
 * The card is measured with a draft in flight, because an empty Desk is not the page anybody sees, and
 * with a stubbed harness so the connected branch — the one with the most markup in it — is the one
 * axe-core reads. `deskRefresh: 0` stops the meta refresh reloading Chrome mid-measurement.
 */
async function deskLane(root: string): Promise<Metric[]> {
  const now = Date.now();
  const s = await preview(root, { port: 0, watch: false, deskRefresh: 0, activity: () => ({ calls: 12, lastMethod: "tools/call", lastAt: now - 2000, since: now - 300000, client: "bench" }) });
  try {
    return (await pageSuite({ root, url: s.url, routes: ["/_snypd", `/_snypd/review/post/${DESK_DRAFT}`], label: "desk", prefix: "desk" })).metrics;
  } finally { s.stop(); }
}
/** Generated into the fixture by `generateTheme`, not created here — the bench does not edit a corpus. */
const DESK_DRAFT = "a-draft-in-flight";

/**
 * `snypd bench visual` (docs/07 S10, gate D3): the per-primitive suite on its own — every visual primitive
 * at the worst shape its spec allows, with the render-time and byte budget beside it. It is the whole of D3
 * and none of D2, so it runs in a second and a viz change can be measured without a build.
 */
export async function visual(opts: { quick?: boolean } = {}): Promise<Report> {
  ACTIVE = budgetsFor(corpus(100));
  const report: Report = { version: VERSION, suite: "visual", bun: Bun.version, date: new Date().toISOString(), tokenizer: TOKENIZER, metrics: runViz(opts.quick ? 3 : 7) };
  mkdirSync("bench", { recursive: true });
  writeFileSync("bench/visual.json", JSON.stringify(report, null, 2));
  writeFileSync("bench/visual.md", toMarkdown(report));
  return report;
}

/**
 * `snypd bench suggest` (docs/07 S15, Phase-3 exit): `suggest_blocks` against the twenty hand-labelled
 * posts in `corpora/suggest`. No build and no browser — it is the detector table under measurement, so
 * a detector YAML can be tuned and scored in a second.
 */
export async function suggest(opts: { root?: string } = {}): Promise<Report> {
  const root = opts.root ?? SUGGEST_CORPUS;
  ACTIVE = budgetsFor(corpus(100));
  const report: Report = { version: VERSION, suite: "suggest", bun: Bun.version, date: new Date().toISOString(), tokenizer: TOKENIZER, metrics: suggestMetrics(root) };
  mkdirSync("bench", { recursive: true });
  writeFileSync("bench/suggest.json", JSON.stringify({ ...report, detail: scoreSuggest(root) }, null, 2));
  writeFileSync("bench/suggest.md", `${toMarkdown(report)}\n\n\`\`\`\n${formatSuggestScore(scoreSuggest(root))}\n\`\`\`\n`);
  return report;
}
export { scoreSuggest, formatSuggestScore, suggestMetrics, factsReport, SUGGEST_CORPUS } from "./suggest";

/**
 * The kill test (docs/07 D1, S17). Lives under `../agent` rather than here because it is the one lane that
 * is a statement about the *product* rather than about a number: it spawns `snypd serve` and talks JSON-RPC
 * to it like a client, and scores the site it left behind. Re-exported so `snypd bench agent` and the CI
 * lane reach it the same way as every other suite.
 */
export { agent, runAgent, agentMetrics, transcript, writeTranscript, DRAFT_BUDGET, REFERENCE_CALLS, TOTAL_GATE, type AgentRun } from "../agent/run";
export { assess, passed, UPGRADES, NEW_POST, THEME, type Check } from "../agent/scenario";
export { scripted, type Driver, type Phase } from "../agent/scripted";
export { Session, type Turn } from "../agent/session";

/**
 * Agent-read surface completeness (docs/05): probe the built corpus + the static server for each item of the
 * surface. Public MCP (S19) joins the probe list when it exists; until then the metric covers the build-time
 * surface only, and says so.
 */
export async function runSurface(n: number | string): Promise<Metric> {
  const root = corpus(n);
  const dist = join(root, "dist");
  const slug = readdirSync(join(dist, "posts")).find((s) => existsSync(join(dist, "posts", s, "index.md")))!;
  const html = readFileSync(join(dist, "posts", slug, "index.html"), "utf8");
  const s = serve(root);
  const checks: Record<string, boolean> = {};
  try {
    checks["llms.txt"] = existsSync(join(dist, "llms.txt")) && readFileSync(join(dist, "llms.txt"), "utf8").includes("index.md");
    checks[".md twin"] = existsSync(join(dist, "posts", slug, "index.md"));
    checks["Accept: text/markdown"] = (await (await fetch(`${s.url}/posts/${slug}/`, { headers: { accept: "text/markdown" } })).text()).startsWith("---");
    checks["link rel=alternate"] = html.includes('rel="alternate" type="text/markdown"') && html.includes('rel="alternate" type="application/rss+xml"');
    checks["JSON API"] = existsSync(join(dist, "api", "site.json")) && existsSync(join(dist, "api", "post", `${slug}.json`));
    checks["feed.xml"] = existsSync(join(dist, "feed.xml"));
    checks["sitemap.xml"] = existsSync(join(dist, "sitemap.xml")) && existsSync(join(dist, "robots.txt"));
    checks["JSON-LD"] = html.includes('<script type="application/ld+json">');
  } finally { s.stop(); }
  const names = Object.keys(checks), ok = names.filter((k) => checks[k]);
  return { name: "surface.completeness", value: +((ok.length / names.length) * 100).toFixed(0), unit: "%", budget: 100, higherIsBetter: true,
    note: `${ok.length}/${names.length}: ${names.map((k) => `${checks[k] ? "✓" : "✗"} ${k}`).join(", ")}; public MCP joins in S19` };
}

/**
 * Tokens to learn the site = the resources an agent reads at session start (docs/05):
 * `config` + `spec` + `spec/primitives` + every `spec/primitives/{name}` + `theme` (S13).
 * Counting every primitive is the conservative upper bound; the index alone is what a harness
 * must read, the per-primitive YAML is what it reads before using a block.
 */
export function learnSurface(root: string, cfg?: ReturnType<typeof loadConfig>): Record<string, string> {
  const c = cfg ?? loadConfig(root);
  const out: Record<string, string> = { "snypd://config": c.render() };
  for (const r of specResources()) if (r.uri === "snypd://spec" || r.uri.startsWith("snypd://spec/primitives")) out[r.uri] = r.text();
  // The theme has been in docs/05's definition of this metric since S13 and only became a resource in S16;
  // the palette and the coverage list are separate reads, made by an agent that is restyling, not learning.
  out["snypd://theme"] = renderThemeSummary(root, c);
  return out;
}
/**
 * What `tools/list` + `resources/templates/list` cost a session, on top of `tokens.learn` (S11).
 * Report-only and deliberately a *separate* metric: `tokens.learn` is defined in docs/05 as config +
 * spec/primitives + theme and has been comparable since S2 — folding the write surface into it would
 * break that line. An agent that lists everything pays both, so both are on the page.
 */
export async function runTokensTools(): Promise<Metric[]> {
  // The subpaths, not the index: neither module may sit on `snypd serve`'s import path.
  const { CORE_TOOLS } = await import("@snypd/mcp/tools");
  const { CATALOG } = await import("@snypd/mcp/catalog");
  const listed = countTokens(JSON.stringify({ tools: CORE_TOOLS }));
  const full = countTokens(JSON.stringify({ tools: [...CORE_TOOLS, ...CATALOG] }));
  return [
    { name: "tokens.tools", value: listed, unit: "tokens", budget: ACTIVE.tokensTools,
      note: `${CORE_TOOLS.length} always listed (content.* + find_tools); paid every turn, on top of tokens.learn, which docs/05 scopes to config + spec + theme` },
    { name: "tokens.tools.full", value: full, unit: "tokens",
      note: `the same ${CORE_TOOLS.length + CATALOG.length} tools with the catalogue listed rather than found — what deferring it saves a turn (docs/07 decision 38); report-only` },
  ];
}

export function runTokensToLearn(n: number | string, opts: { cfg?: ReturnType<typeof loadConfig>; label?: string } = {}): Metric {
  const surface = learnSurface(corpus(n), opts.cfg);
  const total = Object.values(surface).reduce((a, s) => a + countTokens(s), 0);
  return { name: `tokens.learn${opts.label ? `.${opts.label}` : ""}`, value: total, unit: "tokens", budget: ACTIVE.tokensToLearn,
    note: `${Object.keys(surface).length} resources${opts.label ? ` · ${opts.label} theme` : ""}` };
}

export async function run(opts: { quick?: boolean } = {}): Promise<Report> {
  const runs = opts.quick ? 3 : 7;
  const sizes = opts.quick ? [100] : [100, 1000, 10000];
  const metrics: Metric[] = [];
  ACTIVE = budgetsFor(corpus(100));
  const cold = await runColdStarts(runs);   // first: measured from a quiet process, before the builds thrash the page cache (S4)
  for (const n of sizes) metrics.push(await runBuild(n, runs));
  metrics.push(...await runIncremental(100, runs));
  for (const n of sizes.filter((n) => n <= 1000)) metrics.push(...await runLint(n, runs));
  metrics.push(...cold);
  metrics.push(await runTtfb(100, opts.quick ? 20 : 100));
  metrics.push(await runPreviewTtfb(100, opts.quick ? 20 : 100));
  metrics.push(...runTokensPerPage(100));
  metrics.push(runTokensToLearn(100));
  // The editorial lane: the same content under the styled theme, which is what a real site ships and what
  // docs/07 decision 15 says the reduction and the theme's share of `tokens.learn` are measured on.
  const lane = await editorialLane(100);
  metrics.push(...runTokensPerPage(100, { dist: lane.dist, label: "editorial", gate: false }).filter((m) => m.name !== "tokens.page.md"));
  metrics.push(runTokensToLearn(100, { cfg: lane.cfg, label: "editorial" }));
  metrics.push(...(await runTokensTools()));
  metrics.push(await runSurface(100));
  metrics.push(...runViz(runs));
  metrics.push(...suggestMetrics());   // S15 gate: precision over the hand-labelled corpus; ~0.4 s, no build
  if (!opts.quick) {   // the browser suite costs ~10 s and a Chrome; --quick is the inner-loop run
    const fixture = themeFixture();
    await build(fixture);
    metrics.push(...(await pageSuite({ root: fixture, label: "editorial" })).metrics);
    metrics.push(...(await deskLane(fixture)));   // S18b: the Desk under the same browser as the public routes
  }
  const report: Report = { version: VERSION, bun: Bun.version, date: new Date().toISOString(), tokenizer: TOKENIZER, metrics };
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
  return `# snypd bench — ${r.suite ?? "latest"}\n\n**Version** ${r.version} · **Bun** ${r.bun} · **Date** ${r.date} · **Tokenizer** ${r.tokenizer}\n\n| Metric | Value | Budget | Status | Note |\n|---|---|---|---|---|\n${rows.join("\n")}\n\nCI passes at ≤ 80 % of budget (docs/07 §3). Corpora are deterministic (\`bun run corpus <n>\`); 10k is generated on demand, not checked in.\n`;
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
