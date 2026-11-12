"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { DEFENSES, DEFENSE_BLURB, DEFENSE_NAMES, money } from "@/lib/format";
import type { BenchRow, Mode } from "@/lib/types";
import { Markdown } from "./Markdown";

export function BenchPanel() {
  const [rows, setRows] = useState<BenchRow[] | null>(null);
  const [md, setMd] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("compromised");

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [b, r] = await Promise.all([api.bench(), api.benchReport().catch(() => null)]);
        if (!live) return;
        setRows(b ?? []);
        setMd(r?.markdown ?? null);
      } catch (e) {
        if (live) setError(e instanceof ApiError && e.status !== 0 ? e.message : "The Lineage API is not reachable, so the benchmark cannot load.");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const modes = rows ? (Array.from(new Set(rows.map((r) => r.mode))) as Mode[]) : [];
  const shown = rows ? DEFENSES.map((d) => rows.find((r) => r.defense === d && r.mode === mode)).filter(Boolean) as BenchRow[] : [];

  return (
    <div className="bench">
      <p className="lib-intro">
        PayBench-BEC: the same attacks run against each defense. Bars show how often an attack moved money (red) and how often legitimate work still completed (green). The
        provenance-only and binding-only rows are ablations: each half alone is not enough.
      </p>
      {error && <p className="msg msg-error" role="alert">{error}</p>}
      {!rows && !error && <div className="skel-list"><div className="skel" /><div className="skel" /><div className="skel" /></div>}
      {rows && rows.length === 0 && <p className="msg">No benchmark results are available on this server.</p>}
      {rows && rows.length > 0 && (
        <>
          {modes.length > 1 && (
            <div className="seg" role="group" aria-label="Agent mode">
              {modes.map((m) => (
                <button key={m} type="button" className={m === mode ? "is-on" : ""} aria-pressed={m === mode} onClick={() => setMode(m)}>
                  {m === "compromised" ? "simulated compromised agent" : m}
                </button>
              ))}
            </div>
          )}
          <div className="bchart" role="table" aria-label={`Attack success by defense, ${mode} mode`}>
            {shown.map((r) => {
              const asr = r.attacks ? r.wins / r.attacks : 0;
              const ok = r.benign ? r.benign_ok / r.benign : 0;
              const lin = r.defense === "lineage";
              return (
                <div className={`brow${lin ? " is-lineage" : ""}`} role="row" key={r.defense} title={DEFENSE_BLURB[r.defense]}>
                  <div className="brow-name" role="rowheader">
                    {DEFENSE_NAMES[r.defense]}
                    {r.defense.startsWith("lineage_") && <span className="flag">ablation</span>}
                  </div>
                  <div className="brow-bars" role="cell">
                    <div className="bar-line">
                      <div className="bar bad" style={{ width: `${Math.max(asr * 100, asr > 0 ? 1 : 0)}%` }} />
                      <span className="bar-val">
                        {Math.round(asr * 100)}% <em>{r.wins}/{r.attacks} attacks won</em>
                      </span>
                    </div>
                    <div className="bar-line">
                      <div className="bar good" style={{ width: `${ok * 100}%` }} />
                      <span className="bar-val">
                        {Math.round(ok * 100)}% <em>{r.benign_ok}/{r.benign} benign done</em>
                      </span>
                    </div>
                  </div>
                  <div className="brow-lost" role="cell">
                    <b className={r.lost_cents > 0 ? "bad" : "good"}>{money(r.lost_cents)}</b>
                    <span>lost{r.p95_ms ? ` · p95 ${r.p95_ms.toFixed(2)}ms` : ""}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="legend"><i className="bad" /> attack succeeded <i className="good" /> benign completed</div>
        </>
      )}
      {md && (
        <div className="bench-report">
          <Markdown source={md} />
        </div>
      )}
    </div>
  );
}
