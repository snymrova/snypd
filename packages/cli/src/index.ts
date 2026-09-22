#!/usr/bin/env bun
/**
 * `snypd init | dev | serve | build | bench` — five verbs since S18e (docs/00 §1, docs/06 §1, decision
 * 51), of which `serve` is the only one a person does not type: it is what `.mcp.json` spawns. X1 adds
 * `new` and `check`, which are not a sixth and seventh of the same kind: those five are what a *site*
 * needs, and these two are the whole of what a theme or plugin *author* does in a terminal (decision 139).
 *
 * The body is a function rather than top-level code for one reason: `bun build --compile --bytecode`
 * cannot compile a module with top-level `await`, and every verb here begins with one — the lazy
 * `import()` that keeps `snypd serve` answering `initialize` without loading a renderer it will not use
 * (S4, D2's 50 ms). Bytecode and lazy imports are both worth keeping, and `async function main()` is the
 * whole price of having both.
 */
const [cmd, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith("--")));
const args = rest.filter((a) => !a.startsWith("--"));

async function main(): Promise<void> {
// `serve --preview` is kept as an alias for `dev` (S18e, decision 51) — and as *the same code path*
// rather than a second one that drifts. It is the spelling three sessions of docs and one bench lane
// already use, and the whole point of the new verb is that there is one preview, not two.
const verb = cmd === "serve" && flags.has("--preview") ? "dev" : cmd;
switch (verb) {
  case "build": {
    const { build } = await import("@snypd/render");
    let r;
    // `--drafts` decides; without it the build reads the branch it is for (S19d) — a host building
    // `snypd/drafts` gets the drafts, and a laptop on `main` gets the site.
    try { r = await build(args[0] ?? ".", flags.has("--drafts") ? { drafts: true, preview: true } : {}); }
    catch (e) {
      const err = e as Error & { hint?: string };
      console.error(err.message); if (err.hint) console.error(err.hint);
      process.exit(1);
    }
    // A primitive is covered when something renders it: the theme's own file, an ancestor's, or a
    // declared fallback. Only `missing` (the generic wrapper) is a hole, so only it is subtracted.
    const covered = r.theme.coverage.filter((c) => c.status !== "missing").length;
    const inherited = r.theme.coverage.filter((c) => c.status === "inherited").length;
    console.log(`built ${r.routes} routes + ${r.artefacts} artefacts${r.emitted ? ` (${r.emitted} emitted by plugins)` : ""}${r.media ? ` + ${r.media} media` : ""} (${r.rendered} rendered, ${r.cached} cached, ${r.removed} removed${r.recovered ? `, ${r.recovered} left unfinished by an interrupted build and rebuilt` : ""}) in ${r.ms.toFixed(0)} ms · theme ${r.theme.name} (${covered}/${r.theme.coverage.length} primitives${inherited ? `, ${inherited} inherited` : ""})`);
    // Said every time, not only under --verbose: a dist/ with drafts in it going to a host as the site is
    // the mistake this line exists to make visible in the build log.
    // A type the theme has no layout for is said, not hidden (R1, decision 197): the page went out through its base type's layout.
    for (const f of r.fallbacks) console.log(`${f.type} renders through \`${f.used}\` — ${r.theme.name} declares no \`${f.wanted}\` layout`);
    if (r.preview) console.log(`drafts included${r.branch ? ` — this build is for \`${r.branch.name}\` (${r.branch.from})` : " (--drafts)"}: a preview, not the site. Every page is noindex and robots.txt disallows.`);
    if (flags.has("--verbose")) {
      if (r.branch) console.log(`branch ${r.branch.name ?? "(none)"} · ${r.branch.from}`);
      console.log(Object.entries(r.phases).map(([k, v]) => `${k} ${v.toFixed(1)} ms`).join(" · "));
      console.log(`render = ${Object.entries(r.profile).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(" · ")} ms`);   // F1: where the render phase went
    }
    // A hook that failed is a line, never a failed build (P2): the page went out without that plugin's contribution.
    for (const d of r.hooks.diagnostics) console.error(`⚠ plugin ${d.plugin} ${d.hook}${d.route ? ` on ${d.route}` : ""}: ${d.message}`);
    break;
  }
  case "bench": {
    const bench = await import("@snypd/bench");
    if (args[0] === "compare") {
      const rows = bench.compare(bench.load(args[1]!), bench.load(args[2]!));
      for (const r of rows) console.log(`${r.regressed ? "❌" : "✅"} ${r.name}: ${r.a} → ${r.b} (${(r.delta * 100).toFixed(1)} %)`);
      if (rows.some((r) => r.regressed)) process.exit(1);
      break;
    }
    if (args[0] === "page") {    // S13: the built site in a real browser — 0 KB JS, 0 axe violations
      const r = await bench.page({ root: args[1] });
      console.log(bench.toMarkdown(r));
      const over = bench.breaches(r);
      if (over.length && flags.has("--ci")) { console.error(`budget breach: ${over.join(", ")}`); process.exit(1); }
      break;
    }
    if (args[0] === "suggest") {   // S15: suggest_blocks precision over the hand-labelled corpus
      if (flags.has("--facts")) {   // the keys a detector YAML may name — how one is written without reading the code
        console.log(bench.factsReport(args[1], { shape: args.find((a) => a.startsWith("--shape="))?.slice(8) }));
        break;
      }
      const r = await bench.suggest({ root: args[1] });
      console.log(bench.toMarkdown(r));
      console.log(`\n${bench.formatSuggestScore(bench.scoreSuggest(args[1]))}`);
      const over = bench.breaches(r);
      if (over.length) { console.error(`\n${over.length} breach(es)`); process.exit(1); }
      break;
    }
    if (args[0] === "agent") {   // S17: the kill test — the one lane that scores the product, not a number
      // S21: `--driver=claude:<model>` puts a live model at the keyboard instead of the scripted route.
      // Same scenario, same checks, same three numbers; the record goes to `bench/agent.<driver>.*`.
      const which = [...flags].find((f) => f.startsWith("--driver="))?.slice(9);
      const driver = which?.startsWith("claude:") ? bench.live(which.slice(7), { onLine: (l) => { if (/"type":"assistant"/.test(l) && /"tool_use"/.test(l)) process.stderr.write("·"); } }) : undefined;
      if (which && !driver) { console.error(`unknown driver ${which} — scripted (default) or claude:<model>`); process.exit(2); }
      const { report, run } = await bench.agent({ keep: flags.has("--keep"), driver });
      if (driver) process.stderr.write("\n");
      console.log(bench.toMarkdown(report));
      console.log(`\n${run.checks.map((c) => `${c.ok ? "✅" : "❌"} ${c.what} — ${c.detail}`).join("\n")}`);
      if (run.model) console.log(`\nmodel ${run.model.model} · ${run.model.turns} turns · ${run.model.tokensIn} in / ${run.model.tokensOut} out · $${run.model.costUsd} · ended ${run.model.ended}\n${run.model.closing.trim()}`);
      const over = bench.breaches(report);
      if (over.length) { console.error(`\nbudget breach: ${over.join(", ")}`); process.exit(1); }
      break;
    }
    if (args[0] === "registry") {   // S29 · R4: the registry demo — docs/20 §2.4's twelve steps, run and checked against what each tool said
      const which = [...flags].find((f) => f.startsWith("--driver="))?.slice(9);
      const driver = which?.startsWith("claude:") ? bench.liveRegistry(which.slice(7), { onLine: (l) => { if (/"type":"assistant"/.test(l) && /"tool_use"/.test(l)) process.stderr.write("·"); } }) : undefined;
      if (which && !driver) { console.error(`unknown driver ${which} — scripted (default) or claude:<model>`); process.exit(2); }
      const { report, run } = await bench.registry({ keep: flags.has("--keep"), driver });
      if (driver) process.stderr.write("\n");
      console.log(bench.toMarkdown(report));
      console.log(`\n${bench.formatSteps(run)}`);
      if (run.model) console.log(`\nmodel ${run.model.model} · ${run.model.turns} turns · ${run.model.tokensIn} in / ${run.model.tokensOut} out · $${run.model.costUsd} · ended ${run.model.ended}\n${run.model.closing.trim()}`);
      const over = bench.breaches(report);
      if (over.length) { console.error(`\nbudget breach: ${over.join(", ")}`); process.exit(1); }
      break;
    }
    if (args[0] === "writes") {   // S21: first-attempt lint on `write-post`, 20 topics × the models named
      const models = [...flags].find((f) => f.startsWith("--models="))?.slice(9).split(",").filter(Boolean);
      const t = [...flags].find((f) => f.startsWith("--topics="))?.slice(9);
      const topics = t?.includes("-") ? (t.split("-").map(Number) as [number, number]) : Number(t) || undefined;
      const { report, attempts } = await bench.writes({ models, topics, merge: flags.has("--merge"), keep: flags.has("--keep"),
        onProgress: (a, done, total) => console.error(`${done}/${total} ${a.model} · ${a.noAttempt ? "no attempt" : a.pass ? "✅" : `❌ ${a.rules.join(", ") || `${a.errors} errors`}`} · ${a.topic}`) });
      console.log(bench.toMarkdown(report));
      console.log(`\n${bench.formatAttempts(attempts)}`);
      break;
    }
    if (args[0] === "report") {   // S22: the record, rewritten as a page a snypd site can publish (/bench)
      const { readFileSync, writeFileSync } = await import("node:fs");
      const src = args[1] ?? "bench/latest.md";
      const out = [...flags].find((f) => f.startsWith("--out="))?.slice(6);
      const page = bench.benchPage(readFileSync(src, "utf8"), { source: [...flags].find((f) => f.startsWith("--source="))?.slice(9) });
      if (out) { writeFileSync(out, page); console.error(`${out}: ${page.split("\n").length} lines from ${src}`); } else console.log(page);
      break;
    }
    if (args[0] === "gallery") {   // S22: every look every theme ships, measured and photographed (E9)
      const opt = (n: string) => [...flags].find((f) => f.startsWith(`--${n}=`))?.slice(n.length + 3);
      const scheme = opt("scheme");
      if (scheme !== undefined && !["light", "dark", "both"].includes(scheme)) { console.error(`--scheme=${scheme}: light, dark or both`); process.exit(2); }
      const { report, shots } = await bench.gallery({ root: args[1], out: opt("out"), route: opt("route"), focus: opt("focus"), only: opt("only")?.split(",").filter(Boolean), scheme: scheme as "light" | "dark" | "both" | undefined,
        onLook: (l, i, n) => console.error(`${i}/${n} ${l.variation ? `${l.theme} › ${l.variation}` : l.theme}`) });
      console.log(bench.toMarkdown(report));
      console.log(`\n${bench.formatShots(shots)}`);
      const over = bench.breaches(report);
      if (over.length && flags.has("--ci")) { console.error(`budget breach: ${over.join(", ")}`); process.exit(1); }
      break;
    }
    if (args[0] === "onboard") {   // S18g: first run, walked against the compiled binary (docs/08 F1)
      const { report, walk, relay } = await bench.onboard({ keep: flags.has("--keep") });
      console.log(bench.toMarkdown(report));
      console.log(`\n${bench.formatWalk(walk, relay)}`);
      const over = bench.breaches(report);
      if (over.length) { console.error(`\nbudget breach: ${over.join(", ")}`); process.exit(1); }
      break;
    }
    if (args[0] === "visual") {   // D3 only: every visual primitive at its worst shape, no build (S10)
      const r = await bench.visual({ quick: flags.has("--quick") });
      console.log(bench.toMarkdown(r));
      const over = bench.breaches(r);
      if (over.length && flags.has("--ci")) { console.error(`budget breach: ${over.join(", ")}`); process.exit(1); }
      break;
    }
    const report = await bench.run({ quick: flags.has("--quick") });
    console.log(bench.toMarkdown(report));
    const bad = bench.breaches(report);
    if (bad.length && flags.has("--ci")) { console.error(`budget breach: ${bad.join(", ")}`); process.exit(1); }
    break;
  }
  case "serve": {
    const port = Number(rest.find((a) => a.startsWith("--port="))?.slice(7) ?? 4321);
    if (flags.has("--static")) {   // the S2 static stub: dist/ exactly as built, no drafts
      const { serve } = await import("@snypd/runtime");
      const s = serve(args[0] ?? ".", { port });
      console.log(`snypd serve --static → ${s.url}`);
      break;
    }
    const { createServer } = await import("@snypd/mcp");   // MCP on stdio (docs/03); stdout is the protocol
    createServer(args[0] ?? process.env.SNYPD_ROOT ?? process.cwd()).listen();
    break;
  }
  /**
   * S18e, decision 51 — the human verb.
   *
   * `serve` has two audiences and only one of them is a person. It is spawned by the harness from
   * `.mcp.json`: no TTY, and stdout carries JSON-RPC, so a human-facing line printed there is a
   * protocol violation and a browser opened there is a window per session start. `--preview` bolted the
   * second audience onto the first verb, which is why the front door was invisible — the line this file
   * printed named the S11 review path with `<type>/<slug>` placeholders and had never once said
   * `/_snypd`, three sessions after the Desk became a page.
   *
   * `dev` writes nothing. It serves what a build already produced, so *MCP is the only way to write*
   * survives a fifth verb intact. What it does own is the preview: it exists before any tool call,
   * survives the harness restarting, and is already open when the post lands — and `.snypd/dev.json` is
   * how the agent finds it instead of racing it for port 4321 (docs/08 §12.3).
   */
  case "dev": {
    const { preview } = await import("@snypd/render/preview");
    const { liveDev, writeDev, clearDev, VERSION } = await import("@snypd/core");
    // S18f: the first-run Desk lists what a harness will offer once it connects. Names and descriptions
    // only — `@snypd/render` may not import `@snypd/mcp`, and this verb already can.
    const { PROMPTS } = await import("@snypd/mcp/prompts");
    const root = args[0] ?? ".";
    const val = (n: string) => rest.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
    const { resolve } = await import("node:path");

    // Two dev servers in one directory is the collision this session exists to end, so it is not one of
    // the shapes we ship. Re-running the command answers with the URL of the server that is already
    // there — the postcondition the caller wanted either way — rather than binding 4322 and leaving two
    // Desks disagreeing about which one `render_preview` will hand out.
    const running = await liveDev(root);
    if (running) {
      console.log([`a snypd dev server is already serving this site`, ``, `  Desk     ${running.url}/_snypd`, `  started  ${running.startedAt || "unknown"} (pid ${running.pid})`, ``, `Stop that one first, or just use it — the agent finds it through .snypd/dev.json either way.`].join("\n"));
      break;
    }

    // `Number("abc")` is NaN, which `Bun.serve` takes as "pick one for me" and `reload > 0` reads as
    // "off" — both of which turn a typo into behaviour the person did not ask for and cannot see.
    const num = (n: string, fallback?: number): number | undefined => {
      const raw = val(n);
      if (raw === undefined) return fallback;
      const v = Number(raw);
      if (!Number.isFinite(v)) { console.error(`--${n}=${raw} is not a number`); process.exit(1); }
      return v;
    };
    /**
     * Since S18k the default is the change stream, not a clock: the page reloads because the watcher saw
     * an edit. `--reload=N` asks for the old fixed poll back — the one mode that needs nothing from the
     * browser — and `--no-reload` leaves a page that changes only when a person refreshes it.
     */
    const asked = val("reload");
    const reload: number | "watch" | undefined = flags.has("--no-reload") ? undefined
      : asked === undefined || asked === "watch" ? "watch"
      : num("reload")! > 0 ? num("reload")! : undefined;
    const port = num("port");
    let s;
    try {
      s = await preview(root, {
        port,
        hostname: val("host"),
        strictPort: port !== undefined,   // a typed port is a choice; the default is not
        watch: !flags.has("--no-watch"),
        reload,
        deskLink: true,
        prompts: PROMPTS.map((p) => ({ ...p, description: p.description ?? "" })),
      });
    } catch (e) {
      const err = e as Error & { hint?: string };
      console.error(err.message); if (err.hint) console.error(`↳ ${err.hint}`);
      process.exit(1);
    }
    writeDev(root, { url: s.url, port: s.port, hostname: s.hostname, root: resolve(root), pid: process.pid, startedAt: new Date().toISOString(), version: VERSION });

    // The record is the only state this verb leaves behind, and a stale one is worse than none: it
    // sends `render_preview` at a port nobody is holding. `liveDev` proves the claim over HTTP for
    // exactly that reason, but clearing it on the way out is what keeps the proof from being needed.
    let stopping = false;
    const shutdown = (code?: number) => {
      if (stopping) return; stopping = true;
      clearDev(root); try { s!.stop() } catch { /* already down */ }
      if (code !== undefined) process.exit(code);
    };
    process.on("SIGINT", () => shutdown(0));
    process.on("SIGTERM", () => shutdown(0));
    process.on("exit", () => shutdown());

    console.log([
      `snypd dev → ${s.url}`,
      ``,
      `  Desk   ${s.url}/_snypd          drafts in flight, what to approve, what was built`,
      `  Site   ${s.url}/                drafts included — this is the build that publishes`,
      ``,
      `Writing happens over MCP, from your harness — there is no editor here and no button that writes.`,
      reload === "watch" ? `Pages reload when you change a file; --reload=N polls every N seconds instead, --no-reload turns it off.`
        : reload ? `Pages reload every ${reload}s while this runs; --no-reload turns that off.`
        : `Reload is off; refresh the page to see a change.`,
      `Ctrl-C to stop.`,
    ].join("\n"));

    // Decision 57: `init` and `dev` may open a browser; the library functions they call may not. A TTY
    // is the test because it is the only evidence available that a person is present — `packages/bench/
    // smoke/` drives this binary with no display at all, and an agent calling it would get a window on
    // somebody's screen for no reason.
    if (!flags.has("--no-open") && process.stdout.isTTY) {
      const cmd = process.platform === "darwin" ? ["open"] : process.platform === "win32" ? ["cmd", "/c", "start", ""] : ["xdg-open"];
      try { Bun.spawn([...cmd, `${s.url}/_snypd`], { stdout: "ignore", stderr: "ignore", stdin: "ignore" }).unref() } catch { /* no browser is not an error */ }
    }
    break;
  }
  case "config": {   // debugging aid: `snypd config [root] [path]` prints snypd://config or explains one path
    const { loadConfig, formatDiagnostics } = await import("@snypd/core");
    const c = loadConfig(args[0] ?? ".");
    if (args[1]) console.log(c.explain(args[1])); else console.log(c.render());
    if (!c.ok) { console.error(formatDiagnostics(c.diagnostics)); process.exit(1); }
    break;
  }
  case "lint": {     // debugging aid: `snypd lint [root|file.md]` — rules 0–11 (docs/01); exit 1 on errors
    const { lintSite, formatSiteLint, lintMarkdown, formatLint, SiteIndex, loadConfig } = await import("@snypd/core");
    const target = args[0] ?? ".";
    if (target.endsWith(".md")) {
      const r = lintMarkdown(await Bun.file(target).text(), { file: target });
      console.log(formatLint(r) || `${target}: clean (${r.words} words)`);
      process.exit(r.errors ? 1 : 0);
    }
    const cfg = loadConfig(target);
    const index = await SiteIndex.open(target); index.sync(cfg);   // rule 10 reads the move log
    const s = lintSite(target, { cfg, moves: index.moves(), cache: new (await import("@snypd/core")).MdastCache(index.mdastStore()) });
    index.close();
    console.log(formatSiteLint(s));
    process.exit(s.errors ? 1 : 0);
  }
  case "init": {   // S16: the same `initSite` the `site` tool calls, for someone who reached for a terminal first
    const { initSite, Repo, MCP_FILE, DEFAULT_BASE, PLACEHOLDER_URL, buildCommand, VERSION } = await import("@snypd/core");
    const flag = (n: string) => [...flags].find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
    const root = args[0] ?? ".";
    try {
      // No required flags (S18d, docs/08 decision 63): name falls back to the directory, url to a
      // placeholder the first deploy replaces with the host's answer. The person running this has not seen a pixel yet.
      // `--host` is the L1 name (docs/31); `--deploy` is the S18d′ spelling and still means the same.
      const r = initSite(root, { name: flag("name"), url: flag("url"), description: flag("description"), theme: flag("theme"), deploy: (flag("host") ?? flag("deploy")) as "cloudflare" | "vercel" | "none" | undefined });
      const say: string[] = [`${r.dirCreated ? `made ${root}/ and ` : ""}initialised ${r.created.join(", ")}`];
      // An empty directory gets its repo here rather than as homework (S18d): without one the scaffold
      // cannot be committed, and the first `content.create` refuses on a tree it was never told about.
      if (r.gitInit) say.push(`git init — new repository on ${DEFAULT_BASE}`);
      // The host's half is in the repo by default now (L1, decision 229). What the line says is what a
      // person could otherwise only learn from the file: nothing was typed into a dashboard, and the
      // one command a connected host would run is an installed one, not a shell script piped from a URL.
      if (r.deploy) say.push(r.deploy === "cloudflare"
        ? `${r.deploy}: wrangler.toml and a PR workflow are in the repo — \`site\` › deploy uploads through Cloudflare's own CLI and reads the URL back; snypd holds no credential`
        : `${r.deploy}: host config and a PR workflow are in the repo — snypd holds no credential; a connected host builds with \`${buildCommand(VERSION)}\` and serves dist/`);
      // Commit the scaffold on the branch the site deploys from. Leaving it uncommitted would make the
      // agent's first write refuse — `useDrafts` will not carry work it did not do onto the drafts branch
      // — and would leave `main` without a `snypd.yaml` for the host to build after the first publish.
      const repo = Repo.open(root);
      const committed = repo?.commit(r.paths, `site: init ${r.name}`);
      if (committed?.committed) say.push(`committed ${committed.sha!.slice(0, 8)} on ${committed.branch}`);
      else if (!repo) say.push(`not a git repo, and this directory already has files in it — \`git init\` here, then re-run; nothing can be versioned or published without one`);
      // The third case, which said nothing at all until S18d′ and is the one a fresh machine is in: the
      // repo exists and the commit did not happen. Silence here surfaces two steps later as a refused
      // `content.create`, which is the cause hidden behind a symptom.
      else say.push(`the scaffold could not be committed: ${committed?.reason ?? "unknown"}${committed?.hint ? `\n${committed.hint}` : ""}`);
      console.log(say.join("\n"));

      // ── Everything below has two possible readers (docs/08 decision 178) ─────────────────────────
      // Since S18d this was written for an agent alone (decision 60): a person pasted one sentence, the
      // agent ran this, and the printout was that agent's only briefing. The README's front door is now
      // the command itself — a person types it in a terminal *before* any harness is open, because the
      // harness has to (re)start to read `.mcp.json` either way, and a person who runs `init` first
      // opens the harness once instead of restarting it. So the ordinary reader is a person at a
      // terminal, and the agent that ran it on somebody's behalf is the other. Both get the same four
      // things in the order they are acted on: what exists, what is still unknown and when it comes due,
      // the one thing a harness needs (to be opened, or restarted — the agent relays the second), and
      // where the far side picks up — because nothing is carried across a harness start.
      // Wrapped at 100 columns: a paragraph this long breaks mid-word in a default terminal otherwise,
      // and this is the first prose the product prints to a person.
      const wrap = (text: string, width = 100): string => text.split("\n").map((line) => {
        if (line.length <= width || line.startsWith("    ")) return line;
        const words = line.split(" "), lines: string[] = []; let cur = "";
        for (const w of words) { if (cur && cur.length + 1 + w.length > width) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w; }
        if (cur) lines.push(cur);
        return lines.join("\n");
      }).join("\n");
      const out: string[] = ["", `\`${r.name}\` is a snypd site. There is no admin UI: content is written over MCP, by an agent.`];
      if (r.placeholderUrl)
        out.push(r.deploy === "cloudflare"
          ? `Its URL is ${PLACEHOLDER_URL}, a placeholder. The first deploy reads the real one back from ${r.deploy} and sets it — nothing to type.`
          : `Its URL is ${PLACEHOLDER_URL}, a placeholder. The feed, sitemap and JSON-LD are absolute, so the real origin is needed before anything is pushed to a host — and not before.`);
      const registered = r.created.includes(MCP_FILE);
      // The last thing printed is the next thing typed (L1, docs/31 §5): `init my-site` is run from the
      // parent, so the person is not in the site yet, and the harness has to open *there*. `.` prints
      // the bare `claude`. The sentence stays above it, because it is said after the harness opens.
      const there = root === "." ? "claude" : `cd ${root} && claude`;
      out.push("",
        registered
          ? `Next: open Claude Code, Cursor or Codex in this directory — a harness reads ${MCP_FILE} when it starts — and say:`
          : `${MCP_FILE} already existed and was left alone. If it does not name a \`snypd\` server the tools will not load — check it, then open Claude Code, Cursor or Codex in this directory and say:`,
        // The sentence is the product (docs/31 §3, action 4). With the host's config in the repo — the
        // default — the agent can take the post all the way to a URL, so the sentence says so; a site
        // that will be served by something else stops at the post.
        "", r.deploy === "cloudflare" ? "    Write me a first post and put it online." : "    Write me a first post.", "",
        `If a harness is already open here, restart it so the snypd tools load. Nothing needs to be carried across: the next session's \`initialize\` names the \`get-started\` prompt, and everything else is on disk — it will read the site, learn the vocabulary, write the post${r.deploy === "cloudflare" ? ", and put it online (the host asks you to click allow once, in a tab it opens)" : ""}.`,
        "", `    ${there}`);
      console.log(wrap(out.join("\n")));
    } catch (e) {
      const err = e as Error & { hint?: string };
      console.error(err.message); if (err.hint) console.error(`↳ ${err.hint}`);
      process.exit(1);
    }
    break;
  }
  /**
   * X1 — the two verbs a *theme author* types, and the only two.
   *
   * There is no `snypd theme` verb and no `snypd plugin` verb, which is a deliberate refusal: a noun as a
   * verb promises a family (`theme set`, `theme list`, `theme install`), and that family exists over MCP
   * and is never coming to the CLI — writing is over MCP and only over MCP (decision 51, docs/08 §2).
   * What a terminal is for here is the one artefact that is not content. `new` makes one; `check` judges
   * it, by rules with names, which is what decision 123 needs before `/themes` lists anything.
   */
  case "new": {
    const { scaffoldTheme, scaffoldPlugin, Repo } = await import("@snypd/core");
    const [kind, name] = args;
    const root = rest.find((a) => a.startsWith("--root="))?.slice(7) ?? ".";
    if (kind !== "theme" && kind !== "plugin") { console.error("usage: snypd new theme|plugin <name> [--extends=base] [--root=.]"); process.exit(1); }
    if (!name) { console.error(`usage: snypd new ${kind} <name>`); process.exit(1); }
    try {
      const r = kind === "theme"
        ? scaffoldTheme(root, { name, extends: rest.find((a) => a.startsWith("--extends="))?.slice(10) })
        : scaffoldPlugin(root, { name, description: rest.find((a) => a.startsWith("--description="))?.slice(14) });
      const say = [`${r.dir}/`, ...r.files.map((f) => `  ${f.slice(r.dir.length + 1)}`)];
      // Committed for the same reason `init` commits its scaffold: a theme that is not in the repository
      // is a theme the deploy does not build with, and finding that out is a round trip through a host.
      const committed = Repo.open(root)?.commit(r.files, `${kind}: scaffold ${r.name}${r.extends ? ` extends ${r.extends}` : ""}`);
      if (committed?.committed) say.push(`committed ${committed.sha!.slice(0, 8)} on ${committed.branch}`);
      say.push("", kind === "theme"
        ? `Fill DESIGN.md, then write theme.css. Everything else already renders — all 14 primitives and all 6 layouts come from \`${r.extends}\`${r.inheritedTokens ? `, and ${r.inheritedTokens} tokens come with them` : `, which declares no tokens, so theme.yaml starts with the twelve this stylesheet names`}.`
        : `Write slots/note.tsx, then add \`${r.name}\` to \`plugins:\` in snypd.yaml. The manifest lists the other four tiers as one commented line each.`,
        `\`snypd check ${kind} ${r.name}\` says whether it is shelf-ready; \`snypd dev\` shows it.`);
      console.log(say.join("\n"));
    } catch (e) {
      const err = e as Error & { hint?: string };
      console.error(err.message); if (err.hint) console.error(`↳ ${err.hint}`);
      process.exit(1);
    }
    break;
  }
  /**
   * `snypd seed <theme> --seed=<colour> …` (TF3, docs/29 §4) — a verb over the one artefact that is not
   * content, like `new` and `check`: one colour and two numbers become a palette that passes the contrast
   * gate by construction and a fluid type scale, written into the theme's `tokens:` with its comments
   * kept, and the inputs recorded under `## Seed` in its DESIGN.md so a re-seed is one copied line.
   */
  case "seed": {
    const { expandSeed, writeSeed, Repo } = await import("@snypd/core");
    const { join, relative } = await import("node:path");
    const { existsSync } = await import("node:fs");
    const [name] = args;
    const opt = (n: string) => rest.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
    const pair = (n: string) => { const v = opt(n); if (!v) return undefined; const [a, b = a] = v.split(":").map(Number); return [a!, b!] as [number, number]; };
    const root = opt("root") ?? ".";
    if (!name || !opt("seed")) { console.error('usage: snypd seed <theme> --seed="oklch(0.55 0.13 252)" [--strategy=restrained|balanced|expressive] [--scheme=both|light|dark] [--ratio=1.2:1.25] [--base=17:19] [--face=<shelf id>] [--root=.]'); process.exit(1); }
    try {
      // Only a theme in this site's own themes/ — never one in node_modules or inside the binary.
      const dir = join(root, "themes", name);
      // The shelf is imported only when a face is asked for: it carries sixteen fonts.
      const shelf = opt("face") ? await import("@snypd/shelf") : undefined;
      const want = opt("face") ? shelf!.shelfFace(opt("face")!) : undefined;
      if (opt("face") && !want) throw Object.assign(new Error(`no face "${opt("face")}" on the shelf`), { hint: `One of: ${shelf!.loadShelf().faces.map((f) => f.id).join(", ")}.` });
      const r = expandSeed({ seed: opt("seed")!, strategy: opt("strategy") as never, scheme: opt("scheme") as never, ratio: pair("ratio"), base: pair("base"), xHeight: want?.xHeight });
      if (!existsSync(join(dir, "theme.yaml"))) throw Object.assign(new Error(`no theme at ${dir}`), { hint: `\`snypd new theme ${name}\` first; seeding fills a theme, it does not make one.` });
      const got = want ? shelf!.installFace(want.id, dir) : undefined;
      const face = got && { id: got.face.id, font: got.font, stack: got.stack, role: got.face.role, pairsWith: got.face.pairsWith };
      const files = writeSeed(dir, name, r, face).map((f) => relative(root, f));
      const low = (rule: string) => Math.min(...r.report.pairs.filter((p) => p.rule === rule).map((p) => p.ratio)).toFixed(2);
      const say = [`${Object.keys(r.tokens).length} tokens → ${files.join(", ")}`,
        `  text ${low("contrast.text")}:1 · muted ${low("contrast.muted")}:1 · accent ${low("contrast.accent")}:1 · on-accent ${low("contrast.on-accent")}:1 (worst side; the gate asks 4.5)`,
        ...(face ? [`  face ${face.id} (${got!.face.kb} KB, ${face.role}) → ${face.role === "text" ? "font.body" : "font.heading"}; leading.body ${r.tokens["leading.body"]!.default} from its x-height`] : []),
        ...r.report.notes.map((n) => `  ${n}`)];
      const committed = Repo.open(root)?.commit(files, `theme: seed ${name} from ${r.input.seed} (${r.input.strategy})`);
      if (committed?.committed) say.push(`committed ${committed.sha!.slice(0, 8)} on ${committed.branch}`);
      say.push("", `\`snypd check theme ${name}\` judges it; \`snypd shoot --theme=${name}\` photographs it.`);
      console.log(say.join("\n"));
    } catch (e) {
      const err = e as Error & { hint?: string };
      console.error(err.message); if (err.hint) console.error(`↳ ${err.hint}`);
      process.exit(1);
    }
    break;
  }
  /**
   * `snypd check theme|plugin [name|dir] [--all]` (X1, E8) — every rule by name, and exit 1 on a failure
   * so a submission pipeline can be three lines of YAML rather than a reader.
   */
  case "check": {
    const { checkTheme, checkPlugin, formatCheck } = await import("@snypd/render/check");
    const { loadConfig, installedThemes } = await import("@snypd/core");
    const { existsSync } = await import("node:fs");
    const { basename, dirname, join, resolve } = await import("node:path");
    const kind = args[0];
    if (kind !== "theme" && kind !== "plugin") { console.error("usage: snypd check theme|plugin [name|directory] [--all] [--root=.]"); process.exit(1); }
    let root = rest.find((a) => a.startsWith("--root="))?.slice(7) ?? ".";
    let target = args[1];
    // A path is accepted as well as a name, because a theme author's working directory is the theme and
    // not the site. `themes/<name>` and `node_modules/<name>` are how the chain resolver looks for one,
    // so the directory *above* the theme's own is the search root — which is all it needs to be told.
    if (target && existsSync(join(target, kind === "theme" ? "theme.yaml" : "snypd.yaml"))) {
      const dir = resolve(target), up = dirname(dir);
      root = ["themes", "plugins", "node_modules"].includes(basename(up)) ? dirname(up) : up;
      target = basename(dir);
    }
    const cfg = loadConfig(root);
    const names = target ? [target]
      : kind === "theme"
        ? (flags.has("--all") ? installedThemes(root, cfg.config.theme.use).map((t) => t.name) : [cfg.config.theme.use])
        : cfg.plugins.map((p) => p.entry);
    if (!names.length) { console.log(`nothing to check: this site names no plugins`); break; }
    let bad = 0;
    for (const n of names) {
      const r = kind === "theme" ? await checkTheme(root, n) : await checkPlugin(root, n);
      console.log(formatCheck(r));
      if (!r.ok) bad++;
      if (names.length > 1) console.log("");
    }
    if (bad) { console.error(`${bad} of ${names.length} did not pass`); process.exit(1); }
    break;
  }
  /**
   * `snypd cards [root] [--force]` (S36): a share card per page in the site's theme, and the icons from
   * `site.icon` — PNGs under `content/media/cards/` and `content/media/icons/`, to commit. Needs Chrome
   * on this machine and never on the host; says so and exits 1 when there is none.
   */
  case "shoot": {   // docs/29 TF2: every candidate × route × width × scheme, and one contact sheet
    const { shoot, formatShoot } = await import("@snypd/bench");
    // A flag it does not know is refused before anything runs: `shoot` clears its `--out`, and a
    // `--help` read as "no options" once photographed a whole site into the default directory.
    const SHOOT_USAGE = "usage: snypd shoot [root] [--theme=a,b/variation] [--route=/x/,…] [--width=390,768,1280,1440] [--scheme=both|light|dark] [--out=shots]";
    const unknown = [...flags].filter((f) => !/^--(theme|route|width|scheme|out)=/.test(f));
    if (unknown.length) { console.error(unknown.some((f) => f === "--help" || f === "-h") ? SHOOT_USAGE : `${unknown.join(" ")}: not a shoot option\n${SHOOT_USAGE}`); process.exit(unknown.every((f) => f === "--help") ? 0 : 2); }
    const opt = (n: string) => [...flags].find((f) => f.startsWith(`--${n}=`))?.slice(n.length + 3);
    const list = (n: string) => opt(n)?.split(",").map((x) => x.trim()).filter(Boolean);
    const scheme = opt("scheme");
    if (scheme !== undefined && !["light", "dark", "both"].includes(scheme)) { console.error(`--scheme=${scheme}: light, dark or both`); process.exit(2); }
    const widths = list("width")?.map(Number);
    if (widths?.some((w) => !Number.isInteger(w) || w < 200 || w > 3000)) { console.error(`--width=${opt("width")}: whole pixels, 200–3000`); process.exit(2); }
    let r;
    try {
      r = await shoot({ root: args[0], themes: list("theme"), routes: list("route"), widths, scheme: scheme as "light" | "dark" | "both" | undefined, out: opt("out"),
        onCandidate: (c, i, n) => console.error(`${i}/${n} ${c.slug}`) });
    } catch (e) {
      const err = e as Error & { hint?: string };
      console.error(err.message); if (err.hint) console.error(`↳ ${err.hint}`);
      process.exit(1);
    }
    console.log(formatShoot(r));
    if (r.skipped) process.exit(1);
    break;
  }
  case "cards": {
    const { drawCards } = await import("@snypd/bench");
    const root = args[0] ?? ".";
    const r = await drawCards(root, { force: flags.has("--force"), onCard: (route, state) => { if (state === "drawn") console.log(`  drew ${route}`); } });
    if (r.skipped) { console.error(`snypd cards: ${r.skipped}`); process.exit(1); }
    console.log(`cards: ${r.drawn.length} drawn, ${r.kept.length} unchanged${r.removed.length ? `, ${r.removed.length} removed` : ""} → content/media/cards/`);
    if (r.icons.length) console.log(`icons: ${r.icons.join(", ")}`);
    else console.log("icons: none — set `site.icon` to an SVG under /media/ (the `site-basics` prompt draws one)");
    console.log("commit content/media/cards and content/media/icons: the host serves them and never needs a browser");
    break;
  }
  // S18d′: a distributed binary is asked "which one is this?" by bug reports, package managers and
  // agents alike, and until now nothing answered. The import is lazy for the same reason every other one
  // here is (decision 49): `--version` must not put a module on the path `initialize` pays for.
  case "--version": case "-v": case "version": {
    const { version } = await import("../package.json");
    console.log(version);
    break;
  }
  default:
    console.log([
      "usage: snypd <init|dev|serve|build|cards|shoot|bench|new|seed|check> [--version]",
      "",
      "  snypd init [dir] [--name=…] [--url=…] [--host=cloudflare|vercel|none]   scaffold a site (making dir if needed), Cloudflare config by default",
      "  snypd dev [root] [--port=N] [--host=H] [--no-open] [--reload=N|--no-reload]   the Desk and the site with drafts in it, for a person",
      "  snypd serve [root]                                                    MCP on stdio — what your harness spawns, not what you type",
      "  snypd build [root] [--drafts] [--verbose]                             content → dist/; --drafts (or a build of snypd/drafts) is a noindex preview",
      "  snypd shoot [root] [--theme=a,b/variation] [--route=/x/,…] [--width=390,768,1280,1440] [--scheme=both|light|dark] [--out=shots]   photograph themes on every route; contact sheet (needs Chrome)",
      "  snypd cards [root] [--force]                                          share cards per page + icons from site.icon, in the theme (needs Chrome)",
      "  snypd bench [agent [--driver=claude:<model>]|writes [--models=a,b] [--topics=N|A-B] [--merge]|gallery [--out=dir] [--only=a,b] [--scheme=light|dark|both]|report [bench/latest.md] [--out=file]|onboard|page|visual|suggest [--facts [--shape=X]]|compare]",
      "  snypd new theme|plugin <name> [--extends=base]                        scaffold one, in themes/ or plugins/",
      "  snypd seed <theme> --seed=<colour> [--strategy=…] [--scheme=…] [--ratio=1.2:1.25] [--base=17:19] [--face=<shelf id>]   a readable palette + fluid type into a theme's tokens",
      "  snypd check theme|plugin [name|dir] [--all]                            judge one by rule — what the shelf runs",
      "  snypd config [root] [path] · snypd lint [root|file.md]                debugging aids",
      "",
      "Writing is over MCP and only over MCP: start with `snypd init`, restart your harness, then ask it.",
    ].join("\n")); process.exit(cmd ? 1 : 0);
}
}
main();
export {};
