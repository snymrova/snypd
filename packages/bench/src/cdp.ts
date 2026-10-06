/**
 * A headless-Chrome driver over the DevTools protocol, written the way `@snypd/mcp` writes JSON-RPC:
 * one small transport file with no SDK behind it (docs/07 decision 11 — the same instinct that kept the
 * MCP SDK's 140 ms off the `initialize` path keeps 100+ packages of puppeteer out of a bench harness).
 * CDP is a WebSocket carrying `{id, method, params, sessionId}` and events with no `id`; that is the whole
 * protocol, and Bun ships a WebSocket. Chrome itself is a *dev* dependency of the machine, never of the
 * binary: `snypd bench page` is the only caller and it says so when Chrome is missing.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Where a Chromium might be (E1, docs/36 §5a): `SNYPD_CHROME`, then Chrome, Chromium, Edge and Brave where
 * each platform installs them, then the browsers other tools already downloaded — snypd's own
 * `~/.cache/snypd` (`snypd eyes install`), Playwright's and Puppeteer's caches, newest version first.
 *
 * `shell` marks chrome-headless-shell: the old headless build, without the full browser's UI layers, which
 * is what `look` prefers when there is one. Everything else here keeps the order it had — the bench lanes
 * measured on full Chrome and a number is only comparable against the same browser.
 */
export interface BrowserCandidate { path: string; name: string; source: "env" | "system" | "snypd" | "playwright" | "puppeteer"; shell: boolean }

/** A cache directory's subdirectories matching `re`, newest version first (`linux-152.0.7977.42` before `linux-151…`, `-1243` before `-1200`). */
function versions(dir: string, re: RegExp): string[] {
  let names: string[];
  try { names = readdirSync(dir).filter((n) => re.test(n)); } catch { return []; }
  const key = (n: string) => (n.match(/\d+/g) ?? []).map(Number);
  return names.sort((a, b) => {
    const x = key(a), y = key(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0);
    return 0;
  }).map((n) => join(dir, n));
}

