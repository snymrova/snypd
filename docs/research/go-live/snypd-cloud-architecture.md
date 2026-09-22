# snypd cloud — architecture

**Owner:** PM · **Decider:** Sunny · **Written:** 22 Sep 2026 · **Status:** design, for decision · **Builds on:** "snypd cloud on Cloudflare: cost per client" (same day) · **Cloudflare mechanics** checked against developers.cloudflare.com today (sources at the end).

**In one paragraph.** One Cloudflare zone, `snypd.site`. One router Worker on `*/*` that turns a hostname into a site, a site into its active version, a version into a manifest, and a manifest entry into a content-addressed blob in R2 — served through the edge cache. A site is `<name>.snypd.site` the moment it is created; a custom domain is one CNAME the client adds plus one API call we make (Cloudflare for SaaS issues the certificate). Deploys come from the binary over HTTPS: manifest first, only the blobs the server lacks, then a pointer flip — so rollback is a pointer flip too, and a preview is a version that never became the pointer. D1 holds accounts, sites, versions, domains, approvals; KV holds the hot copies the router reads. The binary stays complete without any of this; the cloud is where a site lands when its owner has no host, and where the nine things a static binary cannot do on its own live.

---

## 1. Principles that shape it

1. **`dist/` is the contract.** The cloud serves exactly what `snypd build` wrote. No cloud-only build step, no server-side rendering; a site that leaves takes its `dist/` and its repo and loses nothing but the URL.
2. **The binary is the client.** `site › deploy`, `preview`, `domain`, `rollback`, `status` are MCP actions in the same binary, talking to our HTTPS API. The agent never sees a dashboard; a person sees one page (the Desk, hosted) for the two things a person does — approve and pay.
3. **Zero JS on the page still holds.** Everything the cloud adds — analytics, forms, `Accept` negotiation, redirects — is on the edge, not in the HTML.
4. **Content-addressed everything.** Blobs keyed by SHA-256; a version is a manifest of paths → hashes. Dedup across versions and across sites; a deploy uploads only what changed; rollback costs nothing.
5. **One router, many sites — with a kill switch.** The simplicity of one Worker is also one blast radius; §9 pays for it with staging, gradual rollout and a per-site suspend flag the router checks first.

---

## 2. Components

```
                         ┌──────────────────────── Cloudflare ────────────────────────┐
  reader ──HTTPS──▶ edge cache ──miss──▶ router Worker ──▶ KV (host→site, site→version, manifest)
                                              │                 │
  client's DNS: CNAME ──▶ SaaS custom hostname ┘                 └──▶ R2 blobs/<sha256>
  <name>.snypd.site ──▶ wildcard DNS (originless AAAA 100::) ─┘        │
                                                                        │
  binary (MCP) ──HTTPS──▶ API Worker ──▶ D1 (accounts, sites, versions, domains, approvals, usage)
                                   │──▶ R2 (blob upload, presigned)
                                   │──▶ KV (publish pointers)
                                   │──▶ Cloudflare API (custom hostnames)
                                   └──▶ Analytics Engine (usage), Queue (async: cert polling, emails)
  person ──browser──▶ Desk (hosted at <site>.snypd.site/_snypd and preview hosts)
```

| Component | Role | Cloudflare piece |
|---|---|---|
| **Zone `snypd.site`** | wildcard `*.snypd.site` (Universal SSL covers one label), originless record, SaaS fallback origin | DNS, Free plan |
| **Router Worker** | serve any hostname: lookup, blob fetch, cache, redirects, 404, `Accept`, forms, analytics point, suspend check | Workers Paid, route `*/*` |
| **API Worker** | `/v1/*` — auth, sites, deploys, domains, approvals, usage, export | same account, separate Worker |
| **R2 `blobs`** | content-addressed file bodies | R2 |
| **KV** | `host:<hostname>` → siteId · `site:<id>` → {activeVersion, status} · `manifest:<versionId>` → JSON | KV (reads at the edge, ~ms) |
| **D1** | source of truth: accounts, tokens, sites, versions, domains, approvals, usage rollups, audit | D1 |
| **Queue + Cron** | cert-status polling, usage rollup (daily), emails, garbage collection of unreferenced blobs | Queues, Cron Triggers |
| **Analytics Engine** | one data point per served request (site, path class, status, bytes) | WAE |
| **Cloudflare for SaaS** | custom hostnames + certificates | 100 included, $0.10 each after |
| **Email** | magic links, approval links, form notifications, cap warnings | Resend (or Email Workers) |
| **Stripe** | plans, invoices | external |

