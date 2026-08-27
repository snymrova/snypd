import type { PrimitiveProps, Html } from "@snypd/render";
/** The body already holds the rendered stats (children render through the same theme). */
export default function StatRow({ body, children }: PrimitiveProps): Html {
  return <div class="snypd-stat-row" data-count={children.length}>{body}</div>;
}
