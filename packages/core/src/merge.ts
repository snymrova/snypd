/**
 * Layered deep-merge with provenance (docs/02 §1): later wins, objects deep-merge, arrays append
 * unless tagged `!replace`, scalars override. Every leaf (and every array) remembers which layer
 * and file:line set it, and what it overrode.
 */
import { isReplace, pathKey, type Origin, type Path } from "./yaml";

export type LayerName = "spec" | "theme" | "plugin" | "site" | "env" | "inherited";
export interface Source extends Partial<Origin> { layer: LayerName; /** `snypd-plugin-seo`, theme name, or base type for `inherited` */ from?: string; appended?: boolean; overrides?: Source }
export type Provenance = Map<string, Source>;

export interface Layer { name: LayerName; from?: string; file?: string; value: unknown; origins?: Map<string, Origin> }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function mergeLayer(base: unknown, layer: Layer, prov: Provenance, path: Path = []): unknown {
  const src = (p: Path, extra: Partial<Source> = {}, originPath: Path = p): Source => {
    const o = layer.origins?.get(pathKey(originPath));
    const prev = prov.get(pathKey(p));
    return { layer: layer.name, from: layer.from, file: layer.file, ...(o ? { line: o.line } : {}), ...extra, ...(prev && prev !== undefined ? { overrides: prev } : {}) };
  };
  const walk = (a: unknown, b: unknown, p: Path): unknown => {
    if (isObj(a) && isObj(b) && !isReplace(b)) {
      const out: Record<string, unknown> = { ...a };
      for (const [k, v] of Object.entries(b)) out[k] = walk(a[k], v, [...p, k]);
      return out;
    }
    if (Array.isArray(a) && Array.isArray(b) && !isReplace(b)) {
      prov.set(pathKey(p), src(p, { appended: true }));
      b.forEach((v, i) => stamp(v, [...p, a.length + i], [...p, i]));
      return [...a, ...b];
    }
    // scalar, replace, or new subtree: stamp every leaf under it
    stamp(b, p);
    return b;
  };
  const stamp = (v: unknown, p: Path, originPath: Path = p) => {
    prov.set(pathKey(p), src(p, {}, originPath));
    if (isObj(v)) for (const [k, x] of Object.entries(v)) stamp(x, [...p, k], [...originPath, k]);
    else if (Array.isArray(v)) v.forEach((x, i) => stamp(x, [...p, i], [...originPath, i]));
  };
  return walk(base, layer.value, path);
}

export function getPath(v: unknown, path: Path): unknown {
  let cur: unknown = v;
  for (const p of path) { if (cur == null || typeof cur !== "object") return undefined; cur = (cur as Record<string, unknown>)[p as string]; }
  return cur;
}

/** "snypd.yaml:14, overrides spec default" — the human tail of `site.explain_config`. */
export function describeSource(s: Source | undefined): string {
  if (!s) return "unset";
  if (s.layer === "inherited") return `inherited from types.${s.from} (${describeSource(s.overrides)})`;
  const where = s.layer === "spec" ? "@snypd/spec default" : `${s.file ?? s.layer}${s.line ? `:${s.line}` : ""}${s.from && s.layer !== "site" && s.layer !== "env" ? ` (${s.layer} ${s.from})` : ""}`;
  const verb = s.appended ? "appended to" : "overrides";
  return s.overrides ? `${where}, ${verb} ${describeSource(s.overrides)}` : where;
}
