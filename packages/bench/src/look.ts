/**
 * The eyes (E1, docs/36 §5a): `theme › look` — the agent sees the brick it just placed.
 *
 * `shoot` answers "does this theme hold up everywhere?" with 200 photographs and a contact sheet. That is
 * the review. This is the loop inside the review: one route, one width, one scheme, one state, cropped to
 * one slot, with the facts first as text and one picture second. A 1280×140 masthead is ~240 image tokens
 * where the page it sits on is ~1,370, and the masthead is what the agent just changed.
 *
 * **One browser for the whole session.** Started on the first look — never on `initialize`, and never on
 * import: nothing here runs until `look()` is called — a fresh tab per look in a context of its own (`tab`),
 * a blank tab kept for the before/after compare, and the browser killed after three idle minutes. chrome-headless-shell is preferred
 * when one is on the machine and can start (`eyesBrowsers`). No Playwright and no vision API: the agent is
 * the eyes, and all this file does is put the picture in front of it.
 *
 * **Deterministic.** The same call draws the same pixels: reduced motion is emulated, animations and
 * transitions are paused, the caret is hidden, states are forced (`CSS.forcePseudoState`, `showPopover()`,
 * `details.open`) rather than moused into.
 *
 * **Problems drawn where they are.** Every detector and every taste rule that has an element returns its
 * box; the boxes are numbered to match the text lines and drawn by one overlay that is removed after the
 * shot. The picture handed back has them; the picture kept as the next look's "before" does not, so the
 * compare measures the theme and not the annotations.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import { launch, browserCandidates, cacheSandboxBlocked, type Browser, type BrowserCandidate, type Page } from "./cdp";
import { diffPictures } from "./pixels";
import { TASTE_PROBE, tasteVerdicts, type TasteMeasure } from "@snypd/render/taste";

/** x, y, width, height in document pixels. */
export type Box = [number, number, number, number];

export const LOOK_STATES = ["rest", "hover", "focus", "menu-open", "open"] as const;
export type LookState = (typeof LOOK_STATES)[number];
export type LookScheme = "light" | "dark";

/**
 * Where each slot is on a page, most specific first; the first that matches a visible element wins.
 * A piece's own `emits:` classes go in front of these (the caller passes them as `slotClasses`), so a slot
 * filled by a piece is found by the class that piece promises to emit.
 *
 * `house`, `motion` and `backdrop` are everywhere at once: they crop to the first viewport.
 */
export const SLOT_SELECTORS: Record<string, string[]> = {
  masthead: ["header.snypd-masthead", "body > header", "header"],
  column: ["main"],
  prose: ["main article", "main"],
  code: ["main pre", "main table"],
  blocks: ["main .snypd-block", "main figure"],
  cover: [".snypd-cover", "main article > header", "main h1"],
  entries: [".snypd-entries", ".snypd-home-entries"],
  "post-foot": [".snypd-post-footer"],
  footer: ["body > footer", "footer"],
  home: ["main.snypd-home"],
  notes: [".footnotes"],
  toc: [".snypd-toc"],
  wall: [".snypd-logo-wall"],
};
export const WHOLE_PAGE_SLOTS = new Set(["house", "motion", "backdrop"]);

/** The longest edge a picture is handed back at (docs/36 §5a): past it, a model downsamples anyway. */
export const MAX_EDGE = 1568;
/** A full page is cut here, like `shoot`'s. */
export const MAX_FULL_HEIGHT = 8000;
export const IDLE_MS = 3 * 60_000;
/** How many looks' files are kept under `.snypd/look/`; the oldest go first. */
const KEEP = 24;

export interface LookOptions {
  /** The origin of a server already serving the site — the preview. */
  url: string;
  /** Where the pictures go: `.snypd/look` under the site. */
  cacheDir: string;
  route?: string;
  slot?: string;
  /** A CSS selector to crop to instead of a slot. */
  selector?: string;
  /** Classes the slot's piece emits, tried before `SLOT_SELECTORS`. */
  slotClasses?: string[];
  width?: number;
  scheme?: LookScheme;
  state?: LookState;
  /** What `hover`, `focus`, `menu-open` and `open` act on; by default the first fitting element in the crop. */
  target?: string;
  /** `last` (default) compares with the previous look at the same route, crop, width, scheme and state. */
  since?: "last" | "none";
  /** `outline` returns landmarks and headings as text, and no picture. */
  view?: "picture" | "outline";
}

export interface LookFact {
  rule: string;
  /** A short name for the element: `nav > ul`, `p "Notes on…"`, or `page`. */
  where: string;
  detail: string;
  box?: Box;
  /** The number drawn on the picture, when the box is in it. */
  n?: number;
  /** True when the fact is outside the crop — listed, not drawn. */
  outside?: boolean;
}

export interface LookResult {
  id: string;
  /** `masthead · / · 390 dark · menu-open`. */
  label: string;
  ms: number;
  browser: string;
  route: string;
  width: number;
  scheme: LookScheme;
  state: LookState;
  /** The selector the crop resolved to; undefined for the first viewport. */
  selector?: string;
  clip: Box;
  status: number;
  problems: LookFact[];
  passes: string[];
  image?: { data: string; mimeType: "image/webp"; width: number; height: number };
  /** Absolute paths under `cacheDir/<id>/`. */
  files: { crop?: string; full?: string; before?: string };
  delta?: { first: true } | { share: number; box?: Box; size?: string; tasteBefore: number; tasteAfter: number };
  outline?: string;
  /** Anything the look could not do as asked, said plainly (a slot not on this route, a state with nothing to act on). */
  notes: string[];
}

