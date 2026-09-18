/**
 * `snypd check theme` and `snypd check plugin` (X1, docs/11 §7 · E8) — **a stranger's theme, judged by a
 * machine.**
 *
 * Decision 123 says `/themes` and `/plugins` list nothing that does not pass this. That is the whole
 * reason the file exists, and it sets its shape: a submission is judged by *rules with names*, so a
 * refusal can be argued with. "Your theme failed" is a shrug; "`variations.declared`: `phosphor` sets
 * `color.ring`, which no theme in the chain declares" is a diff.
 *
 * **Almost nothing here is new.** The loader already refuses a missing layout, an `@import` (decision
 * 126), a font over its declaration (decision 118) and a token value that could close the block it lands
 * in (decision 120); `loadConfig` already validates every `theme.yaml` in the chain strictly, with
 * file and line (decision 73). What this file adds is the *third* audience for those refusals — after
 * the build that stops and the agent that reads a diagnostic, the author who wants to know before
 * submitting — plus the checks that only a shelf needs: that the metadata a listing prints exists, that
 * every variation's tokens are tokens the theme declares (decision 127), and that the colours are
 * readable (docs/11 §5 item 4), which is the one rule here that had no machinery before today.
 *
 * Two deliberate limits.
 *
 * **It judges the theme, not the site.** A token the site has moved off its default is read back at the
 * theme's default before the contrast gate sees it: a site that recolours its way below 4.5:1 is a
 * finding about that site, and putting it here would mean a theme passed or failed depending on which
 * directory it was checked from.
 *
 * **A rule that cannot reach an answer says so.** `skip` is a status, printed, and never counted as a
 * pass — the contrast gate over a colour space this build cannot resolve reports "not checked", because
 * a badge awarded by a parser that gave up is worse than no badge.
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { load as parseYaml } from "js-yaml";
import {
  contrastRatio, cssValue, loadConfig, loadPlugin, MAX_FONT_KB, PLUGIN_API, resolveColor, resolvePlugin,
  themeTokens, themeVariations, themeFile, isPlaceholder, pluginShortName, tiersOf, tokenVars,
  type LoadedConfig, type Mode, type Rgb,
} from "@snypd/core";
import { loadTheme, type Theme, LAYOUT_NAMES } from "./theme";

export type Status = "pass" | "warn" | "fail" | "skip";
/** One rule, one verdict. `detail` is what a passing run prints — evidence, not "ok". */
export interface RuleResult { rule: string; status: Status; detail: string; where?: string }
export interface CheckResult {
  kind: "theme" | "plugin";
  name: string;
  /** Where it was found — a directory, or `bundled` for one inside this binary. */
  where: string;
  /** True when no rule failed. Warnings do not sink a submission; they are what a reviewer reads. */
  ok: boolean;
  rules: RuleResult[];
}

const count = (r: CheckResult, s: Status) => r.rules.filter((x) => x.status === s).length;
const finish = (kind: CheckResult["kind"], name: string, where: string, rules: RuleResult[]): CheckResult =>
  ({ kind, name, where, rules, ok: !rules.some((r) => r.status === "fail") });

// ── themes ───────────────────────────────────────────────────────────────────────────────────────

/**
 * The colour pairs a reader actually reads, and the ratio each owes (WCAG 2.2 §1.4.3).
 *
 * Body text, the muted text a date and a caption are set in, and a link, each against both surfaces a
 * theme paints them on — plus the one inversion, a theme's accent used as a fill. 4.5:1 throughout:
 * these are all body-sized, and the 3:1 large-text exception is for 24px, which is a heading. Borders
 * and gridlines are not here on purpose — 1.4.11 asks 3:1 of a control's boundary, and a hairline
 * between two paragraphs is not one, so a rule about it would fail every well-made theme on the shelf.
 */
const PAIRS: { rule: string; fg: string; bg: string; min: number; what: string }[] = [
  { rule: "contrast.text", fg: "color.text", bg: "color.bg", min: 4.5, what: "body text on the page" },
  { rule: "contrast.text", fg: "color.text", bg: "color.surface", min: 4.5, what: "body text on a raised block" },
  { rule: "contrast.muted", fg: "color.muted", bg: "color.bg", min: 4.5, what: "dates and captions on the page" },
  { rule: "contrast.muted", fg: "color.muted", bg: "color.surface", min: 4.5, what: "dates and captions on a raised block" },
  { rule: "contrast.accent", fg: "color.accent", bg: "color.bg", min: 4.5, what: "links on the page" },
  { rule: "contrast.accent", fg: "color.accent", bg: "color.surface", min: 4.5, what: "links on a raised block" },
  { rule: "contrast.on-accent", fg: "color.on-accent", bg: "color.accent", min: 4.5, what: "text on an accent fill" },
];

