import type { Metadata } from "next";
import { DecisionCard } from "@/components/app/DecisionCard";
import { ErrorState } from "@/components/app/ErrorState";
import { api, fetched } from "@/lib/api";
import { modeLabel, money } from "@/lib/format";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Run ${(await params).id}` };
}

export default async function RunPage({ params }: Props) {
  const { id } = await params;
  const res = await fetched(api.run(id));
  if (!res.ok) {
    return (
      <>
        <h1>Run <code>{id}</code></h1>
        <ErrorState error={res.status === 404 ? "No run with that id." : res.error} status={res.status} />
      </>
    );
  }
  const { run, rail, outcome, outcome_class, steps, payouts } = res.data;

  return (
    <>
      <h1>Run <code>{run.id}</code></h1>
      <p>
        Scenario <b>{run.scenario_id}</b> · agent mode <b>{modeLabel(run.mode)}</b> · defense <b>{run.defense}</b> · rail{" "}
        <b>{rail}</b>
      </p>
      <div className={`outcome ${outcome_class}`} role="status">{outcome}</div>

      <h2>Timeline</h2>
      <ol className="timeline">
        {steps?.map((s) => (
          <li key={s.id} className={`step k-${s.kind}`}>
            <span className="kind">{s.kind.replace("_", " ")}</span>
            {s.decision ? <DecisionCard d={s.decision} /> : <span className="summary">{s.summary}</span>}
          </li>
        ))}
      </ol>

      <h2>Payouts</h2>
      {payouts?.length ? (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th scope="col">To</th>
                <th scope="col">Amount</th>
                <th scope="col">Rail</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p, i) => (
                <tr key={i}>
                  <td><code>{p.payee}</code></td>
                  <td>{money(p.cents)}</td>
                  <td>{p.rail}</td>
                  <td>{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No money moved in this run.</p>
      )}
    </>
  );
}
