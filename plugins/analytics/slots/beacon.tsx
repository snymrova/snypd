/**
 * `body-end`: the provider's script tag, `defer`red, last thing before `</body>`. This is the client
 * JavaScript the manifest declares (`client: 3kb`) and `page.js.kb` measures — the tag itself is ~0.1 KB,
 * the script the provider serves is the rest.
 */
import type { Html, SlotProps } from "@snypd/render";
import { beacon, type Options } from "../provider";

export default function Beacon({ ctx, options }: SlotProps): Html {
  const { src, attrs } = beacon(options as unknown as Options, ctx.site.url);
  return <script defer src={src} {...attrs}></script>;
}
