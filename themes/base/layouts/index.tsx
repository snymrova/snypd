import type { LayoutProps, Html } from "@snypd/render";
import Shell from "./shell";
import Entries from "./entries";

export default function Index({ ctx, entries, route, title, jsonLd }: LayoutProps): Html {
  return (
    <Shell ctx={ctx} title={title} route={route} jsonLd={jsonLd}>
      <main>
        <h1>{ctx.site.name}</h1>
        <Entries entries={entries} />
      </main>
    </Shell>
  );
}
