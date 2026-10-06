/**
 * `snypd bench registry` — the registry demo, run and checked (S29 · R4, docs/20 §2.4).
 *
 * Twelve steps an agent runs over the MCP against Ferrule, the studio specimen (`examples/studio`), each
 * with the sentence the tool should answer. The claim under test is docs/20's: *a fifteen-line type
 * declaration, and every tool knows it* — `content.create` names the missing field with the declaration's
 * own description, a publish of a `draft`-policy type is refused in a sentence that carries the next
 * call, the build names the archive the type got, a theme without the layout says what drew the page.
 *
 * So, unlike the kill test, this one **is** scored on the transcript, on purpose: the only evidence for a
 * claim about what a tool *says* is what it said. Every step's check is a pattern over the answers the
 * agent was shown, and the site the run leaves is checked beside them — the case on `main` with its
 * client and its chart, the note on `main`, the redirect written, the theme swapped, the routes in
 * `dist/` — because a sentence with no site behind it is a demo of nothing. A driver passes by being
 * answered right and leaving the site right; the route it took between is measured and not judged.
 *
 * Same harness as the kill test: a throwaway copy of the specimen made into its own repository, the
 * server spawned and spoken to over stdio, the person at the review page an HTTP POST outside the call
 * count, a scripted route for CI and a `claude:<model>` driver for the transcript the doc carries.
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initRepo, loadConfig, readFrontmatter, Repo } from "@snypd/core";
import { Session, type Turn } from "./session";
import { approve, turnMarkdown } from "./run";
import { claude, type ClaudeUsage, type Model } from "./claude";
import type { Metric, Report } from "../src/index";

export const SPECIMEN = "examples/studio";

/** The case the demo drafts, and the two facts the prose cannot supply: a chart's source and the client's name. */
export const CASE = {
  slug: "the-ledger", title: "The ledger", date: "2026-09-18",
  description: "A bookkeeping tool for a cooperative of makers, on one screen the whole floor can read.",
  client: "Cooperativa do Bonfim", service: ["product", "tooling"], industry: "hospitality",
  source: "https://ferrule.snypd.rocks/ledger/hours",
} as const;
/** The note that shows the other policy: a `post` publishes at once. */
export const NOTE = { slug: "counting-hours", title: "Why we count hours", date: "2026-09-18", author: "ines-carvalho", tags: ["process"] } as const;
/** Step 8's question. `product` has three published cases before the demo and the case joins them. */
export const QUERY = { taxonomy: "service", term: "product" } as const;
/** Step 12's theme — one that declares no `work` layout. */
export const SWAP_TO = "editorial";

/** The first draft is missing its client on purpose (step 3); the table is four numeric rows, which is what `suggest_blocks` reads as a chart (step 5); *tooling* in the prose is what `autolink` links (step 9). */
export const CASE_BODY = `The cooperative kept its books in three notebooks and a drawer. We built the tooling that replaced them: one ledger on a screen in the kitchen that the whole floor can read, and a printed sheet every Sunday for the members who would rather hold it.

| Month | Hours logged |
| --- | --- |
| May | 41 |
| June | 58 |
| July | 66 |
| August | 72 |

Every hour above is one the cooperative used to count by hand on a Sunday evening, and the rise is the members trusting the screen.`;

export const NOTE_BODY = `We count hours because the kiln does. A firing is a fixed number of them, and every case in the registry carries the ones it took — so the number on a facts strip is a number somebody wrote down that day, not one we guessed at the end.`;

/** docs/20 §2.4, as data: what the agent does at each step and the sentence it should be answered with. */
export interface Step { n: number; agent: string; sees: string }
export const STEPS: Step[] = [
  { n: 1, agent: "reads `snypd://types` and `snypd://config`", sees: "`work` beside `post`, `page`, `author`, with `client` required; the keys the site did not write read *inherited from types.post*" },
  { n: 2, agent: "`site` › explain_config `types.work.layout`", sees: "`\"work\" ← snypd.yaml:NN, overrides inherited \"post\"`" },
  { n: 3, agent: "`content.create` type `work`, no `client`", sees: "rule 0: *missing required field `client` — Who it was for. Shown in the facts strip.*" },
  { n: 4, agent: "adds `client`, `service: [product, tooling]`, `industry: hospitality`", sees: "on `snypd/drafts`, status `draft`, route `/work/the-ledger/`, lint 0 errors" },
  { n: 5, agent: "`content.suggest_blocks`", sees: "the table becomes a `chart`, applied — the same upgrade a post gets" },
  { n: 6, agent: "`content.publish`", sees: "refused: *publishing work/the-ledger needs a human*, with `content.render_preview` as the next call" },
  { n: 7, agent: "a person approves the review page; the agent publishes again, reads the history, then publishes a note", sees: "landed on `main`, *approved by a human*; the history shows the approval and both principals; the note lands at once, *approved by policy publish*" },
  { n: 8, agent: "`content.query` type `work`, `service` = `product`, published", sees: "the product cases newest first, the case among them, no draft" },
  { n: 9, agent: "`content.explain` work/the-ledger", sees: "`autolink` ran over it and added a link; the twin and the JSON among its outputs" },
  { n: 10, agent: "`site` › set_redirect `/posts/the-ledger` → `/work/the-ledger`", sees: "written as a 301 and landed on `main`" },
  { n: 11, agent: "`site` › build", sees: "the lists by name — `/work/` *Work*, `/posts/` *Notes*, the term pages; `/service/product/`, `/industry/hospitality/` and `/studio/credits/` in `dist/`; the feed carries both types" },
  { n: 12, agent: "`theme` › set `editorial`, `site` › build", sees: "*work renders through `post` — editorial declares no `work` layout*" },
];

