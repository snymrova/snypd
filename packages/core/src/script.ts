/**
 * What counts as script, in one place (docs/11 finding 1, gate E6).
 *
 * The claim is "0 KB of JavaScript by default", and until now it was enforced on the *corpus*, in CI,
 * by `page.js.kb` — which measures the three sites in this repository and no reader's. Raw HTML renders
 * verbatim (render/html.ts, correct CommonMark) and lint skipped `html` nodes, so anything that can
 * write a content file could put a `<script>` on a live site and nothing between the file and the page
 * would say so. Since decision 80 the thing writing content files is an agent that has read the open web.
 *
 * The answer is not to sanitise. The source is the twin (docs/01 §2, decision 102): a rewritten page is
 * a page the author did not write, and stripping tags would break the embeds that are the honest reason
 * raw HTML exists. So the build *weighs* script instead, against the budget the site already declares
 * for its plugins, and refuses to write a page that spends more than the site afforded — the same
 * number, `bench.budgets.jsKb`, that P2 checks a plugin's declaration against and that `page.js.kb`
 * measures over the wire. Three readings of one budget: what a plugin asked for, what the build
 * emitted, what the browser fetched.
 *
 * The scan is deliberately generous about what it calls script and exact about what it does not: it is
 * a gate, and a gate that guesses low is a gate that lies.
 */

/** One place on a page where script arrives, and what it weighs. */
export interface ScriptSite {
  /** `inline` a script body · `src` a script the page fetches · `handler` an `on…` attribute · `url` a `javascript:` destination. */
  kind: "inline" | "src" | "handler" | "url";
  /** What to show the author: the attribute, the tag, the url — truncated, because a diagnostic is a sentence. */
  what: string;
  /**
   * Bytes this site costs, or **undefined when the bytes are not in this string**. Every `src` is
   * undefined here: a site-local one is bytes the *caller* is about to write and can weigh, and a
   * remote one is bytes nobody can weigh before fetching them. An unweighable site is over every
   * budget, however generous — the build can refuse what it cannot count, and `page.js.kb` is where a
   * number that only exists over the wire gets measured.
   */
  bytes?: number;
  /** For `src`: the url as written, so a caller can resolve a site-local one against what it is writing. */
  url?: string;
  /** The whole of what arrives — the url, the body, the attribute value — untruncated. `scriptSignature` is built from it. */
  text: string;
  /** Byte offset into the html scanned — `lineOf` turns it into a line for a diagnostic. */
  offset: number;
}

/**
 * The `type` values that make a `<script>` executable. HTML's own "classic script" list plus `module`:
 * every other value is a *data block*, which the browser does not run — `application/ld+json` is the
 * one this repository writes, and `page.js.kb` excludes it for the same reason and by the same rule.
 * An absent or empty `type` is JavaScript, which is why the empty alternative comes first.
 */
const EXECUTABLE_TYPE =
  /^(?:|module|text\/javascript|text\/ecmascript|text\/jscript|text\/livescript|text\/x-javascript|text\/x-ecmascript|application\/javascript|application\/ecmascript|application\/x-javascript|application\/x-ecmascript)$/i;

/** A destination that runs rather than navigates. Control characters go first: browsers ignore them inside a scheme. */
const EXECUTES = /^(?:javascript|vbscript):/i;
/** The attributes whose value is a destination worth checking. `data` and `formaction` are the two people forget. */
const URL_ATTRS = new Set(["href", "src", "xlink:href", "action", "formaction", "data", "poster", "srcdoc", "background"]);

