import type { PrimitiveProps, Html } from "@snypd/render";
import { raw } from "@snypd/render";
import { renderDiagram } from "@snypd/viz";
/**
 * S9: the SVG from `@snypd/viz` — layers from the spec, colour from `--color-viz-*`, no client JS.
 *
 * The spec's declared fallback ("an `id → id (label)` edge list followed by the caption") is the path for a
 * body the renderer cannot lay out: no `nodes:`, or nodes it could not read. It shows what the author
 * actually wrote, so the page still carries the graph while lint (rule 2) says why there is no picture.
 * Renderer warnings are not printed here: the renderer does not lint (html.ts).
 */
type Node = { id: string; label?: string; kind?: string };
type Edge = { from: string; to: string; label?: string };

export default function Diagram({ props, data }: PrimitiveProps): Html {
  const direction = props.direction as string | undefined;
  const caption = props.caption as string | undefined;
  const diagram = renderDiagram({ data, direction, caption, title: props.title as string | undefined });
  const figcaption = <figcaption>{caption}</figcaption>;
  const figure = (inner: Html | null) => <figure class="snypd-diagram" data-direction={direction}>{inner}{figcaption}</figure>;

  if (diagram) return figure(raw(diagram.svg));

  const d = (data ?? {}) as { nodes?: Node[]; edges?: Edge[] };
  const label = new Map((d.nodes ?? []).map((n) => [n.id, n.label ?? n.id]));
  if (!(d.nodes ?? []).length && !(d.edges ?? []).length) return figure(null);
  return figure(
    <>
      <ul class="snypd-diagram-nodes">{(d.nodes ?? []).map((n) => <li>{n.label ?? n.id}</li>)}</ul>
      <ol class="snypd-diagram-edges">{(d.edges ?? []).map((e) => <li>{label.get(e.from) ?? e.from} {"->"} {label.get(e.to) ?? e.to}{e.label ? <> ({e.label})</> : null}</li>)}</ol>
    </>,
  );
}
