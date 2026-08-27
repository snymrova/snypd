import type { PrimitiveProps, Html } from "@snypd/render";
export default function Pullquote({ props, body }: PrimitiveProps): Html {
  const cite = props.cite as string | undefined, href = props.href as string | undefined;
  return (
    <blockquote class="snypd-pullquote" cite={href}>
      {body}
      {cite ? <footer>{href ? <a href={href}>{cite}</a> : cite}</footer> : null}
    </blockquote>
  );
}
