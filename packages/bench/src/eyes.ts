/**
 * `snypd eyes install` (E1, docs/36 §5a): the opt-in fallback for a machine with no Chromium at all.
 *
 * Never silent and never automatic: `theme › look` on such a machine answers with every fact that needs no
 * browser and one line naming this command, and a person runs it. It fetches chrome-headless-shell — the
 * old headless build, without the full browser's UI layers — from Chrome for Testing, the channel Google
 * publishes for exactly this, into `~/.cache/snypd/chrome-headless-shell/<version>/`, where `findBrowser`
 * already looks. Nothing else is written; deleting the directory uninstalls it.
 */
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { cacheSandboxBlocked } from "./cdp";

export const CFT_INDEX = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json";

/** Chrome for Testing's name for this machine, or undefined where it publishes no build (Linux on ARM). */
export function cftPlatform(platform: string = process.platform, arch: string = process.arch): string | undefined {
  if (platform === "linux") return arch === "x64" ? "linux64" : undefined;
  if (platform === "darwin") return arch === "arm64" ? "mac-arm64" : "mac-x64";
  if (platform === "win32") return arch === "x64" ? "win64" : arch === "ia32" ? "win32" : undefined;
  return undefined;
}

export interface EyesInstall { version: string; path: string; bytes: number; already: boolean; warning?: string }

export async function eyesInstall(opts: { onProgress?: (line: string) => void; fetch?: typeof fetch } = {}): Promise<EyesInstall> {
  const say = opts.onProgress ?? (() => {});
  const get = opts.fetch ?? fetch;
  const plat = cftPlatform();
  if (!plat) throw Object.assign(new Error(`Chrome for Testing publishes no chrome-headless-shell for ${process.platform}/${process.arch}`), { hint: "install Chromium from this system's packages, or set SNYPD_CHROME to one" });
  const index = await (await get(CFT_INDEX)).json() as { channels: Record<string, { version: string; downloads: Record<string, { platform: string; url: string }[]> }> };
  const stable = index.channels.Stable;
  const url = stable?.downloads["chrome-headless-shell"]?.find((d) => d.platform === plat)?.url;
  if (!stable || !url) throw new Error(`Chrome for Testing's index has no Stable chrome-headless-shell for ${plat}`);
  const dir = join(homedir(), ".cache", "snypd", "chrome-headless-shell", stable.version);
  const exe = join(dir, `chrome-headless-shell-${plat}`, `chrome-headless-shell${plat.startsWith("win") ? ".exe" : ""}`);
  const warning = cacheSandboxBlocked()
    ? "this Linux restricts unprivileged user namespaces (AppArmor), so a downloaded Chromium cannot build its sandbox — `look` will prefer a system browser if there is one; with none, set SNYPD_CHROME_FLAGS=--no-sandbox if this machine is yours to decide"
    : undefined;
  if (existsSync(exe)) return { version: stable.version, path: exe, bytes: 0, already: true, warning };

  say(`chrome-headless-shell ${stable.version} (${plat}) ← ${url}`);
  const res = await get(url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status} from ${url}`);
  const zip = Buffer.from(await res.arrayBuffer());
  say(`${(zip.length / 1e6).toFixed(0)} MB downloaded; unpacking to ${dir}`);
  const tmp = join(tmpdir(), `snypd-eyes-${process.pid}.zip`);
  writeFileSync(tmp, zip);
  mkdirSync(dir, { recursive: true });
  try {
    // `unzip` where it exists; bsdtar reads zips everywhere else (macOS and Windows ship it as `tar`).
    const tries = [["unzip", "-q", "-o", tmp, "-d", dir], ["tar", "-xf", tmp, "-C", dir]];
    let done = false, why = "";
    for (const cmd of tries) {
      try { const p = Bun.spawnSync(cmd, { stdout: "ignore", stderr: "pipe" }); if (p.exitCode === 0 && existsSync(exe)) { done = true; break; } why = p.stderr.toString().trim(); }
      catch (e) { why = (e as Error).message; }
    }
    if (!done) { rmSync(dir, { recursive: true, force: true }); throw new Error(`could not unpack the download (${why || "no unzip or tar here"})`); }
    if (!plat.startsWith("win")) chmodSync(exe, 0o755);
  } finally { rmSync(tmp, { force: true }); }
  return { version: stable.version, path: exe, bytes: zip.length, already: false, warning };
}
