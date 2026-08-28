/**
 * `snypd bench page` (S13) — the delivered *page*, measured in a real browser: the Phase-3 exit criteria
 * that no other suite can see (docs/07 §4: "coverage 100 %, Lighthouse ≥ 98, a11y 100, 0 KB JS").
 *
 * Two of those three are measured here and gated:
 *   `page.js.kb`             bytes of JavaScript the page loads or inlines — budget 0, not "small".
 *                            JSON-LD is data, not script, and is excluded by type; everything else counts.
 *   `page.a11y.violations`   axe-core, which *is* Lighthouse's accessibility category, run in the page.
 * The third — a Lighthouse performance score — is deliberately not owned here: its accessibility half is
 * the axe run below, and its performance half is a weighted curve over vitals that a localhost static
 * server cannot honestly simulate. The vitals themselves are reported, and `bench page --lighthouse`
 * shells out to `bunx lighthouse` for the composite number when someone wants to quote it.
 *
 * Everything runs against a built site over `@snypd/runtime`'s static server — the same bytes a host
 * serves, not a dev server. Worst page reported, never the mean: a budget only the index meets is not one.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@snypd/runtime";
import { launch, findChrome, type Page } from "./cdp";
import type { Metric } from "./index";

/** What one route weighed and how it behaved. Bytes are over the wire (`encodedDataLength`). */
export interface PageResult {
  route: string;
  /** Viewport width in CSS px — every route is measured at both, and the worst of the two is reported. */
  width: number;
  bytes: { html: number; css: number; js: number; image: number; font: number; other: number; total: number };
  requests: number;
  inlineJsBytes: number;
  vitals: { fcp: number; lcp: number; cls: number };
  violations: Array<{ id: string; impact: string; nodes: number; help: string }>;
}

const KB = (n: number) => +(n / 1024).toFixed(2);

/**
 * Desktop and phone, because a theme can be flawless at one and unreadable at the other — and S13's suite
 * only ever looked at 1280, which is how a chart drawn at 640 px shipped for a session rendering its 12 px
 * labels at 6 px on a phone (S14). 390 is an iPhone 15/16 in CSS px; 1280 is the browser's own window.
 */
const VIEWPORTS = [
  { width: 1280, height: 900, mobile: false },
  { width: 390, height: 844, mobile: true },
] as const;

/**
 * Routes to measure, one per URL shape: `/`, then the first route under each distinct first path segment
 * (`/posts/…`, `/category/…`, `/tag/…`, `/authors/…`). A shape is this suite's proxy for a layout — the
 * built site does not record which layout drew it, and the shapes are one-to-one with them in practice.
 */
export function pickRoutes(dist: string, max = 6): string[] {
  const sitemap = join(dist, "sitemap.xml");
  if (!existsSync(sitemap)) return ["/"];
  const all = [...readFileSync(sitemap, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => { try { return new URL(m[1]!).pathname; } catch { return m[1]!; } });
  const out: string[] = [];
  const shapes = new Set<string>();
  for (const r of all) {
    const shape = r === "/" ? "/" : r.split("/").filter(Boolean)[0]!;
    if (shapes.has(shape)) continue;
    shapes.add(shape); out.push(r);
    if (out.length >= max) break;
  }
  return out.includes("/") ? out : ["/", ...out].slice(0, max);
}

const VITALS_SCRIPT = `
window.__snypd = { fcp: 0, lcp: 0, cls: 0 };
try {
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__snypd.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__snypd.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__snypd.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
} catch {}`;

/** axe-core is a dev dependency of `@snypd/bench` with zero transitive packages; it never reaches a build. */
function axeSource(): string {
  const p = require.resolve("axe-core/axe.min.js", { paths: [import.meta.dir] });
  return readFileSync(p, "utf8");
}

async function measure(page: Page, url: string, route: string, view: (typeof VIEWPORTS)[number]): Promise<PageResult> {
  const types = new Map<string, string>();
  const bytes = { html: 0, css: 0, js: 0, image: 0, font: 0, other: 0, total: 0 };
  let requests = 0;
  page.on("Network.responseReceived", (p) => {
    const t = String((p as { type?: string }).type ?? "Other");
    types.set(String((p as { requestId?: string }).requestId), t);
  });
  page.on("Network.loadingFinished", (p) => {
    const id = String((p as { requestId?: string }).requestId);
    const n = Number((p as { encodedDataLength?: number }).encodedDataLength ?? 0);
    const t = types.get(id) ?? "Other";
    requests++; bytes.total += n;
    if (t === "Document") bytes.html += n;
    else if (t === "Stylesheet") bytes.css += n;
    else if (t === "Script") bytes.js += n;
    else if (t === "Image") bytes.image += n;
    else if (t === "Font") bytes.font += n;
    else bytes.other += n;
  });

  await page.send("Emulation.setDeviceMetricsOverride", { width: view.width, height: view.height, deviceScaleFactor: 1, mobile: view.mobile });
  await page.send("Network.enable");
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: VITALS_SCRIPT });
  const loaded = page.once("Page.loadEventFired", 20_000);
  await page.send("Page.navigate", { url });
  await loaded;
  // LCP and CLS are only final once the frame has settled; two rAFs plus a tick is what a static page needs.
  await page.send("Runtime.evaluate", { awaitPromise: true, expression: "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120))))" });

  const vitals = (await page.send<{ result: { value: { fcp: number; lcp: number; cls: number } } }>("Runtime.evaluate", {
    expression: "window.__snypd || {fcp:0,lcp:0,cls:0}", returnByValue: true,
  })).result.value;

  // Inline script bytes: a `<script>` with no src never appears in the network log, and "0 KB JS" has to
  // mean the page runs none — not that it downloaded none. `application/ld+json` is data and is excluded.
  const inlineJsBytes = (await page.send<{ result: { value: number } }>("Runtime.evaluate", {
    expression: `[...document.querySelectorAll('script')].filter(s => !s.src && !/json/i.test(s.type || '')).reduce((n, s) => n + s.textContent.length, 0)
      + [...document.querySelectorAll('*')].reduce((n, el) => n + [...el.attributes].filter(a => a.name.startsWith('on')).reduce((m, a) => m + a.value.length, 0), 0)`,
    returnByValue: true,
  })).result.value;

  await page.send("Runtime.evaluate", { expression: axeSource() });
  const violations = (await page.send<{ result: { value: PageResult["violations"] } }>("Runtime.evaluate", {
    awaitPromise: true, returnByValue: true,
    expression: `axe.run(document, { resultTypes: ['violations'] }).then(r => r.violations.map(v => ({ id: v.id, impact: v.impact || 'minor', nodes: v.nodes.length, help: v.help })))`,
  })).result.value;

  return { route, width: view.width, bytes, requests, inlineJsBytes, vitals, violations };
}