/**
 * The tier rule (U7, docs/14 §3 and §7 call 1), as data. A CSS feature is Baseline and may be used
 * anywhere; or it is two engines of three and goes under `@supports`, never for anything the reader
 * needs to reach content; or it is one engine and goes under `@supports` where the fallback is *nothing
 * happens*. This is the list of the second and third kinds this build knows about, each with the
 * `@supports` test a theme would write. Revised when Baseline moves — a row leaves this list the day
 * the third engine ships, which is the only way a list like this stays honest.
 *
 * What is *not* here, and why: `text-wrap: pretty` and every other unsupported *value* — a browser drops
 * the declaration and the page is the page it was, so a guard would say nothing.
 */
export const GUARDED_CSS: { pattern: RegExp; what: string; tier: "two engines" | "one engine"; test: string }[] = [
  { pattern: /\banimation-timeline\s*:|\b(?:scroll|view)-timeline(?:-name|-axis)?\s*:/i, what: "scroll-driven animations", tier: "two engines", test: "(animation-timeline: scroll())" },
  { pattern: /::scroll-(?:marker|button)\b|\bscroll-marker-group\s*:/i, what: "CSS carousels", tier: "two engines", test: "selector(::scroll-marker)" },
  { pattern: /\btext-box(?:-trim|-edge)?\s*:/i, what: "text-box-trim", tier: "two engines", test: "(text-box: trim-both cap alphabetic)" },
  { pattern: /\bscroll-target-group\s*:|:target-current\b/i, what: "scroll-target-group / :target-current", tier: "one engine", test: "(scroll-target-group: auto)" },
  { pattern: /\bscroll-state\(/i, what: "scroll-state() queries", tier: "one engine", test: "(container-type: scroll-state)" },
  { pattern: /\binterpolate-size\s*:|\bcalc-size\(/i, what: "interpolate-size / calc-size()", tier: "one engine", test: "(interpolate-size: allow-keywords)" },
  { pattern: /\bsibling-(?:index|count)\(/i, what: "sibling-index() / sibling-count()", tier: "one engine", test: "(animation-delay: calc(sibling-index() * 1ms))" },
  { pattern: /(?<![\w-])if\(/i, what: "if()", tier: "one engine", test: "(width: if(style(--x): 1px; else: 2px))" },
  { pattern: /@function\b/i, what: "@function", tier: "one engine", test: "at-rule(@function)" },
  { pattern: /\bcorner-shape\s*:/i, what: "corner-shape", tier: "one engine", test: "(corner-shape: squircle)" },
];

/**
 * Every use of a guarded feature outside an `@supports` block, with its line. Comments and strings are
 * blanked first — `content: "if("` is text — and so is the body of every `@supports` block, brace-matched,
 * so what is left is exactly the CSS a browser without the feature would try to apply.
 */
export function unguardedCss(css: string): { line: number; what: string; tier: string; test: string }[] {
  // Blank comments and strings in place so offsets, and therefore line numbers, survive.
  let plain = "";
  for (let i = 0; i < css.length; i++) {
    const c = css[i]!;
    if (c === '"' || c === "'") { const q = c; let j = i + 1; while (j < css.length && css[j] !== q) { if (css[j] === "\\") j++; j++; } plain += css.slice(i, j + 1).replace(/[^\n]/g, " "); i = j; continue; }
    if (c === "/" && css[i + 1] === "*") { const end = css.indexOf("*/", i + 2); const j = end < 0 ? css.length : end + 2; plain += css.slice(i, j).replace(/[^\n]/g, " "); i = j - 1; continue; }
    plain += c;
  }
  // Blank every `@supports … { … }` block, nested ones included, by matching its braces.
  const SUPPORTS = /@supports\b/gi;
  for (let m = SUPPORTS.exec(plain); m; m = SUPPORTS.exec(plain)) {
    const open = plain.indexOf("{", m.index);
    if (open < 0) break;
    let depth = 0, end = open;
    for (; end < plain.length; end++) { if (plain[end] === "{") depth++; else if (plain[end] === "}" && --depth === 0) break; }
    plain = plain.slice(0, m.index) + plain.slice(m.index, end + 1).replace(/[^\n]/g, " ") + plain.slice(end + 1);
    SUPPORTS.lastIndex = end;
  }
  const out: { line: number; what: string; tier: string; test: string }[] = [];
  for (const g of GUARDED_CSS) {
    const re = new RegExp(g.pattern.source, g.pattern.flags.includes("g") ? g.pattern.flags : g.pattern.flags + "g");
    for (let m = re.exec(plain); m; m = re.exec(plain)) out.push({ line: plain.slice(0, m.index).split("\n").length, what: g.what, tier: g.tier, test: g.test });
  }
  return out.sort((a, b) => a.line - b.line);
}

/** The theme's own view of its tokens: declared defaults plus the chosen variation, with the site read out. */
function themeView(cfg: LoadedConfig): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of themeTokens(cfg)) out[t.name] = String(t.overridden ? t.default : t.value);
  return out;
}

/** Which sides of `light-dark()` this look actually renders — `color.scheme` is the token that decides. */
function modesOf(tokens: Record<string, string>): Mode[] {
  const s = (tokens["color.scheme"] ?? "light dark").trim().toLowerCase();
  if (s === "dark" || s === "only dark") return ["dark"];
  if (s === "light" || s === "only light") return ["light"];
  return ["light", "dark"];
}

/**
 * Check one theme, through the loader a site uses.
 *
 * `root` is a site (or any directory: the chain resolves out of `themes/`, `node_modules/` and the
 * binary's own barrel, exactly as a build resolves it). `name` is the theme, which need not be the one
 * `theme.use` names — that is what `loadConfig`'s `theme` option is for.
 */
export async function checkTheme(root: string, name: string, opts: { env?: string } = {}): Promise<CheckResult> {
  const stand = standIn(root);
  try { return await check(stand, root, name, opts); } finally { stand.dispose?.(); }
}

/**
 * A theme is only ever a theme *of a site*, and this is where that stops being a slogan.
 *
 * `loadConfig` builds its merged view by validating the whole config, and a directory with no
 * `snypd.yaml` fails that validation on `site.name` — after which `config` is the spec's defaults and
 * the theme layer is simply not in it. Nothing throws; the tokens come back as the chain's declared
 * defaults and every variation reads identically to every other. That is exactly the silent pass this
 * file exists to refuse, and it was found by running the new verb against `themes/technical` from a
 * checkout root: `phosphor` reported `graphite`'s numbers, in a light mode it does not have.
 *
 * So a root with no site gets the smallest one that loads, in a temp directory, with the real root as a
 * search path — which is how a theme author with a theme and no site is judged by the same rules as a
 * theme sitting in somebody's `themes/`.
 */
function standIn(root: string): { root: string; searchPaths?: string[]; dispose?: () => void } {
  if (existsSync(join(root, "snypd.yaml"))) return { root };
  const dir = mkdtempSync(join(tmpdir(), "snypd-check-"));
  writeFileSync(join(dir, "snypd.yaml"), `snypd: 1\nsite:\n  name: check\n  url: https://check.invalid\n`);
  return { root: dir, searchPaths: [root], dispose: () => rmSync(dir, { recursive: true, force: true }) };
}

async function check(stand: { root: string; searchPaths?: string[] }, root: string, name: string, opts: { env?: string }): Promise<CheckResult> {
  const rules: RuleResult[] = [];
  const add = (rule: string, status: Status, detail: string, where?: string) => { rules.push({ rule, status, detail, where }); };
  const load = (variation?: string) => loadConfig(stand.root, { env: opts.env, theme: name, variation, searchPaths: stand.searchPaths });
  const cfg = load();
  const chain = cfg.layers.find((l) => l.name === "theme")?.chain ?? [];
  const self = chain[0];
  if (!self) return finish("theme", name, root, [{ rule: "contract.found", status: "fail", detail: `no theme "${name}" — looked in themes/, node_modules/ and the themes bundled in this build` }]);
  // A path the reader can act on: inside the site it is relative, outside (a bundled theme, or one in a
  // checkout's `themes/`) it stays whole rather than turning into a run of `../`.
  const selfRel = relative(root, self.dir);
  const where = selfRel && !selfRel.startsWith("..") ? selfRel : self.dir;

  // ── the contract, as the loader already enforces it ────────────────────────────────────────────
  // Every diagnostic attributed to a theme.yaml, and only those: a site's stranded token override is a
  // finding about the site, and it would otherwise fail a theme for the directory it was checked from.
  const mine = cfg.diagnostics.filter((d) => d.source?.layer === "theme" || d.path.startsWith("theme.") && d.source?.file?.endsWith("theme.yaml"));
  const errs = mine.filter((d) => d.level === "error"), warns = mine.filter((d) => d.level === "warning");
  add("contract.yaml", errs.length ? "fail" : warns.length ? "warn" : "pass",
    errs.length || warns.length
      ? [...errs, ...warns].map((d) => `${d.where ?? d.source?.file ?? ""} ${d.message}`.trim()).join("; ")
      : `theme.yaml parses and every key in it is one this build reads`,
    self.yamlFile);

  let theme: Theme | undefined;
  try {
    theme = await loadTheme(cfg);
    add("contract.loads", "pass", `${Object.keys(theme.layouts).length} layouts, ${theme.partCoverage.length} parts, ${theme.css ? "one stylesheet" : "no stylesheet"}${theme.font ? `, one font` : ""} — all resolved`);
  } catch (e) {
    // The loader's refusals are the contract's teeth: a missing layout, a part declared and not written,
    // an `@import` (decision 126), a font over its own declaration (decision 118). One rule, because the
    // first of them stops the load — and the message already names which.
    add("contract.loads", "fail", (e as Error).message);
  }

  if (theme) {
    const missingPrim = theme.coverage.filter((c) => c.status === "missing");
    add("coverage.primitives", missingPrim.length ? "fail" : "pass",
      missingPrim.length
        ? `${missingPrim.length} of ${theme.coverage.length} render as a labelled wrapper and nothing else: ${missingPrim.map((c) => c.name).join(", ")}`
        : `${theme.coverage.length}/${theme.coverage.length}${theme.coverage.some((c) => c.status === "inherited") ? ` (${theme.coverage.filter((c) => c.status === "inherited").length} inherited)` : ""}`);
    // What this theme does with a type of the site's own (R1, decision 197): a `work` renders through
    // `layouts/work.tsx` where the theme declares it and through its base type's layout everywhere else,
    // so the row names what is declared beyond the six — the answer to "does this theme draw a `work`?".
    const beyond = Object.keys(theme.layouts).filter((l) => !(LAYOUT_NAMES as readonly string[]).includes(l));
    add("coverage.layouts", "pass", beyond.length
      ? `the six, and ${beyond.join(", ")} — a type whose layout is one of these renders through it here, and through its base type's layout on a theme without it`
      : "the six; a type with a layout of its own renders through its base type's layout here (post, for a type that extends post)");
    const missingPart = theme.partCoverage.filter((c) => c.status === "missing");
    add("coverage.parts", missingPart.length ? "fail" : "pass",
      missingPart.length
        ? `${missingPart.map((c) => c.name).join(", ")} — a layout that asks for one of these throws`
        : `${theme.partCoverage.length}/${theme.partCoverage.length}${theme.partCoverage.some((c) => c.status === "own") ? ` (${theme.partCoverage.filter((c) => c.status === "own").map((c) => c.name).join(", ")} its own)` : ""}`);
  }

  // ── what a shelf needs and a build does not (decision 123) ─────────────────────────────────────
  const yaml = self.yamlFile ? (parseThemeYaml(self.dir) ?? {}) : {};
  const declaredName = typeof yaml.theme === "string" ? yaml.theme : undefined;
  add("meta.name", !declaredName ? "warn" : declaredName === name ? "pass" : "fail",
    !declaredName ? `no \`theme:\` key — the directory name (${basename(where)}) is what a site would write`
      : declaredName === name ? `\`${declaredName}\`, which is what a site writes in \`theme.use\``
      : `\`theme: ${declaredName}\` but it resolves as "${name}" — a site that writes the declared name would not find it`);
  add("meta.version", typeof yaml.version === "string" && yaml.version ? "pass" : "warn",
    typeof yaml.version === "string" && yaml.version ? String(yaml.version) : "no `version:` — a shelf cannot say what changed between two downloads");
  const personality = typeof yaml.personality === "string" ? yaml.personality.trim() : "";
  // A scaffold has to write something here, and what it writes must not pass: see `PLACEHOLDER`.
  add("meta.personality", !personality ? "fail" : isPlaceholder("personality", personality, name) ? "fail" : "pass",
    !personality ? "no `personality:` — `snypd://theme` and a gallery card have nothing to print, and an agent picking a theme is picking blind"
      : isPlaceholder("personality", personality, name) ? "still the scaffold's sentence — say what this theme reads like, in your words"
      : `${personality.split(/\s+/).length} words — what a listing prints and an agent chooses on`);

  // ── tokens ─────────────────────────────────────────────────────────────────────────────────────
  const all = themeTokens(cfg);
  const declared = new Set(all.filter((t) => t.declaredBy).map((t) => t.name));
  const undescribed = all.filter((t) => t.customisable && !t.description);
  add("tokens.described", undescribed.length ? "warn" : "pass",
    undescribed.length
      ? `${undescribed.length} settable with no description: ${undescribed.slice(0, 6).map((t) => t.name).join(", ")}${undescribed.length > 6 ? "…" : ""} — \`theme\` › set_tokens has nothing to tell an agent they do`
      : `${all.length} declared, ${all.filter((t) => t.customisable).length} settable, every settable one described`);

  // ── variations (decision 127): values, never declarations ──────────────────────────────────────
  const looks = themeVariations(cfg);
  const invented: string[] = [], badValue: string[] = [];
  for (const v of looks) for (const [k, val] of Object.entries(v.tokens ?? {})) {
    if (!declared.has(k)) invented.push(`${v.name} sets \`${k}\`, which no theme in the chain declares`);
    const r = cssValue(val);
    if (!r.ok) badValue.push(`${v.name}.${k}: ${r.why}`);
  }
  add("variations.declared", invented.length ? "fail" : looks.length ? "pass" : "skip",
    invented.length ? invented.join("; ")
      : looks.length ? `${looks.length} look${looks.length === 1 ? "" : "s"} (${looks.map((v) => v.name).join(", ")}), every token one the theme declares`
      : "this theme ships no named looks");
  if (badValue.length) add("variations.values", "fail", badValue.join("; "));

  // ── the font, and whether anything uses it (B1, decision 118) ──────────────────────────────────
  if (!theme?.font) add("font.budget", "skip", "this theme declares no webfont, and inherits none");
  else {
    const kb = +(theme.font.bytes.byteLength / 1024).toFixed(2);
    add("font.budget", "pass", `${theme.font.file} — ${kb} KB against its own declaration of ${theme.font.kb}, ceiling ${MAX_FONT_KB} (decision 118)`);
    // The family name is CSS's, not the font file's: a face nothing names is 30 KB nobody sees.
    const used = all.some((t) => String(t.value).includes(theme!.font!.family));
    add("font.used", used ? "pass" : "fail",
      used ? `\`${theme.font.family}\` is named by a token, so something renders in it`
        : `\`${theme.font.family}\` is declared and no token names it — the face downloads and nothing is set in it`);
    add("font.fallback", "pass", `metric-matched fallback: size-adjust ${theme.font.fallback["size-adjust"]}, ascent ${theme.font.fallback["ascent-override"]}`);
  }

  // ── the tier rule (U7, docs/14 §7 call 1) ──────────────────────────────────────────────────────
  // A two-engine or one-engine feature outside `@supports` is a finding with a line: not a failure,
  // because whether the fallback is "today's page" or "the menu is gone" is what the author has to
  // look at, and this rule is the list of where to look. The theme's own sheet only — a parent's is
  // the parent's finding, and it was checked when the parent was.
  const ownCss = typeof yaml.css === "string" ? themeFile(self.dir, yaml.css) : undefined;
  if (ownCss === undefined) add("css.enhancement-guarded", "skip", "this theme has no stylesheet of its own");
  else {
    const loose = unguardedCss(ownCss);
    add("css.enhancement-guarded", loose.length ? "warn" : "pass",
      loose.length
        ? `${loose.length} use${loose.length === 1 ? "" : "s"} of a ${[...new Set(loose.map((l) => l.tier))].join("/")} feature outside \`@supports\`: ${loose.slice(0, 6).map((l) => `${basename(String(yaml.css))}:${l.line} ${l.what} — \`@supports ${l.test}\``).join("; ")}${loose.length > 6 ? `; +${loose.length - 6} more` : ""} — fine when the fallback is the page as it is; a finding when a reader needs it`
        : `every two-engine and one-engine feature this build knows is under \`@supports\`, or absent (${GUARDED_CSS.length} checked)`,
      String(yaml.css));
  }

  // ── contrast (docs/11 §5 item 4) ───────────────────────────────────────────────────────────────
  // One row per rule across every look and both modes, and the worst verdict wins: a theme with a
  // readable light mode and an unreadable `phosphor` has an unreadable look on the shelf, and the row
  // has to say so. Equal verdicts accumulate their evidence — every measured ratio, deduplicated,
  // because "passes" without the numbers is exactly the badge this file exists not to hand out.
  const RANK: Record<Status, number> = { pass: 0, skip: 1, warn: 2, fail: 3 };
  const seen = new Map<string, { row: RuleResult; details: string[] }>();
  const record = (rule: string, status: Status, detail: string) => {
    const prior = seen.get(rule);
    if (!prior) { const row: RuleResult = { rule, status, detail }; seen.set(rule, { row, details: [detail] }); rules.push(row); return; }
    if (RANK[status] > RANK[prior.row.status]) { prior.row.status = status; prior.details = [detail]; }
    else if (RANK[status] < RANK[prior.row.status]) return;
    else if (!prior.details.includes(detail)) prior.details.push(detail);
    prior.row.detail = prior.details.slice(0, 8).join(" · ") + (prior.details.length > 8 ? ` · +${prior.details.length - 8} more` : "");
  };
  for (const look of looks.length ? looks.map((v) => v.name) : [undefined]) {
    const lookCfg = look === undefined ? cfg : load(look);
    const tokens = themeView(lookCfg);
    const vars = tokenVars(tokens);
    const label = look ?? "its own tokens";
    for (const mode of modesOf(tokens)) {
      for (const p of PAIRS) {
        if (!(p.fg in tokens) || !(p.bg in tokens)) { record(p.rule, "skip", `${label}: this theme declares no \`${p.fg in tokens ? p.bg : p.fg}\``); continue; }
        const fg = resolveColor(tokens[p.fg]!, mode, vars), bg = resolveColor(tokens[p.bg]!, mode, vars);
        if (!fg || !bg) { record(p.rule, "skip", `${label} ${mode}: ${!fg ? tokens[p.fg] : tokens[p.bg]} is not a colour this build can resolve — not checked`); continue; }
        const ratio = contrastRatio(fg as Rgb, bg as Rgb);
        record(p.rule, ratio >= p.min ? "pass" : "fail",
          `${label} ${mode} ${ratio.toFixed(2)}:1${ratio >= p.min ? "" : ` — ${p.what} is below ${p.min}:1 (WCAG 2.2 §1.4.3)`}`);
      }
    }
  }

  return finish("theme", name, where, rules);
}

