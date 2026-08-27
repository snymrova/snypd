import type { PrimitiveProps, Html } from "@snypd/render";
export default function Cta({ props, body }: PrimitiveProps): Html {
  return (
    <aside class="snypd-cta" data-variant={props.variant as string}>
      <p><strong>{props.title as string}</strong></p>
      {props.body ? <p>{props.body as string}</p> : null}
      {body}
      <p><a class="snypd-button" href={props.href as string}>{props.button as string}</a></p>
    </aside>
  );
}
