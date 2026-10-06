/**
 * Two pictures compared in a browser already running (docs/36 §5a.5, §6): the share of pixels that moved,
 * where, and — when asked — a third picture that shows it. No decoder and no dependency: the pictures are
 * handed to an `<img>` and read back through a canvas.
 *
 * `look` compares a crop with the last look at the same crop; `shoot --diff` compares every shot with the
 * same shot in an earlier shoot, which is how a carve is proved to change nothing (P3).
 */
import type { Page } from "./cdp";

/** A channel moving by less than this is compression noise, not a change. */
export const DIFF_THRESHOLD = 24;

export interface PixelDiff {
  /** Changed pixels, over the overlapping area. */
  n: number;
  total: number;
  /** The changed region's box in the pictures' pixels, or null when nothing moved. */
  box: number[] | null;
  /** Natural sizes, before and after. */
  a: number[];
  b: number[];
  /** With `draw`: the after picture faded, changed pixels in red, as a PNG data URL. */
  drawn?: string;
}

/** The in-page function; `draw` adds the marked picture (only worth its cost when something moved). */
export const DIFF = `(async (a, b, thr, draw) => {
  const load = (s) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => j(new Error("undecodable")); i.src = s; });
  const [x, y] = await Promise.all([load(a), load(b)]);
  const w = Math.min(x.naturalWidth, y.naturalWidth), h = Math.min(x.naturalHeight, y.naturalHeight);
  const px = (img) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h).data; };
  const p = px(x), q = px(y);
  let n = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
  const hit = draw ? new Uint8Array(w * h) : null;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = (j * w + i) * 4;
    if (Math.abs(p[k] - q[k]) > thr || Math.abs(p[k + 1] - q[k + 1]) > thr || Math.abs(p[k + 2] - q[k + 2]) > thr) {
      n++; if (hit) hit[j * w + i] = 1;
      if (i < x0) x0 = i; if (j < y0) y0 = j; if (i > x1) x1 = i; if (j > y1) y1 = j;
    }
  }
  let drawn;
  if (draw && n) {
    const W = y.naturalWidth, H = y.naturalHeight;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"); g.drawImage(y, 0, 0);
    const im = g.getImageData(0, 0, W, H), d = im.data;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = (j * W + i) * 4;
      if (i < w && j < h && hit[j * w + i]) { d[k] = 230; d[k + 1] = 0; d[k + 2] = 40; }
      else { const v = (d[k] * 0.3 + d[k + 1] * 0.59 + d[k + 2] * 0.11) * 0.35 + 166; d[k] = d[k + 1] = d[k + 2] = v; }
    }
    g.putImageData(im, 0, 0);
    g.strokeStyle = "rgb(230,0,40)"; g.lineWidth = 2; g.strokeRect(x0 - 3, y0 - 3, x1 - x0 + 7, y1 - y0 + 7);
    drawn = c.toDataURL("image/png");
  }
  return { n, total: w * h, box: n ? [x0, y0, x1 - x0 + 1, y1 - y0 + 1] : null, a: [x.naturalWidth, x.naturalHeight], b: [y.naturalWidth, y.naturalHeight], drawn };
})`;

const dataUrl = (bytes: Buffer, mime: string) => `data:${mime};base64,${bytes.toString("base64")}`;

/** Compare `before` with `after` in `page` (a blank tab is best: nothing else on it to repaint). */
export async function diffPictures(page: Page, before: Buffer, after: Buffer, opts: { mime?: string; threshold?: number; draw?: boolean } = {}): Promise<PixelDiff> {
  const mime = opts.mime ?? "image/png";
  const expression = `${DIFF}(${JSON.stringify(dataUrl(before, mime))}, ${JSON.stringify(dataUrl(after, mime))}, ${opts.threshold ?? DIFF_THRESHOLD}, ${opts.draw ? "true" : "false"})`;
  const r = await page.send<{ result: { value?: PixelDiff }; exceptionDetails?: { exception?: { description?: string }; text?: string } }>("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails || !r.result.value) throw new Error(`diff: ${r.exceptionDetails?.exception?.description ?? r.exceptionDetails?.text ?? "no result"}`);
  return r.result.value;
}
