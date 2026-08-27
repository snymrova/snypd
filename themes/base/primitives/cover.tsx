import type { PrimitiveProps, Html } from "@snypd/render";
/** An explicit cover replaces the one the post layout builds from frontmatter; the layout's stays as the h1. */
export default function Cover({ props, page }: PrimitiveProps): Html {
  const title = (props.title as string | undefined) ?? page?.title;
  return (
    <header class="snypd-cover snypd-cover--explicit">
      {props.eyebrow ? <p class="snypd-eyebrow">{props.eyebrow as string}</p> : null}
      <p class="snypd-cover-title"><strong>{title}</strong></p>
      {props.subtitle ? <p>{props.subtitle as string}</p> : null}
      {props.image ? <img src={props.image as string} alt={(props.alt as string | undefined) ?? ""} /> : null}
    </header>
  );
}
