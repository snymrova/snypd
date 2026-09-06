/** The site footer: the name. A child theme overrides this one file to change it. */
import type { Html, PartProps } from "@snypd/render";

export default function Footer({ ctx }: PartProps): Html {
  return <footer><p>{ctx.site.name}</p></footer>;
}
