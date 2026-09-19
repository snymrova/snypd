/**
 * The continuous contact sheet (docs/29 TF2, in the factory's container). Watches what a look is made
 * of — the themes, the renderer, the specimen — and re-shoots when any of it changes, then serves the
 * newest sheet on :4401. A run shoots into `shots/live-next/` and is swapped in whole, so the page never
 * shows half a run; a change during a run queues exactly one more.
 *
 * Env: THEMES (default editorial,technical,studio) · WIDTHS (default 390,1280; the CLI does all four)
 * · SCHEME (default both) · PORT (default 4401).
 */
import { existsSync, readFileSync, renameSync, rmSync, watch } from "node:fs";
import { join, resolve } from "node:path";
import { shoot, type ShootResult } from "../packages/bench/src/shoot";

const ROOT = resolve(import.meta.dir, "..");
const LIVE = join(ROOT, "shots/live"), NEXT = join(ROOT, "shots/live-next");
const themes = (process.env.THEMES ?? "editorial,technical,studio").split(",").map((t) => t.trim()).filter(Boolean);
const widths = (process.env.WIDTHS ?? "390,1280").split(",").map(Number).filter((n) => n > 0);
const scheme = (process.env.SCHEME ?? "both") as "light" | "dark" | "both";
const WATCH = ["themes", "packages/render/src", "packages/bench/src/shoot.ts", "corpora/specimen/content", "corpora/specimen/snypd.yaml"];

type State = { phase: "idle" | "shooting"; run: number; last?: { at: string; ms: number; shots: number; why: string }; error?: string; queued: boolean; why: string };
const state: State = { phase: "idle", run: 0, queued: false, why: "start" };

async function once(): Promise<void> {
  state.phase = "shooting"; state.error = undefined;
  const why = state.why; const t0 = Date.now();
  console.log(`shoot #${state.run + 1} (${why}) — ${themes.join(", ")} at ${widths.join("/")} px, ${scheme}`);
  try {
    const r: ShootResult = await shoot({ root: join(ROOT, "corpora/specimen"), themes, widths, scheme, out: NEXT });
    if (r.skipped) throw new Error(r.skipped);
    rmSync(LIVE, { recursive: true, force: true });
    renameSync(NEXT, LIVE);
    state.run++;
    state.last = { at: new Date().toISOString(), ms: Date.now() - t0, shots: r.shots.length, why };
    console.log(`  ${r.shots.length} shots in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } catch (e) {
    state.error = (e as Error).message + ((e as { hint?: string }).hint ? ` — ${(e as { hint?: string }).hint}` : "");
    console.error(`  failed: ${state.error}`);
  } finally { state.phase = "idle"; }
}

let timer: Timer | undefined;
function kick(why: string): void {
  state.why = why;
  if (state.phase === "shooting") { state.queued = true; return; }
  clearTimeout(timer);
  timer = setTimeout(async () => {
    await once();
    while (state.queued) { state.queued = false; await once(); }
  }, 1200);
}

for (const w of WATCH) {
  const p = join(ROOT, w);
  if (!existsSync(p)) continue;
  watch(p, { recursive: true }, (_e, f) => {
    const name = String(f ?? "");
    if (/(^|\/)(dist|dist-[^/]*|node_modules|\.snypd)(\/|$)/.test(name)) return;   // our own builds are not edits
    kick(`${w}/${name}`);
  });
}
kick("start");

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function index(): string {
  const json = join(LIVE, "shoot.json");
  const meta = existsSync(json) ? JSON.parse(readFileSync(json, "utf8")) as { sheets: string[]; candidates: { slug: string }[] } : undefined;
  const v = state.run;
  const status = state.phase === "shooting" ? `shooting (${esc(state.why)})${state.queued ? " · one more queued" : ""}…`
    : state.error ? `<b>last run failed:</b> ${esc(state.error)}` : "watching for edits";
  const last = state.last ? `run ${v} · ${state.last.shots} shots in ${(state.last.ms / 1000).toFixed(1)} s · ${new Date(state.last.at).toLocaleTimeString()} · after ${esc(state.last.why)}` : "no run finished yet";
  const sheets = (meta?.sheets ?? []).map((s) => `<figure><figcaption>${esc(s.replace(/^contact-|\.png$/g, ""))}</figcaption><a href="/live/${esc(s)}?v=${v}"><img src="/live/${esc(s)}?v=${v}" alt="${esc(s)}" loading="lazy"></a></figure>`).join("\n");
  // A preview for the person watching, not a snypd page: a meta refresh is the whole mechanism, still no script.
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="refresh" content="${state.phase === "shooting" ? 3 : 6}"><title>${state.phase === "shooting" ? "● " : ""}Contact sheet</title>
<style>body{margin:0;padding:20px;font:14px/1.4 ui-sans-serif,system-ui,sans-serif;background:#f4f5f7;color:#16181d}header{display:flex;gap:16px;align-items:baseline;flex-wrap:wrap}h1{font-size:18px;margin:0}p{margin:4px 0;color:#5b6068}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(560px,1fr));gap:16px;margin-top:16px}figure{margin:0;background:#fff;border:1px solid #dfe2e7;padding:8px}figcaption{font-weight:600;margin-bottom:6px}img{width:100%;height:auto;display:block}a{color:inherit}</style>
<body><header><h1>Contact sheet — ${esc((meta?.candidates ?? []).map((c) => c.slug).join(", ") || themes.join(", "))}</h1><a href="/live/contact.html?v=${v}">every width, full size →</a><a href="http://127.0.0.1:4400/" target="_blank">live site →</a></header>
<p>${status}</p><p>${last}</p><main>${sheets || "<p>The first run is shooting…</p>"}</main></body></html>`;
}

const port = Number(process.env.PORT ?? 4401);
Bun.serve({
  port, hostname: "0.0.0.0",
  fetch(req) {
    const path = decodeURIComponent(new URL(req.url).pathname);
    if (path === "/") return new Response(index(), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    if (path === "/status.json") return Response.json(state);
    if (path.startsWith("/live/") && !path.includes("..")) {
      const f = join(LIVE, path.slice(6));
      if (existsSync(f)) return new Response(Bun.file(f), { headers: { "cache-control": "no-store" } });
    }
    return new Response("not found", { status: 404 });
  },
});
console.log(`sheets → http://127.0.0.1:${port}/  (watching ${WATCH.join(", ")})`);
