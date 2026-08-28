/**
 * Compile the CLI the way a release does, and hand back the path (S18a, decision 47).
 *
 * The recipe itself lives in `@snypd/bench`'s `compile.ts` since S18c, because the benchmark that gates
 * `mcp.coldStart.binary` and the smoke test that runs the artefact must compile the *same* binary — two
 * recipes is how the gate goes green on something a release does not ship.
 *
 * Kept as its own entry so a person can build one and poke at it:
 *   bun packages/bench/smoke/build.ts /tmp/snypd
 */
import { join } from "node:path";
export { compile, ENTRY, REPO } from "../src/compile";
import { compile, REPO } from "../src/compile";

if (import.meta.main) {
  const out = process.argv[2] ?? join(REPO, "dist", "snypd");
  console.log(await compile(out));
}
