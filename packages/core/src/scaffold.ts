/**
 * `snypd new theme` and `snypd new plugin` (X1) — and `theme` › scaffold, which is the same function.
 *
 * The theme scaffold is not new: it has been the MCP tool's since U1, and every byte of what it writes
 * was written there. What is new is that it lives here, where a *terminal* can reach it. That matters
 * more than it sounds: everything else in this product is agent-first on purpose (docs/08 §2, "writing
 * is over MCP and only over MCP"), and a theme is the one artefact that is not content. A theme author
 * is a person with an editor open, and asking them to start by wiring an MCP server to create a
 * directory is the kind of ceremony that means the shelf stays empty.
 *
 * So: one generator, two front doors, and no second copy to drift. The MCP tool keeps its commit and its
 * agent-shaped reply; the verb keeps its four lines of terminal output; the files they produce are the
 * same files, because they are produced here.
 *
 * Neither scaffold writes a layout or a primitive, and that is the contract restated as a default. A
 * theme that declares only `extends:` and `css:` renders all fourteen primitives and all six layouts
 * through the chain (D8, proved in U6b by a second theme that forks neither) — so the starting point is
 * one stylesheet, which is the one file the author actually wants to write.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./config";
import { installedThemes, themeTokens } from "./site";
import { pluginCandidates, resolvePlugin } from "./plugins";
import { PLUGIN_API } from "./schema";
import { WriteError } from "./write";

export interface ScaffoldResult {
  name: string;
  /** Site-relative directory, e.g. `themes/slate`. */
  dir: string;
  /** Site-relative paths written, in the order they are worth opening. */
  files: string[];
  /** For a theme: the parent it extends, and how many tokens came with it. */
  extends?: string;
  inheritedTokens?: number;
}

/**
 * The scaffold's own placeholders, recognised by the checker that ships beside it (X1).
 *
 * `personality:` and `description:` are what a listing prints and what an agent picks a theme on, so a
 * scaffold has to write *something* there — an empty key teaches nothing. But a shelf full of "Describe
 * how this theme reads" is a shelf that has stopped meaning anything, and a gate that cannot tell a
 * description from a to-do is a gate with a hole the exact width of the starter file. So the text is
 * declared once, here, and `check` compares against it: the only two strings in the product where
 * "unchanged since the scaffold" is itself the finding.
 */
export const PLACEHOLDER = {
  personality: "Describe how this theme reads, in one or two sentences.",
  description: (name: string) => `What ${name} does, in one line`,
} as const;

/** Whether this metadata is still the scaffold's. Prefix, not equality: an author who edited the second sentence has started. */
export const isPlaceholder = (kind: "personality" | "description", text: string, name: string): boolean =>
  text.trim().startsWith(kind === "personality" ? PLACEHOLDER.personality.slice(0, 40) : PLACEHOLDER.description(name));

const NAME_RE = /^[a-z][a-z0-9-]*$/;
const NAME_WHY = "Lowercase letters, digits and hyphens — it is also the directory name, and what a site writes to use it.";

/**
 * The palette a theme gets when the theme it extends declares none — which is what `base` does.
 *
 * X1 found this by running `snypd new theme` and then `snypd check theme` on the result, which is the
 * loop the verbs exist to close. The scaffold had always written a stylesheet that says
 * `background: var(--color-bg)`, and `base` has never declared `color.bg`: a theme scaffolded over the
 * floor came out referencing eight custom properties that resolve to nothing, and rendered unstyled.
 * The comment above the stylesheet even listed a palette — the *active* theme's, which the new theme
 * does not extend and cannot see.
 *
 * A token is declared where it is used, so the theme declares them. Every value below clears 4.5:1
 * against the surface it is read on, in both modes, which `contrast.*` then asserts rather than assumes:
 * a scaffold that fails the checker shipped beside it is a scaffold nobody should start from.
 */