export interface StepResult extends Step { ok: boolean; /** The line that satisfied the check, or what came instead. */ saw: string; calls: number; reads: number; tokensOut: number }
export interface Check { id: string; what: string; ok: boolean; detail: string }

export interface RegistryDriver {
  readonly name: string;
  run(s: Session, ctx: { approve(origin: string, type: string, slug: string): Promise<void> }): Promise<void>;
  /** A live model's own accounting, filled in by its run. */
  usage?: ClaudeUsage; ended?: string; closing?: string;
}

export interface RegistryRun {
  driver: string;
  steps: StepResult[];
  checks: Check[];
  turns: Turn[];
  calls: number;
  reads: number;
  wallMs: number;
  lint: { errors: number; warnings: number };
  model?: ClaudeUsage & { ended: string; closing: string };
}

/** What the scripted route costs — seventeen calls and the harness's closing lint. Gated exactly in the test, in both directions, for run.ts's reason: a tool call is discrete. */
export const REGISTRY_CALLS = 18;

// ── the scripted route ──────────────────────────────────────────────────────────────────────────

const firstId = (text: string): string => text.match(/^(\d+)\.\s+lines/m)?.[1] ?? "1";
const urlIn = (text: string): string | undefined => (text.match(/https?:\/\/[^\s)]+/) ?? [])[0];

export const scriptedRegistry: RegistryDriver = {
  name: "scripted",
  async run(s, ctx) {
    await s.listTools();
    // 1 · what a `work` is. Two reads: the schema, and the config with its provenance.
    await s.read("snypd://types");
    await s.read("snypd://config");
    // 2 · where its layout came from. `site` is a catalogue tool, so it is found first, as an agent would.
    await s.call("find_tools", { query: "where did a config value come from" });
    await s.call("site", { action: "explain_config", path: "types.work.layout" });
    // 3 · the draft without its client — and the sentence that names what is missing.
    await s.call("content.create", { type: "work", slug: CASE.slug, frontmatter: { title: CASE.title, date: CASE.date, description: CASE.description }, body: CASE_BODY });
    // 4 · the fix, on the draft that already exists.
    await s.call("content.update", { type: "work", slug: CASE.slug, patch: { client: CASE.client, service: [...CASE.service], industry: CASE.industry } });
    // 5 · the table is a chart; the source is the one fact the prose could not carry.
    const seen = await s.call("content.suggest_blocks", { type: "work", slug: CASE.slug });
    const text = seen.content.map((c) => ("text" in c ? c.text : "")).join("\n");
    const id = firstId(text);
    const fill: Record<string, Record<string, string>> = {};
    if (/needs source/.test(text)) fill[id] = { source: CASE.source };
    if (/needs caption/.test(text)) fill[id] = { ...fill[id], caption: "Hours logged by month" };
    await s.call("content.suggest_blocks", { type: "work", slug: CASE.slug, apply: [id], ...(Object.keys(fill).length ? { fill } : {}) });
    // 6 · the refusal, and 7 · doing what it said.
    await s.call("content.publish", { type: "work", slug: CASE.slug });
    const prev = await s.call("content.render_preview", { type: "work", slug: CASE.slug });
    const url = urlIn(prev.content.map((c) => ("text" in c ? c.text : "")).join("\n"));
    if (!url) throw new Error("render_preview returned no URL to approve on");
    await ctx.approve(new URL(url).origin, "work", CASE.slug);
    await s.call("content.publish", { type: "work", slug: CASE.slug });
    await s.read(`snypd://history/work/${CASE.slug}`);
    await s.call("content.create", { type: "post", slug: NOTE.slug, frontmatter: { title: NOTE.title, date: NOTE.date, author: NOTE.author, tags: [...NOTE.tags], description: "A number on a facts strip is a number somebody wrote down that day." }, body: NOTE_BODY });
    await s.call("content.publish", { type: "post", slug: NOTE.slug });
    // 8 · what is filed under the service.
    await s.call("content.query", { type: "work", taxonomy: QUERY.taxonomy, term: QUERY.term, status: "published" });
    // 9 · what ran over it.
    await s.call("content.explain", { type: "work", slug: CASE.slug });
    // 10 · the old URL.
    await s.call("site", { action: "set_redirect", from: `/posts/${CASE.slug}`, to: `/work/${CASE.slug}` });
    // 11 · the build, and 12 · the other theme.
    await s.call("site", { action: "build" });
    await s.call("theme", { action: "set", name: SWAP_TO });
    await s.call("site", { action: "build" });
  },
};

