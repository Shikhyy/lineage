import Link from "next/link";
import type { ReactNode } from "react";
import { money } from "@/lib/format";
import type { Decision, LineageEntry } from "@/lib/types";
import { TrustChip, VerdictChip } from "./Chips";

function Lineage({ entries }: { entries: LineageEntry[] }) {
  return (
    <>
      {entries.map((l, i) => (
        <div className="lin" key={`${l.field}-${i}`}>
          <div>
            <b>{l.field}</b> <code>{l.value}</code>{" "}
            {l.grounded ? <span className="chip v-allow">grounded</span> : <span className="chip v-block">not grounded</span>}
          </div>
          <div className="muted">{l.source}</div>
          {!!l.origins?.length && (
            <ul className="tree">
              {l.origins.map((o) => (
                <li key={o.fragment_id}>
                  <TrustChip trust={o.trust} withLabel /> {o.kind} <code>{o.fragment_id}</code>
                  <div className="snip">{o.snippet}</div>
                  {!!o.chain?.length && (
                    <ul>
                      {o.chain.map((c) => (
                        <li className="parent" key={c.id}>
                          came from <TrustChip trust={c.trust} /> {c.kind} <code>{c.id}</code>
                          <div className="snip">{c.snippet}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </>
  );
}

/** A guard decision with its reasons and lineage tree. `actions` renders inside the card (e.g. approve/reject). */
export function DecisionCard({ d, actions }: { d: Decision; actions?: ReactNode }) {
  return (
    <div className={`card verdict-${d.verdict.toLowerCase()}`}>
      <div className="row">
        <VerdictChip value={d.verdict} />
        <span>
          pay <b>{money(d.args.amount_cents)}</b> {d.args.currency} for <code>{d.args.invoice_id}</code> to{" "}
          <code>{d.args.payee}</code>
        </span>
      </div>
      {!!d.reasons?.length && (
        <ul className="reasons">
          {d.reasons.map((r, i) => (
            <li key={i}>
              <VerdictChip value={r.effect} /> <code>{r.code}</code> {r.message}
            </li>
          ))}
        </ul>
      )}
      {d.lineage && <Lineage entries={d.lineage} />}
      {d.approval && (
        <div className="row">
          Owner approval: <b>{d.approval.status}</b>
          {d.approval.status === "pending" && !actions && (
            <>
              {" "}
              · <Link href="/approvals">review in approvals</Link>
            </>
          )}
        </div>
      )}
      {d.payment && (
        <div className="row">
          Payout: <b>{d.payment.status}</b> via {d.payment.rail}
        </div>
      )}
      {actions}
    </div>
  );
}