const STARTER_TOKENS = `tokens:
  # \`base\` declares no tokens \u2014 it is the unstyled floor \u2014 so the stylesheet's vars are declared here.
  # \`customisable: true\` is what lets a site retune one without editing CSS; \`kind\` and \`description\` are
  # what \`theme\` \u203a set_tokens shows an agent, and \`snypd check theme ${"${name}"}\` asks for both.
  color.scheme:    { default: "light dark", customisable: true, kind: keyword, description: "Which side of every light-dark() pair resolves. \`light dark\` follows the reader; \`dark\` or \`light\` commits." }
  color.bg:        { default: "light-dark(#ffffff, #14161a)", customisable: true, kind: color, description: "Page background." }
  color.surface:   { default: "light-dark(#f4f5f7, #1d2026)", customisable: true, kind: color, description: "Raised blocks \u2014 callout, cta, tldr." }
  color.text:      { default: "light-dark(#16181d, #e6e8ec)", customisable: true, kind: color, description: "Body text." }
  color.muted:     { default: "light-dark(#5b6068, #9aa0aa)", customisable: true, kind: color, description: "Dates, captions, secondary labels." }
  color.accent:    { default: "light-dark(#1f5fbf, #7fb0f2)", customisable: true, kind: color, description: "Links and the one emphatic colour." }
  color.on-accent: { default: "light-dark(#ffffff, #14161a)", customisable: true, kind: color, description: "Text on an accent fill." }
  color.border:    { default: "light-dark(#dfe2e7, #2a2e36)", customisable: true, kind: color, description: "Hairlines and block edges." }
  measure:         { default: 34rem, customisable: true, kind: size, description: "How wide a line of prose is allowed to get." }
  font.body:       { default: "ui-sans-serif, system-ui, sans-serif", customisable: true, kind: font, description: "The body stack. A webfont is a \`font:\` block, not a value here." }
  size.body:       { default: "1.05rem", customisable: true, kind: size, description: "Body size." }
  leading.body:    { default: 1.6, customisable: true, kind: number, description: "Body line height." }
`;

/** The starter stylesheet a scaffolded theme gets: every token it can reach, as the vars it will use. */
export function starterCss(name: string, parent: string, tokens: { name: string; kind?: string }[]): string {
  const varOf = (t: string) => `--${t.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
  const colour = tokens.filter((t) => t.kind === "color").slice(0, 8);
  const inherited = tokens.length > 0;
  return `/* ${name} — one stylesheet over \`${parent}\`'s markup. The build emits every token above this file
   as a CSS custom property, so a value here is always a var(): recolour in snypd.yaml, never in here.
   ${inherited ? `\`snypd://theme/tokens\` lists all ${tokens.length}; the ones this file starts with are below.`
               : `\`${parent}\` declares no tokens, so this theme declares its own — see \`tokens:\` in theme.yaml.`} */

*, *::before, *::after { box-sizing: border-box; }

:root {
  color-scheme: var(--color-scheme, light dark);
  --content: min(100% - 2rem, var(--measure, 34rem));
}

body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font: var(--size-body) / var(--leading-body) var(--font-body);
}

main { width: var(--content); margin-inline: auto; }

a { color: var(--color-accent); }

${inherited
  ? `/* Available to you, straight from \`${parent}\`:\n${colour.map((t) => ` *   var(${varOf(t.name)})`).join("\n")}\n * …and the rest in snypd://theme/tokens. Style the primitives by their \`snypd-<name>\` class. */`
  : `/* Every primitive renders as semantic HTML with one class: \`.snypd-callout\`, \`.snypd-tldr\`,
   \`.snypd-steps\`, \`.snypd-chart\` and nine more — snypd://theme/coverage lists them. Style those,
   and \`snypd check theme ${name}\` will tell you whether the colours above are still readable. */`}
`;
}

/** The `theme.yaml` a new theme starts with: `extends:` and `css:`, and a comment about each key it leaves out. */
export function starterThemeYaml(name: string, parent: string, inheritedTokens = 0): string {
  return `# ${name} — extends \`${parent}\`, which brings every layout and all 14 primitives with it.
