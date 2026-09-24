/**
 * The contents list (U6b), carved from `technical` (docs/36 §2) — the part `base` declares empty and this
 * piece fills. It was the one thing `technical` wanted that the theme contract did not already have, and
 * the whole of what it needed was a slot in the post layout and the heading tree on the page; no layout
 * is forked, which is D8.
 *
 * `page.headings` is what the renderer issued the ids from, so every `href` here points at an element
 * that exists and carries the de-duplicated id — a second walk over the markdown would have had to
 * re-derive the `-1` on the second "Notes" and would have got it wrong the first time two posts differed.
 *
 * Headings inside a primitive are absent by construction (an `faq`'s questions are rendered with ids
 * off), which is correct: a contents list is the document's spine, not an inventory of every `h3` on the
 * page.
 */
import { settingText, type Html, type PartProps } from "@snypd/render";

export default function Toc({ ctx, page }: PartProps): Html {
  // `0` is the site saying no. Anything unparseable is the declared default, because a contents list is
  // not worth an exception on a page render — the setting is a closed `select` and cannot get here wrong.
  const depth = Number(settingText(ctx, "tocDepth") ?? "3") || 0;
  const items = depth < 2 ? [] : (page?.headings ?? []).filter((h) => h.depth >= 2 && h.depth <= depth);
  // Two entries is a list of the two things below it, which the reader can already see. Three is where a
  // contents list starts being a map rather than a restatement — and a post with none renders nothing at
  // all, which is why `prose-only` in the fixture is the page that proves the slot costs no bytes.
  if (items.length < 3) return <></>;
  return (
    <nav class="snypd-toc" aria-label="Contents">
      <p class="snypd-toc-label" id="snypd-toc-label">Contents</p>
      <ol aria-labelledby="snypd-toc-label">
        {items.map((h) => (
          <li data-depth={String(h.depth)}><a href={`#${h.id}`}>{h.text}</a></li>
        ))}
      </ol>
    </nav>
  );
}
