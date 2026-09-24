/**
 * Resources served in S4: `snypd://config` (merged YAML with provenance, @snypd/core), `snypd://spec/**`
 * (@snypd/spec), `snypd://types[/name]` and `snypd://taxonomies/{name}` (merged schemas, docs/03).
 * S5 adds `snypd://lint/{type}/{slug}` — diagnostics for one file, rules 0–9 with fix hints.
 * S11 adds `snypd://content/{type}/{slug}[.md]` and `snypd://history/{type}/{slug}`, both **templates**:
 * one resource per post would put a thousand rows in `resources/list` and make the cheapest call on the
 * server the most expensive one. An agent that wants the list calls `content.query`.
 * Both packages are imported lazily on first use so cold start stays at the spawn floor.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Handlers } from "./protocol";
import { E, RpcError } from "./protocol";

type Spec = typeof import("@snypd/spec");
type Core = typeof import("@snypd/core");
let spec: Spec | undefined, core: Core | undefined;
const loadSpec = async () => (spec ??= await import("@snypd/spec"));
const loadCore = async () => (core ??= await import("@snypd/core"));

const JSON_ = "application/json", YAML = "application/yaml", MD = "text/markdown";

/**
 * S16 adds the theme resources and `snypd://bench/latest`. They are resources rather than `theme.get_*`
 * tools on purpose (docs/07 decision 38): a read costs nothing until something reads it, whereas a tool
 * costs its schema on every turn. Only `snypd://theme` is part of what docs/05 counts as learning the
 * site — the token table and the coverage list are read when an agent sets out to restyle, not at session
 * start, and folding them into that budget would price a session for work it is not doing.
 */

