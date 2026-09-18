import type { PrimitiveProps, Html } from "@snypd/render";

/** The slice of an mdast node this file reads — typed here because a theme does not depend on `mdast`. */
interface Node { type: string; children?: Node[]; url?: string; alt?: string | null; value?: string }
type Parent = Node & { children: Node[] };
type Image = Node & { type: "image"; url: string };
type Link = Node & { type: "link"; url: string; children: Node[] };
type List = Parent & { type: "list" };
type ListItem = Parent & { type: "listItem" };

/**
 * The fourteenth primitive (S29, docs/17 §4.3): a wall of logos — clients, awards, the badges in a
 * footer — over a markdown list of images, each optionally wrapped in a link and followed by a caption.
 * Three of the reference's fifteen sections are this shape and none of the thirteen could carry it
 * honestly: a row of figures is captions and lightboxes, a stat-row is numbers.
 *
 * The markup is a `<ul>` of `<img alt>`, which is what the list already meant. `marquee` renders the
 * row twice, the second `aria-hidden`, because a CSS marquee is one `@keyframes` over a duplicated row
 * and the duplicate is decoration a screen reader must not read twice; a theme that lays the wall as a
 * grid ignores the copy (`base`'s sheet hides it unless the theme animates it). Alt text is the
 * author's, as on a figure — lint rule 4 already refuses an image without one — and rule 16 says a wall
 * of fewer than three is a list.
 */
export default function LogoWall({ props, ctx, block }: PrimitiveProps): Html {
  const items = logos(block.node as unknown as Node);
  const layout = (props.layout as string | undefined) ?? "grid";
  const title = props.title as string | undefined;
  const row = (hidden: boolean) => (
    <ul aria-hidden={hidden ? "true" : undefined}>
      {items.map((it) => {
        const size = ctx.media[it.src];
        const img = <img src={it.src} alt={hidden ? "" : it.alt} loading="lazy" decoding="async"
          width={size ? String(size.width) : undefined} height={size ? String(size.height) : undefined} />;
        return (
          <li>
            {it.href && !hidden ? <a href={it.href} rel="external">{img}</a> : img}
            {it.caption && !hidden ? <small>{it.caption}</small> : null}
          </li>
        );
      })}
    </ul>
  );
  return (
    <section class="snypd-logo-wall" data-layout={layout} data-count={String(items.length)} aria-label={title}>
      {title ? <p class="snypd-logo-wall-title">{title}</p> : null}
      {layout === "marquee" ? <div class="snypd-marquee">{row(false)}{row(true)}</div> : row(false)}
    </section>
  );
}

export interface Logo { src: string; alt: string; href?: string; caption?: string }

/** The list under the directive, read as logos: the first image in each item, the link around it, the text after it. */
export function logos(node: Node): Logo[] {
  const out: Logo[] = [];
  const list = (node.children ?? []).find((c) => c.type === "list") as List | undefined;
  for (const li of list?.children ?? []) {
    let image: Image | undefined, href: string | undefined;
    const rest: string[] = [];
    const walk = (n: Node, inLink?: string) => {
      if (n.type === "image" && !image) { image = n as Image; href = inLink; return; }
      if (n.type === "link") { for (const c of (n as Link).children) walk(c, (n as Link).url); return; }
      if (n.type === "text" && image) rest.push(n.value ?? "");
      for (const c of n.children ?? []) walk(c, inLink);
    };
    for (const c of (li as ListItem).children) walk(c);
    if (!image) continue;
    const caption = rest.join("").replace(/^\s*[—–-]\s*/, "").replace(/\s+/g, " ").trim();
    out.push({ src: image.url, alt: image.alt ?? "", href, caption: caption || undefined });
  }
  return out;
}
