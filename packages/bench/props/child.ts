/**
 * One build in a process of its own: `bun child.ts <root>`. The interruption and concurrency properties
 * need a build they can kill and builds that run at once, and both are things a process does, not a
 * function. Prints one JSON line — the counts the parent asserts on — and exits 2 on a refusal, so the
 * parent can tell a build the client budget stopped from one it stopped itself.
 */
import { build } from "@snypd/render";

const root = process.argv[2];
if (!root) { console.error("usage: bun child.ts <root>"); process.exit(64); }
try {
  const r = await build(root);
  console.log(JSON.stringify({ ok: true, rendered: r.rendered, cached: r.cached, recovered: r.recovered }));
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: (e as Error).message }));
  process.exit(2);
}
