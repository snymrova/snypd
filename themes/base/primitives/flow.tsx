import type { PrimitiveProps, Html } from "@snypd/render";
import { raw, inline } from "@snypd/render";
import { renderFlow } from "@snypd/viz";
/**
 * S10: the SVG from `@snypd/viz` — the sugar desugars to a graph and goes through the `diagram` painter,
 * so a flow inherits the same layout, the same `--color-viz-*` seam and the same zero client JS.
 *
 * The spec's declared fallback ("a numbered step list with If ask — yes: … / no: … lines") is the path for a
 * body the renderer cannot lay out: no `steps:`, or steps it could not read. It shows what the author
 * actually wrote, so the page still carries the procedure while lint (rule 2) says why there is no picture.
 * Renderer warnings are not printed here: the renderer does not lint (html.ts).
 */
type Step = string | { id?: string; do?: string; ask?: string; yes?: Step | Step[]; no?: Step | Step[]; then?: string };
function Steps({ steps }: { steps: Step[] }): Html {
  return <ol>{steps.map((s) => <Item step={s} />)}</ol>;
}
function Item({ step }: { step: Step }): Html {
  if (typeof step === "string") return <li>{step}</li>;
  if (Array.isArray(step)) return <li><Steps steps={step} /></li>;
  if (step.then) return <li>then: {step.then}</li>;
  if (step.ask) return (
    <li>
      {step.ask}
      <ul>
        <li>yes: <Branch b={step.yes} /></li>
        <li>no: <Branch b={step.no} /></li>
      </ul>
    </li>
  );
  return <li id={step.id ? `step-${step.id}` : undefined}>{step.do ?? ""}</li>;
}
function Branch({ b }: { b?: Step | Step[] }): Html {
  if (b === undefined) return <></>;
  if (Array.isArray(b)) return <Steps steps={b} />;
  return <Steps steps={[b]} />;
}
export default function Flow({ props, data }: PrimitiveProps): Html {
  const direction = props.direction as string | undefined;
  const caption = props.caption as string | undefined;
  const flow = renderFlow({ data, direction, caption, title: props.title as string | undefined });
  const d = (data ?? {}) as { steps?: Step[] };
  return (
    <figure class="snypd-flow" data-direction={direction}>
      {flow ? <div class="snypd-scroll" tabindex="0">{raw(flow.svg)}</div> : (d.steps ?? []).length ? <Steps steps={d.steps ?? []} /> : null}
      <figcaption>{inline(caption)}</figcaption>
    </figure>
  );
}
