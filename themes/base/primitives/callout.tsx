import type { PrimitiveProps, Html } from "@snypd/render";
export default function Callout({ props, body }: PrimitiveProps): Html {
  return (
    <aside class="snypd-callout" data-kind={props.kind as string} data-variant={props.variant as string | undefined}>
      {props.title ? <p><strong>{props.title as string}</strong></p> : null}
      {body}
    </aside>
  );
}
