/**
 * S16 — site-level writes. The MCP tests drive these through a real server; these are the rules themselves,
 * where they can be stated without JSON-RPC in the way: a bad patch is rolled back, a redirect cannot loop,
 * and a token left behind by a theme switch is still visible.
 */
import { describe, expect, test, beforeEach } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { loadConfig, setConfig, setRedirect, redirects, normalizeRoute, themeTokens, initSite, bundledDir, bundledNames, themeFile, themeFiles, themeHas } from "./index";

const root = "corpora/_test/site-writes";
const config = (extra = "") => writeFileSync(`${root}/snypd.yaml`, `# a comment a human wrote\nsnypd: 1\nsite:\n  name: T   # and one here\n  url: https://t.example\n${extra}`);

describe("site config writes", () => {
  beforeEach(() => { rmSync(root, { recursive: true, force: true }); mkdirSync(root, { recursive: true }); config(); });

  test("a patch keeps the human's comments and only moves the key it names", () => {
    setConfig(root, "site.name", "Renamed");
    const after = readFileSync(`${root}/snypd.yaml`, "utf8");
    expect(after).toContain("# a comment a human wrote");
    expect(after).toContain("# and one here");
    expect(after).toContain("name: Renamed");
    expect(after).toContain("url: https://t.example");
  });

  test("a patch that does not validate is rolled back on disk, and says why", () => {
    const before = readFileSync(`${root}/snypd.yaml`, "utf8");
    expect(() => setConfig(root, "site.url", "not a url")).toThrow(/does not validate/);
    expect(readFileSync(`${root}/snypd.yaml`, "utf8")).toBe(before);
    expect(loadConfig(root).ok).toBe(true);
  });

  test("setting a key to its current value writes nothing, so nothing is committed", () => {
    expect(setConfig(root, "site.name", "T").paths).toEqual([]);
    expect(setConfig(root, "site.name", "Other").paths).toEqual(["snypd.yaml"]);
  });

  test("a route is normalized once, so /a, a/ and /a/ are the same redirect", () => {
    expect([normalizeRoute("/a"), normalizeRoute("a/"), normalizeRoute("/a/")]).toEqual(["/a", "/a", "/a"]);
    expect(normalizeRoute("/")).toBe("/");
    setRedirect(root, "posts/old/", "/posts/new");
    expect(redirects(loadConfig(root))).toEqual({ "/posts/old": "/posts/new" });
  });

  test("a redirect cannot point at itself or close a loop, and can be removed", () => {
    expect(() => setRedirect(root, "/a", "/a")).toThrow(/itself/);
    setRedirect(root, "/a", "/b");
    expect(() => setRedirect(root, "/b", "/a")).toThrow(/loop/);
    setRedirect(root, "/a", null);
    expect(redirects(loadConfig(root))).toEqual({});
  });

  test("a token the active theme never declared is still reported, because a theme switch strands them", () => {
    config("theme:\n  use: editorial\n  tokens:\n    color.accent: \"#0a5\"\n    color.leftover: \"#000\"\n");
    const stranded = themeTokens(loadConfig(root)).filter((t) => t.overridden && !t.customisable);
    expect(stranded.map((t) => t.name)).toEqual(["color.leftover"]);
  });
});

