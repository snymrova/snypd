import type { PrimitiveProps, Html } from "@snypd/render";
/** Body is "### question" headings followed by answers; FAQPage schema is emitted in S7. */
export default function Faq({ props, body }: PrimitiveProps): Html {
  return <section class="snypd-faq"><h2>{props.title as string}</h2>{body}</section>;
}
