import type { PrimitiveProps, Html } from "@snypd/render";
/** S6: the spec fallback — nodes as a list, edges as "from -> to". Layout + SVG land in S9 (viz/diagram). */
type Node = { id: string; label?: string; kind?: string }; type Edge = { from: string; to: string; label?: string };
export default function Diagram({ props, data }: PrimitiveProps): Html {
  const d = (data ?? {}) as { nodes?: Node[]; edges?: Edge[] };
  const label = new Map((d.nodes ?? []).map((n) => [n.id, n.label ?? n.id]));
  return (
    <figure class="snypd-diagram" data-direction={props.direction as string}>
      <ul class="snypd-diagram-nodes">{(d.nodes ?? []).map((n) => <li id={`node-${n.id}`}>{n.label ?? n.id}</li>)}</ul>
      <ol class="snypd-diagram-edges">{(d.edges ?? []).map((e) => <li>{label.get(e.from) ?? e.from} {"->"} {label.get(e.to) ?? e.to}{e.label ? <> ({e.label})</> : null}</li>)}</ol>
      <figcaption>{props.caption as string}</figcaption>
    </figure>
  );
}