/** An open tag with its attributes. The quoted alternatives are what lets an attribute value hold a `>`. */
const OPEN_TAG = /<([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)\/?>/g;
/** A tag that opens after the last complete one and runs to the end of the text without a `>` to close it. */
const DANGLING_TAG = /<([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)$/;
const ATTR = /([a-zA-Z_:@][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const CONTROL = /[\u0000-\u0020]/g;

const bytesOf = (s: string) => Buffer.byteLength(s, "utf8");
const cut = (s: string, n = 40) => `${s.slice(0, n)}${s.length > n ? "…" : ""}`;

/** 1-based line of a byte offset, for a diagnostic that has to point somewhere. */
export const lineOf = (s: string, offset: number, from = 1): number => from + (s.slice(0, offset).match(/\n/g)?.length ?? 0);

/** Whether a `src` points at this site — the only kind whose bytes the build can weigh before writing them. */
export const local = (url: string): boolean => !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) && !url.startsWith("//");

/**
 * Every place the given HTML introduces script. Works on a whole page and on the fragment a markdown
 * `html` node carries, which is why it takes a string and not a tree.
 *
 * A `<script>` with a `src` weighs its `src` and not its body: the browser ignores the body when the
 * attribute is there, and counting both would refuse a page for bytes nobody ever fetches.
 *
 * A tag that opens and never closes — `<script` as the last thing in a file — is a site too, and the
 * reason is the two callers. On the fragment, lint saw no `>` and said nothing; on the page, the
 * layout's own markup supplied one (`<script\n</article>` is an open tag with a strange attribute), and
 * the build refused what lint had passed. In a browser it is the same tag, and everything after it is
 * script text until a `</script>` nobody wrote. Found by H4's parser property (decision 156).
 */
export function scriptSites(html: string): ScriptSite[] {
  const out: ScriptSite[] = [];
  const site = (tag: string, attrs: string, at: number, after: number) => {
    if (tag === "script") {
      let type = "";
      let src: string | undefined;
      ATTR.lastIndex = 0;
      for (let a = ATTR.exec(attrs); a; a = ATTR.exec(attrs)) {
        const name = a[1]!.toLowerCase();
        const value = a[2] ?? a[3] ?? a[4] ?? "";
        if (name === "type") type = value.trim();
        else if (name === "src") src = value.trim();
      }
      // A data block is not script, and `type` is the browser's own test — so it is this one too.
      if (!EXECUTABLE_TYPE.test(type)) return;
      if (src !== undefined) {
        out.push({ kind: "src", what: `<script src="${cut(src, 60)}">`, url: src, text: src, offset: at });
      } else {
        const close = html.slice(after).search(/<\/script\s*>/i);
        const body = close === -1 ? html.slice(after) : html.slice(after, after + close);
        out.push({ kind: "inline", what: `<script>${cut(body.trim())}</script>`, bytes: bytesOf(body), text: body, offset: at });
      }
      return;
    }

    ATTR.lastIndex = 0;
    for (let a = ATTR.exec(attrs); a; a = ATTR.exec(attrs)) {
      const name = a[1]!.toLowerCase();
      const value = a[2] ?? a[3] ?? a[4] ?? "";
      // An `on…` attribute is a function body the page runs. `on` alone is not one, and neither is
      // `once`: the name has to be `on` followed by something, and the something has to be a value.
      if (name.length > 2 && name.startsWith("on") && value) {
        out.push({ kind: "handler", what: `${name}="${cut(value)}"`, bytes: bytesOf(value), text: `${name}=${value}`, offset: at + a.index });
        continue;
      }
      if (URL_ATTRS.has(name) && EXECUTES.test(value.replace(CONTROL, "")))
        out.push({ kind: "url", what: `${name}="${cut(value)}"`, bytes: bytesOf(value), text: `${name}=${value}`, offset: at + a.index });
    }
  };
  OPEN_TAG.lastIndex = 0;
  let end = 0;
  for (let m = OPEN_TAG.exec(html); m; m = OPEN_TAG.exec(html)) { site(m[1]!.toLowerCase(), m[2] ?? "", m.index, m.index + m[0].length); end = OPEN_TAG.lastIndex; }
  const dangling = DANGLING_TAG.exec(html.slice(end));
  if (dangling) site(dangling[1]!.toLowerCase(), dangling[2] ?? "", end + dangling.index, html.length);
  return out;
}

/** True when this HTML introduces script at all — what lint rule 13 asks, and cheaper to read than the list. */
export const hasScript = (html: string): boolean => scriptSites(html).length > 0;

/**
 * What identifies one script site independent of where on a page it landed: its kind and its whole text.
 * The build uses it to recognise, in a finished page, script a plugin's slot put there — the only script
 * whose weight a *declaration* may stand in for.
 */
export const scriptSignature = (s: Pick<ScriptSite, "kind" | "text">): string => `${s.kind}\u0000${s.text}`;
