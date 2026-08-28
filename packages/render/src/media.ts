/**
 * Intrinsic image dimensions, read from the file's header (S13).
 * `figure` and `cover` must emit `width`/`height` or the browser reflows when the image arrives — that is
 * Cumulative Layout Shift, and it is the one Core Web Vital a static site can still fail. The theme cannot
 * know the size; the build can, and it already has the file open to copy it.
 *
 * This is the seed of docs/02's `media.yaml` manifest, not the manifest: dimensions only, no blurhash, no
 * credit, no derivatives. Five formats cover everything a site puts in `content/media/`; an unrecognised
 * file simply has no size, and the primitive omits the attributes rather than guessing.
 */
export interface ImageSize { width: number; height: number }

const ascii = (b: Uint8Array, from: number, len: number) => String.fromCharCode(...b.subarray(from, from + len));

export function imageSize(head: Uint8Array): ImageSize | undefined {
  const v = new DataView(head.buffer, head.byteOffset, head.byteLength);
  // PNG: 8-byte signature, then an IHDR chunk whose data starts at 16 with two big-endian uint32.
  if (head.length > 24 && ascii(head, 1, 3) === "PNG") return { width: v.getUint32(16), height: v.getUint32(20) };
  // GIF: "GIF87a"/"GIF89a", then width and height as little-endian uint16.
  if (head.length > 10 && ascii(head, 0, 3) === "GIF") return { width: v.getUint16(6, true), height: v.getUint16(8, true) };
  // WebP: RIFF container; VP8X carries a 24-bit "minus one" size, VP8L packs 14 bits each, VP8 is plain.
  if (head.length > 30 && ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 4) === "WEBP") {
    const fourcc = ascii(head, 12, 4);
    if (fourcc === "VP8X") return { width: (head[24]! | (head[25]! << 8) | (head[26]! << 16)) + 1, height: (head[27]! | (head[28]! << 8) | (head[29]! << 16)) + 1 };
    if (fourcc === "VP8L") { const b = v.getUint32(21, true); return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }; }
    if (fourcc === "VP8 ") return { width: v.getUint16(26, true) & 0x3fff, height: v.getUint16(28, true) & 0x3fff };
  }
  // JPEG: walk the marker segments to the first SOFn (0xC0–0xCF, excluding the four that are not frames).
  if (head.length > 4 && head[0] === 0xff && head[1] === 0xd8) {
    let i = 2;
    while (i + 9 < head.length) {
      if (head[i] !== 0xff) { i++; continue; }
      const marker = head[i + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
        return { height: v.getUint16(i + 5), width: v.getUint16(i + 7) };
      i += 2 + v.getUint16(i + 2);
    }
  }
  return undefined;
}

/** SVG carries its size in markup, not a header: `width`/`height` when both are plain numbers, else the viewBox. */
export function svgSize(source: string): ImageSize | undefined {
  const tag = source.slice(0, 2048).match(/<svg\b[^>]*>/i)?.[0];
  if (!tag) return undefined;
  const attr = (n: string) => tag.match(new RegExp(`\\b${n}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1];
  const px = (s?: string) => { const m = s?.match(/^\s*([\d.]+)\s*(px)?\s*$/); return m ? Number(m[1]) : undefined; };
  const w = px(attr("width")), h = px(attr("height"));
  if (w && h) return { width: Math.round(w), height: Math.round(h) };
  const box = attr("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (box?.length === 4 && box[2]! > 0 && box[3]! > 0) return { width: Math.round(box[2]!), height: Math.round(box[3]!) };
  return undefined;
}

/** Read only what a header needs: 64 KB covers a JPEG with a large EXIF block, and never a whole photograph. */
export async function readImageSize(file: string): Promise<ImageSize | undefined> {
  const f = Bun.file(file);
  const head = new Uint8Array(await f.slice(0, 65536).arrayBuffer());
  if (file.toLowerCase().endsWith(".svg")) return svgSize(new TextDecoder().decode(head));
  return imageSize(head);
}
