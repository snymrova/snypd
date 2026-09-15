/**
 * `bench/latest.md`, rewritten as a page a snypd site can publish (S22, docs/07 S22, docs/10 D12).
 *
 * Principle nine of the design set is "measure or don't claim", and its mechanism is a link: every
 * number in the README and every `stat` on snypd.rocks points at the record CI wrote. This turns that
 * record into `/bench` — the page those links can land on instead of a table on GitHub — and it is
 * generated from the record rather than written beside it, so the page cannot say something the file
 * does not. The input is the *markdown* record and not the JSON, because the markdown is the one that
 * is committed (`bench/*.json` is ignored); a page built from the tracked file is a page anyone can
 * rebuild from a checkout.
 *
 * The page is written in the vocabulary — `tldr`, a `stat-row` for the headline numbers, one table
 * per family — because a bench page that is only a table is a page that wastes the primitives, which
 * is the same sentence `write-post` says to every agent. `content.create` lints it like any other page.
 */

export interface RecordRow {
  name: string;
  /** As printed — `292.5 ms`, `0 KB`, `100 %`. */
  value: string;
  /** As printed, or `—`. */
  budget: string;
  status: "ok" | "report" | "ci" | "budget";
  note: string;
}

export interface BenchRecord {
  version: string;
  bun: string;
  date: string;
  tokenizer: string;
  rows: RecordRow[];
}