---

## 3. Data model (D1)

```
accounts   id, email, created_at, plan, stripe_customer_id
tokens     id, account_id, site_id?, kind(cli|desk), hash, scopes, expires_at, last_used
sites      id, account_id, name(subdomain label), status(active|suspended|deleted), created_at,
           active_version_id, size_cap_bytes, views_cap, settings_json
versions   id, site_id, kind(prod|preview), manifest_hash, file_count, bytes, source(git sha?, snypd version),
           created_at, created_by(token), approved_by?, approved_at?
blobs      sha256 PK, bytes, first_seen, refcount        -- refcount maintained on version create/delete
domains    id, site_id, hostname, cf_custom_hostname_id, status(pending_dns|pending_cert|active|error),
           dcv_method, created_at, verified_at, primary(bool)
approvals  id, site_id, version_id, approver_account_id, decision(approve|reject), note, at
usage_daily site_id, day, requests, bytes, views_estimate
audit      id, account_id, site_id?, action, meta_json, at
```

KV is derived from D1 and rewritten on every state change (a Queue consumer does it, idempotently). The router never touches D1.

Reserved subdomain labels (`www`, `api`, `preview`, `desk`, `mail`, `admin`, `snypd`, profanity list, brand names on request) live in a table too.

---

## 4. Serving a request

```
1. host = request.headers.host (lower-cased)
2. site = KV host:<host>  → miss ⇒ 404 "no site here" (a snypd-styled page, noindex)
3. if site.status ≠ active ⇒ 410 (deleted) / 451 (suspended) static page
4. version = site.activeVersion  (or, for a preview host, the version encoded in the label — §7)
5. path normalisation: /foo → /foo/ (301), /foo/ → foo/index.html; static file paths as-is
6. Accept: text/markdown and manifest has foo/index.md ⇒ serve that, Vary: Accept
7. entry = manifest[path] → miss ⇒ check manifest["_redirects"] (parsed once, cached) ⇒ 301
                            → still miss ⇒ manifest["404.html"] with status 404
8. cache key = sha256 (not the URL): Cache API hit ⇒ return
9. R2 get blobs/<sha256> ⇒ headers from manifest (content-type, immutable for /assets/*, 1 h + SWR for /media/*, revalidate for HTML)
10. writeDataPoint(site, pathClass, status, bytes)   -- Analytics Engine, non-blocking
```

Caching by hash means a rollback or a redeploy of an unchanged file is a cache hit everywhere immediately, and a changed file is a new key — no purges, ever. HTML is served `Cache-Control: no-cache` to browsers but cached at the edge under its hash for as long as the manifest points at it.

**Custom-domain requests** arrive on the same route. Cloudflare for SaaS terminates TLS for the client's hostname and forwards to the fallback origin, which is the originless record on our zone; the Worker on `*/*` sees `host: www.client.com` and step 2 resolves it like any other. (`custom_origin_server` per hostname is bypassed by design when a Worker route matches — we want that.)

---

## 5. Deploying a version

From the binary, `site › deploy` (prod) or `site › preview` (drafts build):

