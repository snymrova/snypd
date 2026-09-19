/**
 * The modules a theme or plugin the *site* wrote may import, answered with the copy this process runs (S37).
 *
 * A bundled theme is compiled into the binary, so its `@snypd/render` was resolved at compile time. A
 * site-local one (`themes/folio/`, `plugins/<name>/`) is `import()`ed from the site's directory at run
 * time, and from there a bare specifier walks up to a `node_modules` a user's site does not have — and
 * with no tsconfig beside it, Bun names `react/jsx-dev-runtime` as the JSX runtime. Inside this monorepo
 * the root tsconfig and the workspace answer both, which is how 0.1.5 shipped unable to build snypd.rocks.
 *
 * So the specifiers are registered as modules whose exports are the namespaces already loaded here: the
 * theme renders through the same `Html` class the shell checks with `instanceof`, by construction. React's
 * two runtime names are answered too, because they are what a `.tsx` with no tsconfig asks for; a theme is
 * JSX over this runtime and nothing else (theme.ts).
 *
 * Every namespace is a static import of a *relative* path. A callback that imported `@snypd/render` by
 * name would ask for the module it is defining — from source that is a loop, not a lookup.
 *
 * Registered on the first site file this process imports, not at start: `serve` answers `initialize`
 * without a renderer (D2), and a site with no theme of its own never registers anything.
 */
import * as render from "./index";
import * as runtime from "./jsx-runtime";

const MODULES: Record<string, object> = {
  "@snypd/render": render,
  "@snypd/render/jsx-runtime": runtime,
  "@snypd/render/jsx-dev-runtime": runtime,
  "react/jsx-runtime": runtime,
  "react/jsx-dev-runtime": runtime,
};

let registered = false;
export function hostModules(): void {
  if (registered) return;
  registered = true;
  Bun.plugin({
    name: "snypd-host-modules",
    setup(b) { for (const [spec, ns] of Object.entries(MODULES)) b.module(spec, () => ({ exports: { ...ns }, loader: "object" })); },
  });
}
