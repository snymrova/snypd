/**
 * S16 — site-level writes. The MCP tests drive these through a real server; these are the rules themselves,
 * where they can be stated without JSON-RPC in the way: a bad patch is rolled back, a redirect cannot loop,
 * and a token left behind by a theme switch is still visible.
 */
import { describe, expect, test, beforeEach } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { loadConfig, setConfig, setRedirect, redirects, normalizeRoute, themeTokens, initSite } from "./index";

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
    expect(r.created).toEqual(["snypd.yaml", "content/posts/", "content/pages/", "content/authors/", "content/media/", ".gitignore"]);
    for (const t of Object.values(loadConfig(fresh).config.types)) expect(existsSync(`${fresh}/${t.dir}`)).toBe(true);
    const cfg = loadConfig(fresh);
    expect(cfg.ok).toBe(true);
    expect(cfg.config.site.name).toBe("New");
    expect(cfg.config.site.url).toBe("https://new.example");   // the trailing slash is dropped once, here
    expect(() => initSite(fresh, { name: "Again", url: "https://new.example" })).toThrow(/already exists/);
  });

  test("refuses a url that is not one, before anything is written", () => {
    expect(() => initSite(fresh, { name: "New", url: "example.com" })).toThrow(/is not a URL/);
    expect(loadConfig(fresh).ok).toBe(false);
  });
});
