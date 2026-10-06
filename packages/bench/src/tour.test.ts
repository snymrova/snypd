/**
 * W5 (docs/37 §6 step 4): which three routes a tour takes. The pictures are the MCP test's (`theme › look`
 * › tour), which needs a browser; the routes are picked from the content and the build, and need none.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, routeLookup } from "@snypd/core";
import { tourRoutes } from "./tour";

const REPO = join(import.meta.dir, "..", "..", "..");
const scratch = join(REPO, "corpora/_test/tour");
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** A stand-in build: an index.html at every route the site has, term pages with as many entries as `entries` says. */
function fakeDist(site: string, entries: (route: string) => number = () => 0): { root: string; dist: string } {
  const root = join(REPO, site), dist = join(scratch, site.replace(/\W+/g, "-"));
  rmSync(dist, { recursive: true, force: true });
  for (const r of routeLookup(root, loadConfig(root)).routes) {
    mkdirSync(join(dist, r), { recursive: true });
    writeFileSync(join(dist, r, "index.html"), `<main>${'<li class="snypd-entry"></li>'.repeat(entries(r))}</main>`);
  }
  return { root, dist };
}
const pick = (site: string, entries?: (route: string) => number) => {
  const { root, dist } = fakeDist(site, entries);
  return tourRoutes(root, loadConfig(root), dist);
};

describe("a tour's three routes", () => {
  test("the specimen: its front page, the posts' archive, and its longest post — not the changelog, which sets more fields and says little", () => {
    const r = pick("corpora/specimen");
    expect(r.routes.map((x) => [x.kind, x.route])).toEqual([["front", "/"], ["list", "/posts/"], ["feature", "/posts/long-read/"]]);
    expect(r.routes[1]!.why).toBe("post's archive, 35 entries");
    expect(r.missing).toEqual([]);
  });

  test("Ferrule: the work archive, and the longest case study — not the about page, which is longer and sets nothing", () => {
    const r = pick("examples/studio");
    expect(r.routes.map((x) => [x.kind, x.route])).toEqual([["front", "/"], ["list", "/work/"], ["feature", "/work/kiln-to-table/"]]);
    expect(r.routes[2]!.why).toContain("work sets 7.0 fields an entry");
  });

  test("a blog whose front page is the archive: the list is the term page with the most entries on it", () => {
    const r = pick("corpora/100", (route) => (route.split("/").filter(Boolean).length === 2 && !route.startsWith("/posts") ? route.length : 0));
    const list = r.routes.find((x) => x.kind === "list")!;
    expect(list.why).toContain("the front page is the archive");
    expect(list.route).not.toMatch(/^\/posts\//);
    expect(r.routes.map((x) => x.kind)).toEqual(["front", "list", "feature"]);
  });

  test("a route missing from the build is never picked, and a kind with none is said, not guessed", () => {
    const { root, dist } = fakeDist("corpora/specimen");
    rmSync(join(dist, "posts"), { recursive: true, force: true });
    const r = tourRoutes(root, loadConfig(root), dist);
    expect(r.routes.every((x) => !x.route.startsWith("/posts/"))).toBe(true);
    expect(r.routes.find((x) => x.kind === "list")?.route ?? r.missing.join()).not.toContain("/posts/");
  });
});
