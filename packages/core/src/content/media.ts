/**
 * The media a document names (S31 · H5, docs/23 §6.1).
 *
 * A page that names `/media/still.png` and a branch that lacks the file is not a state the product should
 * produce — decision 179 said it for a theme, and a publish that lands the item's path alone produces it
 * for every picture added by hand on the drafts branch. This is the one walk both halves of H5 share:
 * `content.publish` lands what it finds beside the item, and lint rule 20 counts who names each file.
 *
 * What counts as a reference is a *value*, not a field name: every string in the frontmatter, every
 * directive attribute and every markdown image whose url is site-relative under `/media/`. Naming fields
 * (`figure.src`, `cover.poster`, …) would be a list to keep in step with the primitives; the value is the
 * fact, and a primitive added later that takes a `/media/…` url is covered the day it is written.
 */
import type { Node, Parent, Image } from "mdast";
import type { ParsedDoc } from "./parse";
import type { PrimitiveTree } from "./tree";

export interface MediaRef {
  /** The url as written, `/media/…`, without its query or fragment. */
  url: string;
  /** The file it names, repo-relative: `content/media/…`. */
  path: string;
  /** Source line — the frontmatter's for a frontmatter value. */
  line: number;
  /** Where it was written: a frontmatter key path, a `block.prop`, or `image` for `![]()`. */
  via: string;
}

export const MEDIA_URL_PREFIX = "/media/";

/** `/media/a/b.png?x#y` → `content/media/a/b.png`; `undefined` for anything that is not a site media url. */
export function mediaPathOf(url: unknown): string | undefined {
  if (typeof url !== "string" || !url.startsWith(MEDIA_URL_PREFIX)) return undefined;
  const clean = url.replace(/[?#].*$/, "");
  if (clean === MEDIA_URL_PREFIX || clean.includes("/../") || clean.endsWith("/..")) return undefined;
  let rest: string;
  try { rest = decodeURIComponent(clean.slice(MEDIA_URL_PREFIX.length)); } catch { return undefined; }
  return `content/media/${rest}`;
}

/** Every string under a value, with the key path it sits at — the frontmatter walk, and the settings'. */
export function stringsIn(value: unknown, at = ""): { at: string; value: string }[] {
  if (typeof value === "string") return [{ at, value }];
  if (Array.isArray(value)) return value.flatMap((v, i) => stringsIn(v, at ? `${at}[${i}]` : `[${i}]`));
  if (value && typeof value === "object") return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => stringsIn(v, at ? `${at}.${k}` : k));
  return [];
}

const walk = (n: Node, fn: (n: Node) => void) => { fn(n); if ("children" in n) for (const c of (n as Parent).children) walk(c, fn); };

/** The `/media/…` files one parsed document names, in source order, each url once. */
export function mediaRefs(doc: ParsedDoc, tree: PrimitiveTree): MediaRef[] {
  const out: MediaRef[] = [];
  const seen = new Set<string>();
  const add = (url: unknown, line: number, via: string) => {
    const path = mediaPathOf(url);
    if (!path || seen.has(url as string)) return;
    seen.add(url as string);
    out.push({ url: (url as string).replace(/[?#].*$/, ""), path, line, via });
  };
  for (const s of stringsIn(doc.frontmatter)) add(s.value, doc.frontmatterLine ?? 1, s.at);
  for (const b of tree.all) for (const [k, v] of Object.entries(b.props)) add(v, b.line, `${b.name}.${k}`);
  walk(doc.tree, (n) => { if (n.type === "image") add((n as Image).url, n.position?.start.line ?? 0, "image"); });
  return out.sort((a, b) => a.line - b.line);
}
