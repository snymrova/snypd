/**
 * `transform`: the first mention of a term links to the term's archive (docs/02 §9, docs/10 §4.8).
 *
 * The tree is a copy (hooks.ts hands every transform its own), so this mutates in place and returns
 * nothing. Text nodes are split around the match: `[text before] [link > text] [text after]`, and the
 * `after` piece goes back on the queue so a second term later in the same sentence is still found.
 * Longer titles are tried first, so "static site generator" wins over "static".
 *
 * Left alone, on purpose: headings (a linked heading is a styling accident), anything already inside a
 * link, code, images, HTML, the label of a directive and directive attributes (`:::callout{title=…}` is
 * markup, not prose). And the page itself: a category page that mentions its own name does not link to
 * where the reader already is.
 */
import type { Link, Node, Parent, Root, Text } from "mdast";
import type { TransformFn } from "@snypd/render";

interface Options { taxonomies?: string[]; minLength?: number }
interface Candidate { pattern: RegExp; url: string; key: string }

const SKIP = new Set(["heading", "link", "linkReference", "inlineCode", "code", "html", "image", "imageReference", "textDirective", "leafDirective", "yaml", "definition", "footnoteDefinition"]);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const transform: TransformFn = (root: Root, ctx) => {
  const o = ctx.options as Options;
  const minLength = o.minLength ?? 3;
  const wanted = o.taxonomies ? new Set(o.taxonomies) : undefined;

  // One candidate per way a term can be written, longest first; the key is the term, so linking a term
  // by its title also retires its slug form.
  const candidates: Candidate[] = [];
  for (const t of ctx.terms) {
    if (wanted && !wanted.has(t.taxonomy)) continue;
    if (t.route === ctx.route) continue;
    const forms = new Set<string>([t.title.trim()]);
    if (t.title.trim().toLowerCase() === t.term.toLowerCase()) forms.add(t.term.replace(/-+/g, " "));
    for (const form of forms) {
      if (form.length < minLength) continue;
      // Whole words, case-insensitive, Unicode-aware: a letter or digit on either side is a different word.
      candidates.push({ pattern: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(form)}(?![\\p{L}\\p{N}])`, "iu"), url: `${t.route}/`, key: `${t.taxonomy} ${t.term}` });
    }
  }
  if (!candidates.length) return;
  candidates.sort((a, b) => b.pattern.source.length - a.pattern.source.length);
  const done = new Set<string>();

  // Every prose text node with its parent, in document order, skipping the subtrees above.
  const queue: { node: Text; parent: Parent }[] = [];
  const walk = (n: Node, parent?: Parent) => {
    if (SKIP.has(n.type)) return;
    if (n.type === "paragraph" && (n.data as { directiveLabel?: boolean } | undefined)?.directiveLabel) return;
    if (n.type === "text" && parent) { queue.push({ node: n as Text, parent }); return; }
    for (const child of (n as Parent).children ?? []) walk(child, n as Parent);
  };
  walk(root);

  while (queue.length) {
    const { node, parent } = queue.shift()!;
    let hit: { c: Candidate; m: RegExpExecArray } | undefined;
    for (const c of candidates) {
      if (done.has(c.key)) continue;
      const m = c.pattern.exec(node.value);
      if (m && (!hit || m.index < hit.m.index)) hit = { c, m };
    }
    if (!hit) continue;
    done.add(hit.c.key);
    const at = hit.m.index, end = at + hit.m[0].length;
    const before: Text | undefined = at > 0 ? { type: "text", value: node.value.slice(0, at) } : undefined;
    const link: Link = { type: "link", url: hit.c.url, title: null, children: [{ type: "text", value: node.value.slice(at, end) }] };
    const after: Text | undefined = end < node.value.length ? { type: "text", value: node.value.slice(end) } : undefined;
    const i = parent.children.indexOf(node);
    parent.children.splice(i, 1, ...([before, link, after].filter(Boolean) as Node[]) as never[]);
    if (after) queue.unshift({ node: after, parent });   // the rest of this sentence, before the next node
  }
};

export default transform;