// ── the session ─────────────────────────────────────────────────────────────────────────────────────

interface Session { browser: Browser; scratch?: Page; which: BrowserCandidate; idle?: ReturnType<typeof setTimeout> }
let session: Session | undefined;
let starting: Promise<Session> | undefined;

/**
 * The browsers `look` would try, in order: `SNYPD_CHROME` if set, then any headless shell, then any full
 * browser. More than one, because the first can refuse to start: a Chromium *downloaded* into a cache has
 * no AppArmor profile, and Ubuntu 23.10+ will not let it build its sandbox — the system's Chrome, which
 * ships one, still starts. snypd does not answer that with `--no-sandbox` on its own (`SNYPD_CHROME_FLAGS`
 * is the person's switch, as it is for `docker/`); it tries the next browser, and says so.
 */
export function eyesBrowsers(): BrowserCandidate[] {
  const all = browserCandidates().filter((c) => existsSync(c.path));
  if (all[0]?.source === "env") return all.slice(0, 1);
  // Where a cached browser cannot sandbox, it goes last: still tried, in case the machine says otherwise.
  const late = cacheSandboxBlocked() ? (c: BrowserCandidate) => c.source !== "system" : () => false;
  const seen = new Set<string>();
  return [...all.filter((c) => c.shell && !late(c)), ...all.filter((c) => !c.shell && !late(c)), ...all.filter((c) => late(c))]
    .filter((c) => !seen.has(c.path) && (seen.add(c.path), true));
}
/** Which browser `look` tries first, without starting it — what `doctor` reports. */
export const eyesBrowser = (): BrowserCandidate | undefined => eyesBrowsers()[0];
/** Browsers that would not start this process, so the next look does not try them again. */
const refused = new Map<string, string>();

/** Whether a browser is running for looks right now. */
export const eyesOpen = (): boolean => session !== undefined;

/** Close the browser, if one is open. Idempotent; called on idle and when the MCP session ends. */
export function closeEyes(): void {
  const s = session;
  session = undefined;
  if (!s) return;
  if (s.idle) clearTimeout(s.idle);
  try { s.browser.close(); } catch { /* already gone */ }
}

function keepAlive(s: Session): void {
  if (s.idle) clearTimeout(s.idle);
  s.idle = setTimeout(() => { if (session === s) closeEyes(); }, IDLE_MS);
  s.idle.unref?.();
}

export class NoBrowserError extends Error {
  hint = "`snypd eyes install` fetches chrome-headless-shell (~90 MB) to ~/.cache/snypd once; or set SNYPD_CHROME to any Chromium";
  constructor() { super("no browser on this machine"); }
}

async function eyes(): Promise<Session> {
  if (session) { keepAlive(session); return session; }
  starting ??= (async () => {
    const tries = eyesBrowsers().filter((c) => !refused.has(c.path));
    if (!tries.length && !refused.size) throw new NoBrowserError();
    let browser: Browser | undefined, which: BrowserCandidate | undefined;
    for (const c of tries) {
      try { browser = await launch({ browser: c, attempts: c.source === "env" ? 3 : 1 }); which = c; break; }
      catch (e) { refused.set(c.path, (e as Error).message); }
    }
    if (!browser || !which) {
      const why = [...refused].map(([p, m]) => `  ${p}: ${m}`).join("\n");
      throw Object.assign(new Error(`no browser here would start:\n${why}`), {
        hint: /sandbox/i.test(why) ? "a downloaded Chromium cannot build its sandbox on this distro — install Chrome or Chromium from the system's packages, or set SNYPD_CHROME_FLAGS=--no-sandbox if this machine is yours to decide" : "set SNYPD_CHROME to a Chromium that runs here" });
    }
    return { browser, which };
  })();
  try { session = await starting; } finally { starting = undefined; }
  keepAlive(session);
  return session;
}

/**
 * One tab for one look, in a browser context of its own. The first build reused one tab, and the second
 * look at an unchanged masthead reported 1.3 % of its pixels changed: the look before had visited
 * `/posts/`, and the nav's link had turned `:visited`. A throwaway context has no history, costs a few
 * milliseconds, and makes the same call draw the same pixels.
 */
async function tab(s: Session): Promise<{ page: Page; console: string[] }> {
  const page = await s.browser.page({ isolated: true });
  const console: string[] = [];
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Log.enable");
  // Console errors and uncaught exceptions: a theme has no script, so any is news.
  page.on("Runtime.exceptionThrown", (p) => { const d = (p.exceptionDetails as { text?: string; exception?: { description?: string } } | undefined); console.push(d?.exception?.description?.split("\n")[0] ?? d?.text ?? "exception"); });
  page.on("Runtime.consoleAPICalled", (p) => { if (p.type === "error") console.push(String(((p.args as { value?: unknown }[] | undefined)?.[0]?.value) ?? "console.error")); });
  page.on("Log.entryAdded", (p) => { const e = p.entry as { level?: string; text?: string; url?: string }; if (e?.level === "error") console.push(`${e.text ?? "error"}${e.url ? ` (${e.url.replace(/^https?:\/\/[^/]+/, "")})` : ""}`); });
  return { page, console };
}

// ── in-page code ────────────────────────────────────────────────────────────────────────────────────
// Each runs through `Runtime.evaluate` as its own source, so each names nothing outside itself.