export function handlers(root: string): Handlers {
  const config = async () => (await loadCore()).loadConfig(root);

  /**
   * The three theme reads. `coverage` is the only one that has to load the renderer — it is the answer to
   * "which primitives does this theme actually implement", which only resolving the chain can give — so an
   * agent that just wants the palette never pays for it.
   */
  const themeResource = async (uri: string): Promise<[string, string]> => {
    const c = await loadCore(), cfg = await config();
    const part = uri.slice("snypd://theme".length).replace(/^\//, "");
    if (part === "tokens") {
      const rows = c.themeTokens(cfg);
      if (!rows.length) return [YAML, `# ${cfg.config.theme.use} declares no tokens.\ntokens: {}\n`];
      const settable = rows.filter((t) => t.customisable).length;
      const body = rows.map((t) => [
        `  ${t.name}:`,
        `    value: ${JSON.stringify(t.value)}`,
        t.overridden ? `    default: ${JSON.stringify(t.default)}   # overridden in snypd.yaml` : "",
        t.variation ? `    default: ${JSON.stringify(t.default)}   # moved by the \`${t.variation}\` variation, not by this site (snypd://theme/variations)` : "",
        t.kind ? `    kind: ${t.kind}` : "",
        t.customisable ? "" : "    customisable: false   # fixed by the theme; extend it to change this",
        t.description ? `    description: ${JSON.stringify(t.description)}` : "",
      ].filter(Boolean).join("\n")).join("\n");
      return [YAML, `# Tokens of theme \`${cfg.config.theme.use}\`. ${settable} of ${rows.length} can be set from snypd.yaml\n` +
        `# with \`theme\` › set_tokens; the rest are structure, not taste. Every one is emitted as a CSS custom\n` +
        `# property (\`color.accent\` → \`--color-accent\`), which is what a theme's stylesheet reads.\ntokens:\n${body}\n`];
    }
    /**
     * The named looks (U6a). Its own resource rather than a block in `snypd://theme/tokens`, which is
     * where it started: a `variations:` map sits at the same indent as the token names under `tokens:`,
     * and the kill test's driver — which reads that resource the way an agent does, by shape — picked
     * `ink` out of it as a token name and had its whole retune refused as one bad key. A resource whose
     * YAML has two maps a line-at-a-time reader cannot tell apart is a resource that will be misread,
     * and the fix is the one `/tokens`, `/settings` and `/coverage` already are: one read, one question.
     *
     * Not in `snypd://theme` either, for the reason the palette is not: what each look *is* takes a
     * sentence, and a sentence per variation on the read every session makes is a tax on the sessions
     * that never restyle. This is free until an agent is actually changing the look.
     */
    if (part === "variations") {
      const looks = c.themeVariations(cfg);
      const stranded = c.strandedVariation(cfg);
      if (!looks.length) return [YAML, `# ${cfg.config.theme.use} ships no variations — its tokens are its one look.\n` +
        `# A theme declares them in theme.yaml: \`variations: { ink: { description: …, tokens: { color.bg: … } } }\`.\nvariations: {}\n` +
        (stranded ? `# theme.variation is \`${stranded}\`, which it does not ship; its own tokens are rendering\n` : "")];
      const body = looks.map((v) => [
        `  ${v.name}:${v.active ? "   # active" : ""}`,
        `    description: ${JSON.stringify(v.description.replace(/\s+/g, " ").trim())}`,
        `    moves: ${v.tokenCount ? `[${Object.keys(v.tokens ?? {}).join(", ")}]` : "[]   # the theme's own tokens, named so a site can switch back to them"}`,
      ].join("\n")).join("\n");
      return [YAML, `# The complete looks theme \`${cfg.config.theme.use}\` ships: \`theme\` › set with \`variation\`, one word.\n` +
        `# Each moves only the tokens it names (snypd://theme/tokens is the palette), and this site's own\n` +
        `# \`theme.tokens\` still win over whichever is chosen — theme defaults ← variation ← your overrides.\n` +
        (stranded ? `# theme.variation is \`${stranded}\`, which is not one of these; the theme's own tokens are rendering.\n` : "") +
        `variations:\n${body}\n`];
    }
    // The settings table (U3, docs/09 §4.2). A resource and not a tool for the reason the tokens table
    // is one (decision 38): an agent that is not restyling never reads it and never pays for it.
    if (part === "settings") {
      const rows = c.themeSettings(cfg);
      const stranded = c.strandedSettings(cfg);
      if (!rows.length) return [YAML, `# ${cfg.config.theme.use} declares no settings — it is tokens and parts only.\n` +
        `# A theme declares them in theme.yaml: \`settings: [{ id, type, label, group?, default?, info? }]\`.\nsettings: {}\n` +
        (stranded.length ? `# ${stranded.length} value${stranded.length === 1 ? "" : "s"} in snypd.yaml this theme does not declare: ${stranded.join(", ")}\n` : "")];
      const set = rows.filter((r) => r.set).length;
      const body = rows.map((r) => [
        `  ${r.id}:`,
        `    type: ${r.type}${r.options ? ` [${r.options.join(", ")}]` : ""}`,
        `    label: ${JSON.stringify(r.label)}`,
        r.group ? `    group: ${r.group}` : "",
        `    value: ${r.value === undefined ? "null   # unset" : JSON.stringify(r.value)}${r.set ? "   # set in snypd.yaml" : ""}`,
        r.default !== undefined && r.set ? `    default: ${JSON.stringify(r.default)}` : "",
        r.invalid ? `    refused: ${JSON.stringify(r.invalid)}   # the value in snypd.yaml; this reads the default` : "",
        r.declaredBy && r.declaredBy !== cfg.config.theme.use ? `    declaredBy: ${r.declaredBy}` : "",
        r.info ? `    info: ${JSON.stringify(r.info)}` : "",
      ].filter(Boolean).join("\n")).join("\n");
      return [YAML, `# Settings of theme \`${cfg.config.theme.use}\`: what it lets this site choose without writing CSS.\n` +
        `# ${rows.length} declared, ${set} set here. Write one with \`theme\` › set_settings; a value set to null goes\n` +
        `# back to the theme's default. The palette is a separate read (snypd://theme/tokens) because a token\n` +
        `# becomes a CSS custom property and a setting does not — a part reads it and decides what it means.\n` +
        `settings:\n${body}\n` +
        (stranded.length ? `# ${stranded.length} value${stranded.length === 1 ? "" : "s"} in snypd.yaml this theme does not declare, left from another one: ${stranded.join(", ")}\n` : "")];
    }
    if (part === "coverage") {
      const { loadTheme } = await import("@snypd/render");
      const t = await loadTheme(cfg);
      const by = (s: string) => t.coverage.filter((x) => x.status === s);
      return [JSON_, JSON.stringify({
        theme: t.name, extends: t.chain.slice(1).map((l) => l.name),
        summary: { own: by("own").length, inherited: by("inherited").length, fallback: by("fallback").length, missing: by("missing").length, total: t.coverage.length },
        layouts: Object.keys(t.layouts).sort(),
        primitives: t.coverage,
        parts: t.partCoverage,
        note: "own = this theme's own component · inherited = an ancestor's (`via`) · fallback = another primitive's component stands in · piece = a piece's (`via` is <slot>/<name>, snypd://theme/pieces) · missing = the generic wrapper, which styles nothing. parts (shell, header, footer, entries, toc) resolve the same way; override one with `parts: { header: ./parts/header.tsx }` in theme.yaml and no layout. `toc` is the post layout's contents slot and renders nothing in `base`: a theme that wants a contents list overrides it and reads `page.headings`",
      }, null, 2)];
    }
    /**
     * The shelf (docs/36 §5): every slot a theme is assembled from, and every piece that fills one — one
     * line each, which is what an agent assembling a theme chooses on. Generated from the manifest, so it
     * is never out of step with what `pieces:` accepts; the active theme's choices are marked, which is
     * the one thing on it that depends on the site. Gated at 1,200 tokens (mcp.test.ts).
     */
    if (part === "pieces") {
      const m = (await import("../../pieces/src/index")).loadPieces();
      const on = new Map(cfg.pieces.map((p) => [p.id, p]));
      const lines: string[] = [];
      const empty: string[] = [];
      for (const s of m.slots) {
        const vs = Object.values(m.pieces).filter((p) => p.slot === s.slot);
        if (!vs.length) { empty.push(s.slot); continue; }
        lines.push(`  ${s.slot}:${s.always ? "   # always on, for every theme on pieces" : ""}`, `    ask: ${JSON.stringify(s.line)}`);
        for (const v of vs) {
          const sw = Object.entries(v.switches).map(([k, d]) => `${k}=${d.of ? d.of.join("|") : "true|false"}`);
          const pairs = Object.entries(v.pairs).map(([k, w]) => `${k}: ${Array.isArray(w) ? w.join("|") : w}`);
          const meta = [`from ${v.from}`, `${v.kb} KB`, ...(sw.length ? [`switches ${sw.join(", ")}`] : []), ...(pairs.length ? [`pairs ${pairs.join(", ")}`] : []),
            ...(v.settings.length ? [`settings ${v.settings.map((x) => x.id).join(", ")}`] : []), ...(on.has(v.piece) ? ["IN USE"] : [])];
          lines.push(`    ${v.name}: ${JSON.stringify(v.line)}   # ${meta.join(" · ")}`);
        }
      }
      const use = cfg.config.theme.use;
      return [YAML, `# The shelf: the slots a theme is assembled from and the pieces that fill them (docs/36).\n` +
        `# Name one per slot in theme.yaml — \`pieces: { toc: block }\`, or \`{ use: <name>, <switch>: <value> }\`.\n` +
        `# A piece reads the forty contract tokens and styles base's classes, so it sits on any theme; a theme's\n` +
        `# own theme.css still wins over every piece (\`@layer snypd.pieces\` is beneath \`snypd.theme\`).\n` +
        `# \`${use}\` ${cfg.pieces.length ? `is on ${cfg.pieces.map((p) => p.id).join(", ")}` : "is on no pieces — its sheet is all its own"}.\n` +
        `slots:\n${lines.join("\n")}\n` +
        (empty.length ? `# nothing on the shelf yet for: ${empty.join(", ")}\n` : "")];
    }
    if (part) throw new RpcError(E.RESOURCE_NOT_FOUND, `Resource not found: ${uri} (theme reads: snypd://theme, /tokens, /variations, /settings, /coverage, /pieces)`);
    return [YAML, c.renderThemeSummary(root, cfg)];
  };
  return {
    async listResources() {
      const [s, c] = [await loadSpec(), await config()];
      return [
        { uri: "snypd://config", name: "config", mimeType: YAML, description: "Merged site config (spec ← theme ← plugins ← snypd.yaml ← snypd.<env>.yaml) with provenance — read this first" },
        ...s.resources().map(({ uri, name, mimeType, description }) => ({ uri, name, mimeType, description })),
        { uri: "snypd://types", name: "types", mimeType: JSON_, description: "Merged content types (spec + plugins + site), frontmatter as JSON Schema" },
        ...Object.keys(c.config.types).map((n) => ({ uri: `snypd://types/${n}`, name: `types/${n}`, mimeType: JSON_, description: `Merged schema for type ${n}` })),
        ...Object.keys(c.config.taxonomies).map((n) => ({ uri: `snypd://taxonomies/${n}`, name: `taxonomies/${n}`, mimeType: JSON_, description: `Merged schema for taxonomy ${n}` })),
        { uri: "snypd://theme", name: "theme", mimeType: YAML, description: "The active theme: what it inherits, how it means to read, and what else is installed — read this with the config" },
        { uri: "snypd://theme/tokens", name: "theme/tokens", mimeType: YAML, description: "Every token the theme declares, with its value, default and whether it may be set from snypd.yaml — the knobs that change how the site looks without writing CSS" },
        ...(c.settingDecls.length ? [{ uri: "snypd://theme/settings", name: "theme/settings", mimeType: YAML, description: "What this theme lets the site choose without writing CSS — each setting's type, what it means, and what it is set to now; `theme` › set_settings writes one" }] : []),
        ...(c.variations.length ? [{ uri: "snypd://theme/variations", name: "theme/variations", mimeType: YAML, description: "The complete named looks this theme ships — what each one is and which tokens it moves; `theme` › set with `variation` switches in one word" }] : []),
        { uri: "snypd://theme/pieces", name: "theme/pieces", mimeType: YAML, description: "The shelf: every slot a theme is assembled from (masthead, prose, entries…) and the pieces that fill each, one line apiece — what `pieces:` in theme.yaml can name" },
        { uri: "snypd://theme/coverage", name: "theme/coverage", mimeType: JSON_, description: "Which of the 14 primitives and 5 parts (shell, header, footer, entries, toc) this theme renders itself, which it inherits, and which fall back — read before writing a theme" },
        { uri: "snypd://themes", name: "themes", mimeType: YAML, description: "Every theme this site can switch to — installed and bundled — with what each reads as and the looks it ships; `theme` › set takes any of them" },
        { uri: "snypd://plugins", name: "plugins", mimeType: YAML, description: "The plugins `plugins:` names: version, where each was found, what it declares (types, taxonomies), its options and capabilities, and whether it loaded — plus the bundled set one line enables" },
        { uri: "snypd://nav", name: "nav", mimeType: YAML, description: "The menus: which locations the theme renders (header, footer) and what each content/nav/<location>.yaml holds, every `ref` resolved to its route — `site` › set_nav writes one" },
        { uri: "snypd://bench/latest", name: "bench/latest", mimeType: MD, description: "The last full benchmark report: every speed and size budget with its measured value" },
        // One per plugin that reacts (P4, docs/10 §4.5): what it said the last few times an event fired.
        // Listed rather than left to the template, because a plugin's own resource is only discoverable
        // if it is named — and `indexnow`'s is the answer to "did the ping go out?", which is the first
        // question anyone asks after a push.
        ...c.plugins.filter((p) => p.loaded && Object.keys(p.events).length).map((p) => ({
          uri: `snypd://${p.name}/last`, name: `${p.name}/last`, mimeType: YAML,
          description: `What the \`${p.name}\` plugin said the last few times it reacted — the rows it wrote to .snypd/events.json, newest first, with what it answered and how long it took`,
        })),
      ];
    },
    async listTemplates() {
      return [
        { uriTemplate: "snypd://content/{type}/{slug}", name: "content", mimeType: YAML, description: "One content item: its frontmatter, then the markdown body. Add `.md` for the file exactly as it is on disk" },
        { uriTemplate: "snypd://history/{type}/{slug}", name: "history", mimeType: JSON_, description: "Commits touching one item, newest first, each with the principal that made it (docs/02 §7)" },
        { uriTemplate: "snypd://lint/{type}/{slug}", name: "lint", mimeType: JSON_, description: "Lint diagnostics for one content file: rule id, severity, line, message and a fix hint (docs/01 editorial lint)" },
        { uriTemplate: "snypd://look/{id}/{picture}", name: "look", mimeType: "image/webp", description: "A picture `theme` › look took (E1): `full.webp` is the whole page with every problem boxed, `before.webp` the previous look at the same crop. The look's result links the ones it made; the last two dozen are kept" },
        { uriTemplate: "snypd://{plugin}/last", name: "plugin/last", mimeType: YAML, description: "What one plugin said the last few times an event fired at it (P4): its rows from the event ring, newest first. `snypd://plugins` names the plugins that react" },
      ];
    },
    async readResource(uri) {
      const text = (mimeType: string, text: string) => [{ uri, mimeType, text }];
      // The one binary resource (E1): a picture from `.snypd/look/`, by the id and name the look linked.
      const lookM = /^snypd:\/\/look\/([0-9a-f]{8})\/(crop|full|before)\.webp$/.exec(uri);
      if (lookM) {
        const file = join(root, ".snypd", "look", lookM[1]!, `${lookM[2]}.webp`);
        if (!existsSync(file)) throw new RpcError(E.RESOURCE_NOT_FOUND, `Resource not found: ${uri} (the last two dozen looks are kept; look again)`);
        return [{ uri, mimeType: "image/webp", blob: readFileSync(file).toString("base64") }];
      }
      const contentM = /^snypd:\/\/(content|history)\/([a-z][a-z0-9-]*)\/([a-z0-9][a-z0-9/-]*?)(\.md)?$/i.exec(uri);
      if (contentM) {
        const c = await loadCore(), cfg = await config();
        const [, kind, type, slug, md] = contentM;
        if (!cfg.config.types[type!]) throw new RpcError(E.RESOURCE_NOT_FOUND, `Resource not found: ${uri} (unknown type ${type}; known: ${Object.keys(cfg.config.types).join(", ")})`);
        const t = c.target(root, cfg, type!, slug!);
        if (kind === "history") {
          const repo = c.Repo.open(root);
          return text(JSON_, JSON.stringify({ path: t.path, git: !!repo, commits: repo?.history(t.path) ?? [] }, null, 2));
        }
        let source: string;
        try { source = readFileSync(t.file, "utf8"); }
        catch { throw new RpcError(E.RESOURCE_NOT_FOUND, `Resource not found: ${uri} (no ${type} with slug ${slug})`); }
        if (md) return text("text/markdown", source);
        const { yaml, body } = c.splitFrontmatter(source);
        return text(YAML, `# ${t.path} → ${t.route}\n${yaml}\nbody: |\n${body.split("\n").map((l) => `  ${l}`).join("\n").replace(/\s+$/, "")}\n`);
      }
      if (uri === "snypd://theme" || uri.startsWith("snypd://theme/")) { const [m, t] = await themeResource(uri); return text(m, t); }
      if (uri === "snypd://themes") { const c = await loadCore(); return text(YAML, c.renderThemes(root, await config())); }
      if (uri === "snypd://nav") { const c = await loadCore(); return text(YAML, c.renderNav(root, await config())); }
      if (uri === "snypd://plugins") { const c = await loadCore(); const cfg = await config(); return text(YAML, c.renderPlugins(cfg.plugins, { jsKb: (cfg.config.bench.budgets as Record<string, unknown>).jsKb as number | undefined })); }
      if (uri === "snypd://bench/latest") {
        const file = join(root, "bench", "latest.md");
        if (!existsSync(file)) throw new RpcError(E.RESOURCE_NOT_FOUND, `Resource not found: ${uri} (no bench/latest.md yet — run \`bench\` › run)`);
        return text(MD, readFileSync(file, "utf8"));
      }
      const lintM = /^snypd:\/\/lint\/([a-z][a-z0-9-]*)\/([a-z0-9][a-z0-9/-]*)$/i.exec(uri);
      if (lintM) {
        const c = await loadCore(), cfg = await config();
        const [, type, slug] = lintM;
        const file = c.listContent(root, cfg).find((f) => f.type === type && f.slug === slug);
        if (!file) throw new RpcError(E.RESOURCE_NOT_FOUND, `Resource not found: ${uri} (no ${type} with slug ${slug})`);
        const index = await c.SiteIndex.open(root); index.sync(cfg);
        const site = c.lintSite(root, { cfg, moves: index.moves(), cache: new c.MdastCache(index.mdastStore()) });   // whole site: rule 5 needs every route, 11 every tag, 10 the move log
        index.close();
        const r = site.files.find((f) => f.file === relative(root, file.file))!;
        return text(JSON_, JSON.stringify({ file: r.file, errors: r.errors, warnings: r.warnings, words: r.words, skipped: r.skipped, diagnostics: r.diagnostics }, null, 2));
      }
      if (uri === "snypd://config") return text(YAML, (await config()).render());
      if (uri.startsWith("snypd://spec")) {
        const r = (await loadSpec()).resource(uri);
        if (r) return text(r.mimeType, r.text());
      }
      const m = /^snypd:\/\/(types|taxonomies)(?:\/([a-z][a-z0-9-]*))?$/i.exec(uri);
      if (m) {
        const [s, c] = [await loadSpec(), await config()];
        const kind = m[1] as "types" | "taxonomies", name = m[2];
        const table = c.config[kind] as Record<string, { fields: Record<string, unknown> }>;
        const schema = (n: string) => ({ $schema: "https://json-schema.org/draft/2020-12/schema", $id: `snypd://${kind}/${n}.json`, title: n, ...s.fieldsToJsonSchema(table[n]!.fields as never), ...(kind === "types" ? { "x-type": { ...table[n], fields: undefined } } : {}) });
        if (!name) { if (kind === "taxonomies") throw new RpcError(E.RESOURCE_NOT_FOUND, `Resource not found: ${uri}`); return text(JSON_, JSON.stringify(Object.fromEntries(Object.keys(table).map((n) => [n, schema(n)])), null, 2)); }
        if (table[name]) return text(JSON_, JSON.stringify(schema(name), null, 2));
      }
      /**
       * `snypd://<plugin>/last` (P4) — one plugin's rows from the event ring, newest first.
       *
       * Resolved last, after every built-in pattern, so a plugin named `theme` or `types` cannot take a
       * URI the server already owns: it loses the resource and keeps every other tier, the same rule a
       * name collision gets in the tool catalogue. And it is a *view*, not a store: `indexnow` persists
       * nothing of its own, so the honest answer to "what did the last ping say" is the line it wrote
       * when it said it — one file, written by whichever process fired (decision 101), not a second
       * record kept beside it that can disagree.
       */
      const lastM = /^snypd:\/\/([a-z][a-z0-9-]*)\/last$/i.exec(uri);
      if (lastM) {
        const c = await loadCore(), cfg = await config();
        const name = lastM[1]!;
        const p = cfg.plugins.find((x) => x.name === name);
        if (!p?.loaded) throw new RpcError(E.RESOURCE_NOT_FOUND, `Resource not found: ${uri} (no loaded plugin \`${name}\`; snypd://plugins lists this site's)`);
        const rows = c.readEvents(root).filter((r) => r.plugin === name).reverse();
        const head = [
          rows.length
            ? `# What \`${name}\` said the last ${rows.length === 1 ? "time an event fired at it" : `${rows.length} times an event fired at it`} — .snypd/events.json, newest first.`
            : `# What \`${name}\` says when an event fires at it — .snypd/events.json. Nothing yet.`,
          "# A handler that fails is a line here and never a failed publish (docs/10 §4.5, decision 87); the ring keeps the last 100 rows.",
          `plugin: ${JSON.stringify(name)}`,
          `listens: [${Object.keys(p.events).join(", ")}]${Object.keys(p.events).length ? "" : "   # nothing — this plugin does not react, so it writes no rows"}`,
        ];
        if (!rows.length) return text(YAML, `${head.join("\n")}\nlast: {}   # no event has fired at it yet on this machine\n`);
        const body = rows.map((r) => [
          `  - at: ${r.at}`,
          `    event: ${r.event}`,
          `    ok: ${r.ok}`,
          `    message: ${JSON.stringify(r.message)}`,
          `    ms: ${r.ms}`,
        ].join("\n")).join("\n");
        return text(YAML, `${head.join("\n")}\nlast:\n${body}\n`);
      }
      throw new RpcError(E.RESOURCE_NOT_FOUND, `Resource not found: ${uri}`);
    },
  };
}
