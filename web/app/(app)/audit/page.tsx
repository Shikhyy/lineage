import type { Metadata } from "next";
import { ErrorState } from "@/components/app/ErrorState";
import { api, fetched } from "@/lib/api";
import { formatTime } from "@/lib/format";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage() {
  const [verify, records] = await Promise.all([fetched(api.auditVerify()), fetched(api.audit(100))]);

  return (
    <>
      <h1>Audit log</h1>
      {verify.ok ? (
        <div className="card verified" role="status">
          <span>Hash chain:</span>
          {verify.data.ok ? (
            <>
              <span className="chip v-allow">OK</span> {verify.data.records} records verified
            </>
          ) : (
            <>
              <span className="chip v-block">BROKEN</span> first broken record: seq {verify.data.broken_seq}
            </>
          )}
          <span>
            · machine-readable: <a href="/v1/audit/verify">/v1/audit/verify</a>
          </span>
        </div>
      ) : (
        <ErrorState {...verify} />
      )}

      {!records.ok ? (
        <ErrorState {...records} />
      ) : records.data.length ? (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Seq</th>
                <th scope="col">Kind</th>
                <th scope="col">Payload</th>
                <th scope="col">Time</th>
                <th scope="col">Hash</th>
              </tr>
            </thead>
            <tbody>
              {records.data.map((r) => (
                <tr key={r.seq}>
                  <td>{r.seq}</td>
                  <td>{r.kind}</td>
                  <td className="payload"><code>{JSON.stringify(r.payload)}</code></td>
                  <td className="time">{formatTime(r.created_at)}</td>
                  <td className="hash"><code title={r.record_hash}>{r.record_hash.slice(0, 12)}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No records yet. Run a scenario to write the first entry.</p>
      )}
    </>
  );
}