/** The theme's own `theme.yaml`, through the seam that reads one out of a binary too (decision 46). */
function parseThemeYaml(dir: string): Record<string, unknown> | undefined {
  const text = themeFile(dir, "theme.yaml");
  if (text === undefined) return undefined;
  try {
    // The strict pass already ran in `loadConfig` and its findings are `contract.yaml`; this read is only
    // for the three keys a *listing* needs, so a shape it cannot use is `undefined` and not a second error.
    const v = parseYaml(text);
    return typeof v === "object" && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : undefined;
  } catch { return undefined; }
}

// ── plugins ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Check one plugin. Same bargain as a theme's: the loader already refuses a manifest this binary cannot
 * speak, options that do not validate and a declared module that is not on disk (docs/10 §4.1), and this
 * puts those in front of the author plus the three things a listing needs and a build does not care about.
 */
export async function checkPlugin(root: string, entry: string, opts: { env?: string } = {}): Promise<CheckResult> {
  const rules: RuleResult[] = [];
  const add = (rule: string, status: Status, detail: string) => { rules.push({ rule, status, detail }); };
  const name = pluginShortName(entry);
  const search = [root];
  const found = resolvePlugin(entry, search);
  if (!found) return finish("plugin", name, root, [{ rule: "contract.found", status: "fail", detail: `no plugin "${entry}" — looked for ${["plugins/", "node_modules/snypd-plugin-"].map((p) => p + name).join(", ")} and the plugins bundled in this build` }]);

  const { plugin } = loadPlugin({ entry, options: undefined, search, rel: (f) => f });
  add("contract.manifest", plugin.loaded ? "pass" : "fail",
    plugin.loaded ? `api ${PLUGIN_API}, ${plugin.manifest?.version ?? "no version"} — manifest valid and every module it names is on disk`
      : plugin.why ?? (plugin.diagnostics.map((d) => d.message).join("; ") || "refused"));
  for (const d of plugin.diagnostics.filter((d) => d.level === "error" && plugin.loaded)) add("contract.options", "fail", d.message);

  const m = plugin.manifest;
  add("meta.name", !m?.name ? "skip" : m.name === name ? "pass" : "fail",
    !m?.name ? "no manifest to read a name from" : m.name === name ? `\`${m.name}\`, which is what a site writes in \`plugins:\`` : `manifest says \`${m.name}\` but it resolves as "${name}"`);
  add("meta.version", m?.version ? "pass" : "warn", m?.version ?? "no `version:` — a shelf cannot say what changed between two downloads");
  const ph = !!m?.description && isPlaceholder("description", m.description, name);
  add("meta.description", !m?.description ? "fail" : ph ? "fail" : "pass",
    !m?.description ? "no `description:` — `snypd://plugins`, doctor and a gallery card all print this line, and there is none"
      : ph ? "still the scaffold's sentence — say what this plugin does, in your words"
      : m.description);

  const tiers = plugin.loaded ? tiersOf(plugin) : [];
  add("contract.tiers", !plugin.loaded ? "skip" : tiers.length ? "pass" : "warn",
    !plugin.loaded ? "not loaded" : tiers.length ? tiers.join(", ") : "this plugin declares no slot, filter, stage, event or tool — it loads and does nothing");

  // The two capabilities a site is trusting the manifest about (docs/10 §4.7). Neither is measured here:
  // what a plugin's client JS actually weighs is the build's assertion to make (H2), and what it fetches
  // is the allowlist's. What a check can say is whether the declaration is *shaped* like a promise.
  const net = m?.capabilities?.network ?? [];
  const badHost = net.filter((h) => !/^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(h));
  add("capabilities.network", badHost.length ? "fail" : net.length ? "pass" : "skip",
    badHost.length ? `not hosts: ${badHost.join(", ")} — an exact host, or \`*.example.com\``
      : net.length ? `${net.join(", ")} — every other host is refused before a connection is made`
      : "declares no network, so its fetch refuses everything");
  add("capabilities.client", plugin.clientKb > 0 ? "warn" : "pass",
    plugin.clientKb > 0 ? `${plugin.clientKb} KB of client JS declared — it comes out of the site's budget, and a site with no budget refuses the plugin (decision 84)` : "0 KB of client JS");

  const dir = plugin.dir ?? root;
  const pRel = relative(root, dir);
  return finish("plugin", name, plugin.where ?? (pRel && !pRel.startsWith("..") ? pRel : dir), rules);
}

// ── output ───────────────────────────────────────────────────────────────────────────────────────

const MARK: Record<Status, string> = { pass: "✅", warn: "⚠️ ", fail: "❌", skip: "➖" };

/** What the terminal prints. One line per rule, because the rule's name is the point (decision 123). */
export function formatCheck(r: CheckResult): string {
  const width = Math.max(...r.rules.map((x) => x.rule.length));
  const head = `${r.kind} ${r.name} — ${r.where}`;
  const body = r.rules.map((x) => `  ${MARK[x.status]} ${x.rule.padEnd(width)}  ${x.detail}`);
  const fails = count(r, "fail"), warns = count(r, "warn"), skips = count(r, "skip");
  const tally = fails ? `${fails} failed` : "passes";
  return [head, ...body, "",
    `${tally}${warns ? `, ${warns} to look at` : ""}${skips ? `, ${skips} not checked` : ""} — ${r.rules.length} rules`,
  ].join("\n");
}
