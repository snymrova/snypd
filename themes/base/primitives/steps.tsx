import type { PrimitiveProps, Html } from "@snypd/render";
export default function Steps({ props, body }: PrimitiveProps): Html {
  return (
    <section class="snypd-steps">
      {props.title ? <h2>{props.title as string}</h2> : null}
      {props.time ? <p><small>{props.time as string}</small></p> : null}
      {body}
    </section>
  );
}