// ── a live model ────────────────────────────────────────────────────────────────────────────────

/** The task in a person's words — the steps, not the route, and not the tool names where a person would not know them. */
export const REGISTRY_PROMPT = `This is Ferrule, a design studio's site on snypd, and its MCP server is the only tool you have. Beside its notes it declares a type of its own, \`work\` — a case study. Walk the type for me, and stop once the site has been built on the other theme.

1. Find out what a \`work\` is: read the site's types and its config, then ask the server where \`types.work.layout\` came from.
2. Draft a new case with the slug ${CASE.slug}, titled "${CASE.title}", dated ${CASE.date} — a bookkeeping tool the studio built for a cooperative — with a one-line description, a paragraph that says the studio built the cooperative its tooling, and a four-row table of hours logged by month. Leave the client off the first time and read what comes back; then fix it: the client is ${CASE.client}, the services are ${CASE.service.join(" and ")}, the industry is ${CASE.industry}.
3. Run suggest_blocks on it and apply what it finds. If a chart needs a source, cite ${CASE.source}.
4. Publish it. It will refuse the first time — read the refusal and do what it says: render the preview, then publish once more; I will have approved it at the review page by the time you do. If it refuses again because the draft changed after I approved it, render the preview again and publish again — I approve every version you show me, so do not stop and wait for me. Then read its history.
5. Write a short note (a post) with the slug ${NOTE.slug}, by ${NOTE.author}, tagged ${NOTE.tags.join(", ")}, about why the studio counts hours, and publish it — it should land at once.
6. List the published work filed under the service "${QUERY.term}".
7. Ask the server to explain what ran over work/${CASE.slug}.
8. Redirect /posts/${CASE.slug} to /work/${CASE.slug}.
9. Build the site and tell me which lists it built.
10. Switch the theme to ${SWAP_TO} and build again; tell me what it said about the work layout.

Do not ask me anything; make reasonable choices and keep going.`;

/**
 * A driver named for the model. The person at the review page is this harness: every time the model's
 * `content.render_preview` answers with the review URL, the approve button is pressed over HTTP, so the
 * model's next `content.publish` — seconds away, on the far side of a model turn — finds the approval.
 * Every time, not once: the second live run previewed before publishing, edited the draft after the
 * approval, was refused with *changed after it was approved*, previewed again as the hint said — and
 * found a harness that had already pressed its one button. A person re-reads a page; so does this.
 */
export function liveRegistry(model: Model, opts: { maxTurns?: number; maxBudgetUsd?: number; onLine?: (l: string) => void } = {}): RegistryDriver {
  const d: RegistryDriver = {
    name: `claude:${model}`,
    async run(s) {
      const onLine = (l: string) => {
        opts.onLine?.(l);
        if (!l.includes(`/_snypd/review/work/${CASE.slug}`) || !/"tool_result"/.test(l)) return;
        const m = l.match(new RegExp(`https?://[^\\s"\\\\)]+/_snypd/review/work/${CASE.slug}`));
        if (!m) return;
        void approve(new URL(m[0]).origin, "work", CASE.slug).catch((e) => process.stderr.write(`\napprove: ${(e as Error).message}\n`));
      };
      const r = await claude({ model, root: s.root, prompt: REGISTRY_PROMPT, maxTurns: opts.maxTurns ?? 60, maxBudgetUsd: opts.maxBudgetUsd ?? 10, onLine });
      d.usage = r.usage; d.ended = r.ended; d.closing = r.text;
      for (const t of r.turns) s.turns.push({ ...t, n: s.turns.length + 1 });
    },
  };
  return d;
}

// ── which step a turn belongs to ────────────────────────────────────────────────────────────────

