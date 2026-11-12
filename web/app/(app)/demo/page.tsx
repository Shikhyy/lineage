import type { Metadata } from "next";
import Link from "next/link";
import { ErrorState } from "@/components/app/ErrorState";
import { RunForm } from "@/components/app/Forms";
import { api, fetched } from "@/lib/api";
import { formatTime, modeLabel } from "@/lib/format";
import { ownerCookie } from "@/lib/server";

export const metadata: Metadata = { title: "Run a scenario" };

export default async function DemoPage() {
  const [scenarios, runs, me] = await Promise.all([
    fetched(api.scenarios()),
    fetched(api.runs()),
    fetched(api.me({ cookie: await ownerCookie() })),
  ]);

  return (
    <>
      <h1>Run a scenario</h1>
      <p className="muted">
        Pick an attack or a benign invoice, an agent mode and a defense. Every decision is written to the audit log.
      </p>

      {scenarios.ok ? (
        <RunForm scenarios={scenarios.data} llmModel={me.ok && me.data.llm ? me.data.llm_model : null} />
      ) : (
        <ErrorState {...scenarios} />
      )}
      <p className="muted">
        The <b>compromised</b> mode is a simulation of a worst-case agent that always follows the latest payment
        instruction it has seen. It is labelled as such on every run.
      </p>

      <h2>Recent runs</h2>
      {!runs.ok ? (
        <ErrorState {...runs} />
      ) : runs.data.length ? (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Run</th>
                <th scope="col">Scenario</th>
                <th scope="col">Mode</th>
                <th scope="col">Defense</th>
                <th scope="col">Started</th>
              </tr>
            </thead>
            <tbody>
              {runs.data.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/runs/${r.id}`}>{r.id}</Link></td>
                  <td>{r.scenario_id}</td>
                  <td>{modeLabel(r.mode)}</td>
                  <td>{r.defense}</td>
                  <td>{formatTime(r.started_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No runs yet.</p>
      )}
    </>
  );
}
