/**
 * The browser half of a clip (docs/15 §3.3): a built page, scrolled once, top to bottom, as an MP4.
 *   bun packages/bench/readme/scroll.ts --dist=<dir> --route=/posts/x/ --out=.scratch/readme-video/x.mp4
 *     [--width=1440] [--height=900] [--seconds=8] [--fps=30] [--scheme=light] [--hold=1.5]
 *
 * Frames are CDP screenshots at eased scroll positions — no screen recorder, no window, nothing but
 * the page the build wrote, served the way `snypd dev` serves it. `ffmpeg` turns the frames into
 * H.264 the way vhs does for the terminal half, so both halves cut together at the same size.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@snypd/runtime";
import { launch, findChrome } from "../src/cdp";

const args = new Map(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.slice(2).split("="); return [k!, v ?? ""]; }));
const need = (k: string) => { const v = args.get(k); if (!v) throw new Error(`--${k}=… is required`); return v; };
const dist = need("dist"), route = need("route"), out = need("out");
const width = Number(args.get("width") ?? 1440), height = Number(args.get("height") ?? 900);
const seconds = Number(args.get("seconds") ?? 8), fps = Number(args.get("fps") ?? 30), hold = Number(args.get("hold") ?? 1.5);
const scheme = (args.get("scheme") ?? "light") as "light" | "dark";

const ease = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;   // in-out cubic

async function main() {
  if (!findChrome()) throw new Error("no Chrome on this machine");
  const server = serve(".", { dist });
  const browser = await launch();
  const frames = mkdtempSync(join(tmpdir(), "snypd-scroll-"));
  try {
    const page = await browser.page();
    await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
    await page.send("Page.enable"); await page.send("Runtime.enable");
    const loaded = page.once("Page.loadEventFired", 20_000);
    await page.send("Page.navigate", { url: `${server.url}${route}` });
    await loaded;
    await page.send("Runtime.evaluate", { awaitPromise: true, expression: "document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))" });
    // Smooth scrolling off and the caret hidden: every frame is a still, and a still must not be mid-animation.
    await page.send("Runtime.evaluate", { expression: "document.documentElement.style.scrollBehavior = 'auto'; document.documentElement.style.caretColor = 'transparent'" });
    const max = (await page.send<{ result: { value: number } }>("Runtime.evaluate", { returnByValue: true, expression: "Math.max(0, document.documentElement.scrollHeight - innerHeight)" })).result.value;

    const total = Math.round(seconds * fps), holdN = Math.round(hold * fps);
    let n = 0;
    const capture = async () => {
      const { data } = await page.send<{ data: string }>("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(frames, `f-${String(n++).padStart(5, "0")}.png`), Buffer.from(data, "base64"));
    };
    for (let i = 0; i < holdN; i++) await capture();
    for (let i = 0; i <= total; i++) {
      const y = Math.round(max * ease(i / total));
      await page.send("Runtime.evaluate", { awaitPromise: true, expression: `scrollTo(0, ${y}); new Promise(r => requestAnimationFrame(r))` });
      await capture();
    }
    for (let i = 0; i < holdN; i++) await capture();
    await page.close();

    const r = Bun.spawnSync(["ffmpeg", "-y", "-loglevel", "error", "-framerate", String(fps), "-i", join(frames, "f-%05d.png"),
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "slow", "-movflags", "+faststart", out], { stdout: "inherit", stderr: "inherit" });
    if (r.exitCode !== 0) throw new Error("ffmpeg failed");
    console.log(`${out}  ${n} frames · ${(n / fps).toFixed(1)} s · scrolled ${max} px`);
  } finally { rmSync(frames, { recursive: true, force: true }); browser.close(); server.stop(); }
}

main().catch((e) => { console.error(e); process.exit(1); });