/** Where a turn belongs, or nothing when it does not say (`find_tools`, a `tools/list`). Read off the call and its answer, so a model's route and the scripted one are sliced the same way. */
export function stepOf(t: Turn, themed: boolean): number | undefined {
  const a = (t.args ?? {}) as Record<string, unknown>;
  const type = typeof a.type === "string" ? a.type : undefined;
  if (t.kind === "read") {
    if (/^snypd:\/\/(types|config|taxonomies)/.test(t.name ?? "")) return 1;
    if (/^snypd:\/\/history\//.test(t.name ?? "")) return 7;
    return undefined;
  }
  if (t.kind !== "call") return undefined;
  switch (t.name) {
    case "site":
      return a.action === "explain_config" ? 2 : a.action === "set_redirect" ? 10 : a.action === "build" ? (themed ? 12 : 11) : a.action === "set_config" && a.path === "theme.use" ? 12 : undefined;
    case "content.create": return type === "work" ? (/missing required field/.test(t.text) ? 3 : 4) : 7;
    case "content.update": return type === "work" ? 4 : 7;
    case "content.suggest_blocks": return 5;
    case "content.publish": return type === "work" ? (t.ok ? 7 : 6) : 7;
    case "content.render_preview": return 6;
    case "content.query": return 8;
    case "content.explain": return 9;
    case "theme": return 12;
    case "content.lint": return type === "work" ? 4 : type === "post" ? 7 : undefined;
    default: return undefined;
  }
}

/** Every turn's step, the ones that said nothing charged to the next that did — live.ts's rule. */
export function stepsFor(turns: Turn[]): (number | undefined)[] {
  let themed = false;
  const own = turns.map((t) => { const s = stepOf(t, themed); if (t.kind === "call" && (t.name === "theme" || (t.name === "site" && (t.args as Record<string, unknown> | undefined)?.path === "theme.use"))) themed = true; return s; });
  const out: (number | undefined)[] = new Array(turns.length);
  let next: number | undefined;
  for (let i = turns.length - 1; i >= 0; i--) { if (own[i]) next = own[i]; out[i] = own[i] ?? next; }
  let last: number | undefined;
  for (let i = 0; i < out.length; i++) { if (out[i]) last = out[i]; else out[i] = last; }
  return out;
}

// ── the judge ───────────────────────────────────────────────────────────────────────────────────

/**
 * Two ways a tool's answer reaches an agent, and the judge reads both. The scripted session records the
 * text; Claude Code hands a model the `structuredContent` when a result has one, as JSON — which the
 * first live run made plain when `explain_config` reached Sonnet as `{"ok":true}`. So every step's check
 * is a pattern over the text *or* a predicate over the parsed JSON, and the surface has to carry the
 * sentence in both halves for a step to be answered the same way to both.
 */
type Json = Record<string, unknown>;
const jsonOf = (t: Turn): Json | undefined => { if (!/^\s*\{/.test(t.text)) return undefined; try { const j = JSON.parse(t.text) as unknown; return j && typeof j === "object" ? (j as Json) : undefined; } catch { return undefined; } };
const lineOf = (text: string, re: RegExp): string | undefined => text.split("\n").find((l) => re.test(l))?.trim();
const firstLine = (t: Turn) => t.text.split("\n")[0]!.trim().slice(0, 200);
/** The first turn among `ts` whose text matches every pattern, or whose JSON satisfies `viaJson`; and the line to show for it. */
const said = (ts: Turn[], res: RegExp[], viaJson?: (j: Json) => string | false | undefined): { t: Turn; line: string } | undefined => {
  for (const t of ts) {
    if (res.length && res.every((re) => re.test(t.text))) return { t, line: lineOf(t.text, res[0]!) ?? firstLine(t) };
    const j = viaJson && jsonOf(t);
    if (j) { const hit = viaJson!(j); if (hit) return { t, line: hit }; }
  }
  return undefined;
};
const calls = (turns: Turn[], name: string, pred: (a: Record<string, unknown>, t: Turn) => boolean = () => true) =>
  turns.filter((t) => t.kind === "call" && t.name === name && pred((t.args ?? {}) as Record<string, unknown>, t));
const reads = (turns: Turn[], ...uris: string[]) => turns.filter((t) => t.kind === "read" && uris.includes(t.name ?? ""));
const missed = (what: string, ts: Turn[]): string => ts.length ? `${what} — answered instead: ${ts.at(-1)!.text.split("\n")[0]!.trim().slice(0, 160)}` : `${what} — never called`;
const git = (j: Json) => (j.git ?? {}) as { branch?: string; base?: string; landed?: boolean };
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Score the twelve steps off the transcript. */
export function judge(turns: Turn[]): StepResult[] {
  const steps = stepsFor(turns);
  // The harness's closing site-wide lint rides in the call count (as the kill test's does) but is nobody's step.
  const harness = (t: Turn, i: number) => i === turns.length - 1 && t.name === "content.lint" && !(t.args as Record<string, unknown> | undefined)?.type;
  const cost = (n: number) => {
    const mine = turns.filter((t, i) => steps[i] === n && !harness(t, i));
    return { calls: mine.filter((t) => t.kind === "call").length, reads: mine.filter((t) => t.kind === "read").length, tokensOut: mine.reduce((a, t) => a + t.tokensOut, 0) };
  };
  const out: StepResult[] = [];
  const add = (n: number, hit: { line: string } | undefined, miss: string) => out.push({ ...STEPS[n - 1]!, ok: !!hit, saw: hit ? hit.line : miss, ...cost(n) });
  const work = (a: Record<string, unknown>) => a.type === "work";
  const slugged = (a: Record<string, unknown>) => a.type === "work" && a.slug === CASE.slug;
  const route = `/work/${CASE.slug}`;

  // 1 · the schema lists work with its client required (the whole registry, or the one type); the config says what was inherited.
  const types = said(reads(turns, "snypd://types", "snypd://types/work"), [/"(work|title)":\s*("work"|\{)/, /"required":\s*\[[^\]]*"client"/]);
  const cfg = said(reads(turns, "snypd://config"), [/inherited from types\.post/]);
  add(1, types && cfg ? { line: `${cfg.line} · ${types.t.name}: work with client required` } : undefined,
    !types ? missed("snypd://types with work and client required", reads(turns, "snypd://types", "snypd://types/work")) : missed("snypd://config with an inherited line", reads(turns, "snypd://config")));
  // 2
  const ex = calls(turns, "site", (a) => a.action === "explain_config" && a.path === "types.work.layout");
  const exRe = /`types\.work\.layout` = "work" ← snypd\.yaml:\d+, overrides inherited "post"/;
  add(2, said(ex, [exRe], (j) => exRe.test(str(j.explanation)) && str(j.explanation)), missed("the layout's line and the value it overrode", ex));
  // 3 · the message and the hint are strings in both halves.
  const creates = calls(turns, "content.create", work);
  add(3, said(creates, [/missing required field `client`/, /Who it was for\. Shown in the facts strip\./]), missed("rule 0 naming `client` with the declaration's description", creates));
  // 4 · the draft, complete: any write to the case that lints clean and says where it is.
  const writes = [...calls(turns, "content.update", slugged), ...calls(turns, "content.create", slugged)];
  add(4, said(writes, [new RegExp(`→ ${route} \\(draft\\)`), /on snypd\/drafts/, /lint: 0 errors/],
    (j) => j.route === route && j.status === "draft" && git(j).branch === "snypd/drafts" && (j.lint as { errors?: number } | undefined)?.errors === 0 && `${route} (draft) on snypd/drafts, lint 0 errors`),
    missed(`the draft at ${route} on snypd/drafts, lint clean`, writes));
  // 5
  const suggests = calls(turns, "content.suggest_blocks", slugged);
  add(5, said(suggests, [/applied \d+ of \d+/, /`chart`/], (j) => Array.isArray(j.applied) && (j.applied as { primitive?: string }[]).some((a) => a.primitive === "chart") && `applied: chart`), missed("a chart applied", suggests));
  // 6 · `error` and `hint` are strings in both halves.
  const refused = calls(turns, "content.publish", (a, t) => slugged(a) && !t.ok);
  add(6, said(refused, [/needs a human/, /content\.render_preview/]), missed("the refusal with the next call in it", calls(turns, "content.publish", slugged)));
  // 7 · three sentences: the publish, the history, the note.
  const landedByHuman = (j: Json) => j.status === "published" && git(j).landed === true && git(j).base === "main" && /human/.test(str((j.approval as { by?: string } | undefined)?.by ?? j.approvedBy)) && `landed on main, approved by ${str((j.approval as { by?: string } | undefined)?.by ?? j.approvedBy)}`;
  const published = said(calls(turns, "content.publish", (a, t) => slugged(a) && t.ok), [/landed on main/, /approved by a human/], landedByHuman);
  const history = said(reads(turns, `snypd://history/work/${CASE.slug}`), [/"approvedBy"/, /"principal": "agent:/]);
  const note = said(calls(turns, "content.publish", (a, t) => a.type === "post" && t.ok), [/landed on main/, /approved by policy publish/],
    (j) => j.status === "published" && git(j).landed === true && git(j).base === "main" && (j.policy === "publish" || j.approvedBy === "policy publish") && "landed on main, approved by policy publish");
  add(7, published && history && note ? { line: `${published.line} · ${note.line}` } : undefined,
    !published ? missed("the publish landing on main, approved by a human", calls(turns, "content.publish", slugged)) : !history ? missed("the history with the approval on the publish", reads(turns, `snypd://history/work/${CASE.slug}`)) : missed("a note publishing at once", calls(turns, "content.publish", (a) => a.type === "post")));
  // 8 · the product cases, newest first, the case among them, nothing that is a draft.
  const queries = calls(turns, "content.query", (a) => a.type === "work" && a.taxonomy === QUERY.taxonomy && a.term === QUERY.term);
  const q = said(queries, [], (j) => {
    const items = (Array.isArray(j.items) ? j.items : []) as { slug?: string; status?: string; type?: string }[];
    return items.length >= 3 && items.every((i) => i.status === "published" && i.type === "work") && items.some((i) => i.slug === CASE.slug) && `${items.length} published work: ${items.map((i) => i.slug).join(", ")}`;
  }) ?? queries.map((t) => ({ t, n: (t.text.match(/^published +work\//gm) ?? []).length })).filter(({ t, n }) => n >= 3 && t.text.includes(`work/${CASE.slug}`) && !/^draft /m.test(t.text)).map(({ t }) => ({ t, line: t.text.split("\n").slice(0, 2).join(" · ") }))[0];
  add(8, q, missed("three or more published product cases with the case among them and no draft", queries));
  // 9
  const explains = calls(turns, "content.explain", slugged);
  add(9, said(explains, [/autolink stages\.transform.*\d+ links? added/, new RegExp(`work/${CASE.slug}/index\\.md`)],
    (j) => { const ran = (Array.isArray(j.ran) ? j.ran : []) as { plugin?: string; note?: string }[]; const r = ran.find((x) => x.plugin === "autolink" && /\d+ links? added/.test(x.note ?? "")); return !!r && Array.isArray(j.outputs) && j.outputs.includes(`work/${CASE.slug}/index.md`) && `autolink ${r!.note}; outputs ${(j.outputs as string[]).join(", ")}`; }),
    missed("autolink's run with a link counted, and the twin among the outputs", explains));
  // 10
  const redirects = calls(turns, "site", (a) => a.action === "set_redirect");
  add(10, said(redirects, [new RegExp(`/posts/${CASE.slug} → ${route} \\(301\\)`), /→ main/],
    (j) => j.from === `/posts/${CASE.slug}` && j.to === route && j.status === 301 && /→ main/.test(str(j.git)) && `${j.from} → ${j.to} (301), ${str(j.git)}`),
    missed("the redirect written and landed", redirects));
  // 11 · the first build names the lists.
  const builds = calls(turns, "site", (a) => a.action === "build");
  const listsIn = (j: Json) => { const lists = (Array.isArray(j.lists) ? j.lists : []) as { route?: string; title?: string; entries?: number }[]; const w = lists.find((l) => l.route === "/work"), p = lists.find((l) => l.route === "/posts"); return !!w && !!p && w.title === "Work" && p.title === "Notes" && typeof j.terms === "number" && j.terms > 0 && `lists: /work/ Work (${w.entries}) · /posts/ Notes (${p.entries}) · ${j.terms} term pages`; };
  add(11, said(builds, [/lists: .*\/work\/ Work \(\d+ work\)/, /\/posts\/ Notes \(\d+ post\)/, /\d+ term pages/], listsIn), missed("the lists by name", builds));
  // 12 · the theme swapped — by `theme` › set or by `site` › set_config theme.use, either is the surface — and the build after it saying what drew the case.
  const swaps = [...calls(turns, "theme", (a) => a.action === "set"), ...calls(turns, "site", (a) => a.action === "set_config" && a.path === "theme.use")];
  const swapped = said(swaps, [new RegExp(`theme (studio → ${SWAP_TO}|\\.use: "studio" → "${SWAP_TO}")`)], (j) => (j.theme === SWAP_TO && j.from === "studio") || (j.path === "theme.use" && j.to === SWAP_TO) ? `theme studio → ${SWAP_TO}` : false);
  const fallbackRe = new RegExp(`work renders through \`post\` — ${SWAP_TO} declares no \`work\` layout`);
  const fallback = said(builds, [fallbackRe], (j) => { const f = (Array.isArray(j.fallbacks) ? j.fallbacks : []) as { type?: string; wanted?: string; used?: string }[]; const hit = f.find((x) => x.type === "work" && x.used === "post"); return !!hit && (j.theme as { name?: string } | undefined)?.name === SWAP_TO && `work renders through \`${hit!.used}\` — ${SWAP_TO} declares no \`${hit!.wanted}\` layout`; });
  add(12, swapped && fallback ? fallback : undefined, !swapped ? missed(`the theme switched to ${SWAP_TO}`, swaps) : missed("the build saying which layout drew the case", builds));
  return out;
}

/** The site the run left: what the sentences were about. */
export function assessSite(root: string, lint: { errors: number; warnings: number }): Check[] {
  const out: Check[] = [];
  const add = (id: string, what: string, ok: boolean, detail: string) => out.push({ id, what, ok, detail });
  const cfg = loadConfig(root);
  const repo = Repo.open(root);
  const onMain = (path: string) => repo?.show("main", path);

  const casePath = `content/work/${CASE.slug}.md`;
  const caseSrc = onMain(casePath);
  const fm = caseSrc ? readFrontmatter(caseSrc) : undefined;
  add("case.main", "the case is on `main`, published, with its client", !!fm && fm.status === "published" && fm.client === CASE.client,
    !caseSrc ? "not on main" : `status ${String(fm!.status)}, client ${JSON.stringify(fm!.client)}`);
  add("case.chart", "the case carries the chart the table became", !!caseSrc && /^:::chart/m.test(caseSrc), caseSrc ? (/^:::chart/m.test(caseSrc) ? ":::chart present" : "still a table") : "no case");
  const trailer = repo?.run("log", "main", "-1", "--format=%B", "--", casePath).stdout ?? "";
  add("case.approved", "the publish commit carries who approved it", /Snypd-Approved-By:/.test(trailer), trailer.split("\n").find((l) => l.startsWith("Snypd-Approved-By:")) ?? "no Snypd-Approved-By trailer");
  const noteSrc = onMain(`content/posts/${NOTE.slug}.md`);
  add("note.main", "the note is on `main`, published", !!noteSrc && readFrontmatter(noteSrc).status === "published", noteSrc ? `status ${String(readFrontmatter(noteSrc).status)}` : "not on main");
  const redirects = (cfg.config.site.redirects ?? {}) as Record<string, string>;
  add("redirect", "the redirect is in `site.redirects`", redirects[`/posts/${CASE.slug}`] === `/work/${CASE.slug}`, redirects[`/posts/${CASE.slug}`] ? `/posts/${CASE.slug} → ${redirects[`/posts/${CASE.slug}`]}` : "absent");
  add("theme", `the theme is \`${SWAP_TO}\``, cfg.config.theme.use === SWAP_TO, `theme.use = ${cfg.config.theme.use}`);
  const dist = join(root, "dist");
  const has = (route: string) => existsSync(join(dist, route, "index.html"));
  const routes = ["work", "posts", `work/${CASE.slug}`, `posts/${NOTE.slug}`, `${QUERY.taxonomy}/${QUERY.term}`, `industry/${CASE.industry}`, "studio/credits", `posts/${CASE.slug}`];
  const gone = routes.filter((r) => !has(r));
  add("dist.routes", "every route the demo names is in `dist/`", !gone.length, gone.length ? `missing: ${gone.map((r) => `/${r}/`).join(", ")}` : `${routes.length} present, the redirect page included`);
  const feed = existsSync(join(dist, "feed.xml")) ? readFileSync(join(dist, "feed.xml"), "utf8") : "";
  add("feed", "the feed carries both types", feed.includes(`/work/${CASE.slug}/`) && feed.includes(`/posts/${NOTE.slug}/`), feed ? `${feed.includes(`/work/${CASE.slug}/`) ? "the case" : "no case"}, ${feed.includes(`/posts/${NOTE.slug}/`) ? "the note" : "no note"}` : "no feed.xml");
  add("lint.clean", "the site lints with no errors", lint.errors === 0, `${lint.errors} errors, ${lint.warnings} warnings`);
  return out;
}

// ── the run ─────────────────────────────────────────────────────────────────────────────────────

/** A disposable copy of the specimen that is its own repository, with everything it ships committed. */
function stage(): string {
  const root = mkdtempSync(join(tmpdir(), "snypd-registry-"));
  cpSync(SPECIMEN, root, { recursive: true, filter: (src) => !/(^|\/)(dist|\.snypd|\.cache)(\/|$)/.test(src.slice(SPECIMEN.length)) });
  initRepo(root, { name: "Ferrule", email: "studio@ferrule.example" }).commit(["."], "Ferrule, as it arrived");
  return root;
}

export async function runRegistry(opts: { driver?: RegistryDriver; keep?: boolean } = {}): Promise<RegistryRun> {
  const driver = opts.driver ?? scriptedRegistry;
  const root = stage();
  const s = new Session(root);
  const t0 = performance.now();
  try {
    await s.start();
    await driver.run(s, { approve });
    // The lint the agent was shown, as run.ts takes it — a second, in-process lint could disagree.
    const lintResult = await s.call("content.lint", {});
    const lint = (lintResult.structuredContent ?? {}) as { errors?: number; warnings?: number };
    const counts = { errors: lint.errors ?? 0, warnings: lint.warnings ?? 0 };
    const wallMs = +(performance.now() - t0).toFixed(0);
    return {
      driver: driver.name, steps: judge(s.turns), checks: assessSite(root, counts), turns: s.turns,
      calls: s.calls, reads: s.reads, wallMs, lint: counts,
      ...(driver.usage ? { model: { ...driver.usage, ended: driver.ended ?? "success", closing: driver.closing ?? "" } } : {}),
    };
  } finally {
    s.stop();
    if (!opts.keep) rmSync(root, { recursive: true, force: true });
  }
}

export function registryMetrics(r: RegistryRun): Metric[] {
  const ok = r.steps.filter((s) => s.ok).length;
  const failedSteps = r.steps.filter((s) => !s.ok).map((s) => s.n);
  const checks = r.checks.filter((c) => c.ok).length;
  const failedChecks = r.checks.filter((c) => !c.ok).map((c) => c.id);
  return [
    // Counted, not timed, and docs/20 §2.4 is the table it is measured against — so the line is the budget (run.ts on `exact`).
    { name: "registry.steps", value: ok, unit: "steps", budget: STEPS.length, higherIsBetter: true, exact: true,
      note: failedSteps.length ? `${ok}/${STEPS.length} answered as docs/20 §2.4 says — missed: ${failedSteps.join(", ")}` : `${ok}/${STEPS.length} answered as docs/20 §2.4 says, driver \`${r.driver}\`` },
    { name: "registry.site", value: +(checks / r.checks.length).toFixed(3), unit: "", budget: 1, higherIsBetter: true,
      note: failedChecks.length ? `${checks}/${r.checks.length} — failed: ${failedChecks.join(", ")}` : `${checks}/${r.checks.length} checks on the site the run left` },
    { name: "registry.calls", value: r.calls, unit: "calls",
      note: `${r.steps.map((s) => `${s.n}·${s.calls}`).join(" ")} · +1 final lint — the reference route is ${REGISTRY_CALLS} with it, gated exactly in the test` },
    { name: "registry.reads", value: r.reads, unit: "reads", note: "resources and tools/list — free by decision 38, counted so the split stays honest" },
    { name: "registry.tokens", value: r.turns.reduce((a, t) => a + t.tokensIn + t.tokensOut, 0), unit: "tokens",
      note: `o200k both directions — ${r.turns.reduce((a, t) => a + t.tokensIn, 0)} sent, ${r.turns.reduce((a, t) => a + t.tokensOut, 0)} returned` },
    { name: "registry.wallMs", value: r.wallMs, unit: "ms", note: "spawn → the site built twice, report-only (three builds, a preview and an explain dominate)" },
    ...(r.model ? [{ name: "registry.model.tokens", value: r.model.tokensIn + r.model.tokensOut, unit: "tokens",
      note: `what \`${r.model.model}\`'s own context paid — ${r.model.tokensIn} in (cache included), ${r.model.tokensOut} out, ${r.model.turns} turns, $${r.model.costUsd}; ended \`${r.model.ended}\`; report-only` }] : []),
  ];
}

export function formatSteps(r: RegistryRun): string {
  return [
    ...r.steps.map((s) => `${s.ok ? "✅" : "❌"} ${s.n}. ${s.agent}\n     ${s.saw}`),
    "",
    ...r.checks.map((c) => `${c.ok ? "✅" : "❌"} ${c.what} — ${c.detail}`),
  ].join("\n");
}

/** Where a driver's record goes, beside the kill test's: CI's is `bench/registry.*`; a model's is named for it. */
export function registryPaths(driver: string): { report: string; json: string; transcript: string } {
  const tag = driver === "scripted" ? "" : `.${driver.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  return { report: `bench/registry${tag}.md`, json: `bench/registry${tag}.json`, transcript: `bench/registry-transcript${tag}.md` };
}

export const REGISTRY_SUITE = "registry";

export async function registry(opts: { driver?: RegistryDriver; keep?: boolean; write?: boolean } = {}): Promise<{ report: Report; run: RegistryRun }> {
  const { VERSION, toMarkdown } = await import("../src/index");
  const run = await runRegistry(opts);
  const report: Report = { version: VERSION, bun: Bun.version, date: new Date().toISOString(), tokenizer: "o200k_base", suite: REGISTRY_SUITE, metrics: registryMetrics(run) };
  if (opts.write !== false) {
    const paths = registryPaths(run.driver);
    writeFileSync(paths.json, JSON.stringify({ ...report, steps: run.steps.map(({ n, ok, saw, calls, reads, tokensOut }) => ({ n, ok, saw, calls, reads, tokensOut })), checks: run.checks, ...(run.model ? { model: run.model } : {}) }, null, 2));
    writeFileSync(paths.report, `${toMarkdown(report)}\n\n${formatSteps(run).split("\n").map((l) => (l.startsWith("     ") ? `  ${l.trim()}` : l.startsWith("✅") || l.startsWith("❌") ? `- ${l}` : l)).join("\n")}\n`);
    writeFileSync(paths.transcript, registryTranscript(run));
  }
  return { run, report };
}

/** The transcript the doc carries: the twelve steps with what each was answered, then every turn, grouped by step. */
export function registryTranscript(r: RegistryRun): string {
  const steps = stepsFor(r.turns);
  const ok = r.steps.filter((s) => s.ok).length;
  const head = [
    `# snypd bench — the registry demo`, "",
    `**Driver** \`${r.driver}\`${r.model ? ` (${r.model.model})` : ""} · **Steps** ${ok}/${STEPS.length} · **Tool calls** ${r.calls} · **Reads** ${r.reads} · **Wall** ${r.wallMs} ms`, "",
    ...(r.model ? [`**The model's own context** ${r.model.tokensIn} tokens in (cache included), ${r.model.tokensOut} out, ${r.model.turns} turns, $${r.model.costUsd}, ended \`${r.model.ended}\`.`, "", `> ${r.model.closing.trim().split("\n").join("\n> ")}`, ""] : []),
    `docs/20 §2.4's twelve steps over Ferrule, the studio specimen: a \`work\` type declared in fifteen lines of`,
    `snypd.yaml, and what every tool says about it. Each step is checked against the sentence the tool should`,
    `answer; the site the run leaves is checked under them.`, "",
    `## The twelve steps`, "", `| # | The agent | Should see | Saw | |`, `|---|---|---|---|---|`,
    ...r.steps.map((s) => `| ${s.n} | ${s.agent} | ${s.sees} | ${s.saw.replace(/\|/g, "\\|")} | ${s.ok ? "✅" : "❌"} |`), "",
    `## The site it left`, "", `| Check | Result | Detail |`, `|---|---|---|`,
    ...r.checks.map((c) => `| ${c.what} | ${c.ok ? "✅" : "❌"} | ${c.detail.replace(/\|/g, "\\|")} |`), "",
    `## Transcript`, "",
  ];
  const body: string[] = [];
  let current: number | undefined;
  r.turns.forEach((t, i) => {
    const s = steps[i];
    if (s !== current && s !== undefined) { current = s; body.push(`## Step ${s} · ${STEPS[s - 1]!.agent}`, ""); }
    body.push(turnMarkdown(t, 1400));
  });
  return [...head, ...body].join("\n");
}
