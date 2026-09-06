/** The site header: the name, linked home. A menu arrives with nav (docs/09 U2); a child theme overrides this one file to change it. */
import type { Html, PartProps } from "@snypd/render";

export default function Header({ ctx }: PartProps): Html {
  return <header><a href="/" rel="home">{ctx.site.name}</a></header>;
}
