/** `head`: a preconnect to the provider's origin, so the deferred beacon's connection is open by the time the tag is reached. */
import type { Html, SlotProps } from "@snypd/render";
import { beacon, type Options } from "../provider";

export default function Head({ ctx, options }: SlotProps): Html {
  const { origin } = beacon(options as unknown as Options, ctx.site.url);
  return <link rel="preconnect" href={origin} crossorigin="" />;
}