/** Every place looked, in order. Pure over its inputs, so the list is testable on any machine. `SNYPD_CHROME=none` is no browser at all. */
export function browserCandidates(env: Record<string, string | undefined> = process.env, home = homedir(), platform: string = process.platform): BrowserCandidate[] {
  // `none` turns every browser off: what CI and a test use to take the path a machine without one takes.
  if (env.SNYPD_CHROME === "none") return [];
  const out: BrowserCandidate[] = [];
  const add = (path: string | undefined, name: string, source: BrowserCandidate["source"], shell = /headless[-_]shell/.test(path ?? "")) => { if (path) out.push({ path, name, source, shell }); };
  add(env.SNYPD_CHROME, "SNYPD_CHROME", "env");
  if (platform === "darwin") {
    for (const [app, bin] of [["Google Chrome", "Google Chrome"], ["Chromium", "Chromium"], ["Microsoft Edge", "Microsoft Edge"], ["Brave Browser", "Brave Browser"]] as const) {
      add(`/Applications/${app}.app/Contents/MacOS/${bin}`, app, "system");
      add(join(home, "Applications", `${app}.app/Contents/MacOS/${bin}`), app, "system");
    }
  } else if (platform === "win32") {
    const roots = [env.PROGRAMFILES ?? "C:\\Program Files", env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", env.LOCALAPPDATA].filter(Boolean) as string[];
    for (const r of roots) {
      add(join(r, "Google", "Chrome", "Application", "chrome.exe"), "Google Chrome", "system");
      add(join(r, "Chromium", "Application", "chrome.exe"), "Chromium", "system");
      add(join(r, "Microsoft", "Edge", "Application", "msedge.exe"), "Microsoft Edge", "system");
      add(join(r, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"), "Brave", "system");
    }
  } else {
    for (const [p, n] of [["/usr/bin/google-chrome", "Google Chrome"], ["/usr/bin/google-chrome-stable", "Google Chrome"], ["/usr/bin/chromium", "Chromium"], ["/usr/bin/chromium-browser", "Chromium"],
      ["/snap/bin/chromium", "Chromium"], ["/usr/bin/microsoft-edge", "Microsoft Edge"], ["/usr/bin/microsoft-edge-stable", "Microsoft Edge"], ["/usr/bin/brave-browser", "Brave"], ["/opt/google/chrome/chrome", "Google Chrome"]] as const)
      add(p, n, "system");
  }
  const exe = platform === "win32" ? ".exe" : "";
  const plat = platform === "darwin" ? (process.arch === "arm64" ? "mac-arm64" : "mac-x64") : platform === "win32" ? "win64" : "linux64";
  // snypd's own: what `snypd eyes install` unpacks, one directory per version.
  for (const v of versions(join(home, ".cache", "snypd", "chrome-headless-shell"), /./))
    add(join(v, `chrome-headless-shell-${plat}`, `chrome-headless-shell${exe}`), "chrome-headless-shell (snypd)", "snypd", true);
  // Playwright's: `chromium_headless_shell-N` (two layouts across its versions) and `chromium-N`.
  const pw = platform === "darwin" ? join(home, "Library", "Caches", "ms-playwright") : platform === "win32" ? join(env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "ms-playwright") : join(home, ".cache", "ms-playwright");
  for (const v of versions(pw, /^chromium_headless_shell-\d+$/)) {
    add(join(v, `chrome-headless-shell-${plat}`, `chrome-headless-shell${exe}`), "chrome-headless-shell (Playwright)", "playwright", true);
    add(join(v, platform === "win32" ? "chrome-win" : platform === "darwin" ? "chrome-mac" : "chrome-linux", `headless_shell${exe}`), "chrome-headless-shell (Playwright)", "playwright", true);
  }
  for (const v of versions(pw, /^chromium-\d+$/))
    add(platform === "darwin" ? join(v, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium")
      : platform === "win32" ? join(v, "chrome-win", "chrome.exe") : join(v, "chrome-linux", "chrome"), "Chromium (Playwright)", "playwright");
  // Puppeteer's: `chrome-headless-shell/<plat>-<ver>/…` and `chrome/<plat>-<ver>/…`.
  const pp = join(env.PUPPETEER_CACHE_DIR ?? join(home, ".cache", "puppeteer"));
  for (const v of versions(join(pp, "chrome-headless-shell"), /./))
    add(join(v, `chrome-headless-shell-${plat}`, `chrome-headless-shell${exe}`), "chrome-headless-shell (Puppeteer)", "puppeteer", true);
  for (const v of versions(join(pp, "chrome"), /./))
    add(platform === "darwin" ? join(v, `chrome-${plat}`, "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing")
      : join(v, `chrome-${plat}`, `chrome${exe}`), "Chrome for Testing (Puppeteer)", "puppeteer");
  return out;
}

/**
 * True when a Chromium from a cache (Playwright's, Puppeteer's, snypd's own) cannot build its sandbox here:
 * Ubuntu 23.10+ restricts unprivileged user namespaces through AppArmor, and only a browser installed with
 * a profile (the system's package) is let through. `SNYPD_CHROME_FLAGS=--no-sandbox` is the person's way
 * past it, and when it is set nothing is blocked.
 */
export function cacheSandboxBlocked(): boolean {
  if (process.platform !== "linux" || /--no-sandbox/.test(process.env.SNYPD_CHROME_FLAGS ?? "")) return false;
  try { return readFileSync("/proc/sys/kernel/apparmor_restrict_unprivileged_userns", "utf8").trim() === "1"; } catch { return false; }
}

/** The first candidate that exists; `preferShell` takes a headless shell over a full browser when both are there (`SNYPD_CHROME` still wins). */
export function findBrowser(opts: { preferShell?: boolean } = {}): BrowserCandidate | undefined {
  const all = browserCandidates().filter((c) => existsSync(c.path));
  if (opts.preferShell && all[0]?.source !== "env") return all.find((c) => c.shell) ?? all[0];
  return all[0];
}

/** Where Chrome usually is — the paths `findChrome` reports when it finds none. */
export const CHROME_PATHS = browserCandidates().map((c) => c.path);

export function findChrome(): string | undefined { return findBrowser()?.path; }

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

export interface Browser {
  /** A new tab; with `isolated`, in a browser context of its own — no history, so no `:visited`, no cookies — which closing the page disposes. */
  page(opts?: { isolated?: boolean }): Promise<Page>;
  close(): void;
  version: string;
}

/**
 * Launch headless Chrome and connect. Throws with an actionable message when Chrome is not installed.
 *
 * **Retried, because the first CI run this repo ever had died here.** *"Chrome did not print a DevTools
 * URL in 15 s"* on a GitHub runner, on a commit that touched three files and none of them this lane —
 * and it took the whole `test + bench` job with it, leaving orphan `chrome` processes for the runner to
 * reap. A cold Chrome on a shared runner occasionally takes longer than a fixed window, and since S18d′
 * CI is where this project's comparable numbers come from: a gate that cannot start is not a gate. S18f
 * adds a second browser lane to the same job (`desk.first.*`), which doubles the exposure.
 *
 * The retry is bounded at three and each attempt cleans up after itself. A failure that survives three
 * attempts is a real one and still says so.
 */
export async function launch(opts: { timeoutMs?: number; attempts?: number; browser?: BrowserCandidate } = {}): Promise<Browser> {
  const attempts = opts.attempts ?? 3;
  let last: Error | undefined;
  for (let i = 0; i < attempts; i++) {
    try { return await launchOnce(opts) }
    catch (e) {
      last = e as Error;
      if (/no Chrome found|No usable sandbox/.test(last.message)) throw last;   // not a race; retrying cannot help
      if (i < attempts - 1) await Bun.sleep(500 * (i + 1));
    }
  }
  throw new Error(`${last?.message ?? "Chrome would not start"} (${attempts} attempts)`);
}

async function launchOnce(opts: { timeoutMs?: number; browser?: BrowserCandidate } = {}): Promise<Browser> {
  const found = opts.browser ?? findBrowser();
  if (!found) throw new Error(`no Chrome found (looked in ${CHROME_PATHS.slice(0, 8).join(", ")}, and ${Math.max(0, CHROME_PATHS.length - 8)} more) — install one or set SNYPD_CHROME`);
  const bin = found.path;
  const profile = mkdtempSync(join(tmpdir(), "snypd-cdp-"));
  const proc = Bun.spawn([bin,
    // chrome-headless-shell *is* the old headless mode and takes the plain flag; a full browser takes `=new`.
    found.shell ? "--headless" : "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-extensions", "--disable-background-networking", "--mute-audio", "--hide-scrollbars",
    "--window-size=1280,900",
    // A container has no user namespaces for Chrome's sandbox; `docker/` sets `--no-sandbox` here, the host never does.
    ...(process.env.SNYPD_CHROME_FLAGS?.split(/\s+/).filter(Boolean) ?? []),
    "about:blank",
  ], { stdout: "ignore", stderr: "pipe" });

  // Chrome prints `DevTools listening on ws://…` to stderr once the debugging socket is up.
  const ms = opts.timeoutMs ?? 30_000;
  let wsUrl: string;
  try {
    wsUrl = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Chrome did not print a DevTools URL in ${Math.round(ms / 1000)} s`)), ms);
      (async () => {
        let buf = "";
        for await (const chunk of proc.stderr as ReadableStream<Uint8Array>) {
          buf += new TextDecoder().decode(chunk);
          const m = buf.match(/ws:\/\/[^\s]+/);
          if (m) { clearTimeout(timer); resolve(m[0]); return; }
        }
        // What it said on the way out, when it said something: "No usable sandbox" is the common one — a
        // downloaded Chromium on a distro whose AppArmor refuses unprivileged user namespaces (Ubuntu 23.10+).
        const fatal = buf.split("\n").find((l) => /FATAL|sandbox/i.test(l))?.replace(/^\[[^\]]*\]\s*/, "").replace(/^[^:]*\.cc:\d+\]\s*/, "").split(/(?<=[.!]) /)[0];
        clearTimeout(timer); reject(new Error(`Chrome exited before printing a DevTools URL${fatal ? ` — ${fatal}` : ""}`));
      })().catch(reject);
    });
  } catch (e) {
    // The runner logged "Terminate orphan process: pid (…) (chrome)" after the failure that prompted the
    // retry above — a launch that gives up owes it to the next attempt to leave no browser behind.
    try { proc.kill() } catch { /* already gone */ }
    rmSync(profile, { recursive: true, force: true });
    throw e;
  }

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
    async page(opts = {}): Promise<Page> {
      const ctx = opts.isolated ? (await call<{ browserContextId: string }>("Target.createBrowserContext", { disposeOnDetach: true })).browserContextId : undefined;
      const { targetId } = await call<{ targetId: string }>("Target.createTarget", { url: "about:blank", ...(ctx ? { browserContextId: ctx } : {}) });
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
        async close() { for (const [m, l] of mine) listeners.get(m)?.delete(l); await call("Target.closeTarget", { targetId }).catch(() => {}); if (ctx) await call("Target.disposeBrowserContext", { browserContextId: ctx }).catch(() => {}); },
      };
    },
  };
}
