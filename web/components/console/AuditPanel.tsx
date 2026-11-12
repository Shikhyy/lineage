"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { clock, shortHash } from "@/lib/format";
import type { AuditRecord, AuditVerify } from "@/lib/types";

function summary(r: AuditRecord): string {
  const p = r.payload as Record<string, unknown>;
  const bits: string[] = [];
  if (typeof p.verdict === "string") bits.push(p.verdict);
  if (typeof p.tool === "string") bits.push(String(p.tool));
  if (Array.isArray(p.reasons)) bits.push((p.reasons as { code?: string }[]).map((x) => x.code).filter(Boolean).join(", "));
  if (typeof p.status === "string") bits.push(String(p.status));
  if (typeof p.action === "string") bits.push(String(p.action));
  return bits.filter(Boolean).join(" · ") || r.kind;
}

export function AuditPanel({ activeRunId }: { activeRunId: string | null }) {
  const [records, setRecords] = useState<AuditRecord[] | null>(null);
  const [verify, setVerify] = useState<AuditVerify | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [rs, v] = await Promise.all([api.audit(200), api.auditVerify()]);
        if (!live) return;
        setRecords(rs ?? []);
        setVerify(v);
        setError(null);
      } catch (e) {
        if (live) setError(e instanceof ApiError && e.status !== 0 ? e.message : "The Lineage API is not reachable, so the audit log cannot load.");
      }
    })();
    return () => {
      live = false;
    };
  }, [nonce]);

  return (
    <div className="aud">
      <div className="aud-top">
        {verify ? (
          <span className={`verify ${verify.ok ? "ok" : "bad"}`} role="status">
            {verify.ok ? `chain verified ✓ ${verify.records} records` : `chain BROKEN at seq ${verify.broken_seq ?? "?"} (${verify.records} records)`}
          </span>
        ) : error ? null : (
          <span className="verify wait">verifying…</span>
        )}
        <button type="button" className="linkbtn" onClick={() => setNonce((n) => n + 1)}>re-verify</button>
      </div>
      <p className="lib-intro">
        Every guard decision is appended to a hash-chained log: each record carries the hash of the one before it, so editing history breaks the chain.
      </p>
      {error && <p className="msg msg-error" role="alert">{error}</p>}
      {!records && !error && <div className="skel-list"><div className="skel" /><div className="skel" /><div className="skel" /></div>}
      {records && records.length === 0 && <p className="msg">The log is empty. Run something and the decision lands here.</p>}
      {records && records.length > 0 && (
        <ol className="chain">
          {records.map((r, i) => {
            const next = records[i + 1];
            const linked = next ? r.prev_hash === next.record_hash : r.seq === 1 || /^0+$/.test(r.prev_hash) || r.prev_hash === "";
            const mine = !!activeRunId && (r.payload as { run_id?: string }).run_id === activeRunId;
            const broken = verify && !verify.ok && verify.broken_seq === r.seq;
            return (
              <li key={r.seq} className={`block${mine ? " is-mine" : ""}${broken ? " is-broken" : ""}`}>
                <button type="button" className="block-main" onClick={() => setOpen(open === r.seq ? null : r.seq)} aria-expanded={open === r.seq}>
                  <span className="block-seq">#{r.seq}</span>
                  <span className={`kindchip k-${r.kind}`}>{r.kind}</span>
                  <span className="block-sum">{summary(r)}</span>
                  <span className="block-time">{clock(r.created_at)}</span>
                  {mine && <span className="mini good">this run</span>}
                </button>
                <div className="block-hash">
                  <span title={r.prev_hash}>prev {shortHash(r.prev_hash, 6)}</span>
                  <span className="arrow">{linked ? "⛓ matches" : "✕ mismatch"}</span>
                  <span title={r.record_hash}>hash <b>{shortHash(r.record_hash, 6)}</b></span>
                </div>
                {open === r.seq && <pre className="in-pre">{JSON.stringify(r.payload, null, 2)}</pre>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
