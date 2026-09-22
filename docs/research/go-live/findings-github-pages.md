# Findings: can snypd deploy to GitHub Pages today?

**22 Sep 2026 · read of the tree at `tf-theme-factory` (b8efa11), main 245f293 · evidence with file:line**

## Verdict

**Almost.** A build of a snypd site deploys to GitHub Pages unchanged **if it is served at the root** (`<owner>.github.io` or a custom domain). Under a project path (`/<repo>/`) every internal link breaks, because the renderer has no notion of a base path. Everything else Pages needs is already in `dist/`.

## What already works on Pages

| Need | Evidence | Status |
|---|---|---|
| A 404 page | `deploy.ts:145` — "dist/404.html … which every build writes" | ✅ Pages serves `404.html` with a 404 status |
| Redirects without a server | `emit.ts:205–215` — `_redirects` **plus** one meta-refresh page per entry (`<meta http-equiv="refresh">`, canonical, noindex) | ✅ Pages ignores `_redirects`, serves the pages |
| Cache policy | `emit.ts:105–113` — `_headers` marks `/assets/*` immutable; assets are versioned by `?v=` | ✅ ignored by Pages, harmless: `?v=` busts the 10-min default |
| A workflow in the repo | `deploy.ts:160` — `.github/workflows/snypd.yml` written on `--deploy`; lint + build + bench on PR and push to main, pinned `npx -y @snypd/cli@<v>` | ◐ exists; lacks a Pages deploy job (`configure-pages` → `upload-pages-artifact` → `deploy-pages`, `pages: write` + `id-token: write`) |
| Deploy targets | `deploy.ts:44` — `DEPLOY_TARGETS = ["cloudflare", "vercel"]` | ◐ add `github`; the module already refuses unknown targets with the contract in the message (`deploy.ts:100`) |
| Push preconditions | `push.ts:119–126` — refuses with "Create an empty repo on GitHub, then: git remote add origin …" | ◐ the refusal already describes the manual half of what `connect` would do |
| Placeholder URL | `config.ts:637–645` — `site.url` is judged by `new URL(url).hostname` only | ◐ a URL with a path (`https://o.github.io/repo`) passes the check but is not used as a path |
| Jekyll | — | ✅ not run on a workflow deploy; no `.nojekyll` needed |

## What does not work

**No base path.** Grepped `packages/core/src`, `packages/render/src`, `packages/cli/src` for `basePath`, `pathname`, `new URL(`: the only hits are the config-inheritance `basePath` (a YAML path, unrelated, `config.ts:478`) and the hostname check above. Emitted hrefs are root-absolute — `/posts/x/`, `/assets/theme.css?v=…`, `/media/…`, the feed, sitemap, JSON-LD `@id`s, the twins, canonicals, the meta-refresh targets. At `https://owner.github.io/repo/` each of those resolves against the account root and 404s.

Fix shape: `site.url` may carry a path; one prefixing helper on the emit path; `dist/` layout unchanged (Pages mounts the artifact at the path); a bench row that builds under `/repo/` and fails on any unprefixed root-absolute href. Estimate 2–3 days with tests. Independent of Pages — any subpath host has the same bug.

## Constraints from the host, not from us

- Free account → **public repo** required for Pages. `connect` must say so before creating the repo, and point private sites at `--host=cloudflare`.
- `gh` is a prerequisite (no `npx` equivalent). Preflight prints the platform's install line.
- Deploy latency ~1–2 min via Actions; the agent's answer must say so; `site › status` should read `gh run list`.
- Soft limits: 100 GB/month, 1 GB site, 10 deploys/hour. A blog never meets them; a page with a 45-s film per post could meet the first.
- No `Accept:` negotiation — nothing in the build depends on it; twins are path-based (`index.md` beside `index.html`).

## What this buys

Same five actions removed as the Cloudflare-CLI route (URL, repo, remote, push, dashboard), but: the URL is known **before** any deploy (`html_url` from `gh api repos/{o}/{r}/pages`), "snypd never talks to a host" stays literally true (decision 221 unnecessary), and the backup-on-GitHub step is the same step. **Two human actions for a developer with `gh` already logged in; three otherwise.**

## Sessions

P1 base path (23–25 Sep) · P2 `--host=github` default + deploy job (25) · P3 `site › connect` (26–29) · P4 `site › domain` + `status` (30 Sep–1 Oct) · P5 bench `onboard.live` (1–2 Oct) · P6 front door + film's last beat (2–4 Oct).

## Decisions needed

1. Pages as the default host for a new site.
2. Base-path support in the renderer (recommend yes — it is a correctness gap either way).
3. Offer `<owner>.github.io` when free (recommend yes, as an offer).
4. `connect` runs `gh` itself, like `push` runs git (recommend yes — so the bench measures the count, not the agent).