# Nothing below is required: a theme that declares only \`extends:\` and \`css:\` already renders the whole
# vocabulary. Redeclare a token here to change its default; set \`customisable: true\` to let snypd.yaml
# move it. \`snypd://theme/tokens\` lists what you inherited. To change the header or footer, override
# one part and no layout: \`parts: { header: ./parts/header.tsx }\` — snypd://theme/coverage lists the five.
# \`toc\` is the post layout's contents slot and renders nothing until a theme fills it from \`page.headings\`.
# To let a site choose something without writing CSS — a logo, a date format, social links — declare it:
# \`settings: [{ id: showDates, type: boolean, label: "Show dates", default: true }]\`, and read it in a part
# with \`settingFlag(ctx, "showDates", true)\`. snypd://theme/settings is what an agent sees.
# Two more declarations, both optional and both budgeted: \`variations:\` ships named looks over these tokens
# (snypd://theme/variations), and \`font:\` ships one subsetted webfont with a metric-matched fallback, at
# most 40 KB — a theme that names none inherits its parent's, and \`base\` has none.
# \`snypd check theme ${name}\` judges all of it by name, and is what the shelf runs before it lists anything.
theme: ${name}
version: 0.1.0
spec: ^1
extends: ${parent}
css: ./theme.css
personality: >-
  ${PLACEHOLDER.personality} The renderer never uses this — an agent choosing a theme does, and so does
  anyone deciding whether a change belongs in it. \`snypd check theme ${name}\` fails this line until you
  replace it, because a shelf of scaffolded sentences is a shelf nobody can choose from.

${inheritedTokens ? `# ${inheritedTokens} tokens come from \`${parent}\`; redeclare one here to change its default.\ntokens: {}` : STARTER_TOKENS.replace("${name}", name).trimEnd()}
`;
}

/**
 * Write `themes/<name>/` — `theme.yaml`, `theme.css`, `package.json`. Throws `WriteError` with a hint on
 * a bad name, a name already taken, or a parent that is not installed; writes nothing when it throws.
 */
export function scaffoldTheme(root: string, input: { name: string; extends?: string }): ScaffoldResult {
  const name = input.name.trim();
  if (!NAME_RE.test(name)) throw new WriteError(`"${input.name}" is not a theme name`, NAME_WHY);
  const parent = input.extends?.trim() || "base";
  const cfg = loadConfig(root);
  const installed = installedThemes(root, cfg.config.theme.use);
  const taken = installed.find((t) => t.name === name);
  if (taken) throw new WriteError(`theme "${name}" already exists`, `At ${taken.dir}. \`snypd check theme ${name}\` says what state it is in.`);
  if (!installed.some((t) => t.name === parent)) throw new WriteError(`no theme "${parent}" to extend`, `Installed: ${installed.map((t) => t.name).join(", ")}.`);
  // The parent's tokens, read through a config that names *it* — not the site's active theme, which may
  // be something else entirely and whose palette would then be listed in a comment about this one.
  const tokens = themeTokens(loadConfig(root, { theme: parent }));

  const dir = join(root, "themes", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "theme.yaml"), starterThemeYaml(name, parent, tokens.length));
  writeFileSync(join(dir, "theme.css"), starterCss(name, parent, tokens));
  writeFileSync(join(dir, "package.json"), `{ "name": "@snypd/theme-${name}", "version": "0.1.0", "type": "module", "license": "MIT" }\n`);
  return {
    name, extends: parent, inheritedTokens: tokens.length, dir: `themes/${name}`,
    files: ["theme.yaml", "theme.css", "package.json"].map((f) => `themes/${name}/${f}`),
  };
}

/**
 * Write `plugins/<name>/` — a manifest, one slot module and a `package.json`.
 *
 * One slot and not five: tier 1 is the tier that needs no explanation (docs/10 §4.2), it is visible on
 * the next build, and it declares no client bytes, so a new plugin cannot fail a site's budget on its
 * first run. Every other tier is a commented line in the manifest beside it — a plugin author reading
 * their own scaffold learns the whole contract, and pays for the one they uncomment.
 */
