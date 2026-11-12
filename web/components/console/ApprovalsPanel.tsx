"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { money, tier } from "@/lib/format";
import type { Decision } from "@/lib/types";
import { railLabel } from "./Graph";
import { errorText, useStore } from "./store";

export function OwnerLogin({ onDone }: { onDone?: () => void }) {
  const { reloadAll } = useStore();
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(secret);
      setSecret("");
      await reloadAll();
      onDone?.();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "Wrong owner secret." : errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="login" onSubmit={submit}>
      <p className="lib-intro">Approvals belong to the owner. Enter the owner secret to see held payments and decide them.</p>
      <label className="field">
        <span>Owner secret</span>
        <input type="password" autoComplete="current-password" required value={secret} onChange={(e) => setSecret(e.target.value)} />
      </label>
      <button type="submit" className="btn primary" disabled={busy || !secret}>
        {busy ? "Signing in…" : "Sign in as owner"}
      </button>
      {error && (
        <p className="msg msg-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

/** Approve/reject buttons for one approval. Used inside the approvals drawer and under the graph's outcome. */
export function ApprovalButtons({ approvalId, onResolved, compact }: { approvalId: string; onResolved: (runId: string, status: string) => void; compact?: boolean }) {
  const { refreshApprovals, refreshRuns, me } = useStore();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rail = me.state === "ok" ? me.data.rail : "simulated";

  async function resolve(action: "approve" | "reject") {
    setBusy(action);
    setError(null);
    try {
      const r = await api.resolveApproval(approvalId, action);
      await Promise.all([refreshApprovals(), refreshRuns()]);
      onResolved(r.run_id, r.status);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className={`apr-actions${compact ? " is-compact" : ""}`}>
      <div className="apr-btns">
        <button type="button" className="btn good" disabled={busy !== null} onClick={() => resolve("approve")}>
          {busy === "approve" ? "Approving…" : "Approve and pay"}
        </button>
        <button type="button" className="btn danger" disabled={busy !== null} onClick={() => resolve("reject")}>
          {busy === "reject" ? "Rejecting…" : "Reject"}
        </button>
      </div>
      <p className="apr-rail">Approving executes a payout on the <b>{railLabel(rail)}</b>.</p>
      {error && (
        <p className="msg msg-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function PendingCard({ d, onOpenRun, onResolved }: { d: Decision; onOpenRun: (id: string) => void; onResolved: (runId: string, status: string) => void }) {
  const payeeLin = d.lineage?.find((l) => l.field === "payee");
  const origins = payeeLin?.origins ?? [];
  return (
    <article className="apr-card">
      <div className="in-row">
        <span className={`vchip v-${d.verdict.toLowerCase()}`}>{d.verdict.replace("_", " ")}</span>
        <button type="button" className="linkbtn" onClick={() => onOpenRun(d.run_id)}>
          open run {d.run_id}
        </button>
      </div>
      <p className="apr-line">
        Pay <b>{money(d.args.amount_cents)}</b> {d.args.currency} for <code>{d.args.invoice_id}</code> to <code className="apr-payee">{d.args.payee}</code>
      </p>
      {(d.reasons ?? []).map((r) => (
        <p className="apr-reason" key={r.code}>
          <code>{r.code}</code> {r.message}
        </p>
      ))}
      {origins.length > 0 && (
        <div className="apr-lin">
          <div className="micro">Where the payee came from</div>
          {origins.map((o) => (
            <div key={o.fragment_id} className="in-origin">
              <div className="in-row">
                <span className={`tierchip tier-${tier(o.trust).toLowerCase()}`}>{tier(o.trust)}</span>
                <span>{o.kind}</span>
                <span className="in-dim">{o.source}</span>
              </div>
              <div className="in-snip">{o.snippet}</div>
              {(o.chain ?? []).map((c) => (
                <div className="in-chain" key={c.id}>
                  <span className="in-chain-k">came from</span> <span className={`tierchip tier-${tier(c.trust).toLowerCase()}`}>{tier(c.trust)}</span> {c.kind}
                  <div className="in-snip">{c.snippet}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {d.approval && <ApprovalButtons approvalId={d.approval.id} onResolved={onResolved} />}
    </article>
  );
}

export function ApprovalsPanel({ onOpenRun, onResolved }: { onOpenRun: (id: string) => void; onResolved: (runId: string, status: string) => void }) {
  const { me, approvals, owner, reloadAll, refreshApprovals } = useStore();
  const [outErr, setOutErr] = useState<string | null>(null);

  if (me.state === "loading") return <div className="skel-list"><div className="skel" /><div className="skel" /></div>;
  if (me.state === "error") return <p className="msg msg-error" role="alert">{me.status === 0 ? "The Lineage API is not reachable, so approvals cannot load." : me.message}</p>;
  if (!owner) return <OwnerLogin />;

  async function signOut() {
    try {
      await api.logout();
      await reloadAll();
    } catch (e) {
      setOutErr(errorText(e));
    }
  }

  return (
    <div className="apr">
      <div className="apr-top">
        <span className="in-dim">Signed in as owner · rail: <b>{railLabel(me.data.rail)}</b></span>
        <span className="apr-top-r">
          <button type="button" className="linkbtn" onClick={() => void refreshApprovals()}>refresh</button>
          <button type="button" className="linkbtn" onClick={signOut}>sign out</button>
        </span>
      </div>
      {outErr && <p className="msg msg-error" role="alert">{outErr}</p>}
      {approvals.state === "loading" && <div className="skel-list"><div className="skel" /><div className="skel" /></div>}
      {approvals.state === "error" && <p className="msg msg-error" role="alert">{approvals.status === 0 ? "The Lineage API is not reachable." : approvals.message}</p>}
      {approvals.state === "ok" && (
        <>
          <h3 className="in-h">Pending ({approvals.data.pending?.length ?? 0})</h3>
          {!approvals.data.pending?.length && <p className="msg">Nothing is waiting for you. Run an attack under the lineage defense and a held payment shows up here.</p>}
          {(approvals.data.pending ?? []).map((d) => (
            <PendingCard key={d.id} d={d} onOpenRun={onOpenRun} onResolved={onResolved} />
          ))}
          {!!approvals.data.resolved?.length && (
            <>
              <h3 className="in-h">Recently resolved</h3>
              <ul className="apr-resolved">
                {approvals.data.resolved.map((d) => (
                  <li key={d.id}>
                    <span className={`mini ${d.approval?.status === "approved" ? "good" : "bad"}`}>{d.approval?.status}</span>
                    <code>{d.args.payee}</code> {money(d.args.amount_cents)}
                    <button type="button" className="linkbtn" onClick={() => onOpenRun(d.run_id)}>run</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
