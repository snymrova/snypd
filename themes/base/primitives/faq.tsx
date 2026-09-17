import type { PrimitiveProps, Html } from "@snypd/render";
import { jsx, raw } from "@snypd/render";
/**
 * Body is "### question" headings followed by answers; FAQPage schema is emitted in S7 from the same
 * headings, off the markdown, so nothing here changes what a search engine reads.
 *
 * Each question is a `<details>` (U7, docs/14 §4.3): the platform's own disclosure — keyboard, screen
 * reader, find-in-page opening the right answer, no script — and `name=` makes the set exclusive, one
 * open at a time. The split is the renderer's (`sections`), not a second walk over the markdown: the
 * heading keeps the id the renderer issued, so `#does-llms-txt-help-ranking` still lands on the
 * question, and the browser opens the `<details>` around a fragment target on its own. The `.md` twin
 * is the source and is not touched — the source is `###` headings, and this is what a theme does with
 * them. A body with no headings renders as it always did.
 *
 * The title is the author's, not the spec's (docs/19 §2 · 3, S29 · U10): a `faq` with no `title` renders
 * no heading of its own — under a `##` the section's heading is enough, and "FAQ" between it and the
 * questions was a blog's label the reader did not ask for. Given, the title is one heading level under
 * the section the block sits in (docs/18, decision 189) and the questions render one level under the
 * title, so the outline nests (WCAG 1.3.1) — the author keeps writing `###`; only the HTML level moves.
 * Without a title the questions keep the level the author wrote. The FAQPage schema and the `.md` twin
 * read the markdown and see none of this.
 */
export default function Faq({ props, body, sections, block, depth }: PrimitiveProps): Html {
  const titled = typeof props.title === "string" && props.title.trim() !== "";
  const level = Math.min(depth + 1, 6);
  const title = titled ? jsx(`h${level}`, { children: props.title as string }) : null;
  const { lead, sections: qs } = sections();
  if (!qs.length) return <section class="snypd-faq">{title}{body}</section>;
  // One group per block, so two `faq`s on a page do not close each other's answers.
  const group = `faq-${block.node.position?.start.line ?? qs[0]!.id ?? "0"}`;
  return (
    <section class="snypd-faq">
      {title}
      {lead}
      {qs.map((q) => {
        const h = titled ? Math.min(level + 1, 6) : q.depth;
        return (
        <details class="snypd-faq-item" name={group}>
          <summary>{raw(`<h${h}${q.id ? ` id="${q.id}"` : ""}>${q.title.html}</h${h}>`)}</summary>
          <div class="snypd-faq-answer">{q.body}</div>
        </details>
        );
      })}
    </section>
  );
}