/** Settle: stylesheets, fonts, every image made eager and decoded, animation stilled, two frames. Returns the document height and CLS. */
const SETTLE = `(async () => {
  let cls = 0;
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) cls += e.value; }).observe({ type: "layout-shift", buffered: true }); } catch {}
  const still = document.createElement("style"); still.id = "__snypd_still";
  still.textContent = "*,*::before,*::after{animation-play-state:paused!important;animation-delay:0s!important;transition:none!important;caret-color:transparent!important}";
  document.head.appendChild(still);
  await Promise.all([...document.querySelectorAll('link[rel="stylesheet"]')].map(l => l.sheet ? 0 : new Promise(r => { l.onload = l.onerror = r; })));
  for (const i of document.images) i.loading = "eager";
  // Every declared face loaded, not just the ones layout had asked for when fonts.ready resolved: under
  // font-display: swap a shot taken in between drew the fallback, and one run in two differed (P3).
  await document.fonts.ready; await Promise.all([...document.fonts].map(f => f.load().catch(() => {}))); await document.fonts.ready;
  await Promise.all([document.fonts.ready, ...[...document.images].map(i => Promise.race([i.decode().catch(() => {}), new Promise(r => setTimeout(r, 8000))]))]);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const nav = performance.getEntriesByType("navigation")[0];
  return { h: Math.ceil(document.documentElement.scrollHeight), cls: +cls.toFixed(4), status: nav && nav.responseStatus || 0 };
})()`;

