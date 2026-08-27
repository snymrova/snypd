import type { PrimitiveProps, Html } from "@snypd/render";
/** S6: the spec fallback — a table of the data, then the caption. SVG lands in S8 (viz/chart). */
type Row = { label: string; value: number; series?: string };
export default function Chart({ props, data }: PrimitiveProps): Html {
  const rows = (Array.isArray(data) ? data : Array.isArray(props.data) ? props.data : []) as Row[];
  const hasSeries = rows.some((r) => r.series !== undefined);
  const unit = props.unit as string | undefined;
  return (
    <figure class="snypd-chart" data-type={props.type as string}>
      <table>
        <thead><tr><th>label</th><th>{unit ? `value (${unit})` : "value"}</th>{hasSeries ? <th>series</th> : null}</tr></thead>
        <tbody>{rows.map((r) => <tr><td>{r.label}</td><td>{String(r.value)}</td>{hasSeries ? <td>{r.series ?? ""}</td> : null}</tr>)}</tbody>
      </table>
      <figcaption>{props.caption as string}{props.source ? <> (<a href={props.source as string} rel="external">source</a>)</> : null}</figcaption>
    </figure>
  );
}
