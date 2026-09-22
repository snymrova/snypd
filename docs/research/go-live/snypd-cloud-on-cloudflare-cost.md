# snypd cloud on Cloudflare: what it would cost per client

**22 Sep 2026 · research, not a plan · prices read from developers.cloudflare.com today (links at the end); the one number Cloudflare says it is not yet billing is marked ⚠**

## The one-line answer

Hosting a client's site on our own Cloudflare-based cloud costs **about $0.15 a month for a typical blog, under $1 for an agency site with media, and $5–7 for a heavy site with ten million requests** — on top of a fixed **$5–30 a month** for the account. Bandwidth is free on Cloudflare, and that single fact is why the number is a fraction of what the same site costs on Vercel or Netlify, where egress dominates. At a thousand clients the whole bill is on the order of **$600 a month**.

The cost is not the reason to do or not do it. The ops — abuse, takedowns, billing, support — are. This document prices the metal; the earlier roadmap doc lists the nine capabilities the cloud would buy.

---

## 1. What "everything snypd handles" means, on Cloudflare

| Job | Cloudflare piece | Notes |
|---|---|---|
| A site's `dist/` at a URL | **R2** for the files, **one router Worker** that maps hostname → site → version and serves from R2 through the edge cache | Alternative: Workers for Platforms, one user Worker per site with static assets (§4) |
| `<name>.snypd.site` | one zone, wildcard DNS, universal SSL | the zone can sit on the **Free** plan |
| Custom domains | **Cloudflare for SaaS** custom hostnames — the client points a CNAME, Cloudflare issues the cert | 100 included on every plan, $0.10/hostname/month after |
| Deploy from the agent | the MCP's `site › deploy` uploads to an HTTPS endpoint the Worker exposes; versions are R2 prefixes, so rollback is a pointer change | no git required; git-mode stays possible |
| Drafts preview, approval from a phone | the drafts build is another version prefix at `preview-<token>.snypd.site`; approval is a signed link | — |
| Accounts, sites, versions, approvals | **D1** | tiny tables |
| Forms (`form` primitive) | the Worker + D1, email through a provider | the fourteenth primitive gets a home |
| First-party 0 KB analytics | **Workers Analytics Engine**, one data point per request from the Worker | ⚠ not billed yet |
| `Accept: text/markdown`, real redirects, cache headers, 404 status | the Worker, trivially | the README's twin story becomes true everywhere |
| Scheduled publish, IndexNow | Cron Triggers, `fetch` | included |
| Billing | Stripe | 2.9 % + 30 ¢ per charge |

---

## 2. The prices (verbatim, 22 Sep 2026)

| Item | Price |
|---|---|
| Workers Paid | **$5/month**; 10 M requests included, **+$0.30 per additional million**; 30 M CPU-ms included, +$0.02/M |
| Workers static-asset requests | **free and unlimited** (applies when a site is its own Worker with assets; a router Worker reading R2 is a normal request) |
| Workers for Platforms | **$25/month**; 20 M requests, 1 000 scripts, 60 M CPU-ms included; +$0.30/M requests, **+$0.02 per additional script** |
| R2 storage | **$0.015/GB-month**; Class A (writes) **$4.50/M**; Class B (reads) **$0.36/M**; **egress free**; free tier 10 GB, 1 M A, 10 M B per month |
| Cloudflare for SaaS custom hostnames | **100 included** (Free, Pro, Business); **$0.10 per additional hostname/month** |
| D1 | 25 B rows read and 50 M rows written included on Paid; 5 GB included; effectively $0 at our scale |
| Workers Analytics Engine | 10 M data points/month included, +$0.25/M; 1 M queries included, +$1/M — ⚠ "you will not be billed" today |
| Zone / DNS / SSL for `snypd.site` | $0 on the Free plan; the domain itself ~$10–30/year at registrar cost |
| Email (approval links, form notifications) | Resend or similar: 3 000/month free, then ~$20/month |

---

## 3. Three client profiles

Assumptions: 3 requests per pageview after the edge cache (HTML + one CSS + one font or image miss); a deploy writes every file (Class A); analytics one data point per request.