```
1. snypd build → dist/ ; walk it → manifest { "posts/x/index.html": {sha, bytes, type}, … }
   refuse locally if Σ bytes > site.size_cap (the cap is in snypd://cloud, fetched at login)
2. POST /v1/sites/:id/versions  { kind, manifest, source }        → { versionId, missing: [sha…], uploadUrls }
3. PUT each missing blob (R2 presigned, or through the API Worker for < 100 MB total) — parallel, retried
4. POST /v1/sites/:id/versions/:vid/finalize                       → server verifies every sha exists
5. prod: POST …/activate  → D1 active_version_id, KV site:<id> rewritten, audit row
   preview: returns the preview URL; no pointer touched
6. answer to the agent: URL, files changed / unchanged, bytes uploaded, cap headroom
```

Typical second deploy of a blog: 200-file manifest, 3 changed blobs, ~50 KB uploaded, under two seconds. Rollback: `site › rollback [n]` = step 5 with an older version id. Garbage collection: a nightly cron deletes blobs with refcount 0 older than 30 days (versions are kept: last 20 prod + 7 days of previews, configurable per plan).

---

## 6. Subdomains: `<name>.snypd.site`

- Created with the site: `site › connect` asks for nothing if the site's `snypd.yaml` name slugs to a free label; otherwise offers `<name>-<4 chars>` or asks. Label rules: `[a-z0-9-]{3,40}`, not reserved, not a look-alike of a reserved one (`snypd-login`…).
- DNS: one wildcard `*.snypd.site` AAAA `100::` (originless, proxied). Universal SSL covers `*.snypd.site`. No per-site DNS work at all.
- `site.url` is set to `https://<name>.snypd.site` by `connect` — **the URL question is gone**: the feed, sitemap and JSON-LD are absolute from the first build.
- Renames: allowed once per 30 days; the old label 301s to the new one for 90 days (a `host:` entry with a redirect target).
- Second-level labels are not used (`a.b.snypd.site` would need a second wildcard certificate — Advanced Certificate Manager, $10/month, and confuses the reserved-label rules). Previews use `--` inside one label (§7).

---

## 7. Previews and approval from a phone