export function scaffoldPlugin(root: string, input: { name: string; description?: string }): ScaffoldResult {
  const name = input.name.trim();
  if (!NAME_RE.test(name)) throw new WriteError(`"${input.name}" is not a plugin name`, NAME_WHY);
  const already = resolvePlugin(name, [root]);
  if (already) throw new WriteError(`plugin "${name}" already exists`, `At ${already.dir} (${already.source}). A site's own \`plugins/\` is searched before node_modules and before the plugins bundled in this build, so ${pluginCandidates(name)[0]} would shadow it rather than replace it.`);
  const description = (input.description ?? "").trim() || `${PLACEHOLDER.description(name)} — \`snypd://plugins\`, doctor and a gallery card all print this.`;

  const dir = join(root, "plugins", name);
  mkdirSync(join(dir, "slots"), { recursive: true });
  writeFileSync(join(dir, "snypd.yaml"), `# ${name} — a snypd plugin (docs/10 §4). Everything a plugin is, is in this file:
# the \`plugin:\` block below describes it, and every *other* root key here merges into the site's config,
# which is how a plugin declares a content type or a taxonomy without a site editing snypd.yaml.
#
# Five tiers, in order of what they cost the reader (docs/10 §4.2). This scaffold uses the first.
#   1 declares   root keys, and \`slots:\` — markup in a place the theme left for you
#   2 decorates  \`filters:\` — a title, an excerpt, a route, changed on the way past
#   3 transforms \`stages: { transform }\` per document, \`{ emit }\` once per build
#   4 reacts     \`events: { publish, push }\` — after the fact, allowed only the hosts you name below
#   5 speaks     \`tools:\` and \`prompts:\` — your own MCP surface, in the agent's catalogue
#
# \`snypd check plugin ${name}\` judges this file by name, and is what the shelf runs before it lists anything.
plugin:
  name: ${name}
  version: 0.1.0
  api: ${PLUGIN_API}
  description: ${JSON.stringify(description)}
  # What a site may pass you, as JSON Schema. The site's \`plugins: [{ ${name}: {…} }]\` entry is validated
  # against this at load, and a site whose options do not fit gets a diagnostic naming its own line.
  options:
    type: object
    additionalProperties: false
    properties:
      note: { type: string, description: "The line this plugin puts under every post" }
  slots:
    after-content: ./slots/note.tsx
  # The other four tiers, each one line. Uncomment what you need; every path must exist at load.
  # filters:  { title: ./filters/title.ts }
  # stages:   { transform: ./transform.ts, emit: ./emit.ts }
  # events:   { publish: ./events/publish.ts }
  # tools:    ./tools.ts
  # prompts:  ./prompts.ts
  # capabilities:
  #   client: 0kb            # kilobytes of client JS you add; it comes out of the site's budget (decision 84)
  #   network: [api.example.com]   # the only hosts your event handlers' \`ctx.fetch\` may reach
  #   emit: [${name}/]              # the dist/ prefixes your emit stage may write under
`);
  writeFileSync(join(dir, "slots", "note.tsx"), `/**
 * \`after-content\`: markup at the end of every page's body, where the theme left room for it.
 *
 * A slot is a component and nothing more — it is handed the site context and this plugin's options, and
 * what it returns is inlined. It runs at build: there is no client here, and a plugin that wants one
 * declares the kilobytes in \`capabilities.client\` first.
 */
import type { Html, SlotProps } from "@snypd/render";

export default function Note({ ctx, options }: SlotProps): Html {
  const note = typeof options.note === "string" ? options.note : undefined;
  if (!note) return <></>;
  return <p class="${name}-note" data-plugin="${name}">{note} — {ctx.site.name}</p>;
}
`);
  writeFileSync(join(dir, "package.json"), `{ "name": "snypd-plugin-${name}", "version": "0.1.0", "type": "module", "license": "MIT", "keywords": ["snypd-plugin"] }\n`);
  return {
    name, dir: `plugins/${name}`,
    files: ["snypd.yaml", "slots/note.tsx", "package.json"].map((f) => `plugins/${name}/${f}`),
  };
}

/** Whether this root already has a directory where a scaffold would land — what a verb checks before it asks. */
export const scaffoldExists = (root: string, kind: "theme" | "plugin", name: string): boolean =>
  existsSync(join(root, kind === "theme" ? "themes" : "plugins", name));