/** Find the crop: the first selector that matches a visible element; its box, and the piece of the selector list that matched. */
function locate(selectors: string[], state: string): { sel?: string; box?: number[]; menu?: number[] } {
  const g = globalThis as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const doc = g.document;
  const box = (e: any) => { const r = e.getBoundingClientRect(); return [Math.round(r.left + g.scrollX), Math.round(r.top + g.scrollY), Math.round(r.width), Math.round(r.height)]; }; // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const sel of selectors) {
    let els: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    try { els = [...doc.querySelectorAll(sel)]; } catch { continue; }
    const e = els.find((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    if (!e) continue;
    const m = state === "menu-open" ? doc.querySelector(":popover-open") : null;
    return { sel, box: box(e), menu: m ? box(m) : undefined };
  }
  return {};
}

/** Put the page in a state. Returns what it acted on, or why it could not. */
function enter(state: string, scope: string | null, target: string | null): { ok: boolean; what: string } {
  const doc = (globalThis as any).document; // eslint-disable-line @typescript-eslint/no-explicit-any
  const within = (scope && doc.querySelector(scope)) || doc;
  const name = (e: any) => e.tagName.toLowerCase() + (e.id ? "#" + e.id : e.classList[0] ? "." + e.classList[0] : ""); // eslint-disable-line @typescript-eslint/no-explicit-any
  if (state === "menu-open") {
    const btn = target ? doc.querySelector(target) : within.querySelector("[popovertarget]") || doc.querySelector("[popovertarget]");
    const pop = btn && btn.getAttribute && btn.getAttribute("popovertarget") ? doc.getElementById(btn.getAttribute("popovertarget")) : (target ? doc.querySelector(target) : doc.querySelector("[popover]"));
    if (!pop || !pop.showPopover) return { ok: false, what: "no popover menu on this page" };
    try { pop.showPopover(); } catch { /* already open */ }
    return { ok: true, what: name(pop) };
  }
  if (state === "open") {
    const d = target ? doc.querySelector(target) : within.querySelector("details") || within.querySelector("dialog");
    if (!d) return { ok: false, what: "no <details> or <dialog> in the crop" };
    if (d.tagName === "DIALOG") d.show(); else d.open = true;
    return { ok: true, what: name(d) };
  }
  return { ok: true, what: "" };
}

/**
 * The layout detectors (docs/36 §5a, carved from impeccable's list where snypd had none) and rendered
 * contrast. Every problem has a box; every rule also says what it saw when it passed.
 */
function detect(width: number): { problems: { rule: string; where: string; detail: string; box?: number[] }[]; seen: Record<string, unknown> } {
  const g = globalThis as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  // The layout viewport, not `innerWidth`: under mobile emulation a page wider than the phone *widens*
  // `innerWidth` to fit it (390 became 600 in the test), which would hide the very overflow asked about.
  const doc = g.document, W = doc.documentElement.clientWidth;
  type El = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const cs = (e: El) => g.getComputedStyle(e);
  const box = (e: El) => { const r = e.getBoundingClientRect(); return [Math.round(r.left + g.scrollX), Math.round(r.top + g.scrollY), Math.round(r.width), Math.round(r.height)]; };
  const vis = (e: El) => { const r = e.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) return false; const s = cs(e); return s.visibility !== "hidden" && s.display !== "none" && +s.opacity > 0; };
  const name = (e: El) => {
    const one = (x: El) => x.tagName.toLowerCase() + (x.id && !x.id.startsWith("__") ? "#" + x.id : x.classList[0] ? "." + x.classList[0] : "");
    const p = e.parentElement && e.parentElement !== doc.body ? one(e.parentElement) + " > " : "";
    const t = (e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 24);
    return p + one(e) + (t && !/^(nav|ul|ol|header|footer|main|section|div)$/.test(e.tagName.toLowerCase()) ? ` "${t}${(e.textContent || "").trim().length > 24 ? "…" : ""}"` : "");
  };
  const all: El[] = [...doc.body.querySelectorAll("*")].filter((e: El) => !e.closest("#__snypd_look, script, style, template"));
  const problems: { rule: string; where: string; detail: string; box?: number[] }[] = [];
  const seen: Record<string, unknown> = {};

  // layout.overflow-x — the outermost element past the right edge, not clipped by an ancestor that scrolls or hides it.
  const clipped = (e: El) => { for (let p = e.parentElement; p && p !== doc.body; p = p.parentElement) { const o = cs(p).overflowX; if (o !== "visible") return true; } return false; };
  const over = all.filter((e) => vis(e) && e.getBoundingClientRect().right > W + 1 && cs(e).position !== "fixed" && !clipped(e));
  const outer = over.filter((e) => !over.includes(e.parentElement));
  for (const e of outer.slice(0, 4)) problems.push({ rule: "layout.overflow-x", where: name(e), detail: `+${Math.round(e.getBoundingClientRect().right - W)} px past the ${W} px viewport`, box: box(e) });
  seen.scrollWidth = doc.documentElement.scrollWidth;

  // layout.text-overflow — text cut off by its own box.
  let cut = 0;
  for (const e of all) {
    if (cut >= 4 || !vis(e)) continue;
    const s = cs(e);
    if (!["hidden", "clip"].includes(s.overflowX) && s.textOverflow !== "ellipsis") continue;
    if (![...e.childNodes].some((n: El) => n.nodeType === 3 && n.textContent.trim())) continue;
    if (e.scrollWidth > e.clientWidth + 1) { cut++; problems.push({ rule: "layout.text-overflow", where: name(e), detail: `text needs ${e.scrollWidth} px, its box is ${e.clientWidth}${s.textOverflow === "ellipsis" ? " (ellipsised)" : " (cut)"}`, box: box(e) }); }
  }

  // layout.broken-image — an image that finished and drew nothing.
  for (const i of doc.images) if (i.complete && i.naturalWidth === 0 && vis(i)) problems.push({ rule: "layout.broken-image", where: `img ${(i.getAttribute("src") || "").slice(0, 60)}`, detail: "did not load", box: box(i) });

  // layout.occlusion — a heading, link, button or image whose centre is covered by something that is not it.
  // Checked in the viewport only (elementFromPoint cannot see further), which is the part a reader sees first.
  let covered = 0;
  for (const e of all) {
    if (covered >= 4 || !/^(H1|H2|H3|A|BUTTON|IMG|SUMMARY)$/.test(e.tagName) || !vis(e)) continue;
    const r = e.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x >= W || y >= g.innerHeight) continue;
    const top = doc.elementFromPoint(x, y);
    // An open menu or dialog covers the page on purpose: that is what opening it means.
    if (!top || top === e || e.contains(top) || top.contains(e) || top.closest("#__snypd_look, :popover-open, dialog[open]")) continue;
    covered++;
    problems.push({ rule: "layout.occlusion", where: name(e), detail: `its centre is under ${name(top)}`, box: box(e) });
  }

  // layout.tap-target — at phone width, anything pressed. Under 24 px either way fails WCAG 2.2's AA floor (2.5.8)
  // and is a problem with a box; 24–44 is under the AAA/platform size (2.5.5) and is counted, not boxed —
  // the base masthead's links are 28 px tall, and fourteen boxes on every phone look drowned the one that
  // mattered. A link inside a sentence is exempt, as both criteria say: the sentence is the target.
  if (width < 600) {
    const tiny: El[] = [];
    let least = Infinity, under44 = 0;
    for (const e of all) {
      if (!/^(A|BUTTON|SUMMARY|INPUT|SELECT)$/.test(e.tagName) && e.getAttribute("role") !== "button") continue;
      if (!vis(e) || (e.tagName === "A" && cs(e).display === "inline" && e.closest("p, li, td, figcaption, blockquote, dd") && !e.closest("nav"))) continue;
      const r = e.getBoundingClientRect(), side = Math.min(r.width, r.height);
      least = Math.min(least, Math.round(side));
      if (side < 24) tiny.push(e); else if (side < 44) under44++;
    }
    for (const e of tiny.slice(0, 4)) { const r = e.getBoundingClientRect(); problems.push({ rule: "layout.tap-target", where: name(e), detail: `${Math.round(r.width)}×${Math.round(r.height)} px, under WCAG's 24${tiny.length > 4 && e === tiny[3] ? ` (and ${tiny.length - 4} more)` : ""}`, box: box(e) }); }
    seen.tapLeast = Number.isFinite(least) ? least : undefined;
    seen.tapUnder44 = under44;
  }

  // Rendered contrast: the text colour against what is actually behind it — the backgrounds composited up the
  // tree. The solver proves the tokens; this proves the page. Text over an image or a gradient is not judged.
  const rgba = (c: string) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number); return [p[0]!, p[1]!, p[2]!, p[3] ?? 1]; };
  const over2 = (a: number[], b: number[]) => { const al = a[3]!; return [a[0]! * al + b[0]! * (1 - al), a[1]! * al + b[1]! * (1 - al), a[2]! * al + b[2]! * (1 - al), 1]; };
  const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!); };
  const backdrop = (e: El): number[] | null => {
    const layers: number[][] = [];
    for (let p = e; p; p = p.parentElement) {
      const s = cs(p);
      if (s.backgroundImage && s.backgroundImage !== "none") return null;
      const c = rgba(s.backgroundColor);
      if (c && c[3]! > 0) { layers.push(c); if (c[3] === 1) break; }
    }
    let base = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) base = over2(layers[i]!, base);
    return base;
  };
  let lowest = Infinity, judged = 0;
  const bad = new Map<string, { e: El; ratio: number; need: number }>();
  for (const e of all) {
    if (![...e.childNodes].some((n: El) => n.nodeType === 3 && n.textContent.trim().length > 1) || !vis(e)) continue;
    const s = cs(e);
    const fg = rgba(s.color), bg = backdrop(e);
    if (!fg || !bg) continue;
    const c = over2(fg, bg);
    const [l1, l2] = [lum(c), lum(bg)].sort((a, b) => b - a);
    const ratio = (l1! + 0.05) / (l2! + 0.05);
    const px = parseFloat(s.fontSize) || 16, large = px >= 24 || (px >= 18.66 && +s.fontWeight >= 700);
    const need = large ? 3 : 4.5;
    judged++;
    lowest = Math.min(lowest, ratio);
    if (ratio < need) { const k = `${s.color}|${bg.join(",")}`; const was = bad.get(k); if (!was || ratio < was.ratio) bad.set(k, { e, ratio, need }); }
  }
  for (const { e, ratio, need } of [...bad.values()].sort((a, b) => a.ratio - b.ratio).slice(0, 4))
    problems.push({ rule: "contrast.rendered", where: name(e), detail: `${ratio.toFixed(2)}:1, needs ${need}:1`, box: box(e) });
  seen.contrastLowest = Number.isFinite(lowest) ? +lowest.toFixed(2) : undefined;
  seen.contrastJudged = judged;
  return { problems, seen };
}

