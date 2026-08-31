/**
 * The host's half of the contract (S18d′). What is worth asserting here is not the file format — it is
 * that the generated build command names something a host can actually install, which is the sentence
 * `07` §3b could not write before npm answered `bunx snypd`.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCommand, initSite, VERSION, writeDeploy } from "./index";

const fresh = () => mkdtempSync(join(tmpdir(), "snypd-deploy-"));

describe("--deploy", () => {
  test("cloudflare gets wrangler.toml, vercel gets vercel.json, both get the PR workflow", () => {
    const a = fresh(), b = fresh();
    expect(writeDeploy(a, "cloudflare", { name: "My Site" })).toEqual(["wrangler.toml", ".github/workflows/snypd.yml"]);
    expect(writeDeploy(b, "vercel", { name: "My Site" })).toEqual(["vercel.json", ".github/workflows/snypd.yml"]);
    expect(readFileSync(join(a, "wrangler.toml"), "utf8")).toContain('name = "my-site"');   // a project name, not a title
    const v = JSON.parse(readFileSync(join(b, "vercel.json"), "utf8")) as { outputDirectory: string; cleanUrls: boolean };
    expect(v.outputDirectory).toBe("dist");
    expect(v.cleanUrls).toBe(true);   // `/about` and `/about/` must not be two pages with one canonical URL
  });

  test("the build command names a published, pinned version — not a pipe to a shell", () => {
    // `07` §3b specified `curl -fsSL … | sh && snypd build`. S18d′ refused it on two counts, and this is
    // where that refusal has to hold: the host's build line is the one place the install story is load-bearing.
    const cmd = buildCommand(VERSION);
    expect(cmd).toBe(`npx -y snypd@${VERSION} build`);
    for (const f of ["wrangler.toml", ".github/workflows/snypd.yml"]) {
      const dir = fresh(); writeDeploy(dir, "cloudflare", { name: "x" });
      const body = readFileSync(join(dir, f), "utf8");
      expect(body).toContain(`snypd@${VERSION}`);
      expect(body).not.toContain("curl");
      expect(body).not.toContain("| sh");
    }
  });

  test("never overwrites a config that is already somebody's", () => {
    const dir = fresh();
    writeFileSync(join(dir, "wrangler.toml"), "# mine\n");
    expect(writeDeploy(dir, "cloudflare", { name: "x" })).toEqual([".github/workflows/snypd.yml"]);
    expect(readFileSync(join(dir, "wrangler.toml"), "utf8")).toBe("# mine\n");
  });

  test("an unknown target fails before a single file is written", () => {
    const dir = fresh();
    expect(() => writeDeploy(dir, "netlifyish" as never, { name: "x" })).toThrow(/unknown deploy target/);
    expect(existsSync(join(dir, ".github"))).toBe(false);
  });

  test("init carries it, and the files land in the commit rather than beside it", () => {
    const dir = fresh();
    mkdirSync(join(dir, "sub"), { recursive: true });   // not empty → no `git init`, which this test does not need
    const r = initSite(dir, { name: "Deployed", deploy: "vercel" });
    expect(r.deploy).toBe("vercel");
    expect(r.created).toContain("vercel.json");
    expect(r.paths).toContain(".github/workflows/snypd.yml");   // `paths` is what `init` commits
  });
});
