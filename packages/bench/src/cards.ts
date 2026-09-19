/**
 * `snypd cards` (S36): a share card per page, drawn in the site's own theme, and the icons a browser and
 * a phone ask for, rasterised from `site.icon`.
 *
 * **Why a browser and not an SVG template.** A card has to be a PNG or a JPEG — X, Facebook, LinkedIn and
 * Slack do not take SVG as `og:image` — and it has to be *in the theme*: its face, its colours, its
 * weight. The theme is CSS, and the one thing that draws CSS exactly is a browser. So the card is a small
 * HTML document on the built site's own origin, wearing `theme.css`, photographed by the same headless
 * Chrome the page suite and the gallery drive (`cdp.ts`, no SDK). Chrome is a dependency of the machine
 * and never of the host: the PNGs land in `content/media/cards/` and are committed, so the host's build
 * copies them like any other media and never needs a browser.
 *
 * **What a theme controls.** The markup is fixed (`.snypd-card` and its parts, below) and the default
 * look is in the `snypd.base` layer, so a theme restyles a card from its own stylesheet the way it
 * restyles anything else — `.snypd-card-title { font-style: italic }` in `theme.css` wins by layer order.
 * The parts are `div`s, not `h1` and `p`, on purpose: the first draw used headings and paragraphs, and
 * the theme's page-sized `h1` and `p` rules won over the card's — a 44 px title on a 1200 px card. A
 * theme's card is its tokens (face, colour) until it writes `.snypd-card-*` rules of its own.
 * The page frame (1200 × 630, no margin) is unlayered, because a theme's `body { max-width }` must not
 * move the frame a network crops to.
 *
 * **Incremental.** Each card's inputs are hashed with the stylesheet's bytes into `.cards.json` beside
 * the PNGs; an unchanged page is not redrawn, and the card of a page that is gone is deleted — only
 * cards this command drew, never a file it did not write.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { build, cardName, CARD_SIZE, titleCase, escape } from "@snypd/render";
import { serve } from "@snypd/runtime";
import { loadConfig, settingValues } from "@snypd/core";
import { launch, findChrome, type Page } from "./cdp";

export interface CardsOptions {
  /** Redraw every card, whatever `.cards.json` says. */
  force?: boolean;
  onCard?: (route: string, state: "drawn" | "kept") => void;
}
export interface CardsResult {
  drawn: string[]; kept: string[]; removed: string[];
  /** Icon files written under `content/media/icons/`, when `site.icon` is a local file. */
  icons: string[];
  /** Why nothing was drawn, when nothing could be. */
  skipped?: string;
}

interface CardInput { route: string; title: string; description?: string; eyebrow?: string; url: string }
interface ApiItem { route: string; url: string; title: string; date?: string; description?: string; json: string }