/** Draw numbered boxes over the page, in one layer that `unmark` removes. */
function mark(boxes: [number, number[]][]): void {
  const doc = (globalThis as any).document; // eslint-disable-line @typescript-eslint/no-explicit-any
  doc.getElementById("__snypd_look")?.remove();
  const layer = doc.createElement("div");
  layer.id = "__snypd_look";
  layer.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;contain:none";
  for (const [n, [x, y, w, h]] of boxes) {
    const b = doc.createElement("div");
    b.style.cssText = `position:absolute;box-sizing:border-box;left:${x! - 2}px;top:${y! - 2}px;width:${w! + 4}px;height:${h! + 4}px;border:2px solid #e5195e;border-radius:2px;background:rgba(229,25,94,.08)`;
    const l = doc.createElement("span");
    l.textContent = String(n);
    l.style.cssText = `position:absolute;left:-2px;${y! >= 18 ? "top:-18px" : "bottom:-18px"};min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;background:#e5195e;color:#fff;font:700 11px/16px ui-sans-serif,system-ui,sans-serif;text-align:center;border-radius:2px`;
    b.appendChild(l);
    layer.appendChild(b);
  }
  doc.documentElement.appendChild(layer);
}

/** Landmarks and headings, folded: what is on the page and in what order, in ~150 tokens. */
function outline(slots: Record<string, string[]>): string {
  const doc = (globalThis as any).document; // eslint-disable-line @typescript-eslint/no-explicit-any
  type El = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const role = (e: El): string | undefined => {
    const r = e.getAttribute("role"); if (r) return /^(banner|navigation|main|complementary|contentinfo|region|search|form|dialog)$/.test(r) ? r : undefined;
    const t = e.tagName.toLowerCase();
    if (t === "header" && !e.closest("main, article, section, aside")) return "banner";
    if (t === "footer" && !e.closest("main, article, section, aside")) return "contentinfo";
    return ({ nav: "navigation", main: "main", aside: "complementary", search: "search", form: e.getAttribute("aria-label") ? "form" : undefined, section: e.getAttribute("aria-label") || e.getAttribute("aria-labelledby") ? "region" : undefined } as Record<string, string | undefined>)[t];
  };
  const slotOf = (e: El) => { for (const [s, sels] of Object.entries(slots)) for (const sel of sels) { try { if (e.matches(sel)) return s; } catch { /* a selector this engine refuses */ } } return undefined; };
  const label = (e: El) => (e.getAttribute("aria-label") || "").trim();
  const lines: string[] = [];
  const walk = (e: El, depth: number) => {
    for (const c of e.children) {
      const cs = (globalThis as any).getComputedStyle(c); // eslint-disable-line @typescript-eslint/no-explicit-any
      if (cs.display === "none" || c.id === "__snypd_look") continue;
      const r = role(c);
      const h = /^H([1-6])$/.exec(c.tagName);
      if (r) {
        const links = c.querySelectorAll("a[href]").length, imgs = c.querySelectorAll("img, svg[role=img]").length;
        const s = slotOf(c);
        lines.push(`${"  ".repeat(depth)}${r}${label(c) ? ` "${label(c)}"` : ""}${s ? ` [${s}]` : ""} · ${links} link${links === 1 ? "" : "s"}${imgs ? ` · ${imgs} image${imgs === 1 ? "" : "s"}` : ""}`);
        walk(c, depth + 1);
      } else if (h) {
        lines.push(`${"  ".repeat(depth)}h${h[1]} ${(c.textContent || "").replace(/\s+/g, " ").trim().slice(0, 70)}`);
      } else walk(c, depth);
    }
  };
  walk(doc.body, 0);
  return lines.slice(0, 60).join("\n") + (lines.length > 60 ? `\n… ${lines.length - 60} more` : "");
}