describe("initSite", () => {
  const fresh = "corpora/_test/site-init";
  beforeEach(() => { rmSync(fresh, { recursive: true, force: true }); mkdirSync(fresh, { recursive: true }); });

  test("writes the smallest config that loads, plus the directories content lives in", () => {
    const r = initSite(fresh, { name: "New", url: "https://new.example/", description: "One line." });
    // The dirs the config names, not a guess: `post` lives in `content/posts`, so scaffolding
    // `content/post/` left every new site with a decoy folder beside the real one (S17b).
    expect(r.created).toEqual(["snypd.yaml", "content/posts/", "content/pages/", "content/authors/", "content/media/", ".gitignore", ".mcp.json"]);
    for (const t of Object.values(loadConfig(fresh).config.types)) expect(existsSync(`${fresh}/${t.dir}`)).toBe(true);
    const cfg = loadConfig(fresh);
    expect(cfg.ok).toBe(true);
    expect(cfg.config.site.name).toBe("New");
    expect(cfg.config.site.url).toBe("https://new.example");   // the trailing slash is dropped once, here
    expect(() => initSite(fresh, { name: "Again", url: "https://new.example" })).toThrow(/already exists/);
  });

  // S18a: registration is the only step between an installed binary and a usable product, and the
  // server's own `get-started` prompt cannot cover it — a harness that has not loaded the server cannot
  // run the server's prompts. So `init` writes it, and these are the two ways it goes wrong.
  test("registers the MCP server with the binary that is running, not the name `snypd`", () => {
    initSite(fresh, { name: "New", url: "https://new.example" });
    const j = JSON.parse(readFileSync(`${fresh}/.mcp.json`, "utf8")) as { mcpServers: Record<string, { command: string; args: string[] }> };
    const e = j.mcpServers.snypd!;
    expect(e.args.at(-1)).toBe("serve");
    // `snypd` may not be on PATH — an installer that dropped it in ~/.local/bin is one shell restart
    // away — and a registration naming a command the harness cannot spawn fails where nobody looks.
    expect(e.command).toBe(process.execPath);
    expect(existsSync(e.command)).toBe(true);
  });

  test("never overwrites an .mcp.json that already names servers", () => {
    writeFileSync(`${fresh}/.mcp.json`, JSON.stringify({ mcpServers: { other: { command: "x", args: [] } } }));
    const r = initSite(fresh, { name: "New", url: "https://new.example" });
    expect(r.created).not.toContain(".mcp.json");   // it was not init's to create
    const j = JSON.parse(readFileSync(`${fresh}/.mcp.json`, "utf8")) as { mcpServers: Record<string, unknown> };
    expect(Object.keys(j.mcpServers).sort()).toEqual(["other", "snypd"]);   // added beside, not over
  });

  test("leaves a snypd entry someone pointed somewhere on purpose alone", () => {
    writeFileSync(`${fresh}/.mcp.json`, JSON.stringify({ mcpServers: { snypd: { command: "/opt/snypd", args: ["serve", "/other/site"] } } }));
    initSite(fresh, { name: "New", url: "https://new.example" });
    const j = JSON.parse(readFileSync(`${fresh}/.mcp.json`, "utf8")) as { mcpServers: { snypd: { command: string } } };
    expect(j.mcpServers.snypd.command).toBe("/opt/snypd");
  });

  test("refuses a url that is not one, before anything is written", () => {
    expect(() => initSite(fresh, { name: "New", url: "example.com" })).toThrow(/is not a URL/);
    expect(loadConfig(fresh).ok).toBe(false);
  });
});

// ── The bundled themes (S18a, decision 46) ────────────────────────────────────
// `bundled.ts` is what a compiled binary loads themes from. A theme file added without regenerating is
// a file the product does not ship — and every other test here passes anyway, because they run from a
// checkout where `themes/` is right there. This is the test that fails instead.
describe("bundled themes", () => {
  test("bundled.ts is in sync with themes/", async () => {
    const { generate } = await import("./bundled.gen");
    expect(generate()).toBe(readFileSync(`${import.meta.dir}/bundled.ts`, "utf8"));   // stale → `bun packages/core/src/bundled.gen.ts`
  });

  test("every file of every bundled theme is in it, as text or as a module", async () => {
    const { BUNDLED_NAMES } = await import("./bundled.gen");
    const { BUNDLED } = await import("./bundled");
    for (const name of BUNDLED_NAMES) {
      const dir = `${import.meta.dir}/../../../themes/${name}`;
      const walk = (d: string, base = dir): string[] => readdirSync(d, { withFileTypes: true }).flatMap((f) =>
        f.name === "node_modules" || f.name.startsWith(".") || f.name === "package.json" ? []
          : f.isDirectory() ? walk(`${d}/${f.name}`, base) : [`${d}/${f.name}`.slice(base.length + 1)]);
      const b = BUNDLED[name]!;
      expect(walk(dir).sort()).toEqual([...Object.keys(b.files), ...Object.keys(b.modules)].sort());
      for (const [f, text] of Object.entries(b.files)) expect(text, f).toBe(readFileSync(`${dir}/${f}`, "utf8"));
    }
  });

  test("a bundled theme loads through the seam with no directory to read", () => {
    // What the binary does: no disk, so `themeFile`/`themeHas` answer from the barrel. If these ever
    // fall back to `fs`, they return "missing" for a theme that is present — the S18a bug exactly.
    const dir = bundledDir("base");
    expect(existsSync(dir)).toBe(false);                      // there is genuinely no such directory
    expect(themeHas(dir, "theme.yaml")).toBe(true);
    expect(themeFile(dir, "theme.yaml")).toContain("theme: base");
    expect(themeHas(dir, "./primitives/stat.tsx")).toBe(true);   // theme.yaml writes the `./` form
    expect(themeFiles(dir)).toContain("layouts/post.tsx");
    expect(bundledNames()).toEqual(["base", "editorial"]);
    expect(themeFile(bundledDir("nope"), "theme.yaml")).toBeUndefined();
  });
});
