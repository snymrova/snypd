/**
 * The README's stills, made by the tree (docs/15 §3.2). `bun packages/bench/readme/shots.ts [--only=a,b] [--out=dir]`
 *
 * Every picture in `.github/readme/` is the output of this file over `corpora/readme` — the gallery lane's
 * Chrome, the gallery lane's build-per-look, the same `prefers-color-scheme` emulation S22 learned to
 * declare. Nothing is retouched; a theme change re-shoots the README the way it re-runs the bench.
 *
 * Sets, each named after the README block it serves:
 *   looks       six looks × light/dark × 1280, the every-primitive post, folded at 800 px  → looks/<slug>-<scheme>.png
 *   phones      six looks × 390, one composite strip                                       → phones/<slug>.png (+ strip.png by ffmpeg, later)
 *   primitives  thirteen primitives, each clipped from editorial › paper at 1280, light     → primitives/<name>.png
 *   blocks      the `chart` and `diagram` posts, the SVG the build wrote, copied out         → blocks/<name>.svg
 *   desk        the Desk with a draft in flight, light and dark                              → desk/desk-<scheme>.png
 *
 * The manifest (`manifest.json`) records every file with the look, route, viewport, scheme and byte size
 * it was made at — the README's own bench row, in the sense that the folder has a budget (docs/15 §7).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "@snypd/render";
import { preview } from "@snypd/render/preview";
import { serve } from "@snypd/runtime";
import { loadConfig, SiteIndex, INDEX_DIR, writeHeartbeat } from "@snypd/core";
import { primitives } from "@snypd/spec";
import { launch, findChrome, type Page, type Browser } from "../src/cdp";
import { looks, type Look } from "../src/gallery";
import { generateReadme } from "../src/corpus";

const ROOT = "corpora/readme";
const POST = "/posts/every-primitive-once/";
const FOLD = 800;
type Scheme = "light" | "dark";

interface Frame { file: string; set: string; look?: string; route: string; width: number; height?: number; scheme?: Scheme; bytes: number }

const args = new Map(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.slice(2).split("="); return [k!, v ?? ""]; }));
const OUT = args.get("out") || ".github/readme";
const ONLY = args.get("only")?.split(",").filter(Boolean);
const want = (set: string) => !ONLY || ONLY.includes(set);

async function open(browser: Browser, url: string, width: number, height: number, scheme: Scheme, mobile = false): Promise<Page> {
  const page = await browser.page();
  await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile });
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  const loaded = page.once("Page.loadEventFired", 20_000);
  await page.send("Page.navigate", { url });
  await loaded;
  // Fonts and the first paint settle in two frames; a screenshot taken on `load` catches the fallback face.
  await page.send("Runtime.evaluate", { awaitPromise: true, expression: "document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 80)))))" });
  return page;
}

async function shot(page: Page, file: string, clip?: { x: number; y: number; width: number; height: number }): Promise<number> {
  const { data } = await page.send<{ data: string }>("Page.captureScreenshot", {
    format: "png", captureBeyondViewport: true,
    ...(clip ? { clip: { ...clip, scale: 1 } } : {}),   // scale is on top of the 2× device factor above
  });
  const buf = Buffer.from(data, "base64");
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, buf);
  return buf.length;
}

/** Build one look of the fixture into its own dist and serve it; the caller stops the server. */
async function serveLook(look: Look) {
  const cfg = loadConfig(ROOT, { theme: look.theme, variation: look.variation });
  const dist = join(ROOT, `dist-readme-${look.slug}`);
  const index = await SiteIndex.open(ROOT, join(ROOT, INDEX_DIR, `index.readme-${look.slug}.sqlite`));
  try { await build(ROOT, { out: dist, cfg, index }); } finally { index.close(); }
  return { dist, server: serve(ROOT, { dist }) };
}