// ── the look ────────────────────────────────────────────────────────────────────────────────────────

const call = (fn: (...a: never[]) => unknown, ...args: unknown[]) => `(${fn.toString()})(${args.map((a) => JSON.stringify(a ?? null)).join(", ")})`;

async function evaluate<T>(page: Page, expression: string): Promise<T> {
  const r = await page.send<{ result: { value?: T }; exceptionDetails?: { exception?: { description?: string }; text?: string } }>("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`in the page: ${r.exceptionDetails.exception?.description?.split("\n")[0] ?? r.exceptionDetails.text}`);
  return r.result.value as T;
}

const intersects = (a: Box | number[], b: Box) => a[0]! < b[0] + b[2] && a[0]! + a[2]! > b[0] && a[1]! < b[1] + b[3] && a[1]! + a[3]! > b[1];

/** The look's key for before/after: everything that decides what the crop should look like. */
export const lookKey = (o: { route: string; slot?: string; selector?: string; width: number; scheme: string; state: string }) =>
  createHash("sha1").update(JSON.stringify([o.route, o.slot ?? "", o.selector ?? "", o.width, o.scheme, o.state])).digest("hex").slice(0, 12);

/** Keep the newest `KEEP` looks' directories and drop the rest. */
function prune(dir: string): void {
  let ids: { d: string; t: number }[];
  try { ids = readdirSync(dir).filter((n) => /^[0-9a-f]{8}$/.test(n)).map((n) => ({ d: join(dir, n), t: statSync(join(dir, n)).mtimeMs })); } catch { return; }
  for (const { d } of ids.sort((a, b) => b.t - a.t).slice(KEEP)) rmSync(d, { recursive: true, force: true });
}

export async function look(opts: LookOptions): Promise<LookResult> {
  try { return await lookOnce(opts); }
  catch (e) {
    // A browser that died between looks (killed, crashed, the machine slept) is started again, once.
    if (e instanceof NoBrowserError || !session) throw e;
    if (!/closed|WebSocket|Target|not attached|No target|Session/i.test((e as Error).message)) throw e;
    closeEyes();
    return await lookOnce(opts);
  }
}

async function lookOnce(opts: LookOptions): Promise<LookResult> {
  const t0 = performance.now();
  const s = await eyes();
  const { page, console: logged } = await tab(s);
  try { return await lookIn(s, page, logged, opts, t0); }
  finally { await page.close(); }
}

async function lookIn(s: Session, page: Page, logged: string[], opts: LookOptions, t0: number): Promise<LookResult> {
  const route = opts.route ? (opts.route.startsWith("/") ? opts.route : `/${opts.route}`) : "/";
  const width = opts.width ?? 1280, scheme = opts.scheme ?? "light", state = opts.state ?? "rest";
  const view = opts.view ?? "picture";
  const notes: string[] = [];
  const height = width < 600 ? 844 : 900;

  await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }, { name: "prefers-reduced-motion", value: "reduce" }] });
  const loaded = page.once("Page.loadEventFired", 30_000);
  await page.send("Page.navigate", { url: `${opts.url.replace(/\/$/, "")}${route}` });
  await loaded;
  const settled = await evaluate<{ h: number; cls: number; status: number }>(page, SETTLE);

  // The crop: an explicit selector, else the piece's classes and the slot's usual places, else the first viewport.
  const slot = opts.slot && !WHOLE_PAGE_SLOTS.has(opts.slot) ? opts.slot : undefined;
  if (opts.slot && !SLOT_SELECTORS[opts.slot] && !WHOLE_PAGE_SLOTS.has(opts.slot)) throw Object.assign(new Error(`no slot "${opts.slot}"`), { hint: `slots: ${[...Object.keys(SLOT_SELECTORS), ...WHOLE_PAGE_SLOTS].join(", ")} — or pass \`selector\`` });
  const selectors = opts.selector ? [opts.selector] : slot ? [...(opts.slotClasses ?? []).map((c) => `.${c}`), ...SLOT_SELECTORS[slot]!] : [];

  let where = selectors.length ? await evaluate<ReturnType<typeof locate>>(page, call(locate, selectors, "rest")) : {};
  if (selectors.length && !where.sel) notes.push(`${opts.selector ? `\`${opts.selector}\`` : `the ${slot} slot`} is not on ${route} (looked for ${selectors.join(", ")}) — showing the first viewport`);

  // The state, then the crop found again: an open menu moves things, and the sheet is part of the picture.
  if (state === "hover" || state === "focus") {
    const sel = opts.target ?? (where.sel ? `${where.sel} :is(a[href], button, summary)` : "a[href], button, summary");
    await page.send("DOM.enable"); await page.send("CSS.enable");
    const { root } = await page.send<{ root: { nodeId: number } }>("DOM.getDocument", { depth: 0 });
    const { nodeId } = await page.send<{ nodeId: number }>("DOM.querySelector", { nodeId: root.nodeId, selector: sel }).catch(() => ({ nodeId: 0 }));
    if (nodeId) await page.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: state === "hover" ? ["hover"] : ["focus", "focus-visible", "focus-within"] });
    else notes.push(`nothing to ${state} — no \`${sel}\` on ${route}`);
  } else if (state !== "rest") {
    const r = await evaluate<{ ok: boolean; what: string }>(page, call(enter, state, where.sel ?? null, opts.target ?? null));
    if (!r.ok) notes.push(`${state}: ${r.what}`);
  }
  if (state !== "rest") {
    await evaluate(page, "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))");
    if (selectors.length && where.sel) where = await evaluate<ReturnType<typeof locate>>(page, call(locate, [where.sel], state));
  }

  const docH = Math.max(height, await evaluate<number>(page, "Math.ceil(document.documentElement.scrollHeight)"));
  let clip: Box;
  if (where.box) {
    let [x, y, w, h] = where.box as Box;
    if (where.menu) { const [mx, my, mw, mh] = where.menu; const x1 = Math.max(x + w, mx! + mw!), y1 = Math.max(y + h, my! + mh!); x = Math.min(x, mx!); y = Math.min(y, my!); w = x1 - x; h = y1 - y; }
    // A few pixels of air, then clamped to the page: a crop that ends exactly on the border hides the border.
    const pad = 8;
    x = Math.max(0, x - pad); y = Math.max(0, y - pad);
    w = Math.min(width - x, w + pad * 2); h = Math.min(docH - y, h + pad * 2);
    clip = [x, y, Math.max(1, w), Math.max(1, h)];
  } else clip = [0, 0, width, Math.min(height, docH)];
  if (clip[3] > MAX_EDGE) { notes.push(`the crop is ${clip[3]} px tall; cut at ${MAX_EDGE} — the full page is linked`); clip = [clip[0], clip[1], clip[2], MAX_EDGE]; }

  const id = randomBytes(4).toString("hex");
  const dir = join(opts.cacheDir, id);
  mkdirSync(dir, { recursive: true });
  const status = settled.status;
  const label = `${opts.selector ?? opts.slot ?? "page"} · ${route} · ${width} ${scheme}${state === "rest" ? "" : ` · ${state}`}`;

  if (view === "outline") {
    const text = await evaluate<string>(page, call(outline, SLOT_SELECTORS));
    return { id, label, ms: Math.round(performance.now() - t0), browser: s.which.name, route, width, scheme, state, selector: where.sel, clip, status, problems: [], passes: [], files: {}, outline: text, notes };
  }

  // Facts: the detectors, then the taste rules this width judges, each with its box where it has one.
  const found = await evaluate<ReturnType<typeof detect>>(page, call(detect, width));
  const measure = await evaluate<TasteMeasure>(page, TASTE_PROBE);
  const facts: LookFact[] = found.problems.map((p) => ({ ...p, box: p.box as Box | undefined }));
  for (const hit of tasteVerdicts(measure, width)) {
    if (!hit.fired) continue;
    const boxes = hit.rule === "taste.eyebrow" ? measure.eyebrows.map((e) => e.box).filter(Boolean)
      : hit.rule === "taste.tiny-text" ? measure.body.filter((b) => b.px < 14).map((b) => b.box).filter(Boolean) : [];
    const whereTaste = hit.rule === "taste.eyebrow" ? `"${measure.eyebrows[0]?.text ?? ""}"` : hit.rule === "taste.tiny-text" ? `p "${measure.body[0]?.text.slice(0, 24) ?? ""}…"` : "page";
    facts.push({ rule: hit.rule, where: whereTaste, detail: hit.detail, box: boxes[0] as Box | undefined });
  }
  if (logged.length) facts.push({ rule: "page.console", where: "page", detail: `${logged.length} error${logged.length === 1 ? "" : "s"}: ${logged[0]}` });
  if (status >= 400 && route !== "/404") facts.push({ rule: "page.status", where: "page", detail: `HTTP ${status}` });
  if (settled.cls > 0.05) facts.push({ rule: "page.cls", where: "page", detail: `layout shift ${settled.cls} while it settled` });

  // A slot's look reports the slot: a fact with a box outside the crop is counted, not listed; a fact with no
  // box is about the page and is listed only on a whole-page look (or the column and prose slots, which are most of it).
  const pageWide = !where.sel || slot === "column" || slot === "prose";
  const problems: LookFact[] = [];
  let n = 0;
  for (const f of facts) {
    if (f.box && intersects(f.box, clip)) problems.push({ ...f, n: ++n });
    else if (!f.box && (pageWide || f.rule.startsWith("page."))) problems.push(f);
  }
  for (const f of facts) if (f.box && !intersects(f.box, clip)) problems.push({ ...f, n: ++n, outside: true });

  const passes: string[] = [];
  const rules = new Set(problems.filter((p) => !p.outside).map((p) => p.rule));
  const seen = found.seen as { contrastLowest?: number; contrastJudged?: number; tapLeast?: number; tapUnder44?: number; scrollWidth?: number };
  if (!rules.has("contrast.rendered") && seen.contrastLowest !== undefined) passes.push(`contrast ≥ ${seen.contrastLowest}:1 over ${seen.contrastJudged} text runs`);
  if (width < 600 && !rules.has("layout.tap-target") && seen.tapLeast !== undefined) passes.push(`tap targets ≥ 24 px${seen.tapUnder44 ? ` (${seen.tapUnder44} under 44)` : ""}`);
  if (!rules.has("layout.overflow-x")) passes.push(`no horizontal overflow`);
  if (!facts.some((f) => f.rule === "page.cls")) passes.push(`CLS ${settled.cls}`);
  if (!logged.length) passes.push("no console errors");

  // The pictures. The clean crop first — it is the next look's "before" — then the one with boxes, then the page.
  const shotOf = async (c: Box, scale = 1) => (await page.send<{ data: string }>("Page.captureScreenshot", { format: "webp", quality: 82, captureBeyondViewport: true, clip: { x: c[0], y: c[1], width: c[2], height: c[3], scale } })).data;
  const scale = Math.min(1, MAX_EDGE / Math.max(clip[2], clip[3]));
  const clean = await shotOf(clip, scale);
  const drawn = problems.filter((p) => p.box && p.n);
  let boxed = clean;
  if (drawn.length) {
    await evaluate(page, call(mark, drawn.map((p) => [p.n, p.box])));
    if (drawn.some((p) => !p.outside)) boxed = await shotOf(clip, scale);
  }
  const fullH = Math.min(docH, MAX_FULL_HEIGHT);
  const full = await shotOf([0, 0, width, fullH]);
  await evaluate(page, "document.getElementById('__snypd_look')?.remove()");

  const files: LookResult["files"] = { crop: join(dir, "crop.webp"), full: join(dir, "full.webp") };
  writeFileSync(files.crop!, Buffer.from(boxed, "base64"));
  writeFileSync(files.full!, Buffer.from(full, "base64"));

  // Before/after: the last clean crop at this key, compared in a blank tab of the same browser.
  const key = lookKey({ route, slot: opts.slot, selector: opts.selector, width, scheme, state });
  const lastPng = join(opts.cacheDir, `last-${key}.webp`), lastJson = join(opts.cacheDir, `last-${key}.json`);
  const tasteNow = problems.filter((p) => p.rule.startsWith("taste.") && !p.outside).length;
  let delta: LookResult["delta"];
  if ((opts.since ?? "last") === "last") {
    if (existsSync(lastPng)) {
      const before = readFileSync(lastPng);
      files.before = join(dir, "before.webp");
      writeFileSync(files.before, before);
      let prev: { taste?: number; clip?: Box } = {};
      try { prev = JSON.parse(readFileSync(lastJson, "utf8")); } catch { /* no record: the picture still compares */ }
      s.scratch ??= await s.browser.page();
      const d = await diffPictures(s.scratch, before, Buffer.from(clean, "base64"), { mime: "image/webp" });
      const size = d.a[0] !== d.b[0] || d.a[1] !== d.b[1] ? `${d.a[0]}×${d.a[1]} → ${d.b[0]}×${d.b[1]}` : undefined;
      const inv = 1 / scale;
      delta = { share: d.total ? d.n / d.total : 0, box: d.box ? [Math.round(clip[0] + d.box[0]! * inv), Math.round(clip[1] + d.box[1]! * inv), Math.round(d.box[2]! * inv), Math.round(d.box[3]! * inv)] : undefined, size, tasteBefore: prev.taste ?? 0, tasteAfter: tasteNow };
    } else delta = { first: true };
  }
  writeFileSync(lastPng, Buffer.from(clean, "base64"));
  writeFileSync(lastJson, JSON.stringify({ taste: tasteNow, clip, id }));
  prune(opts.cacheDir);

  const [iw, ih] = [Math.round(clip[2] * scale), Math.round(clip[3] * scale)];
  return {
    id, label, ms: Math.round(performance.now() - t0), browser: s.which.name, route, width, scheme, state, selector: where.sel, clip, status,
    problems, passes, image: { data: boxed, mimeType: "image/webp", width: iw, height: ih }, files, delta, notes,
  };
}

