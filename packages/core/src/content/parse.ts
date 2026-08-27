/**
 * S5 parse stage (docs/02 §9, docs/04 "Markdown"): markdown → mdast with directive nodes + frontmatter.
 * Uses the micromark/mdast utilities directly (no `unified` processor) — same parser remark uses, less
 * indirection on the hot path. GFM tables/footnotes are on so ordinary blog markdown round-trips.
 * Frontmatter is parsed with js-yaml: the `yaml` package used for config layering costs ~1.2 ms per call.
 */
import { fromMarkdown } from "mdast-util-from-markdown";
import { directive } from "micromark-extension-directive";
import { directiveFromMarkdown } from "mdast-util-directive";
import { frontmatter } from "micromark-extension-frontmatter";
import { frontmatterFromMarkdown } from "mdast-util-frontmatter";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { load as parseYaml } from "js-yaml";   // 15× faster than `yaml` per call (S5 finding); no provenance needed for content
import type { Root } from "mdast";

export interface ParsedDoc {
  /** Full mdast, positions relative to the whole file (frontmatter included). */
  tree: Root;
  /** Parsed frontmatter (`{}` when absent or invalid). */
  frontmatter: Record<string, unknown>;
  /** Raw frontmatter YAML text, `""` when absent. */
  frontmatterYaml: string;
  /** 1-based line where the YAML body starts (line 2 when frontmatter exists), else 0. */
  frontmatterLine: number;
  /** YAML parse error message, if the frontmatter failed to parse. */
  frontmatterError?: string;
}

const EXT = [frontmatter(["yaml"]), directive(), gfm()];
const MDAST = [frontmatterFromMarkdown(["yaml"]), directiveFromMarkdown(), gfmFromMarkdown()];

export function parseMarkdown(source: string): ParsedDoc {
  const tree = fromMarkdown(source, { extensions: EXT, mdastExtensions: MDAST });
  let frontmatterYaml = "", frontmatterLine = 0, frontmatterError: string | undefined;
  let fm: Record<string, unknown> = {};
  const first = tree.children[0];
  if (first && first.type === "yaml") {
    frontmatterYaml = first.value;
    frontmatterLine = (first.position?.start.line ?? 1) + 1;
    try {
      const v = parseYaml(frontmatterYaml);
      if (v && typeof v === "object" && !Array.isArray(v)) fm = v as Record<string, unknown>;
      else if (v !== null && v !== undefined) frontmatterError = "frontmatter must be a YAML mapping";
    } catch (e) { frontmatterError = (e as Error).message.split("\n")[0]; }
  }
  return { tree, frontmatter: fm, frontmatterYaml, frontmatterLine, frontmatterError };
}

/** Line of `key:` inside the frontmatter block, for diagnostics; falls back to the block's first line. */
export function frontmatterKeyLine(doc: ParsedDoc, key: string): number {
  if (!doc.frontmatterLine) return 1;
  const lines = doc.frontmatterYaml.split("\n");
  const i = lines.findIndex((l) => l.startsWith(`${key}:`));
  return i < 0 ? doc.frontmatterLine : doc.frontmatterLine + i;
}
