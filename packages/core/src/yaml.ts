/**
 * YAML file → plain value + per-path provenance (file:line), with the `!replace` tag (docs/02 §1).
 * Runtime-neutral: the `yaml` package only. Collections tagged `!replace` carry REPLACE so the
 * merger overwrites instead of appending / deep-merging.
 */
import { isMap, isScalar, isSeq, LineCounter, parseDocument, type Node, type Pair } from "yaml";

export const REPLACE: unique symbol = Symbol.for("snypd.replace");
export type Path = (string | number)[];
export interface Origin { file: string; line: number }
export interface Parsed { value: unknown; origins: Map<string, Origin>; warnings: string[] }

/** Dotted path; keys containing `.` or `[` are bracketed so `theme.tokens[color.accent]` stays unambiguous. */
export function pathKey(path: Path): string {
  let out = "";
  for (const p of path) {
    if (typeof p === "number") out += `[${p}]`;
    else if (/[.[\]]/.test(p) || p === "") out += `[${p}]`;
    else out += out ? `.${p}` : p;
  }
  return out;
}
export function parsePath(key: string): Path {
  const out: Path = [];
  const re = /\[([^\]]*)\]|([^.[\]]+)/g;
  for (const m of key.matchAll(re)) {
    if (m[1] !== undefined) out.push(/^\d+$/.test(m[1]) ? Number(m[1]) : m[1]);
    else out.push(m[2]!);
  }
  return out;
}

const TAGS = [
  { tag: "!replace", collection: "seq" as const },
  { tag: "!replace", collection: "map" as const },
];

export function parseYaml(text: string, file: string): Parsed {
  const lc = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lc, customTags: TAGS as never, keepSourceTokens: false, strict: false });
  const warnings = [...doc.errors, ...doc.warnings].map((e) => `${file}:${e.linePos?.[0]?.line ?? 0}: ${e.message.split("\n")[0]}`);
  const origins = new Map<string, Origin>();
  const line = (n: Node | null | undefined, fallback: number) => (n?.range ? lc.linePos(n.range[0]).line : fallback);

  const walk = (node: Node | null, path: Path, at: number): unknown => {
    if (isMap(node)) {
      const obj: Record<string, unknown> = {};
      for (const pair of node.items as Pair<Node, Node>[]) {
        const k = String(isScalar(pair.key) ? pair.key.value : pair.key);
        const l = line(pair.key, at);
        origins.set(pathKey([...path, k]), { file, line: l });
        obj[k] = walk(pair.value, [...path, k], l);
      }
      if (node.tag === "!replace") Object.defineProperty(obj, REPLACE, { value: true, enumerable: false });
      return obj;
    }
    if (isSeq(node)) {
      const arr = (node.items as Node[]).map((it, i) => { origins.set(pathKey([...path, i]), { file, line: line(it, at) }); return walk(it, [...path, i], line(it, at)); });
      if (node.tag === "!replace") Object.defineProperty(arr, REPLACE, { value: true, enumerable: false });
      return arr;
    }
    if (isScalar(node)) return node.value;
    return node == null ? null : (node as Node).toJSON();
  };
  const value = doc.contents ? walk(doc.contents as Node, [], 1) : {};
  return { value: value ?? {}, origins, warnings };
}

export const isReplace = (v: unknown): boolean => typeof v === "object" && v !== null && (v as Record<symbol, unknown>)[REPLACE] === true;
