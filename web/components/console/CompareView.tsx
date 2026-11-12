"use client";

import { useMemo, useState } from "react";
import { DEFENSE_NAMES, money, tier } from "@/lib/format";
import { decisionsOf, outcomeOf } from "@/lib/console/model";
import { useReplay } from "@/lib/console/replay";
import type { RunDetail } from "@/lib/types";
import { Graph, railLabel, type Selection } from "./Graph";
import { Replay } from "./Replay";
import { useRunDetail } from "./useRunDetail";

function payeeOrigin(run: RunDetail): string | null {
  const decs = decisionsOf(run);
  const d = decs.length ? decs[decs.length - 1].decision : null;
  const lin = d?.lineage?.find((l) => l.field === "payee");
  if (!lin) return null;
  const o = lin.origins?.[0];
  if (!o) return lin.grounded ? lin.source : null;
  const chain = (o.chain ?? []).map((c) => `${c.kind} (${tier(c.trust)})`);
  return [`${o.kind} (${tier(o.trust)})`, ...chain].join(" ← ");
}

function Summary({ a, b }: { a: RunDetail; b: RunDetail }) {
  const oa = outcomeOf(a);
  const ob = outcomeOf(b);
  const da = decisionsOf(a);
  const db = decisionsOf(b);
  const lastB = db.length ? db[db.length - 1].decision : null;
  const protectedCents = a.outcome_class === "moved" && b.outcome_class !== "moved" ? (oa.cents ?? 0) : 0;
  const originB = payeeOrigin(b);
  const tone = (k: string) => (k === "moved-bad" || k === "failed" ? "bad" : k === "held" || k === "blocked" || k === "moved-ok" ? "good" : "neutral");
  const sentence = (r: RunDetail, o: ReturnType<typeof outcomeOf>) =>
    o.kind === "held" || o.kind === "blocked"
      ? o.headline
      : o.headline === "Paid after owner approval" && o.cents !== null
        ? `${o.headline}: ${money(o.cents)} to ${o.payee}`
        : r.outcome.replace(/\.$/, "");
  return (
    <section className="cmp-sum" aria-label="Difference">
      <div className={`cmp-sum-col ${tone(oa.kind)}`}>
        <div className="micro">{DEFENSE_NAMES[a.run.defense]}</div>
        <p className="cmp-big">{sentence(a, oa)}</p>
        <p className="cmp-dim">{da.length === 0 ? "No provenance decision was recorded." : `Guard said ${da[da.length - 1].decision.verdict.replace("_", " ")}.`}</p>
      </div>
      <div className="cmp-sum-mid" aria-hidden="true">
        <span>vs</span>
      </div>
      <div className={`cmp-sum-col ${tone(ob.kind)}`}>
        <div className="micro">{DEFENSE_NAMES[b.run.defense]}</div>
        <p className="cmp-big">{sentence(b, ob)}</p>
        <p className="cmp-dim">
          {lastB ? `Guard said ${lastB.verdict.replace("_", " ")}` : "No decision recorded"}
          {lastB?.reasons?.length ? ` · ${lastB.reasons.map((r) => r.code).join(", ")}` : ""}.
          {originB ? ` The payee traced to ${originB}.` : ""}
        </p>
      </div>
      {protectedCents > 0 && (
        <div className="cmp-delta" role="status">
          <b>{money(protectedCents)}</b> would have moved to <code>{oa.payee}</code> and was not.
          <span className="cmp-rail"> {railLabel(oa.rail ?? a.rail)}.</span>
        </div>
      )}
    </section>
  );
}

function Pane({ label, run, step }: { label: string; run: RunDetail; step: number }) {
  const [sel, setSel] = useState<Selection>(null);
  const o = outcomeOf(run);
  return (
    <section className={`cmp-pane kind-${o.kind}`} aria-label={label}>
      <header className="cmp-pane-head">
        <span className={`dtag d-${run.run.defense}`}>{DEFENSE_NAMES[run.run.defense]}</span>
        <span className="cmp-pane-label">{label}</span>
        <a className="linkbtn" href={`/console/runs/${run.run.id}`}>open full run</a>
      </header>
      <Graph run={run} step={step} selection={sel} onSelect={setSel} compact />
    </section>
  );
}

export function CompareView({ a, b }: { a: string | null; b: string | null }) {
  const ra = useRunDetail(a);
  const rb = useRunDetail(b);
  const aData = ra.state === "ok" ? ra.data : null;
  const bData = rb.state === "ok" ? rb.data : null;
  const delay = useMemo(() => () => 55, []);
  const rp = useReplay(101, `${a}|${b}`, delay);
  const stepOf = (r: RunDetail) => Math.round((rp.index / 100) * Math.max(0, (r.steps?.length ?? 1) - 1));

  if (!a || !b) {
    return (
      <div className="msg-page">
        <h2>Compare needs two runs</h2>
        <p>Use the Compare button to run the same attack with no defense and with lineage, or open a link like <code>/console/compare?a=RUN_ID&amp;b=RUN_ID</code>.</p>
      </div>
    );
  }
  const err = ra.state === "error" ? ra : rb.state === "error" ? rb : null;
  if (err) {
    return (
      <div className="msg-page">
        <h2>{err.status === 0 ? "The Lineage API is not reachable" : "This comparison cannot be loaded"}</h2>
        <p>{err.message}</p>
      </div>
    );
  }
  if (!aData || !bData) {
    return (
      <div className="cmp" aria-busy="true">
        <div className="skel big" />
        <div className="cmp-panes"><div className="skel tall" /><div className="skel tall" /></div>
      </div>
    );
  }
  const mismatch = aData.run.scenario_id !== bData.run.scenario_id;
  return (
    <div className="cmp">
      <div className="cmp-head">
        <div className="micro">compare · same attack, two defenses</div>
        <h1>{aData.scenario_title || aData.run.scenario_id}</h1>
        {mismatch && <p className="msg">These two runs are from different scenarios, so the comparison is not like for like.</p>}
      </div>
      <Summary a={aData} b={bData} />
      <div className="cmp-panes">
        <Pane label="Without a guard" run={aData} step={stepOf(aData)} />
        <Pane label="With the guard" run={bData} step={stepOf(bData)} />
      </div>
      <Replay
        steps={[]}
        total={101}
        index={rp.index}
        playing={rp.playing}
        onSeek={rp.seek}
        onToggle={rp.toggle}
        onReplay={rp.replay}
        label="Shared replay across both runs"
        percent
      />
    </div>
  );
}
