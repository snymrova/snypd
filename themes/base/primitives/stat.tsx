import type { PrimitiveProps, Html } from "@snypd/render";
/**
 * `data-n` / `data-unit` (S29, docs/17 §3): when the value opens with a whole number — `92%`, `0 KB`,
 * `13` — the number and what follows it are put on the element as data, so a theme may count up to it
 * with `@property` and a scroll-driven animation. The value itself stays in the DOM as text: the `.md`
 * twin, axe and a reader with no animation see the real number, and the count is a `::before` the theme
 * paints over it. A value that is not a whole number gets no data and no count.
 */
export default function Stat({ props }: PrimitiveProps): Html {
  const source = props.source as string | undefined;
  const value = props.value as string;
  // The unit keeps its leading space — `0 KB` is counted as `0` + ` KB`, so the count sits where the text sits.
  const m = /^(\d{1,9})(?!\d|\.)(.{0,9})$/.exec(value);
  return (
    <div class="snypd-stat">
      <p class="snypd-stat-value" data-n={m ? m[1] : undefined} data-unit={m ? m[2] : undefined} style={m ? `--n: ${m[1]}` : undefined}><strong>{value}</strong>{props.delta ? <> <small>{props.delta as string}</small></> : null}</p>
      <p class="snypd-stat-label">{props.label as string}{source ? <> (<a href={source} rel="external">source</a>)</> : null}</p>
    </div>
  );
}
