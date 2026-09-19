/**
 * TF3 (docs/29 §4): the seed solver's promise is "every seed passes the contrast gate", and a promise
 * about every seed is a property, so it is tested as one — a thousand seeds from a fixed PRNG, across the
 * whole OKLCH wheel, at every lightness and chroma a person might plausibly type, × three strategies, each
 * measured on both sides of `light-dark()` through `resolveColor`, the gate's own parser.
 */
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONTRAST_PAIRS, expandSeed, SeedError, writeSeed, type SeedStrategy } from "./seed";
import { contrastRatio, inGamut, resolveColor, rgbToOklch, tokenVars, type Mode } from "./color";

/** mulberry32: small, fast, and the same thousand seeds on every machine. */
function prng(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const OKLCH = /oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/g;

describe("seed expansion (TF3)", () => {
  test("1,000 seeds × 3 strategies: every gated pair, text ≥ 7:1, viz ≥ 3:1, every value in gamut", () => {
    const rand = prng(20260919);
    const strategies: SeedStrategy[] = ["restrained", "balanced", "expressive"];
    let runs = 0;
    for (let i = 0; i < 1000; i++) {
      const seed = `oklch(${(0.3 + rand() * 0.6).toFixed(3)} ${(0.03 + rand() * 0.2).toFixed(3)} ${(rand() * 360).toFixed(1)})`;
      for (const strategy of strategies) {
        const r = expandSeed({ seed, strategy });
        const values = Object.fromEntries(Object.entries(r.tokens).map(([k, v]) => [k, String(v.default)]));
        const vars = tokenVars(values);
        for (const mode of ["light", "dark"] as Mode[]) {
          const get = (t: string) => resolveColor(values[t]!, mode, vars)!;
          for (const p of CONTRAST_PAIRS) {
            const got = contrastRatio(get(p.fg), get(p.bg));
            if (got < p.min) throw new Error(`${seed} ${strategy} ${mode}: ${p.fg} on ${p.bg} ${got.toFixed(2)}`);
          }
          for (const g of ["color.bg", "color.surface"]) if (contrastRatio(get("color.text"), get(g)) < 7) throw new Error(`${seed} ${strategy} ${mode}: text on ${g} under 7:1`);
          for (let v = 1; v <= 6; v++) if (contrastRatio(get(`color.viz.${v}`), get("color.bg")) < 3) throw new Error(`${seed} ${strategy} ${mode}: color.viz.${v} under 3:1`);
        }
        for (const [k, v] of Object.entries(values)) for (const m of v.matchAll(OKLCH)) {
          if (!inGamut(+m[1]!, +m[2]!, +m[3]!, 1e-3)) throw new Error(`${seed} ${strategy}: ${k} ${m[0]} is out of sRGB`);
        }
        runs++;
      }
    }
    expect(runs).toBe(3000);
  }, 180_000);

  test("the accent keeps the seed's hue, and its lightness when that already reads", () => {
    const r = expandSeed({ seed: "oklch(0.5 0.13 252)", strategy: "restrained" });
    const light = rgbToOklch(resolveColor(String(r.tokens["color.accent"]!.default), "light")!);
    expect(Math.abs(light.h - 252)).toBeLessThan(1);
    expect(Math.abs(light.l - 0.5)).toBeLessThan(0.005);
    expect(r.report.notes.filter((n) => n.startsWith("light: accent L"))).toEqual([]);
    // A seed too pale to be a link is darkened, and the report says so rather than doing it silently.
    const pale = expandSeed({ seed: "oklch(0.85 0.12 90)" });
    expect(pale.report.notes.some((n) => /^light: accent L 0\.85 → 0\.\d+/.test(n))).toBe(true);
  });

  test("one scheme writes plain values and commits `color.scheme`; both writes light-dark() pairs", () => {
    const dark = expandSeed({ seed: "#1f5fbf", scheme: "dark" });
    expect(dark.tokens["color.scheme"]!.default).toBe("dark");
    expect(String(dark.tokens["color.bg"]!.default)).toMatch(/^oklch\(0\.165 /);
    expect(dark.report.pairs.every((p) => p.mode === "dark")).toBe(true);
    const both = expandSeed({ seed: "#1f5fbf" });
    expect(both.tokens["color.scheme"]!.default).toBe("light dark");
    expect(String(both.tokens["color.bg"]!.default)).toStartWith("light-dark(oklch(0.985 ");
  });

  test("the type scale is Utopia's: body at step 0, each end at base × ratio^n, h1 above h2 above h3", () => {
    const r = expandSeed({ seed: "#1f5fbf", ratio: [1.2, 1.25], base: [16, 20] });
    expect(r.tokens["size.body"]!.default).toBe("clamp(1rem, 0.9071rem + 0.381vw, 1.25rem)");
    const step = (n: number) => r.report.steps.find((s) => s.step === n)!;
    expect(step(2)).toEqual({ step: 2, min: 1.44, max: 1.9531, token: "size.h2" });
    expect(r.report.steps.map((s) => s.step)).toEqual([-2, -1, 0, 1, 2, 3, 4, 5]);
    expect(r.tokens["measure"]!.default).toBe("66ch");
    expect(String(r.tokens["space.3"]!.default)).toBe(String(r.tokens["size.body"]!.default));
    // Leading follows the face: a tall x-height gets more of it, capped at 1.7.
    expect(expandSeed({ seed: "#1f5fbf" }).tokens["leading.body"]!.default).toBe(1.5);
    expect(expandSeed({ seed: "#1f5fbf", xHeight: 0.54 }).tokens["leading.body"]!.default).toBe(1.6);
    expect(expandSeed({ seed: "#1f5fbf", xHeight: 0.7 }).tokens["leading.body"]!.default).toBe(1.7);
  });

  test("a grey, an unreadable colour and an out-of-range ratio are refused with a hint", () => {
    expect(() => expandSeed({ seed: "#808080" })).toThrow(SeedError);
    expect(() => expandSeed({ seed: "not a colour" })).toThrow(/cannot read the seed/);
    expect(() => expandSeed({ seed: "#1f5fbf", ratio: [1.2, 3] })).toThrow(/--ratio=1.2:3/);
  });

  test("writeSeed keeps the file's comments and descriptions, and records the inputs under ## Seed", () => {
    const dir = mkdtempSync(join(tmpdir(), "seed-"));
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "theme.yaml"), `# a comment a person wrote\ntheme: t\ntokens:\n  # about the page\n  color.bg: { default: "#fff", customisable: true, kind: color, description: "Mine." }\n`);
      writeFileSync(join(dir, "DESIGN.md"), "# t\n\n## Use scene\n\nThe bus.\n\n## Seed\n\nold\n\n## Decisions\n\n- one\n");
      const r = expandSeed({ seed: "oklch(0.55 0.13 252)" });
      writeSeed(dir, "t", r, "ibm-plex-serif");
      const y = readFileSync(join(dir, "theme.yaml"), "utf8");
      expect(y).toContain("# a comment a person wrote");
      expect(y).toContain("# about the page");
      expect(y).toContain('description: "Mine."');
      expect(y).toContain(`default: "${r.tokens["color.bg"]!.default}"`);
      expect(y).toContain("color.viz.6:");
      const d = readFileSync(join(dir, "DESIGN.md"), "utf8");
      expect(d).toContain("## Use scene\n\nThe bus.");
      expect(d).toContain('snypd seed t --seed="oklch(0.55 0.13 252)" --strategy=balanced --scheme=both --ratio=1.2:1.25 --base=17:19 --face=ibm-plex-serif');
      expect(d).not.toContain("old");
      expect(d).toContain("## Decisions\n\n- one");
      try { writeSeed(join(dir, "nope"), "nope", r); throw new Error("wrote into a theme that does not exist"); }
      catch (e) { expect((e as SeedError).hint).toContain("snypd new theme nope"); }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