/** The record as `toMarkdown` writes it: one header line of bold pairs, one table. Anything else is an error, not a guess. */
export function parseRecord(md: string): BenchRecord {
  const head = /\*\*Version\*\* (\S+) · \*\*Bun\*\* (\S+) · \*\*Date\*\* (\S+) · \*\*Tokenizer\*\* (\S+)/.exec(md);
  if (!head) throw new Error("parseRecord: no `**Version** … · **Bun** … · **Date** … · **Tokenizer** …` line — is this a bench record?");
  const rows: RecordRow[] = [];
  for (const line of md.split("\n")) {
    const m = /^\| `([^`]+)` \| (.*?) \| (.*?) \| (.*?) \| (.*) \|$/.exec(line);
    if (!m) continue;
    const s = m[4]!;
    rows.push({ name: m[1]!, value: m[2]!.trim(), budget: m[3]!.trim(), note: m[5]!.trim(),
      status: s.startsWith("✅") ? "ok" : s.startsWith("❌") ? "budget" : s.startsWith("⚠️") ? "ci" : "report" });
  }
  if (!rows.length) throw new Error("parseRecord: the record has no metric rows");
  return { version: head[1]!, bun: head[2]!, date: head[3]!, tokenizer: head[4]!, rows };
}

/** The families a reader scans for, in the order they read best, with the metric prefixes each collects. */
export const FAMILIES: { title: string; lead: string; prefixes: string[] }[] = [
  { title: "Build", lead: "A cold build from nothing — no `dist/`, no index — at three sizes, and the incremental build a single edit costs. `parse` rows are the share of each build spent turning markdown into the typed tree.", prefixes: ["build."] },
  { title: "Lint", lead: "Editorial lint over the same corpora, warm and cold.", prefixes: ["lint."] },
  { title: "The MCP server", lead: "Spawn to `initialize` on the release binary — the number that decides whether an agent's first turn waits.", prefixes: ["mcp."] },
  { title: "Install", lead: "What `bunx @snypd/cli init` pulls, and how much of it is snypd rather than the runtime it ships in.", prefixes: ["install."] },
  { title: "Serving", lead: "Time to first byte for a static `dist/`, for the preview server, and for the Desk it serves at `/_snypd`.", prefixes: ["serve.", "preview.", "desk.ttfb"] },
  { title: "Tokens", lead: "What a page costs an agent to read, and what a site costs one to learn — counted with the tokenizer named above.", prefixes: ["tokens."] },
  { title: "The agent surface", lead: "The eight things a page has to offer a machine reader, and whether every one of them is there.", prefixes: ["surface."] },
  { title: "Visual primitives", lead: "Chart, diagram and flow at their worst shapes: render time and SVG weight, zero JS, zero CSS.", prefixes: ["viz."] },
  { title: "Suggestions", lead: "`content.suggest_blocks` over a hand-labelled corpus: how often it finds the chart inside the table, and how often it invents one.", prefixes: ["suggest."] },
  { title: "The page in a browser", lead: "Six routes at 1280 and 390 px in headless Chrome: JavaScript on the wire, the webfont, axe violations, bytes and vitals.", prefixes: ["page."] },
  { title: "The Desk in a browser", lead: "The same suite over `/_snypd`, with a draft in flight, and the first run of a scaffolded site.", prefixes: ["desk."] },
];

/** The three numbers the launch copy leads with (docs/10 §7.3). Each is skipped, not invented, when the record lacks it. */
export const HEADLINES: { name: string; label: string }[] = [
  { name: "mcp.coldStart.binary", label: "MCP cold start, release binary" },
  { name: "tokens.page.md", label: "to read one page as markdown" },
  { name: "page.js.kb", label: "JavaScript on the page" },
];

export interface BenchPageOptions {
  /** Where the record is published — every `stat` on the page points at it. */
  source?: string;
  title?: string;
  /** The page's `description` frontmatter; ≤ 160 characters. */
  description?: string;
}

export const RECORD_URL = "https://github.com/snymrova/snypd/blob/main/bench/latest.md";

const cell = (s: string) => s.replace(/\|/g, "\\|");
const day = (iso: string) => iso.slice(0, 10);

/** The record as a snypd page: frontmatter, `tldr`, the headline `stat-row`, one table per family, and the rows no family claims. */
export function benchPage(md: string, opts: BenchPageOptions = {}): string {
  const r = parseRecord(md);
  const source = opts.source ?? RECORD_URL;
  const gated = r.rows.filter((x) => x.status !== "report");
  const over = gated.filter((x) => x.status === "budget");
  const ci = gated.filter((x) => x.status === "ci");
  const claimed = new Set<string>();
  const sections = FAMILIES.map((f) => {
    const rows = r.rows.filter((x) => !claimed.has(x.name) && f.prefixes.some((p) => x.name.startsWith(p)));
    rows.forEach((x) => claimed.add(x.name));
    return rows.length ? [`## ${f.title}`, "", f.lead, "", table(rows)].join("\n") : "";
  }).filter(Boolean);
  const rest = r.rows.filter((x) => !claimed.has(x.name));
  if (rest.length) sections.push(["## Everything else", "", "Rows the families above do not claim — new lanes land here first.", "", table(rest)].join("\n"));

  const stats = HEADLINES.map((h) => r.rows.find((x) => x.name === h.name)).flatMap((x, i) => x ? [`::stat{value=${JSON.stringify(x.value)} label=${JSON.stringify(HEADLINES[i]!.label)} source=${JSON.stringify(source)}}`] : []);
  const title = opts.title ?? "Benchmarks";
  const description = opts.description ?? `Every number snypd claims, from the suite CI runs on every push: ${r.rows.length} rows, ${gated.length} of them budgets that fail the build. Taken ${day(r.date)} on v${r.version}.`;

  return [
    "---",
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(description)}`,
    "---",
    "",
    ":::tldr",
    `${r.rows.length} rows, ${gated.length} of them gated: a gated row over its budget fails the build. Today ${over.length === 0 ? "none is" : `${over.length} ${over.length === 1 ? "is" : "are"}`}${ci.length ? `, and ${ci.length} ${ci.length === 1 ? "sits" : "sit"} between CI's 80 % line and the budget` : ""}. Version ${r.version} on Bun ${r.bun}, taken ${day(r.date)}, tokens counted with ${r.tokenizer}.`,
    ":::",
    "",
    ...(stats.length ? [":::stat-row", ...stats, ":::", ""] : []),
    "## How to read this page",
    "",
    `Every row is a value, a budget and a note saying how the value was taken. A **budget** is a design statement — the number the product promises, written in \`snypd.yaml\` under \`bench.budgets\` so a site can tighten it. CI passes a timed row at 80 % of its budget, because a runner is noisy and a promise met on a bad afternoon is the promise; a *counted* row — tokens, kilobytes, actions — passes at the budget exactly. **report** rows have no budget: they are published so the next decision has a number, and a budget is set from them once there is one worth setting. The numbers are CI's, not a laptop's; [the record](${source}) this page is generated from is committed on every run that changes it.`,
    "",
    ...sections.flatMap((s) => [s, ""]),
    ":::callout{kind=\"note\" title=\"Where this page comes from\"}",
    `\`snypd bench report\` rewrites [\`bench/latest.md\`](${source}) as this page. Nothing here is typed by hand; a number that is not in the record is not on the page.`,
    ":::",
    "",
  ].join("\n");
}

/**
 * Three columns, not five. The record's own table carries the note beside the value, and at 390 px a
 * theme that keeps the table role — `technical` refuses the `display: block` trick for that reason — wraps
 * a 200-character note into a cell twenty lines tall. So the table is metric, value and budget, the
 * status folded into the budget cell, and the notes follow as a list where a line can be as long as it is.
 */
function table(rows: RecordRow[]): string {
  const mark = { ok: "✅", report: "report-only", ci: "⚠️ over CI's line", budget: "❌ over budget" };
  const notes = rows.filter((x) => x.note);
  return [
    "| Metric | Value | Budget |",
    "|---|---|---|",
    ...rows.map((x) => `| \`${x.name}\` | ${cell(x.value)} | ${x.status === "report" ? mark.report : `${cell(x.budget)} ${mark[x.status]}`} |`),
    ...(notes.length ? ["", "How each was taken:", "", ...notes.map((x) => `- \`${x.name}\` — ${x.note}`)] : []),
  ].join("\n");
}
