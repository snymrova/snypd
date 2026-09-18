/**
 * S1/S2 STUB static server: serves `<root>/dist` with Bun.serve so the TTFB benchmark has a floor.
 * The real preview (`snypd dev`: SSR of drafts, route cache) landed in S11 (docs/07).
 * Only Bun APIs used: Bun.serve, Bun.file (docs/04 runtime interface).
 */
import { join } from "node:path";
import { existsSync, statSync } from "node:fs";

export interface ServeOptions { port?: number; dist?: string }

export function serve(root: string, opts: ServeOptions = {}) {
  const dist = opts.dist ?? join(root, "dist");
  const server = Bun.serve({
    port: opts.port ?? 0,
    fetch(req) {
      const url = new URL(req.url);
      let path = decodeURIComponent(url.pathname);
      if (path.includes("..")) return new Response("bad path", { status: 400 });
      // Content negotiation: `Accept: text/markdown` on a route → its .md twin (docs/05 agent-read surface).
      const wantsMd = req.headers.get("accept")?.includes("text/markdown");
      let file = join(dist, path);
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, wantsMd ? "index.md" : "index.html");
      // A miss is the site's own not-found page when the build wrote one (S36), as a host serves it.
      if (!existsSync(file)) { const nf = join(dist, "404.html"); return existsSync(nf) ? new Response(Bun.file(nf), { status: 404 }) : new Response("not found", { status: 404 }); }
      return new Response(Bun.file(file));
    },
  });
  return { url: `http://localhost:${server.port}`, port: server.port, stop: () => server.stop(true) };
}
