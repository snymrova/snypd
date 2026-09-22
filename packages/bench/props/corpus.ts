/**
 * The seeded corpus (H4): every counterexample a property has found, shrunk, written down as data, and
 * handed back to the property as an example it runs before any random one. A property that found a
 * bug once and then forgot the input is a property that will find it again on some seed, some day; this
 * file is where the seed stops mattering. Each entry names the decision that closed it.
 *
 * Add to it the way a failing example test would be added: the shrunk value fast-check printed, the
 * fix, and a line saying what it was.
 */
import type { Edit, Item, Site } from "./arbitrary";

const post = (slug: string, fm: Record<string, unknown>, body = "Words.\n"): Item => ({ type: "post", slug, fm: { title: slug, date: "2026-02-07", status: "published", ...fm }, body });
const author = (slug: string): Item => ({ type: "author", slug, fm: { name: slug }, body: "Bio.\n" });
const bare = (over: Partial<Site> = {}): Site => ({ name: "S", authorPages: true, redirects: {}, jsKb: 0, items: [], terms: [], media: [], nav: {}, ...over });

/** Property 1 — a site and the edits made to it, in order. */
export const EDITS: Array<[Site, Edit[]]> = [
  // Decision 154, 14 Sep 2026: an author page listed a post after the post was trashed. Its key held the
  // author's file and nothing about the posts it lists; the first run of the first property found it.
  [bare({ items: [author("ada"), post("posts-24", { author: "ada" })] }), [{ kind: "status", i: 1, status: "trashed" }]],
  // Decision 158, 14 Sep 2026: a media file replaced by one of the same size inside the mtime's tick was
  // not copied again — the same-tick hole H3 closed for content (decision 150), left open for media on
  // purpose until a property could say whether it mattered. `dist/media/one.png` served the old image.
  [bare({ items: [post("p", {}, "::figure{src=\"/media/one.png\" alt=\"x\"}\n")], media: [{ name: "one", width: 16, height: 16, rgb: [1, 2, 3] }] }), [{ kind: "media", media: { name: "one", width: 16, height: 16, rgb: [4, 5, 6] }, sameTick: true }]],
];

/** Property 4 — documents. Each is `[source]`, the shape `fc.property(document, …)` takes. */
export const DOCUMENTS: Array<[string]> = [
  // Decision 155: a `url` prop with a scheme that executes reached the page as an `href`. `chart`'s
  // `source`, here; the same for every `url` and `image` prop.
  ['---\ntitle: "agent"\ndate: "2026-03-01"\nstatus: "published"\ntags: []\n---\n\n:::chart{type="bar" source="javascript:alert(1)" caption="Agent agent agent agent."}\n\n:::\n'],
  // Decision 156: an open tag that never closes — lint saw a fragment with no `>`, the build saw a page.
  ["::cover{}\n\n<script"],
  // Decision 157: `----` closes nothing in micromark, and `readFrontmatter` read it as a fence.
  ["---\ntitle: x\n----\n\n\n"],
  ["--- \ntitle: x\n---\n"],
  // U7 (docs/14 §6): the three blocks whose markup now carries an invoker, a popover target or an anchor
  // name — `commandfor`, `command`, `closedby`, `style="anchor-name: …"`, `<details name>` — on one page,
  // so property 4e ("script on the page ⇔ rule 13 in the file") reads all of them on every seed and
  // weighs them at 0. Not a defect found; the case the rule's comment names, pinned.
  ['---\ntitle: "twin"\ndate: "2026-03-02"\nstatus: "published"\ntags: []\n---\n\nA note[^1] and a picture.\n\n[^1]: The note.\n\n::figure{src="/media/one.png" alt="One"}\n\n:::faq\n### Why?\nBecause.\n:::\n'],
  // Decision 234, 22 Sep 2026 (CI seed 35766304191, shrunk 9×): an unclosed `[` and a bare URL in the
  // same paragraph send `mdast-util-gfm-autolink-literal` back through the text node, and every node it
  // splits out comes back with no `position`. Lint's walk read `?? 0`, so every diagnostic in that
  // paragraph named line 0 of a six-line file — slop here, and image-alt, the dead link and rules 12–13
  // by the same route. The walk now carries the nearest positioned ancestor's line instead.
  ['::cover{eyebrow="evidence" image="/media/one.png" alt="A block of colour"}\n\n:::callout{kind="warning" title="日本語 markdown"}\n[agent](/posts/nowhere) Spec spec agent agent agent null delve. [agent(https://snypd.rocks/bench)\n:::\n'],
];

/** Property 6a — a session, as the messages an agent's harness sent. */
export const MESSAGES: Array<[Array<Record<string, unknown>>]> = [
  // Decision 159: an object id came back as an object; a notification's method with an id was ignored.
  [[{ jsonrpc: "2.0", method: "tools/call", params: { name: "site", arguments: {} }, id: { nested: true } }]],
  [[{ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 1 }, id: 1.5 }, { jsonrpc: "2.0", method: "tools/call", params: { name: "content.restore", arguments: {} } }]],
];
/** Property 6b — a session, as the lines on stdin. */
export const LINES: Array<[string[]]> = [
  // Decision 159: `null` threw inside the handler and a bare string was dropped as a notification.
  [["null", ""]],
  [['"a string"', '{"jsonrpc":"2.0","id":1,"method":"ping"}']],
];
