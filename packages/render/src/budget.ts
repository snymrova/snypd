/**
 * The client budget, enforced on the bytes this build is about to leave in `dist/` (docs/11 finding 1,
 * gate E6).
 *
 * `bench.budgets.jsKb` has had two readers since P2: `loadPlugin`, which refuses a plugin whose
 * declaration does not fit, and `page.js.kb`, which measures what a browser fetched. Between them sat
 * the gap this closes — the declaration is a plugin's promise about its own file, and the bench runs on
 * the three sites in this repository. Neither could see a `<script>` that arrived through a content
 * file, which is every site's shortest path to one (finding 1) and, since decision 80, a path an agent
 * walks after reading the open web.
 *
 * So the build weighs the page it just rendered. Nothing is rewritten: a refused page is named and
 * refused, whole, the way a refused token and a refused link already are (decision 102). The number is
 * the site's own — the one it declared for its plugins — so a site that means to ship script says so
 * once, in `snypd.yaml`, and every one of the three readers agrees about what it afforded.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { lineOf, localUrl, scriptSignature, scriptSites, type ScriptSite } from "@snypd/core";

/** One script site with its line resolved, its bytes resolved where they could be, and the plugin that put it there if one did. */
export interface WeighedSite extends ScriptSite {
  line: number;
  /** The plugin whose slot rendered this site (H2): its weight is that plugin's `client:` declaration, not a guess. */
  plugin?: string;
}
/** What one page spends, and on what. */
export interface PageWeight {
  /** dist-relative path of the page weighed. */
  file: string;
  /** Bytes of script this page is charged: what could be weighed, plus each plugin's declaration where its script could not. */
  bytes: number;
  sites: WeighedSite[];
  /** The sites nobody can vouch for — a script from another origin that no plugin declared. Over every budget. */
  unweighable: WeighedSite[];
  /** Plugins charged on this page, and what: `declared` when the declaration stood in for bytes the build could not weigh. */
  plugins: { name: string; bytes: number; declared: boolean }[];
}

/**
 * Who put a script site on the page, and what they said it costs. Built by the build from the slots
 * that rendered (`hooks.scripts`) and the loaded plugins' `client:` declarations — which P2 already
 * summed against this same budget, so trusting one here is trusting a number that was checked.
 */
export interface Attribution {
  scripts?: Map<string, string>;
  declaredKb: Map<string, number>;
}

const KB = (b: number) => +(b / 1024).toFixed(2);

/**
 * Weigh one page. `resolve` turns a site-local `src` into bytes, and returns undefined for a file the
 * build did not write — which is then unweighable for the same reason a remote script is: the gate
 * refuses what it cannot count rather than assuming it is small.
 *
 * Script a plugin's slot rendered is charged to the plugin. If every byte of it could be weighed, the
 * charge is the bytes; if some could not — the analytics beacon is a provider's file on the provider's
 * origin — the charge is the larger of the bytes and the declaration, and a plugin that declared
 * nothing has nothing to stand in, so its remote script is refused like anyone else's. Script from
 * anywhere else — a content file, a layout, an agent — has no declaration and gets none.
 */
export function weighPage(file: string, html: string, resolve: (url: string) => number | undefined, who: Attribution = { declaredKb: new Map() }): PageWeight {
  const sites: WeighedSite[] = [];
  const unweighable: WeighedSite[] = [];
  const byPlugin = new Map<string, { known: number; unknown: WeighedSite[] }>();
  let bytes = 0;
  for (const s of scriptSites(html)) {
    const w: WeighedSite = { ...s, line: lineOf(html, s.offset) };
    if (s.kind === "src") w.bytes = localUrl(s.text) ? resolve(s.text) : undefined;
    w.plugin = who.scripts?.get(scriptSignature(s));
    sites.push(w);
    if (w.plugin) {
      const acc = byPlugin.get(w.plugin) ?? { known: 0, unknown: [] };
      if (w.bytes === undefined) acc.unknown.push(w); else acc.known += w.bytes;
      byPlugin.set(w.plugin, acc);
    } else if (w.bytes === undefined) unweighable.push(w);
    else bytes += w.bytes;
  }
  const plugins: PageWeight["plugins"] = [];
  for (const [name, { known, unknown }] of byPlugin) {
    const declared = (who.declaredKb.get(name) ?? 0) * 1024;
    if (unknown.length && !declared) { unweighable.push(...unknown); bytes += known; plugins.push({ name, bytes: known, declared: false }); continue; }
    const charge = unknown.length ? Math.max(known, declared) : known;
    bytes += charge;
    plugins.push({ name, bytes: charge, declared: unknown.length > 0 });
  }
  return { file, bytes, sites, unweighable, plugins };
}

