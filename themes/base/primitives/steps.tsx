import type { PrimitiveProps, Html } from "@snypd/render";
import { jsx } from "@snypd/render";
/**
 * The title is a heading one level under the section the block sits in (docs/18, decision 189): `<h2>`
 * before the page's first `##`, `<h3>` under one — so "How we work" and its "Four stages, one room" are
 * a heading and a sub-heading, not two headlines. `data-count` is how many steps there are, so a theme
 * that stands them side by side can choose columns that never leave one step alone on a row.
 */
export default function Steps({ props, body, block, depth }: PrimitiveProps): Html {
  const list = (block.node as { children?: Array<{ type: string; children?: unknown[] }> }).children?.find((c) => c.type === "list");
  const count = list?.children?.length;
  return (
    <section class="snypd-steps" data-count={count !== undefined ? String(count) : undefined}>
      {props.title ? jsx(`h${Math.min(depth + 1, 6)}`, { children: props.title as string }) : null}
      {props.time ? <p><small>{props.time as string}</small></p> : null}
      {body}
    </section>
  );
}
