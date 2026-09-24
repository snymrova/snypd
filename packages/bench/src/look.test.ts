import { afterAll, describe, expect, test, setDefaultTimeout } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browserCandidates } from "./cdp";
import { cftPlatform } from "./eyes";
import { closeEyes, eyesBrowser, formatLook, look, lookKey, type LookResult } from "./look";

// A real browser, started once for the file; the timeout is a hang detector, not a stopwatch.
setDefaultTimeout(60_000);

describe("where a browser is found (E1)", () => {
  const home = mkdtempSync(join(tmpdir(), "snypd-home-"));
  afterAll(() => rmSync(home, { recursive: true, force: true }));

  test("SNYPD_CHROME first, then the system's, then the caches newest version first", () => {
    for (const v of ["1200", "1243", "1217"]) mkdirSync(join(home, ".cache", "ms-playwright", `chromium_headless_shell-${v}`), { recursive: true });
    for (const v of ["linux-151.0.7922.47", "linux-152.0.7977.42", "linux-115.0.5790.98"]) mkdirSync(join(home, ".cache", "puppeteer", "chrome-headless-shell", v), { recursive: true });
    mkdirSync(join(home, ".cache", "snypd", "chrome-headless-shell", "150.0.1.2"), { recursive: true });
    const all = browserCandidates({ SNYPD_CHROME: "/opt/mine/chrome" }, home, "linux");
    expect(all[0]).toEqual({ path: "/opt/mine/chrome", name: "SNYPD_CHROME", source: "env", shell: false });
    expect(all[1]!.path).toBe("/usr/bin/google-chrome");
    expect(all.some((c) => c.path === "/usr/bin/microsoft-edge" && c.source === "system")).toBe(true);
    expect(all.some((c) => c.path === "/usr/bin/brave-browser")).toBe(true);
    // snypd's own install before anyone else's cache; each cache newest first; shells marked.
    const cached = all.filter((c) => c.source !== "env" && c.source !== "system");
    expect(cached[0]!.source).toBe("snypd");
    const pw = cached.filter((c) => c.source === "playwright" && c.shell).map((c) => c.path.match(/shell-(\d+)/)![1]);
    expect([...new Set(pw)]).toEqual(["1243", "1217", "1200"]);
    const pp = cached.filter((c) => c.source === "puppeteer" && c.shell).map((c) => c.path.match(/linux-([\d.]+)/)![1]);
    expect(pp).toEqual(["152.0.7977.42", "151.0.7922.47", "115.0.5790.98"]);
    expect(cached.filter((c) => /headless[-_]shell/.test(c.path)).every((c) => c.shell)).toBe(true);
  });

  test("macOS and Windows look where those platforms install Chrome, Edge and Brave", () => {
    const mac = browserCandidates({}, "/Users/u", "darwin").map((c) => c.path);
    expect(mac).toContain("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
    expect(mac).toContain("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge");
    expect(mac).toContain("/Applications/Brave Browser.app/Contents/MacOS/Brave Browser");
    const win = browserCandidates({ PROGRAMFILES: "C:\\PF", LOCALAPPDATA: "C:\\L" }, "C:\\Users\\u", "win32").map((c) => c.path);
    expect(win.some((p) => p.includes("Chrome") && p.endsWith("chrome.exe"))).toBe(true);
    expect(win.some((p) => p.endsWith("msedge.exe"))).toBe(true);
    expect(win.some((p) => p.endsWith("brave.exe"))).toBe(true);
  });

  test("SNYPD_CHROME=none is no browser at all", () => {
    expect(browserCandidates({ SNYPD_CHROME: "none" }, home, "linux")).toEqual([]);
  });

  test("Chrome for Testing's platform names", () => {
    expect(cftPlatform("linux", "x64")).toBe("linux64");
    expect(cftPlatform("linux", "arm64")).toBeUndefined();
    expect(cftPlatform("darwin", "arm64")).toBe("mac-arm64");
    expect(cftPlatform("win32", "x64")).toBe("win64");
  });
});

describe("the facts, as text", () => {
  test("a look's key is everything that decides the crop, and nothing else", () => {
    const a = { route: "/", slot: "masthead", width: 390, scheme: "dark", state: "rest" };
    expect(lookKey(a)).toBe(lookKey({ ...a }));
    expect(lookKey(a)).not.toBe(lookKey({ ...a, width: 1280 }));
    expect(lookKey(a)).not.toBe(lookKey({ ...a, state: "menu-open" }));
  });

  test("problems first with their box numbers, then what passed, then the delta and the links", () => {
    const r: LookResult = {
      id: "7f3a0000", label: "masthead · / · 390 dark · menu-open", ms: 212, browser: "x", route: "/", width: 390, scheme: "dark", state: "menu-open",
      selector: "header.snypd-masthead", clip: [0, 0, 390, 140], status: 200,
      problems: [
        { rule: "layout.overflow-x", where: "nav > ul", detail: "+38 px past the 390 px viewport", box: [0, 0, 428, 40], n: 1 },
        { rule: "taste.tiny-text", where: "p \"tagline\"", detail: "11.2 px", box: [0, 50, 200, 14], n: 2 },
        { rule: "layout.tap-target", where: "footer > a", detail: "20×20", box: [0, 900, 20, 20], n: 3, outside: true },
      ],
      passes: ["contrast ≥ 7.1:1 over 12 text runs", "CLS 0"],
      files: { full: "/x/7f3a0000/full.webp", before: "/x/7f3a0000/before.webp" },
      delta: { share: 0.032, box: [0, 0, 390, 140], tasteBefore: 2, tasteAfter: 1 }, notes: [],
    };
    const text = formatLook(r, (f) => `snypd://look/${f.split("/").slice(-2).join("/")}`);
    const lines = text.split("\n");
    expect(lines[0]).toBe("masthead · / · 390 dark · menu-open · 212 ms");
    expect(lines[1]).toMatch(/^✗ layout\.overflow-x\s+nav > ul\s+\+38 px .* box 1$/);
    expect(lines[2]).toContain("box 2");
    expect(lines[3]).toBe("✓ contrast ≥ 7.1:1 over 12 text runs · CLS 0");
    expect(lines[4]).toContain("1 outside the crop: layout.tap-target");
    expect(lines[5]).toBe("Δ since last: 3.2 % of pixels, inside 390×140 at (0, 0); taste 2 → 1");
    expect(lines[6]).toBe("full page: snypd://look/7f3a0000/full.webp · before: snypd://look/7f3a0000/before.webp");
  });
});

/**
 * The detectors against a page built to trip each one — the specimen passes them all, which proves
 * nothing about whether they can fire. Skipped on a machine with no browser, like every lane that needs one.
 */
const seeing = !!eyesBrowser();
describe.skipIf(!seeing)("the eyes, in a real browser", () => {
  const cache = mkdtempSync(join(tmpdir(), "snypd-look-"));
  let css = "";
  const page = () => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>t</title><style>
    body { margin: 0; font: 16px/1.5 sans-serif; background: #fff; color: #111; }
    header { padding: 8px; display: flex; gap: 8px; }
    header a { font-size: 12px; }
    .wide { width: 600px; height: 20px; background: #ccc; }
    .faint { color: #bbb; }
    .cut { width: 80px; white-space: nowrap; overflow: hidden; }
    .cover { position: absolute; left: 0; top: 0; width: 200px; height: 60px; background: #eee; }
    ${css}
  </style><body><header class="snypd-masthead"><a href="/a">A</a><button popovertarget="m">Menu</button><ul id="m" popover><li>One</li></ul></header>
  <main><h1>Title</h1><div class="wide"></div><p class="faint">This grey sentence is too faint to read against white.</p>
  <p class="cut">A line that will never fit in eighty pixels</p><img src="/missing.png" alt="" width="40" height="40">
  <details><summary>More</summary><p>Hidden until opened.</p></details></main></body></html>`;
  const server = Bun.serve({ port: 0, fetch: (r) => new URL(r.url).pathname === "/missing.png" ? new Response("no", { status: 404 }) : new Response(page(), { headers: { "content-type": "text/html" } }) });
  const url = `http://localhost:${server.port}`;
  afterAll(() => { closeEyes(); server.stop(true); rmSync(cache, { recursive: true, force: true }); });

  test("every detector fires where it should, with a box", async () => {
    const r = await look({ url, cacheDir: cache, width: 390 });
    const rules = r.problems.map((p) => p.rule);
    expect(rules).toContain("layout.overflow-x");
    expect(rules).toContain("contrast.rendered");
    expect(rules).toContain("layout.text-overflow");
    expect(rules).toContain("layout.broken-image");
    expect(rules).toContain("layout.tap-target");      // the 12 px link is under 24 either way
    expect(rules).toContain("page.console");            // the 404 for the image
    for (const p of r.problems.filter((x) => x.rule.startsWith("layout.") || x.rule === "contrast.rendered")) expect(p.box).toBeDefined();
    expect(r.problems.find((p) => p.rule === "layout.overflow-x")!.detail).toContain("+210 px");
    expect(r.image!.mimeType).toBe("image/webp");
    expect(existsSync(r.files.full!)).toBe(true);
    expect(r.delta).toEqual({ first: true });
  });

  test("the same look twice changes no pixel; a CSS change is found, and where", async () => {
    await look({ url, cacheDir: cache, slot: "masthead" });
    const same = await look({ url, cacheDir: cache, slot: "masthead" });
    expect(same.delta).toMatchObject({ share: 0 });
    css = "header { background: #123; }";
    const moved = await look({ url, cacheDir: cache, slot: "masthead" });
    css = "";
    expect("share" in moved.delta! && moved.delta.share).toBeGreaterThan(0.5);
    expect(existsSync(moved.files.before!)).toBe(true);
  });

  test("a slot crops to it; menu-open takes the sheet into the crop; open opens", async () => {
    const rest = await look({ url, cacheDir: cache, slot: "masthead", width: 390, since: "none" });
    expect(rest.selector).toBe("header.snypd-masthead");
    const open = await look({ url, cacheDir: cache, slot: "masthead", width: 390, state: "menu-open", since: "none" });
    expect(open.notes).toEqual([]);
    expect(open.clip[3]).toBeGreaterThanOrEqual(rest.clip[3]);
    const det = await look({ url, cacheDir: cache, selector: "main", state: "open", since: "none" });
    expect(det.notes).toEqual([]);
    const none = await look({ url, cacheDir: cache, slot: "toc", since: "none" });
    expect(none.notes[0]).toContain("not on /");
  });

  test("the outline names landmarks, headings and slots, with no picture", async () => {
    const r = await look({ url, cacheDir: cache, view: "outline" });
    expect(r.image).toBeUndefined();
    expect(r.outline).toContain("banner [masthead]");
    expect(r.outline).toContain("h1 Title");
  });
});
