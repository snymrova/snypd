import type { PrimitiveProps, Html } from "@snypd/render";
export default function Tldr({ body }: PrimitiveProps): Html {
  return <section class="snypd-tldr" aria-label="Summary"><p><strong>TL;DR</strong></p>{body}</section>;
}
