"use client";

import { useEffect, useRef, useState } from "react";
import { money, tier, tierLabel } from "@/lib/format";
import { decisionsOf, fragmentsOf, stepGlyph, stepTitle, threadsFor } from "@/lib/console/model";
import type { Decision, Fragment, RunDetail } from "@/lib/types";
import type { Selection } from "./Graph";
import { railLabel } from "./Graph";

function TierChip({ trust }: { trust: number }) {
  const t = tier(trust);
  return <span className={`tierchip tier-${t.toLowerCase()}`} title={tierLabel(t)}>{t}</span>;
}

function DecisionDetail({ d }: { d: Decision }) {
  return (
    <div className="in-sec">
      <div className="in-row">
        <span className={`vchip v-${d.verdict.toLowerCase()}`}>{d.verdict.replace("_", " ")}</span>
        <span className="in-mono">{d.id}</span>
      </div>
      <dl className="in-kv">
        <dt>invoice</dt>
        <dd>{d.args.invoice_id}</dd>
        <dt>payee</dt>
        <dd className="in-mono">{d.args.payee}</dd>
        <dt>amount</dt>
        <dd>
          {money(d.args.amount_cents)} {d.args.currency}
        </dd>
      </dl>
      {!!d.reasons?.length && (
        <>
          <h4 className="in-h">Reasons</h4>
          <ul className="in-reasons">
            {d.reasons.map((r) => (
              <li key={r.code}>
                <code>{r.code}</code>
                <span>{r.message}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {!!d.lineage?.length && (
        <>
          <h4 className="in-h">Lineage of the arguments</h4>
          {d.lineage.map((l, i) => (
            <div className="in-lin" key={`${l.field}-${i}`}>
              <div className="in-row">
                <b>{l.field}</b>
                <code>{l.value}</code>
                <span className={`mini ${l.grounded ? "good" : "bad"}`}>{l.grounded ? "grounded" : "not grounded"}</span>
              </div>
              <div className="in-dim">{l.source}</div>
              {(l.origins ?? []).map((o) => (
                <div className="in-origin" key={o.fragment_id}>
                  <div className="in-row">
                    <TierChip trust={o.trust} />
                    <span>{o.kind}</span>
                    <span className="in-mono">{o.fragment_id}</span>
                  </div>
                  <div className="in-snip">{o.snippet}</div>
                  {(o.chain ?? []).map((c) => (
                    <div className="in-chain" key={c.id}>
                      <span className="in-chain-k">came from</span> <TierChip trust={c.trust} /> {c.kind} <span className="in-mono">{c.id}</span>
                      <div className="in-snip">{c.snippet}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </>
      )}
      {d.approval && (
        <p className="in-dim">
          Owner approval <b>{d.approval.status}</b> <span className="in-mono">{d.approval.id}</span>
        </p>
      )}
      {d.payment && (
        <p className="in-dim">
          Payout <b>{d.payment.status}</b> via {railLabel(d.payment.rail)}
        </p>
      )}
    </div>
  );
}

function FragmentDetail({ run, f, onSelect }: { run: RunDetail; f: Fragment; onSelect: (s: Selection) => void }) {
  const decs = decisionsOf(run);
  const last = decs.length ? decs[decs.length - 1].decision : null;
  const threads = threadsFor(run, last).filter((t) => t.fragmentId === f.id);
  const parents = (f.parent_ids ?? []).map((p) => fragmentsOf(run).find((x) => x.id === p)).filter(Boolean) as Fragment[];
  const children = fragmentsOf(run).filter((x) => (x.parent_ids ?? []).includes(f.id));
  const t = tier(f.trust);
  return (
    <div className="in-sec">
      <div className="in-row">
        <TierChip trust={f.trust} />
        <b>{f.kind}</b>
        <span className="in-dim">{tierLabel(t)}</span>
      </div>
      <dl className="in-kv">
        <dt>source</dt>
        <dd>{f.source}</dd>
        <dt>id</dt>
        <dd className="in-mono">{f.id}</dd>
      </dl>
      <h4 className="in-h">Content</h4>
      <pre className="in-pre">{f.snippet}</pre>
      {threads.length > 0 && (
        <p className="in-note">
          {threads.map((th) => (
            <span key={th.key}>
              Origin of the <b>{th.field}</b> <code>{th.value}</code>
              {th.inferred ? " (matched by value)" : ""}.{" "}
            </span>
          ))}
          {f.trust === 0 && "Untrusted: this can never decide where money goes."}
        </p>
      )}
      {parents.map((p) => (
        <button type="button" key={p.id} className="in-link" onClick={() => onSelect({ type: "fragment", id: p.id })}>
          derived from <TierChip trust={p.trust} /> {p.kind}: {p.snippet.slice(0, 80)}
        </button>
      ))}
      {children.map((c) => (
        <button type="button" key={c.id} className="in-link" onClick={() => onSelect({ type: "fragment", id: c.id })}>
          fed into <TierChip trust={c.trust} /> {c.kind}: {c.snippet.slice(0, 80)}
        </button>
      ))}
    </div>
  );
}

export function Inspector({
  run,
  selection,
  onSelect,
  step,
  onSeek,
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
  run: RunDetail;
  selection: Selection;
  onSelect: (s: Selection) => void;
  step: number;
  onSeek: (i: number) => void;
}) {
  const [tab, setTab] = useState<"inspect" | "steps">("inspect");
  const decs = decisionsOf(run);
  const landed = decs.filter((d) => d.stepIndex <= step);
  const dec = landed.length ? landed[landed.length - 1].decision : decs[0]?.decision ?? null;
  const sel: Selection = selection ?? { type: "guard" };
  const steps = run.steps ?? [];
  const curRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (tab === "steps") curRef.current?.scrollIntoView({ block: "nearest" });
  }, [tab, step]);

  const frag = sel.type === "fragment" ? fragmentsOf(run).find((f) => f.id === sel.id) : null;
  return (
    <div className="in">
      <div className="in-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "inspect"} onClick={() => setTab("inspect")}>
          Inspector
        </button>
        <button type="button" role="tab" aria-selected={tab === "steps"} onClick={() => setTab("steps")}>
          Step log <span className="in-n">{steps.length}</span>
        </button>
        <button type="button" className="in-toggle" onClick={onToggle} aria-expanded={open}>
          {open ? "Hide details" : "Show details"}
        </button>
      </div>
      <div className="in-body" role="tabpanel" hidden={!open}>
        {tab === "inspect" && (
          <>
            {sel.type === "guard" && (dec ? <DecisionDetail d={dec} /> : <p className="in-dim in-pad">This run recorded no guard decision: the defense did not inspect provenance. Select a fragment to see where a value appeared.</p>)}
            {sel.type === "fragment" && frag && <FragmentDetail run={run} f={frag} onSelect={onSelect} />}
            {sel.type === "outcome" && (
              <div className="in-sec">
                <p className="in-p">{run.outcome}</p>
                <dl className="in-kv">
                  <dt>class</dt>
                  <dd>{run.outcome_class}</dd>
                  <dt>rail</dt>
                  <dd>{railLabel(run.rail)}</dd>
                </dl>
                {(run.payouts ?? []).map((p, i) => (
                  <div className="in-lin" key={i}>
                    <div className="in-row">
                      <b>{money(p.cents)}</b> to <code>{p.payee}</code>
                    </div>
                    <div className="in-dim">
                      {railLabel(p.rail)} · status {p.status}
                    </div>
                  </div>
                ))}
                {!run.payouts?.length && <p className="in-dim">No payout was recorded for this run.</p>}
              </div>
            )}
          </>
        )}
        {tab === "steps" && (
          <ol className="in-steps">
            {steps.map((s, i) => (
              <li key={s.id} ref={i === step ? curRef : undefined} className={i === step ? "is-now" : i < step ? "is-past" : ""}>
                <button type="button" onClick={() => onSeek(i)}>
                  <span className="in-idx">{i + 1}</span>
                  <span className={`rp-glyph k-${s.kind}`}>{stepGlyph(s)}</span>
                  <span className="in-steptitle">{stepTitle(s)}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
