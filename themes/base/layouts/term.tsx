import type { LayoutProps, Html } from "@snypd/render";
import Shell from "./shell";
import Entries from "./entries";

export default function Term({ ctx, entries, route, title, description, term }: LayoutProps): Html {
  return (
    <Shell ctx={ctx} title={title} description={description} route={route}>
      <main>
        <h1><small>{term?.taxonomy}</small> {title}</h1>
        {description ? <p>{description}</p> : null}
        <Entries entries={entries} />
      </main>
    </Shell>
  );
}