const MANIFEST = ".cards.json";
const FORMAT = "c2";   // bump when the markup or the default sheet changes: every card is then redrawn
const sha = (s: string | Buffer) => createHash("sha1").update(s).digest("hex");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const date = (d?: string) => { if (!d) return undefined; const t = new Date(d.length === 10 ? `${d}T00:00:00Z` : d); return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`; };

/**
 * The default card (in `snypd.base`) and the frame (unlayered). Token names are the spec's own
 * (`--color-*`, `--font-*`), so every theme's card is its own before it writes a line for it.
 */
const CARD_CSS = `
html, body { margin: 0 !important; padding: 0 !important; width: ${CARD_SIZE.width}px !important; height: ${CARD_SIZE.height}px !important; max-width: none !important; overflow: hidden; }
@layer snypd.base {
  body { background: var(--color-bg); }
  .snypd-card { box-sizing: border-box; width: ${CARD_SIZE.width}px; height: ${CARD_SIZE.height}px; padding: 64px 80px 56px; display: flex; flex-direction: column; color: var(--color-text); font-family: var(--font-body); border-top: 12px solid var(--color-accent); }
  .snypd-card-site { display: flex; align-items: center; gap: 16px; font: 500 28px / 1 var(--font-heading, var(--font-display, var(--font-body))); letter-spacing: -0.01em; }
  .snypd-card-site img { height: 44px; width: auto; }
  .snypd-card-body { margin-top: auto; display: flex; flex-direction: column; gap: 22px; }
  .snypd-card-eyebrow { font: 500 24px / 1.2 var(--font-ui, var(--font-body)); color: var(--color-muted); }
  .snypd-card-title { font: 600 72px / 1.06 var(--font-heading, var(--font-display, var(--font-body))); letter-spacing: -0.025em; text-wrap: balance; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
  .snypd-card-description { font-size: 30px; line-height: 1.35; color: var(--color-muted); text-wrap: pretty; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
  .snypd-card-url { margin-top: 40px; font: 400 22px / 1 var(--font-mono, var(--font-body)); color: var(--color-muted); }
}`;

/** `wordmark`: a theme's `logo` setting, which already spells the name; `icon`: `site.icon`, which sits beside it. */
function cardHtml(c: CardInput, site: { name: string; wordmark?: string; icon?: string }): string {
  const mark = site.wordmark ? `<img src="${escape(site.wordmark)}" alt="${escape(site.name)}">` : `${site.icon ? `<img src="${escape(site.icon)}" alt="">` : ""}<span>${escape(site.name)}</span>`;
  return `<article class="snypd-card">
<div class="snypd-card-site">${mark}</div>
<div class="snypd-card-body">
${c.eyebrow ? `<div class="snypd-card-eyebrow">${escape(c.eyebrow)}</div>` : ""}
<div class="snypd-card-title">${escape(c.title)}</div>
${c.description ? `<div class="snypd-card-description">${escape(c.description)}</div>` : ""}
</div>
<div class="snypd-card-url">${escape(c.url.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</div>
</article>`;
}

/** A document on the served origin, so `/assets/…` and `/media/…` resolve, then the frame and the fonts settle. */
async function paint(page: Page, origin: string, html: string, size: { width: number; height: number }, transparent = false): Promise<Buffer> {
  await page.send("Emulation.setDeviceMetricsOverride", { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: false });
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }, { name: "prefers-reduced-motion", value: "reduce" }] });
  if (transparent) await page.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  await page.send("Page.enable");
  const loaded = page.once("Page.loadEventFired", 15_000);
  await page.send("Page.navigate", { url: `${origin}/404.html` });   // any HTML page on the origin; every build writes this one
  await loaded;
  const { frameTree } = await page.send<{ frameTree: { frame: { id: string } } }>("Page.getFrameTree");
  await page.send("Page.setDocumentContent", { frameId: frameTree.frame.id, html });
  await page.send("Runtime.evaluate", { awaitPromise: true, expression: `Promise.all([document.fonts.ready, ...[...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))]).then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))` });
  const { data } = await page.send<{ data: string }>("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 } });
  return Buffer.from(data, "base64");
}

/** An `.ico` holding one PNG — the container every browser reads since Vista, with no encoder needed. */
export function icoFromPng(png: Buffer, size: number): Buffer {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);   // reserved, type icon, one image
  head.writeUInt8(size >= 256 ? 0 : size, 6); head.writeUInt8(size >= 256 ? 0 : size, 7);
  head.writeUInt8(0, 8); head.writeUInt8(0, 9); head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
  head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
  return Buffer.concat([head, png]);
}

export async function drawCards(root: string, opts: CardsOptions = {}): Promise<CardsResult> {
  const result: CardsResult = { drawn: [], kept: [], removed: [], icons: [] };
  if (!findChrome()) return { ...result, skipped: "no Chrome on this machine — install Chrome or Chromium, or set SNYPD_CHROME to one; the cards are drawn by a browser because they are the theme's CSS" };
  const cfg = loadConfig(root);
  if (!cfg.ok) throw new Error(`cannot draw cards for ${root}: its configuration does not load`);
  const c = cfg.config;
  const dist = join(root, "dist");
  await build(root);

  // What to draw: every listed item without a cover of its own, from the JSON API the build just wrote —
  // the same list `llms.txt` offers, so `noindex` pages and the not-found page are already out of it.
  const site = JSON.parse(readFileSync(join(dist, "api", "site.json"), "utf8")) as { url: string; types: Record<string, { list: string }> };
  const local = (u: string) => join(dist, u.slice(c.site.url.replace(/\/$/, "").length).replace(/^\//, ""));
  const inputs: CardInput[] = [];
  for (const [type, t] of Object.entries(site.types)) {
    const list = JSON.parse(readFileSync(local(t.list), "utf8")) as { items: ApiItem[] };
    for (const it of list.items) {
      const item = JSON.parse(readFileSync(local(it.json), "utf8")) as { frontmatter?: { cover?: { image?: string } } };
      if (item.frontmatter?.cover?.image) continue;
      inputs.push({ route: it.route, title: it.title, description: it.description, url: it.url, eyebrow: [type !== "page" ? titleCase(type) : undefined, date(it.date)].filter(Boolean).join(" · ") || undefined });
    }
  }
  // The front page shares `site.image` when there is one (the shell's rule), so it gets no card to ignore.
  if (c.site.image) { const i = inputs.findIndex((x) => x.route === "/"); if (i >= 0) inputs.splice(i, 1); }
  else if (!inputs.some((i) => i.route === "/")) inputs.push({ route: "/", title: c.site.name, description: c.site.description, url: `${c.site.url.replace(/\/$/, "")}/` });

  const cssPath = join(dist, "assets", "theme.css");
  const css = existsSync(cssPath) ? readFileSync(cssPath) : Buffer.from("");
  const cssVersion = sha(css).slice(0, 10);
  const wordmark = ((v) => (typeof v === "string" && v.startsWith("/") ? v : undefined))(settingValues(cfg).logo);
  const brand = { name: c.site.name, wordmark, icon: c.site.icon as string | undefined };
  const doc = (body: string, extra = "") => `<!doctype html><html lang="${escape(c.site.defaultLocale)}"><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/theme.css?v=${cssVersion}"><style>${CARD_CSS}${extra}</style></head><body>${body}</body></html>`;

  const out = join(root, "content", "media", "cards");
  mkdirSync(out, { recursive: true });
  const manifestFile = join(out, MANIFEST);
  const before = existsSync(manifestFile) ? (JSON.parse(readFileSync(manifestFile, "utf8")) as { cards?: Record<string, string> }).cards ?? {} : {};
  const after: Record<string, string> = {};

  const s = serve(root, { dist });
  const browser = await launch();
  try {
    const page = await browser.page();
    try {
      for (const input of inputs) {
        const name = cardName(input.route);
        const html = doc(cardHtml(input, brand));
        const hash = sha(`${FORMAT}\n${html}\n${cssVersion}`);
        after[name] = hash;
        const file = join(out, `${name}.png`);
        if (!opts.force && before[name] === hash && existsSync(file)) { result.kept.push(input.route); opts.onCard?.(input.route, "kept"); continue; }
        writeFileSync(file, await paint(page, s.url, html, CARD_SIZE));
        result.drawn.push(input.route); opts.onCard?.(input.route, "drawn");
      }
      // The icons, from `site.icon` when it is a file on this site: a 180 px touch icon on the theme's
      // ground (iOS draws no transparency and rounds the corners itself), and a 32 px favicon.ico with
      // its transparency kept, for the clients that ask for `/favicon.ico` whatever a page says.
      const icon = c.site.icon as string | undefined;
      if (icon?.startsWith("/media/") && existsSync(join(root, "content", icon))) {
        const icons = join(root, "content", "media", "icons");
        mkdirSync(icons, { recursive: true });
        const img = (px: number) => `<img src="${escape(icon)}" alt="" style="display:block;width:${px}px;height:${px}px">`;
        const touch = await paint(page, s.url, doc(`<div style="display:grid;place-items:center;width:180px;height:180px;background:var(--color-bg)">${img(136)}</div>`, "html,body{width:180px !important;height:180px !important}"), { width: 180, height: 180 });
        writeFileSync(join(icons, "apple-touch-icon.png"), touch);
        const small = await paint(page, s.url, `<!doctype html><html><head><style>html,body{margin:0;background:transparent}</style></head><body>${img(32)}</body></html>`, { width: 32, height: 32 }, true);
        writeFileSync(join(icons, "favicon.ico"), icoFromPng(small, 32));
        result.icons.push("content/media/icons/apple-touch-icon.png", "content/media/icons/favicon.ico");
      }
    } finally { await page.close(); }
  } finally { browser.close(); s.stop(); }

  for (const name of Object.keys(before)) {
    if (after[name]) continue;
    rmSync(join(out, `${name}.png`), { force: true });
    result.removed.push(name);
  }
  writeFileSync(manifestFile, JSON.stringify({ format: FORMAT, cards: after }, null, 1) + "\n");
  // The pages that now have a card name it in `og:image`: one more build, which re-renders exactly those.
  await build(root);
  return result;
}