- `site › preview` uploads the drafts build as a `kind: preview` version and returns `https://<name>--<8 hex of version>.snypd.site`. The router parses `--` and serves that version with `X-Robots-Tag: noindex` and, when the site sets it, a **gate**: a signed cookie set by a magic link emailed to the approvers (no password; the link is the auth). Unauthenticated ⇒ a plain "this is a preview" page with a "send me the link" field.
- The hosted Desk at `…/_snypd` on a preview host shows *what changed against the active version* (manifest diff, rendered as the site's own page) and two buttons: **Approve this version** / **Reject with a note**. Approval writes an `approvals` row.
- The binary's `publishCheck` (today: a human must approve the exact version on `/_snypd`) gains a second source: `GET /v1/sites/:id/approvals?version=<manifest_hash>`. Same rule — that exact version, a person — but the person can be on a phone, and can be someone other than the author. `mcp.write: draft` becomes usable for a team for the first time.
- Preview versions expire after 7 days (plan-dependent); the label stops resolving (410).

---

## 8. Custom domains

The client-side is **one DNS record**; the rest is ours.

```
site › domain add www.client.com
  1. API: POST /v1/sites/:id/domains  → D1 row pending_dns
  2. API → Cloudflare: POST /zones/{zone}/custom_hostnames { hostname, ssl: { method: "http", type: "dv" } }
  3. answer to the agent: "Add this record at your DNS:  www.client.com  CNAME  <name>.snypd.site
     then say 'check the domain' — or I'll check every minute for an hour."
  4. Queue job polls GET custom_hostnames/{id}: status → active, ssl.status → active
     (HTTP DCV succeeds automatically once the CNAME resolves through us; no TXT record needed)
  5. on active: KV host:www.client.com → siteId ; D1 domain.status=active ; if primary:
     site.url ← https://www.client.com, the agent rebuilds and redeploys (canonical, feed, sitemap move);
     <name>.snypd.site now 301s to the domain (a host: entry with redirect)
```

**The apex problem, stated honestly.** Cloudflare for SaaS routes by CNAME. A bare `client.com` cannot carry a CNAME in standard DNS; Cloudflare's "apex proxying" for SaaS is Enterprise-only. So:

| Client's DNS | What works |
|---|---|
| Supports ALIAS / ANAME / CNAME flattening at the apex (Cloudflare DNS, Route 53 alias, DNSimple, Porkbun, Namecheap ALIAS, DNS Made Easy…) | `client.com ALIAS <name>.snypd.site` — works like any hostname |
| Does not (many registrars' default DNS) | `www.client.com CNAME …` as primary, and the registrar's URL-forwarding from `client.com` → `https://www.client.com` — the agent says exactly this, and `domain status` reports which case it detected |
| Wants it all fixed | move the zone's DNS to Cloudflare (free) — the agent can print the steps; never required |

`domain add client.com` therefore defaults to adding **both** `client.com` and `www.client.com`, marks `www` primary unless the apex resolves through us, and says why.

**Removal / transfer.** `domain remove` deletes the custom hostname (cert revoked by Cloudflare), the KV entry, the row; `site.url` falls back to the subdomain and the agent rebuilds. A hostname already claimed by another site is refused with "that domain is attached to another snypd site; its owner must remove it first" — Cloudflare enforces uniqueness per zone anyway.

**Wildcard and second-level client domains** (`*.client.com`, `blog.docs.client.com`): the first is not supported (their cert would be ours to buy); the second is just a hostname and works.

---

## 9. Multi-tenancy, safety, abuse

- **Isolation** is by data, not by process: the router has no tenant-specific code; a request can only ever read the manifest its hostname resolves to and blobs that manifest names. Blob keys are hashes, unguessable in practice, and the router never lists R2.
- **Kill switch:** `sites.status = suspended` → KV → 451 page within seconds. `POST /v1/admin/suspend` is behind a separate admin token and logs to `audit`.
- **Signup:** email magic link + Turnstile; one free site per verified email; a new account's first deploy is rate-limited (5/hour) and scanned: HTML that contains a login form posting off-site, or a known brand name in `<title>` on a free subdomain, goes to a review queue before activation. Cheap, catches the phishing that `*.snypd.site` invites on day one.
- **Reporting:** `abuse@snypd.site` and a `/report` form on the 404/451 pages; SLA one business day; DMCA path documented.
- **Caps** (from the cost doc): size at upload (hard); views from a daily Analytics Engine rollup into `usage_daily` (soft): email at 80 % and 100 %, keep serving to 3×, then the static "over the limit" page with the owner's upgrade link — never a broken site at 10 001.
- **Blast radius of the router:** two zones (`snypd-staging.site` mirrors everything); Workers gradual deployments (5 % → 50 % → 100 % over an hour, error-rate gated); `wrangler rollback` for our code; the router reads only KV and R2, so a D1 outage stops deploys but never serving.
- **Secrets:** the Cloudflare API token (custom hostnames) lives only in the API Worker's secrets; the router has none.

---

## 10. Accounts and tokens

- `snypd login` (CLI) / `site › connect` (MCP): device flow — the binary prints a URL + code, the person approves in a browser once, the binary stores a scoped token in the OS keychain (`~/.config/snypd/cloud.json` fallback, 0600). Tokens are per account with an optional site scope; the MCP uses a site-scoped one after `connect` so a compromised repo can only redeploy that site.
- Two people on a site: the owner invites by email; the invitee's token gets `deploy` and/or `approve` scopes. The "second person has no MCP" gap (docs/08 §12.8) closes without the cloud being an MCP endpoint yet — that is a later phase.
- The hosted Desk is the only browser surface: sign in (magic link), sites list, usage, domains status, approvals, billing. No content editing — content is the agent's, in the repo.

---

## 11. Export and leaving

`site › export` → a tarball of the active version's files (it *is* `dist/`) plus `versions.json`; `site › delete` → 410 for 30 days, then rows and unreferenced blobs go. The repo was always theirs. This is the sentence that keeps "no lock-in" honest with a server in the picture: **the cloud holds a copy of something the person already has.**

---

## 12. The MCP surface it adds

Found through `find_tools` like today's `site`, so the per-turn cost stays 2 230 tokens:

```
site › connect            login if needed, create the site, claim <name>.snypd.site, set site.url
site › deploy             build, upload changed blobs, activate; answers URL + headroom
site › preview            same, kind=preview; answers the preview URL
site › rollback [n]       pointer flip to a previous prod version
site › domain add|status|remove <hostname>
site › status             active version, last deploy, domains, cert state, cap headroom
site › usage              last 30 days from usage_daily
site › export             tarball URL (signed, 1 h)
resource snypd://cloud    plan, caps, sites, what the agent may do without asking
```

`publishCheck` learns approvals from the cloud (§7). `deploy.push: human` keeps its meaning: the Desk's button (hosted now) does the activate; the agent may only preview.

---

## 13. Build order

| # | Phase | Delivers | Weeks |
|---|---|---|---|
| C1 | Serve | zone, wildcard, router Worker, R2, KV, manifests; a site uploaded by hand is live at `<name>.snypd.site` with cache-by-hash, redirects, 404, `Accept` | 1 |
| C2 | Deploy | API Worker, D1 schema, versions/blobs/finalize/activate, `site › deploy` + `rollback` + `status` in the binary | 1.5 |
| C3 | Accounts | device-flow login, tokens, scopes, `site › connect`, hosted Desk sign-in + sites list | 1 |
| C4 | Previews + approval | `--` hosts, gate by magic link, manifest diff on the Desk, `publishCheck` reads approvals | 1 |
| C5 | Domains | SaaS custom hostnames, polling queue, apex handling, `site › domain *` | 1 |
| C6 | Caps + usage | Analytics Engine points, daily rollup, emails, over-limit page | 0.5 |
| C7 | Safety | suspend, signup limits, first-deploy scan, report path, staging zone, gradual rollout | 1 |
| C8 | Billing | Stripe, plans, the paid tier's caps | 1 |
| | | | **≈ 8** |

C1–C2 are a weekend's proof if we want to feel it before committing; C1–C5 is the product; C6–C8 is what makes it safe to announce.

---

## 14. Decisions asked

1. **Router + R2 (this design) vs Workers for Platforms** (one Worker per site, free asset requests, $25/month + $0.02/site past 1 000). Recommendation: router + R2 — one code path, versions and dedup fall out of it, and the cost difference is nil under 10 000 sites.
2. **Previews gated by default, or open-by-obscurity?** Recommendation: open (noindex) by default on free, gate as a setting — the gate is a real feature for teams and friction for a solo blogger.
3. **Apex policy:** `www` primary unless the apex flattens — or refuse apex outright and say "use www"? Recommendation: the table in §8; refusing loses the Cloudflare-DNS users who could have had the apex.
4. **When.** After launch (6 Oct) — the cost doc and this one are the case; the signal to start is the first ten people asking where the site should go.

---

## Sources (22 Sep 2026)

- https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/getting-started/ — fallback origin must be proxied; customer CNAME; "using an A record to point to the target is not a supported setup", apex needs apex proxying
- https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/worker-as-origin/ — originless `AAAA 100::` fallback, route `*/*`, per-hostname routing inside the Worker, `custom_origin_server` bypassed
- https://developers.cloudflare.com/workers/platform/pricing/ · https://developers.cloudflare.com/r2/pricing/ · https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/ · https://developers.cloudflare.com/d1/platform/pricing/ · https://developers.cloudflare.com/analytics/analytics-engine/pricing/
