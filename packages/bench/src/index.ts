/**
 * `snypd bench` — the harness everything is built inside (docs/05, docs/07 §3).
 * S1 scope: build timer (cold), MCP cold start (stub), bench/latest.md + latest.json, compare.
 * Budgets come from snypd.yaml › bench.budgets; CI enforces 80 % of them.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { build } from "@snypd/render";
import { generate } from "./corpus";

export const BUDGETS = { buildPer100: 2000, incremental: 300, mcpColdStart: 50, ttfb: 50 }; // ms
export const CI_FACTOR = 0.8;

export interface Metric { name: string; value: number; unit: string; budget?: number }
export interface Report { version: string; bun: string; date: string; metrics: Metric[] }

async function median(runs: number, fn: () => Promise<number>) {
  const xs: number[] = [];
  for (let i = 0; i < runs; i++) xs.push(await fn());
  xs.sort((a, b) => a - b);
  return xs[Math.floor(xs.length / 2)]!;
}

export async function runBuild(n: number, runs: number): Promise<Metric> {
  const root = `corpora/${n}`;
  if (!existsSync(join(root, "content"))) generate(n, root);
  const ms = await median(runs, async () => {
    rmSync(join(root, "dist"), { recursive: true, force: true });
    return (await build(root)).ms;
  });
  return { name: `build.cold.${n}`, value: +ms.toFixed(1), unit: "ms", budget: n === 100 ? BUDGETS.buildPer100 : undefined };
}

export async function runMcpColdStart(runs: number): Promise<Metric> {
  const ms = await median(runs, async () => {
    const t0 = performance.now();
    const proc = Bun.spawn(["bun", "run", "packages/mcp/src/server.ts"], { stdin: "pipe", stdout: "pipe", stderr: "ignore" });
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "bench", version: "0" } } }) + "\n");
    proc.stdin.flush();
    const reader = proc.stdout.getReader();
    await reader.read();
    const t = performance.now() - t0;
    proc.kill();
    return t;
  });
  return { name: "mcp.coldStart", value: +ms.toFixed(1), unit: "ms", budget: BUDGETS.mcpColdStart };
}

export async function run(opts: { quick?: boolean } = {}): Promise<Report> {
  const runs = opts.quick ? 3 : 7;
  const sizes = opts.quick ? [100] : [100, 1000];
  const metrics: Metric[] = [];
  for (const n of sizes) metrics.push(await runBuild(n, runs));
  metrics.push(await runMcpColdStart(runs));
  const report: Report = { version: "0.1.0-s1", bun: Bun.version, date: new Date().toISOString(), metrics };
  mkdirSync("bench", { recursive: true });
  writeFileSync("bench/latest.json", JSON.stringify(report, null, 2));
  writeFileSync("bench/latest.md", toMarkdown(report));
  return report;
}

export function toMarkdown(r: Report) {
  const rows = r.metrics.map((m) => {
    const b = m.budget ? `${m.budget} ${m.unit}` : "—";
    const ci = m.budget ? m.budget * CI_FACTOR : undefined;
    const status = ci === undefined ? "report" : m.value <= ci ? "✅" : m.value <= m.budget! ? "⚠️ over CI (80 %)" : "❌ over budget";
    return `| \`${m.name}\` | ${m.value} ${m.unit} | ${b} | ${status} |`;
  });
  return `# snypd bench — latest\n\n**Version** ${r.version} · **Bun** ${r.bun} · **Date** ${r.date}\n\n| Metric | Value | Budget | Status |\n|---|---|---|---|\n${rows.join("\n")}\n\nCI passes at ≤ 80 % of budget (docs/07 §3).\n`;
}

/** Fails (returns names) for metrics over CI threshold. */
export function breaches(r: Report) {
  return r.metrics.filter((m) => m.budget !== undefined && m.value > m.budget * CI_FACTOR).map((m) => m.name);
}

export function compare(a: Report, b: Report, threshold = 0.10) {
  const out: { name: string; a: number; b: number; delta: number; regressed: boolean }[] = [];
  for (const m of b.metrics) {
    const prev = a.metrics.find((x) => x.name === m.name);
    if (!prev) continue;
    const delta = (m.value - prev.value) / prev.value;
    out.push({ name: m.name, a: prev.value, b: m.value, delta, regressed: delta > threshold });
  }
  return out;
}

export function load(path: string): Report { return JSON.parse(readFileSync(path, "utf8")); }