/** The facts as the agent reads them, before the picture. */
export function formatLook(r: LookResult, uri?: (file: string) => string): string {
  const lines = [`${r.label} · ${r.ms} ms${r.status >= 400 && r.route !== "/404" ? ` · HTTP ${r.status}` : ""}`];
  for (const nte of r.notes) lines.push(`ℹ ${nte}`);
  if (r.outline !== undefined) return [...lines, r.outline].join("\n");
  const inside = r.problems.filter((p) => !p.outside), outside = r.problems.filter((p) => p.outside);
  const pad = Math.max(0, ...inside.map((p) => p.rule.length));
  for (const p of inside.slice(0, 12)) lines.push(`✗ ${p.rule.padEnd(pad)}  ${p.where}  ${p.detail}${p.n ? `  box ${p.n}` : ""}`);
  if (inside.length > 12) lines.push(`✗ … ${inside.length - 12} more`);
  if (r.passes.length) lines.push(`✓ ${r.passes.join(" · ")}`);
  if (outside.length) lines.push(`… ${outside.length} outside the crop: ${[...new Set(outside.map((p) => p.rule))].join(", ")} — boxed on the full page`);
  if (r.delta) lines.push("first" in r.delta ? "Δ first look at this crop — the next one is compared with it"
    : r.delta.size ? `Δ since last: the crop changed size, ${r.delta.size}; taste ${r.delta.tasteBefore} → ${r.delta.tasteAfter}`
    : `Δ since last: ${r.delta.share === 0 ? "no pixel changed" : `${(r.delta.share * 100).toFixed(1)} % of pixels${r.delta.box ? `, inside ${r.delta.box[2]}×${r.delta.box[3]} at (${r.delta.box[0]}, ${r.delta.box[1]})` : ""}`}; taste ${r.delta.tasteBefore} → ${r.delta.tasteAfter}`);
  if (uri && r.files.full) lines.push(`full page: ${uri(r.files.full)}${r.files.before ? ` · before: ${uri(r.files.before)}` : ""}`);
  return lines.join("\n");
}
