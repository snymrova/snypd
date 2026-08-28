/**
 * The kill test, as data (docs/06 "the v0.1 test", docs/07 D1).
 *
 * The one design rule here: **an assertion reads the site, never the transcript.** A driver passes by
 * leaving the repository in the described state — the posts carry the primitives they were latent in,
 * the theme is the one that was asked for, the tokens are retuned, everything is published and lint is
 * clean. How it got there is not scored, so a driver cannot pass by replaying a blessed call sequence,
 * and a live model that finds a shorter route is not marked wrong for taking it.
 *
 * The budget (`≤ 8 tool calls to a lint-clean draft`) is therefore a *separate* number from the goal.
 * A run can reach the goal and blow the budget: that is a real, reportable outcome and the thing we
 * most want to see, because it is the failure mode that says "the surface works but it is not smooth".
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, readFrontmatter, target, type LoadedConfig } from "@snypd/core";

export interface Check { id: string; what: string; ok: boolean; detail: string }

/** The three plain posts the test starts from, and the primitive each one is secretly already shaped as. */
export const UPGRADES = [
  { slug: "cold-start", primitive: "chart", why: "a four-row table of one measurement per row" },
  { slug: "publishing-a-draft", primitive: "flow", why: "a numbered list that branches and loops back" },
  { slug: "why-only-mcp", primitive: "faq", why: "a run of question headings with answers under them" },
] as const;

/** Phase 2: the new post, written from nothing, which must carry both viz primitives. */
export const NEW_POST = { slug: "the-kill-test", primitives: ["chart", "flow"] } as const;

/** The theme the site must end on, and how many of its tokens must have been retuned. */
export const THEME = { from: "base", to: "editorial", tokensChanged: 2 } as const;

const source = (root: string, cfg: LoadedConfig, slug: string): string | undefined => {
  const t = target(root, cfg, "post", slug);
  return existsSync(t.file) ? readFileSync(t.file, "utf8") : undefined;
};

/** Does this post carry a real `primitive` block? Directive syntax, not the word appearing in prose. */
const carries = (src: string, primitive: string) =>
  new RegExp(`^:{2,}${primitive}(?:[\\s{]|$)`, "m").test(src);

/**
 * Score a finished run against the site it left behind.
 *
 * `lint` is passed in rather than recomputed because the driver has already paid for it over MCP and a
 * second, in-process lint could disagree with the one the agent was shown — which would make the report
 * a statement about this file rather than about the product.
 */
export function assess(root: string, lint: { errors: number; warnings: number }): Check[] {
  const cfg = loadConfig(root);
  const out: Check[] = [];
  const add = (id: string, what: string, ok: boolean, detail: string) => out.push({ id, what, ok, detail });

  for (const u of UPGRADES) {
    const src = source(root, cfg, u.slug);
    add(`upgrade.${u.slug}`, `${u.slug} carries a \`${u.primitive}\``,
      !!src && carries(src, u.primitive),
      !src ? "post is missing" : carries(src, u.primitive) ? `:::${u.primitive} present (${u.why})` : `still plain prose — ${u.why}`);
  }

  const newSrc = source(root, cfg, NEW_POST.slug);
  add("new.exists", `a new post \`${NEW_POST.slug}\` was written`, !!newSrc, newSrc ? "present" : "missing");
  for (const p of NEW_POST.primitives)
    add(`new.${p}`, `the new post carries a \`${p}\``, !!newSrc && carries(newSrc, p),
      !newSrc ? "no post to check" : carries(newSrc, p) ? `:::${p} present` : `no :::${p} in the body`);

  const use = cfg.config.theme.use;
  add("theme.swapped", `the theme is \`${THEME.to}\``, use === THEME.to, `theme.use = ${use}`);

  // Only scalars. The merged `theme.tokens` also carries the theme's own *declarations* — `{ default,
  // customisable, kind, description }` objects — and counting those would pass this check on a theme that
  // simply declares a lot, which is how it first read "38 set" on a run where the agent set none.
  // `snypd.yaml › theme.tokens` writes scalars (docs/07 S7), so a scalar is an override and nothing else is.
  const retuned = Object.entries((cfg.config.theme.tokens ?? {}) as Record<string, unknown>)
    .filter(([, v]) => typeof v === "string" || typeof v === "number").map(([k]) => k);
  add("theme.tokens", `at least ${THEME.tokensChanged} tokens retuned`, retuned.length >= THEME.tokensChanged,
    retuned.length ? `${retuned.length} overridden: ${retuned.join(", ")}` : "none overridden");

  const published = [...UPGRADES.map((u) => u.slug), NEW_POST.slug].filter((slug) => {
    const src = source(root, cfg, slug);
    return !!src && readFrontmatter(src).status === "published";
  });
  add("published", "every post is published", published.length === 4, `${published.length}/4 published${published.length < 4 ? `: ${published.join(", ") || "none"}` : ""}`);

  add("lint.clean", "the site lints clean", lint.errors === 0, `${lint.errors} errors, ${lint.warnings} warnings`);

  // The site has to *build*: a post that lints clean and throws the renderer is not a published post.
  const dist = join(root, "dist");
  add("built", "the site builds", existsSync(join(dist, "index.html")), existsSync(dist) ? "dist/index.html present" : "no dist/");

  return out;
}

export const passed = (checks: Check[]) => checks.every((c) => c.ok);
