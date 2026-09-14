import type { PrimitiveProps, Html } from "@snypd/render";
import { raw } from "@snypd/render";
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
 */
export default function Faq({ props, body, sections, block }: PrimitiveProps): Html {
  const { lead, sections: qs } = sections();
  if (!qs.length) return <section class="snypd-faq"><h2>{props.title as string}</h2>{body}</section>;
  // One group per block, so two `faq`s on a page do not close each other's answers.
  const group = `faq-${block.node.position?.start.line ?? qs[0]!.id ?? "0"}`;
  return (
    <section class="snypd-faq">
      <h2>{props.title as string}</h2>
      {lead}
      {qs.map((q) => (
        <details class="snypd-faq-item" name={group}>
          <summary>{raw(`<h${q.depth}${q.id ? ` id="${q.id}"` : ""}>${q.title.html}</h${q.depth}>`)}</summary>
          <div class="snypd-faq-answer">{q.body}</div>
        </details>
      ))}
    </section>
  );
}