/**
 * Run the suite over a built site. `dist` defaults to `<root>/dist`; the editorial lane passes its own.
 * Chrome is a machine dependency, not a package one: without it the suite returns a single report-only
 * metric saying so rather than failing a build that has nothing wrong with it.
 */
export async function pageSuite(opts: { root: string; dist?: string; routes?: string[]; label?: string } = { root: "." }): Promise<{ metrics: Metric[]; pages: PageResult[]; browser?: string }> {
  const dist = opts.dist ?? join(opts.root, "dist");
  if (!findChrome()) return { metrics: [{ name: "page.a11y.violations", value: -1, unit: "violations", note: "no Chrome on this machine — install one or set SNYPD_CHROME; `snypd bench page` is the only suite that needs it" }], pages: [] };
  const routes = opts.routes?.length ? opts.routes : pickRoutes(dist);
  const s = serve(opts.root, { dist });
  const browser = await launch();
  const pages: PageResult[] = [];
  try {
    // The first navigation of a fresh browser pays the renderer's own warm-up — measured here at ~1.5 s
    // against ~90 ms for every navigation after it. One throwaway page, discarded, the same discipline
    // `medianOf` uses everywhere else in this harness.
    const warm = await browser.page();
    try { await measure(warm, `${s.url}${routes[0]}`, routes[0]!, VIEWPORTS[0]); } finally { await warm.close(); }
    for (const route of routes) {
      for (const view of VIEWPORTS) {
        const page = await browser.page();
        try { pages.push(await measure(page, `${s.url}${route}`, route, view)); } finally { await page.close(); }
      }
    }
  } finally { browser.close(); s.stop(); }

  const worstBy = <T,>(pick: (p: PageResult) => number) => pages.reduce((a, b) => (pick(b) > pick(a) ? b : a));
  const js = worstBy((p) => p.bytes.js + p.inlineJsBytes);
  const a11y = worstBy((p) => p.violations.length);
  const heavy = worstBy((p) => p.bytes.total);
  const lcp = worstBy((p) => p.vitals.lcp);
  const cls = worstBy((p) => p.vitals.cls);
  const allViolations = pages.flatMap((p) => p.violations.map((v) => ({ ...v, route: p.route, width: p.width })));
  const where = opts.label ? `${opts.label}: ` : "";
  const at = (p: PageResult) => `${p.route} @ ${p.width}`;
  const seen = `${where}${routes.length} routes × ${VIEWPORTS.map((v) => v.width).join("/")} px — ${routes.join(", ")}`;

  return {
    browser: browser.version,
    pages,
    metrics: [
      { name: "page.js.kb", value: KB(js.bytes.js + js.inlineJsBytes), unit: "KB", budget: 0,
        note: `${seen}; worst ${at(js)} (${js.bytes.js} B loaded + ${js.inlineJsBytes} B inline/handlers). JSON-LD excluded: it is data` },
      { name: "page.a11y.violations", value: allViolations.length, unit: "violations", budget: 0,
        note: allViolations.length ? allViolations.map((v) => `${v.route} @ ${v.width} ${v.id} (${v.impact}, ${v.nodes} nodes)`).join(" · ") : `axe-core, 0 across ${pages.length} route/viewport pairs` },
      { name: "page.bytes.kb", value: KB(heavy.bytes.total), unit: "KB",
        note: `worst ${at(heavy)}: ${KB(heavy.bytes.html)} KB html + ${KB(heavy.bytes.css)} KB css + ${KB(heavy.bytes.image)} KB img, ${heavy.requests} requests — uncompressed, which no host serves; report-only` },
      { name: "page.lcp", value: +lcp.vitals.lcp.toFixed(1), unit: "ms",
        note: `worst ${at(lcp)}; localhost, unthrottled — the shape of the page, not a field number; report-only` },
      // Gated from S14: layout shift is the one vital a localhost run measures honestly, because it is
      // caused by the markup and the stylesheet rather than by the network. The budget is half the
      // web-vitals "good" line; the theme measures 0, because every image is sized and no webfont swaps.
      { name: "page.cls", value: +cls.vitals.cls.toFixed(4), unit: "", budget: 0.05,
        note: `worst ${at(cls)}; caused by the theme, not the network — the one vital localhost measures honestly` },
    ],
  };
}
