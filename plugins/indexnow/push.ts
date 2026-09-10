/**
 * `push`: after the branch is sent, tell IndexNow which pages changed (docs/10 §4.5, §4.8).
 *
 * The payload already says which content files the sent commits touched and what URLs those are —
 * created, changed and deleted alike; IndexNow takes a removed URL as a removal. Nothing to name means
 * nothing is sent, and the message says which of the two reasons that was. The POST goes through
 * `ctx.fetch`, the allowlisted one, so a `endpoint` option naming a host outside the manifest's
 * `network:` is refused before a byte leaves — and that refusal is this handler's failure line.
 *
 * `{ ok: false }` on a non-2xx: the words are on `main` regardless, and the line says what the engine
 * answered. The one answer worth a hint is the key not being verifiable yet — the key file is emitted
 * by this plugin, so the site has to have been built and pushed with it once before a ping can pass.
 */
import type { EventHandler } from "@snypd/core";

interface Options { key: string; endpoint?: string }

const push: EventHandler<"push"> = async (payload, ctx) => {
  const o = ctx.options as unknown as Options;
  if (!payload.urls.length) return { ok: true, message: payload.sent ? "nothing to ping — the push carried no content change" : "nothing to ping — the remote already had everything" };
  const endpoint = o.endpoint ?? "https://api.indexnow.org/indexnow";
  const siteUrl = ctx.site.url.replace(/\/+$/, "");
  const urlList = payload.urls.slice(0, 10_000);   // the protocol's ceiling per request
  const body = { host: new URL(siteUrl).host, key: o.key, keyLocation: `${siteUrl}/indexnow/${o.key}.txt`, urlList };
  const res = await ctx.fetch(endpoint, { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body) });
  const n = urlList.length, urls = `${n} URL${n === 1 ? "" : "s"}`;
  const engine = new URL(endpoint).host;
  if (res.ok) return { ok: true, message: `pinged ${engine} with ${urls} (${res.status})` };
  const hint = res.status === 403 || res.status === 422 ? ` — the key was not verified; ${body.keyLocation} has to be live first, and it is emitted by this plugin, so build and push once with it enabled` : res.status === 429 ? " — too many requests; the next push tries again" : "";
  return { ok: false, message: `${engine} answered ${res.status}${res.statusText ? ` ${res.statusText}` : ""} for ${urls}${hint}` };
};

export default push;