| | **Blog** | **Agency site** (Ferrule-shaped) | **Heavy** (media-rich, popular) |
|---|---|---|---|
| Pageviews / month | 20 000 | 200 000 | 3 000 000 |
| Requests / month | 60 k | 1 M | 10 M |
| `dist/` size | 50 MB | 2 GB | 20 GB |
| Deploys / month × files | 30 × 200 | 100 × 500 | 100 × 2 000 |
| Custom domain | 1 | 1 | 2 |
| **Requests** @ $0.30/M | $0.02 | $0.30 | $3.00 |
| **R2 storage** @ $0.015/GB (×2 for a kept previous version) | $0.00 | $0.06 | $0.60 |
| **R2 writes** @ $4.50/M | $0.03 | $0.23 | $0.90 |
| **R2 reads** @ $0.36/M (cache misses ≈ 20 % of requests) | $0.00 | $0.07 | $0.72 |
| **Hostnames** @ $0.10 (beyond the first 100 across all clients) | $0.10 | $0.10 | $0.20 |
| **Analytics** @ $0.25/M ⚠ | $0.02 | $0.25 | $2.50 |
| **Per client, per month** | **≈ $0.17** | **≈ $1.00** | **≈ $7.90** |
| Same site on a per-GB-egress host (≈ $0.15/GB, 3 GB / 60 GB / 900 GB) | ≈ $0.45 | ≈ $9 | ≈ $135 |

The last row is the argument for Cloudflare specifically: egress is the cost that scales with success everywhere else, and it is zero here.

---

## 4. The bill at scale

Mix: 80 % blogs, 15 % agency, 5 % heavy. Included tiers (10 M requests, 100 hostnames, 10 GB R2, 10 M data points) absorb the first clients.

| Clients | Variable | Fixed | **Total / month** | **Per client** |
|---|---|---|---|---|
| 10 | ≈ $3 (mostly inside included tiers) | $5 Workers Paid + $2 domain | **≈ $10** | $1.00 |
| 100 | ≈ $60 | $7 | **≈ $70** | $0.70 |
| 1 000 | ≈ $580 | $7 (+$20 email) | **≈ $610** | $0.61 |
| 10 000 | ≈ $5 800 | $27 | **≈ $5 800** | $0.58 |

Per-client cost *falls* with scale only until the included tiers are used up, then flattens at about **60 ¢**, dominated by the 5 % heavy sites. A plan that caps requests on the free tier (say 100 k/month — cost to us ≈ 3 ¢) and meters above it keeps the heavy tail paying for itself.

**Router Worker vs Workers for Platforms.** The table assumes one router Worker reading R2 (every hit is a billed request). With Workers for Platforms — one user Worker per site, static assets attached — asset requests are free, so the requests row drops toward zero and the fixed cost rises to $25/month + $0.02 per site past 1 000. At 1 000 clients that is a wash; at 10 000 heavy-skewed clients it is cheaper. Not a launch decision; the R2 design is the simpler one to build first and the versions/rollback story is cleaner on it.

---

## 5. What the metal price leaves out

These are the real cost of a cloud, and none of them is a Cloudflare line item:

- **Abuse.** `*.snypd.site` is a free hostname for phishing the day it exists. A takedown path, a reporting address, rate limits on account creation, and someone to answer within hours.
- **Billing and tax.** Stripe, invoices, VAT/GST by country, refunds, dunning.
- **Support.** "My domain doesn't work" is a DNS conversation with a person who does not know what DNS is.
- **Data.** A client's content on our storage: backups, export on demand (the no-lock-in promise now has a server side), deletion on request, a privacy policy, a DPA for the EU client.
- **Uptime.** Cloudflare's, mostly — but the router Worker and D1 are ours, and a bad deploy of the router takes every site down at once. Staging, canary, rollback for *our* code.
- **Time.** 6–8 weeks to an MVP (deploy, previews, approvals, custom domains, versions), then a person-week a month forever.

---

## 6. What it means for a price list (a sketch, not a decision)

With cost at 17 ¢ – $1 for 95 % of clients:

| Tier | What | Cost to us | Price |
|---|---|---|---|
| Free | one site, `<name>.snypd.site`, 100 k requests/month, previews | ≈ 3 ¢ | $0 |
| Site | custom domain, unlimited requests within fair use, forms, analytics, rollback | ≈ 20 ¢ – $1 | $6–9/month |
| Studio | ten sites, team approvals, the MCP as a hosted endpoint | ≈ $2–10 | $29–49/month |

Gross margin above 90 % on every paid tier. Vercel Hobby's non-commercial clause and Pages' public-repo requirement are the gaps a Site tier walks into.

**The README sentence stays true**: the binary is free and complete, `snypd build` + any host works, and the cloud sells the nine things a static binary cannot do alone.

---

## Sources (read 22 Sep 2026)

- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/
- https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/platform/pricing/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/analytics/analytics-engine/pricing/
- https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/configuration/static-assets/
