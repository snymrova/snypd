import type { PrimitiveProps, Html } from "@snypd/render";
import { raw } from "@snypd/render";
import { renderChart } from "@snypd/viz";
/**
 * S8: the SVG from `@snypd/viz` — geometry from the spec, colour from `--color-viz-*`, no client JS.
 * `base` declares no tokens, so the literals inside those vars do the painting and a child theme
 * recolours every chart without touching this file.
 *
 * The spec's declared fallback ("a markdown table of the data, not a picture") is the path for a chart
 * that cannot be drawn: rows the renderer could not read. It shows what the author actually wrote, so
 * the page still carries the data while lint (rule 2) says why there is no picture. A chart with no rows
 * at all — `src=`, which v0.1 does not read — renders its caption and nothing else, never an empty table.
 * Renderer warnings are not printed here: the renderer does not lint (html.ts).
 */
export default function Chart({ props, data }: PrimitiveProps): Html {
  const type = props.type as string;
  const unit = props.unit as string | undefined;
  const caption = props.caption as string | undefined;
  const rows = data ?? props.data;
  const chart = renderChart({ type, data: rows, unit, caption, title: props.title as string | undefined });
  const figcaption = <figcaption>{caption}{props.source ? <> (<a href={props.source as string} rel="external">source</a>)</> : null}</figcaption>;
  const figure = (inner: Html | null) => <figure class="snypd-chart" data-type={type}>{inner}{figcaption}</figure>;

  if (chart) return figure(raw(chart.svg));

  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return figure(null);
  const cell = (v: unknown) => (v === undefined || v === null || v === "" ? "—" : String(v));
  const hasSeries = list.some((r) => (r as { series?: unknown })?.series !== undefined);
  return figure(
    <table>
      <thead><tr><th>label</th><th>{unit ? `value (${unit})` : "value"}</th>{hasSeries ? <th>series</th> : null}</tr></thead>
      <tbody>{list.map((r) => { const o = (r && typeof r === "object" ? r : { value: r }) as Record<string, unknown>;
        return <tr><td>{cell(o.label)}</td><td>{cell(o.value)}</td>{hasSeries ? <td>{cell(o.series)}</td> : null}</tr>; })}</tbody>
    </table>,
  );
}
