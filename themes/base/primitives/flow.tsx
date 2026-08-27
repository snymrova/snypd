import type { PrimitiveProps, Html } from "@snypd/render";
/** S6: the spec fallback — an ordered step list with nested yes/no branches. Diagram lands in S10 (viz/flow). */
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
  const d = (data ?? {}) as { steps?: Step[] };
  return (
    <figure class="snypd-flow" data-direction={props.direction as string}>
      <Steps steps={d.steps ?? []} />
      <figcaption>{props.caption as string}</figcaption>
    </figure>
  );
}
