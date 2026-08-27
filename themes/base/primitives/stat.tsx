import type { PrimitiveProps, Html } from "@snypd/render";
export default function Stat({ props }: PrimitiveProps): Html {
  const source = props.source as string | undefined;
  return (
    <div class="snypd-stat">
      <p class="snypd-stat-value"><strong>{props.value as string}</strong>{props.delta ? <> <small>{props.delta as string}</small></> : null}</p>
      <p class="snypd-stat-label">{props.label as string}{source ? <> (<a href={source} rel="external">source</a>)</> : null}</p>
    </div>
  );
}
