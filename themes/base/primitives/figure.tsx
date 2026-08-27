import type { PrimitiveProps, Html } from "@snypd/render";
export default function Figure({ props }: PrimitiveProps): Html {
  return (
    <figure class="snypd-figure" data-width={props.width as string}>
      <img src={props.src as string} alt={(props.alt as string | undefined) ?? ""} loading="lazy" />
      {props.caption ? <figcaption>{props.caption as string}</figcaption> : null}
    </figure>
  );
}