async function main() {
  if (!findChrome()) throw new Error("no Chrome on this machine — install one or set SNYPD_CHROME");
  if (!existsSync(join(ROOT, "content"))) generateReadme(ROOT);
  const frames: Frame[] = [];
  const all = looks(ROOT);
  const paper = all.find((l) => l.slug === "editorial-paper") ?? all[0]!;
  const browser = await launch();
  const t0 = performance.now();
  try {
    // ── looks + phones: one build and one server per look ─────────────────────────────────────────
    if (want("looks") || want("phones")) {
      for (const look of all) {
        const { server } = await serveLook(look);
        try {
          const url = `${server.url}${POST}`;
          if (want("looks")) {
            for (const scheme of ["light", "dark"] as Scheme[]) {
              if (look.dark && scheme === "light") continue;   // a dark-only look is dark either way; one frame says so
              const page = await open(browser, url, 1280, FOLD, scheme);
              try {
                const file = join(OUT, "looks", `${look.slug}-${scheme}.png`);
                const bytes = await shot(page, file, { x: 0, y: 0, width: 1280, height: FOLD });
                frames.push({ file, set: "looks", look: look.slug, route: POST, width: 1280, height: FOLD, scheme, bytes });
                console.log(`looks       ${look.slug}-${scheme}  ${kb(bytes)}`);
              } finally { await page.close(); }
            }
          }
          if (want("phones")) {
            const page = await open(browser, url, 390, 844, "light", true);
            try {
              const file = join(OUT, "phones", `${look.slug}.png`);
              const bytes = await shot(page, file, { x: 0, y: 0, width: 390, height: 844 });
              frames.push({ file, set: "phones", look: look.slug, route: POST, width: 390, height: 844, scheme: "light", bytes });
              console.log(`phones      ${look.slug}  ${kb(bytes)}`);
            } finally { await page.close(); }
          }
        } finally { server.stop(); }
      }
    }

    // ── primitives: each block clipped from the paper look, light, with its margin ────────────────
    if (want("primitives") || want("blocks")) {
      const { dist, server } = await serveLook(paper);
      try {
        if (want("primitives")) {
          const page = await open(browser, `${server.url}${POST}`, 1280, 900, "light");
          try {
            for (const p of primitives()) {
              const sel = p.name === "cover" ? ".snypd-cover, header.snypd-cover" : `.snypd-${p.name}`;
              const box = (await page.send<{ result: { value: { x: number; y: number; width: number; height: number } | null } }>("Runtime.evaluate", {
                returnByValue: true,
                expression: `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }; })()`,
              })).result.value;
              if (!box) { console.log(`primitives  ${p.name}  (no ${sel} on the page)`); continue; }
              const pad = 24;
              const clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + pad * 2, height: box.height + pad * 2 };
              const file = join(OUT, "primitives", `${p.name}.png`);
              const bytes = await shot(page, file, clip);
              frames.push({ file, set: "primitives", look: paper.slug, route: POST, width: Math.round(clip.width), height: Math.round(clip.height), scheme: "light", bytes });
              console.log(`primitives  ${p.name}  ${Math.round(clip.width)}×${Math.round(clip.height)}  ${kb(bytes)}`);
            }
          } finally { await page.close(); }
        }
        if (want("blocks")) {
          // The SVGs the build wrote, lifted out of the page whole: the chart and the diagram are inline,
          // so the file is the element's outerHTML with the theme's colours resolved from the page.
          for (const [route, sel, name] of [["/posts/how-fast/", ".snypd-chart svg", "build-clock"], ["/posts/one-binary/", ".snypd-diagram svg", "one-binary"]] as const) {
            const html = readFileSync(join(dist, route, "index.html"), "utf8");
            const page = await open(browser, `${server.url}${route}`, 1280, 900, "light");
            try {
              const svg = (await page.send<{ result: { value: string | null } }>("Runtime.evaluate", {
                returnByValue: true,
                expression: `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const c = e.cloneNode(true); const cs = getComputedStyle(e); c.setAttribute("xmlns", "http://www.w3.org/2000/svg"); c.style.fontFamily = cs.fontFamily; c.style.color = cs.color; return c.outerHTML; })()`,
              })).result.value;
              if (!svg) { console.log(`blocks      ${name}  (no ${sel} in ${route})`); continue; }
              const file = join(OUT, "blocks", `${name}.svg`);
              mkdirSync(join(file, ".."), { recursive: true });
              writeFileSync(file, svg + "\n");
              const bytes = statSync(file).size;
              frames.push({ file, set: "blocks", look: paper.slug, route, width: 0, bytes });
              console.log(`blocks      ${name}  ${kb(bytes)}  (${html.includes("<svg") ? "inline in the page" : "?"})`);
            } finally { await page.close(); }
          }
        }
      } finally { server.stop(); }
    }

    // ── desk: the preview server with a draft in flight ────────────────────────────────────────────
    // The Desk of a *working* site, not a first run: the fixture is copied under `.scratch/` (ignored),
    // made a repo with one commit, registered with a harness, and `deploy.push: human` so the Push card
    // is the gate the README describes. The six first-run rows are then true and the card is gone.
    if (want("desk")) {
      const desk = join(".scratch", "readme-desk");
      rmSync(desk, { recursive: true, force: true });
      mkdirSync(desk, { recursive: true });
      Bun.spawnSync(["cp", "-r", join(ROOT, "content"), join(ROOT, "snypd.yaml"), desk]);
      writeFileSync(join(desk, "snypd.yaml"), readFileSync(join(desk, "snypd.yaml"), "utf8") + "deploy:\n  push: human\n");
      writeFileSync(join(desk, ".mcp.json"), JSON.stringify({ mcpServers: { snypd: { command: "snypd", args: ["serve"] } } }, null, 2) + "\n");
      writeFileSync(join(desk, ".gitignore"), "dist/\n.snypd/\n");
      // A bare repo beside it stands in for the host's remote, so the Push card reads *up to date* rather
      // than *no remote*; the heartbeat names this process, which is alive for as long as the shot takes.
      const remote = join(".scratch", "readme-desk.git");
      rmSync(remote, { recursive: true, force: true });
      const git = (...cmd: string[]) => {
        const r = Bun.spawnSync(["git", "-c", "user.name=Field Notes", "-c", "user.email=notes@example.com", ...cmd], { cwd: desk });
        if (r.exitCode !== 0) throw new Error(`git ${cmd.join(" ")}: ${r.stderr.toString()}`);
      };
      Bun.spawnSync(["git", "init", "-q", "--bare", "-b", "main", remote]);
      git("init", "-q", "-b", "main"); git("add", "-A"); git("commit", "-q", "-m", "first post");
      git("remote", "add", "origin", join("..", "readme-desk.git")); git("push", "-q", "-u", "origin", "main");
      const now = Date.now();
      writeHeartbeat(desk, { startedAt: now - 300000, calls: 12, lastMethod: "tools/call", lastAt: now - 2000, since: now - 300000, client: "Claude Code" });
      const s = await preview(desk, { port: 0, watch: false, deskRefresh: 0 });
      try {
        for (const scheme of ["light", "dark"] as Scheme[]) {
          const page = await open(browser, `${s.url}/_snypd`, 1280, 900, scheme);
          try {
            const file = join(OUT, "desk", `desk-${scheme}.png`);
            const bytes = await shot(page, file, { x: 0, y: 0, width: 1280, height: 900 });
            frames.push({ file, set: "desk", route: "/_snypd", width: 1280, height: 900, scheme, bytes });
            console.log(`desk        ${scheme}  ${kb(bytes)}`);
          } finally { await page.close(); }
        }
      } finally { await s.stop(); }
    }
  } finally { browser.close(); }

  // ── optimise: 256 colours, oxipng — when the machine has python3 + Pillow + pyoxipng ─────────────
  const pngs = frames.filter((f) => f.file.endsWith(".png"));
  if (pngs.length) {
    const probe = Bun.spawnSync(["python3", "-c", "import PIL, oxipng"]);
    if (probe.exitCode === 0) {
      const r = Bun.spawnSync(["python3", "packages/bench/readme/optimise.py", ...pngs.map((f) => f.file)], { stdout: "inherit", stderr: "inherit" });
      if (r.exitCode !== 0) throw new Error("optimise.py failed");
      for (const f of pngs) f.bytes = statSync(f.file).size;
    } else console.log("\n(no python3 with Pillow + pyoxipng — frames left at Chrome's size; `pip install --user pillow pyoxipng`)");
  }

  // ── manifest ───────────────────────────────────────────────────────────────────────────────────
  const manifestFile = join(OUT, "manifest.json");
  const prior: Frame[] = existsSync(manifestFile) ? (JSON.parse(readFileSync(manifestFile, "utf8")) as { frames: Frame[] }).frames : [];
  const merged = [...prior.filter((f) => !frames.some((g) => g.file === f.file) && existsSync(f.file)), ...frames].sort((a, b) => a.file.localeCompare(b.file));
  const total = merged.reduce((n, f) => n + f.bytes, 0);
  writeFileSync(manifestFile, JSON.stringify({ made: new Date().toISOString(), chrome: browser.version, root: ROOT, totalBytes: total, frames: merged }, null, 2) + "\n");
  console.log(`\n${merged.length} files, ${kb(total)} in ${OUT}/ (budget 6 MB) · ${Math.round((performance.now() - t0) / 1000)} s`);
  for (const d of all) rmSync(join(ROOT, `dist-readme-${d.slug}`), { recursive: true, force: true });
}

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

main().catch((e) => { console.error(e); process.exit(1); });