/** Bytes of a file this build has written, or undefined when it did not write one. Query and fragment are not part of a path. */
export const distBytes = (out: string) => (url: string): number | undefined => {
  const rel = url.replace(/[#?].*$/, "").replace(/^\/+/, "");
  if (!rel || rel.includes("..")) return undefined;
  const f = join(out, rel);
  return existsSync(f) ? statSync(f).size : undefined;
};

/**
 * The refusal, written for the person who has to act on it: which page, what it spends it on, and the
 * two ways out. One message for every page over, not one exception per page — an author who wrote a
 * handler into a layout wants the whole list, and finding out about the next one on the next build is
 * how a gate earns its reputation for pedantry.
 */
export function clientBudgetMessage(over: PageWeight[], budgetKb: number): string {
  const lines: string[] = [];
  const n = over.length;
  lines.push(`${n} ${n === 1 ? "page carries" : "pages carry"} more JavaScript than this site afforded — budget ${budgetKb} KB (bench.budgets.jsKb)`);
  for (const p of over.slice(0, 10)) {
    const spend = p.unweighable.length ? `${KB(p.bytes)} KB and ${p.unweighable.length} it cannot weigh` : `${KB(p.bytes)} KB`;
    lines.push(`  ${p.file} — ${spend}`);
    for (const s of p.sites.slice(0, 6)) {
      const by = s.plugin ? ` — from plugin ${s.plugin}${s.bytes === undefined ? `, charged at its client: declaration` : ""}` : "";
      const weight = s.bytes === undefined ? (s.plugin && !p.unweighable.includes(s) ? "" : " — fetched from another origin and declared by nothing, so its weight is not knowable before it runs") : ` (${s.bytes} B)`;
      lines.push(`    :${s.line} ${s.what}${weight}${by}`);
    }
    for (const pl of p.plugins) if (pl.declared) lines.push(`    plugin ${pl.name} charged ${KB(pl.bytes)} KB, its declaration`);
    if (p.sites.length > 6) lines.push(`    … and ${p.sites.length - 6} more on this page`);
  }
  if (over.length > 10) lines.push(`  … and ${over.length - 10} more pages`);
  lines.push("");
  lines.push("A page here carries no JavaScript unless the site afforded some. Either raise `bench.budgets.jsKb`");
  lines.push("in snypd.yaml — the same number a plugin's `client:` declaration is checked against (decision 84) —");
  lines.push("or move the behaviour into a plugin, which declares what it costs. A script fetched from another");
  lines.push("origin is charged at the declaration of the plugin that rendered it; one no plugin declared is over every");
  lines.push("budget, and `page.js.kb` is where its real weight gets measured.");
  lines.push("Nothing was rewritten: the page is refused as written (decision 102).");
  return lines.join("\n");
}

/**
 * Weigh every HTML file named and throw if any is over. Called inside the build's index transaction, so
 * a refusal rolls the index back: the bytes are on disk and no route row claims them, which makes the
 * next build a cold one that refuses again rather than a warm one that forgets.
 */
export function assertClientBudget(out: string, files: string[], budgetKb: number, who?: Attribution): PageWeight[] {
  const limit = budgetKb * 1024;
  const over: PageWeight[] = [];
  for (const f of files) {
    const path = join(out, f);
    if (!existsSync(path)) continue;
    const w = weighPage(f, readFileSync(path, "utf8"), distBytes(out), who);
    if (w.unweighable.length || w.bytes > limit) over.push(w);
  }
  if (over.length) throw new Error(clientBudgetMessage(over, budgetKb));
  return over;
}
