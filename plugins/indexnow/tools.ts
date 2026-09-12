/**
 * `indexnow › ping` — tier 4 (P4, docs/10 §4.2, §4.5).
 *
 * The `push` event pings what a push changed, and it never retries: "no retries in 0.x; a plugin that
 * needs one exposes a tool to run again". This is that tool, and it is the Tier 4 proof for exactly that
 * reason — the retry an agent performs is better than the retry a plugin performs quietly, because the
 * agent is the one who knows whether the last answer mattered.
 *
 * It sends the whole site by default rather than a remembered list. A remembered list would be a second
 * source of truth about what this site publishes, kept in a file nobody reads, and wrong the moment a
 * post is unpublished; every page of the site is a read that cannot go stale. `urls` narrows it when the
 * agent knows better.
 *
 * Reads are not here — `snypd://indexnow/last` is what this plugin said the last few times it reacted,
 * and a resource costs nothing until something reads it (docs/07 decision 38).
 */
import type { PluginToolsModule } from "@snypd/core";

interface Options { key: string; endpoint?: string }

/** A host IndexNow cannot fetch a key file from is a host it will refuse, so the refusal happens here with the remedy in it. */
const unreachable = (host: string) =>
  host === "localhost" || host.startsWith("localhost:") || host === "127.0.0.1" || host.startsWith("127.0.0.1:") || host.endsWith(".local") || host === "0.0.0.0";

export default {
  description: "Submit this site's URLs to IndexNow, the protocol Bing, Yandex, Seznam and Naver share — the same ping a push sends, run again on demand. Use it when a push reported the ping failed, when the key file has only just gone live, or after a change that did not come through a push at all. Nothing is written: this tells search engines to re-crawl pages that already exist.",
  keywords: ["indexnow", "ping", "search engine", "search engines", "submit", "resubmit", "reindex", "recrawl", "crawl", "index", "bing", "yandex", "seznam", "naver", "sitemap ping", "seo", "notify"],
  actions: [
    { name: "ping",
      description: "sends the site's URLs to the IndexNow endpoint and reports what it answered",
      input: {
        urls: { type: "array", items: { type: "string" }, description: "`ping`: the pages to submit — absolute URLs, or routes like `/posts/a` which are resolved against site.url. Omit it to submit every page this site publishes" },
      },
      async run(args, ctx) {
        const o = ctx.options as unknown as Options;
        const endpoint = o.endpoint ?? "https://api.indexnow.org/indexnow";
        const siteUrl = ctx.site.url.replace(/\/+$/, "");
        const host = new URL(siteUrl).host;
        if (unreachable(host))
          return { ok: false, message: `site.url is ${ctx.site.url}, which no search engine can reach — IndexNow verifies a key file over HTTP, so this needs the site's real origin first (\`site\` › set_config \`site.url\`)` };

        const given = Array.isArray(args.urls) ? args.urls.filter((u): u is string => typeof u === "string" && !!u.trim()) : undefined;
        const urlList = (given?.length
          ? given.map((u) => (/^https?:\/\//i.test(u) ? u : `${siteUrl}/${u.replace(/^\/+/, "")}`))
          : ctx.pages().map((p) => p.url)
        ).slice(0, 10_000);   // the protocol's ceiling per request
        if (!urlList.length) return { ok: false, message: "nothing to submit — this site publishes no pages yet" };

        const keyLocation = `${siteUrl}/indexnow/${o.key}.txt`;
        const body = { host, key: o.key, keyLocation, urlList };
        const engine = new URL(endpoint).host;
        const n = urlList.length, urls = `${n} URL${n === 1 ? "" : "s"}`;
        let res: Response;
        try { res = await ctx.fetch(endpoint, { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body) }); }
        catch (e) { return { ok: false, message: `${engine} could not be reached for ${urls}: ${(e as Error).message}` }; }

        const data = { endpoint, engine, host, keyLocation, submitted: n, status: res.status, urls: urlList.slice(0, 20) };
        if (res.ok) return { ok: true, message: `pinged ${engine} with ${urls} (${res.status})${given?.length ? "" : " — every page this site publishes"}`, data };
        const hint = res.status === 403 || res.status === 422
          ? ` — the key was not verified; ${keyLocation} has to be live first, and it is emitted by this plugin, so build and push once with it enabled`
          : res.status === 429 ? " — too many requests; wait and run it again" : "";
        return { ok: false, message: `${engine} answered ${res.status}${res.statusText ? ` ${res.statusText}` : ""} for ${urls}${hint}`, data };
      } },
  ],
} satisfies PluginToolsModule;
