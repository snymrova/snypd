/**
 * A headless-Chrome driver over the DevTools protocol, written the way `@snypd/mcp` writes JSON-RPC:
 * one small transport file with no SDK behind it (docs/07 decision 11 — the same instinct that kept the
 * MCP SDK's 140 ms off the `initialize` path keeps 100+ packages of puppeteer out of a bench harness).
 * CDP is a WebSocket carrying `{id, method, params, sessionId}` and events with no `id`; that is the whole
 * protocol, and Bun ships a WebSocket. Chrome itself is a *dev* dependency of the machine, never of the
 * binary: `snypd bench page` is the only caller and it says so when Chrome is missing.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Where Chrome usually is. `SNYPD_CHROME` wins, then the platform's usual paths. */
export const CHROME_PATHS = [
  process.env.SNYPD_CHROME,
  "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
].filter(Boolean) as string[];

export function findChrome(): string | undefined { return CHROME_PATHS.find((p) => existsSync(p)); }

interface Pending { resolve: (v: unknown) => void; reject: (e: Error) => void }
type Listener = (params: Record<string, unknown>, sessionId?: string) => void;

/** One attached page. `send` is scoped to its session, so a caller never carries the id around. */
export interface Page {
  send<T = Record<string, unknown>>(method: string, params?: Record<string, unknown>): Promise<T>;
  on(method: string, fn: Listener): void;
  /** Resolves on the next occurrence of `method`, or rejects after `ms`. */
  once(method: string, ms?: number): Promise<Record<string, unknown>>;
  close(): Promise<void>;
}

export interface Browser { page(): Promise<Page>; close(): void; version: string }

/** Launch headless Chrome and connect. Throws with an actionable message when Chrome is not installed. */
export async function launch(opts: { timeoutMs?: number } = {}): Promise<Browser> {
  const bin = findChrome();
  if (!bin) throw new Error(`no Chrome found (looked in ${CHROME_PATHS.join(", ")}) — install one or set SNYPD_CHROME`);
  const profile = mkdtempSync(join(tmpdir(), "snypd-cdp-"));
  const proc = Bun.spawn([bin,
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-extensions", "--disable-background-networking", "--mute-audio", "--hide-scrollbars",
    "--window-size=1280,900", "about:blank",
  ], { stdout: "ignore", stderr: "pipe" });

  // Chrome prints `DevTools listening on ws://…` to stderr once the debugging socket is up.
  const wsUrl = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Chrome did not print a DevTools URL in 15 s")), opts.timeoutMs ?? 15_000);
    (async () => {
      let buf = "";
      for await (const chunk of proc.stderr as ReadableStream<Uint8Array>) {
        buf += new TextDecoder().decode(chunk);
        const m = buf.match(/ws:\/\/[^\s]+/);
        if (m) { clearTimeout(timer); resolve(m[0]); return; }
      }
      clearTimeout(timer); reject(new Error("Chrome exited before printing a DevTools URL"));
    })().catch(reject);
  });

  const ws = new WebSocket(wsUrl);
  await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error(`cannot connect to ${wsUrl}`)); });
  let nextId = 1;
  const pending = new Map<number, Pending>();
  const listeners = new Map<string, Set<Listener>>();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(String(ev.data)) as { id?: number; result?: unknown; error?: { message: string }; method?: string; params?: Record<string, unknown>; sessionId?: string };
    if (msg.id !== undefined) {
      const p = pending.get(msg.id); if (!p) return;
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${msg.error.message}`)); else p.resolve(msg.result);
      return;
    }
    if (msg.method) for (const fn of listeners.get(msg.method) ?? []) fn(msg.params ?? {}, msg.sessionId);
  };
  const call = <T,>(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<T> => {
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      ws.send(JSON.stringify({ id, method, params: params ?? {}, ...(sessionId ? { sessionId } : {}) }));
    });
  };

  const version = await call<{ product?: string }>("Browser.getVersion").then((v) => v.product ?? "unknown").catch(() => "unknown");
  const close = () => { try { ws.close(); } catch {} proc.kill(); rmSync(profile, { recursive: true, force: true }); };

  return {
    version,
    close,
    async page(): Promise<Page> {
      const { targetId } = await call<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await call<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
      const scoped = (fn: Listener): Listener => (params, sid) => { if (sid === sessionId) fn(params, sid); };
      // Every listener this page adds, so closing it takes them with it: a suite that measures six routes
      // would otherwise leave six sets of network handlers running against a browser that is still open.
      const mine: Array<[string, Listener]> = [];
      return {
        send: (method, params) => call(method, params, sessionId),
        on(method, fn) { const s = listeners.get(method) ?? new Set(); const l = scoped(fn); s.add(l); mine.push([method, l]); listeners.set(method, s); },
        once(method, ms = 10_000) {
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`timed out waiting for ${method}`)), ms);
            const s = listeners.get(method) ?? new Set<Listener>();
            const fn: Listener = (params, sid) => { if (sid !== sessionId) return; clearTimeout(timer); s.delete(fn); resolve(params); };
            s.add(fn); listeners.set(method, s);
          });
        },
        async close() { for (const [m, l] of mine) listeners.get(m)?.delete(l); await call("Target.closeTarget", { targetId }).catch(() => {}); },
      };
    },
  };
}
