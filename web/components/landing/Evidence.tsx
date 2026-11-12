"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { SplitText } from "@/components/ui/SplitText";
import { money } from "@/lib/format";
import type { BenchRow } from "@/lib/types";
import { ATTACKS, DEFENSE_ROWS, compromisedRows, findRow, pct } from "./bench";

const LIMITS = [
  ["Exact-match tracing.", "Lineage follows identifiers, an address or an ID, not paraphrases or derived values. Memory written while untrusted text was in view is conservatively marked T0."],
  ["A small, author-written benchmark.", "Twelve attacks and five benign tasks, written by us. They show where each layer helps, not how it fares against attackers we have not imagined."],
  ["A simulated attacker.", "The compromised agent is a scripted worst case that follows the latest payment instruction in any context. It is a simulation, not a measured model."],
  ["Out of scope.", "A poisoned vendor master or a compromised owner channel defeats the trust root. Lineage does not defend against those."],
  ["No network in the numbers.", "The rail is simulated in the benchmark, and decision time is the guard's own compute, not a round trip."],
];

export function Evidence({ rows }: { rows: BenchRow[] | null }) {
  const [hot, setHot] = useState<number | null>(null);
  const live = compromisedRows(rows);
  const none = findRow(rows, "none");
  const full = findRow(rows, "lineage");
  const n = ATTACKS.length;

  const staticWins = useMemo(() => {
    const m: Record<string, number> = {};
    DEFENSE_ROWS.forEach((d) => (m[d.id] = ATTACKS.filter((a) => a.lost.includes(d.id)).length));
    return m;
  }, []);
  const drift = live.length > 0 && DEFENSE_ROWS.some((d) => findRow(rows, d.id) && findRow(rows, d.id)!.wins !== staticWins[d.id]);
  const a = hot != null ? ATTACKS[hot] : null;

  return (
    <section className="evidence" id="evidence">
      <div className="sec-head">
        <p className="mono-label sec-no">§ 04 — The evidence</p>
        <p className="mono-label sec-aside">PayBench-BEC · simulated compromised agent</p>
      </div>

      <div className="evidence-intro">
        <SplitText as="h2" className="display h2" text={"Each layer alone\n*leaks.* Together,\nnone of twelve."} />
        <Reveal className="evidence-big" delay={0.1}>
          {none && full ? (
            <>
              <p className="big-n display">
                <span>{none.wins}</span>
                <small>of {none.attacks}</small>
                <i aria-hidden="true">→</i>
                <span className="zero">{full.wins}</span>
                <small>of {full.attacks}</small>
              </p>
              <p className="big-c">
                attacks succeed against a simulated compromised agent, with no guard and behind full Lineage.{" "}
                {full.benign_ok}/{full.benign} benign tasks still complete. The guard decides in{" "}
                {full.p95_ms ? `${full.p95_ms < 1 ? "under 1" : full.p95_ms.toFixed(1)} ms (p95)` : "well under a millisecond"}.
              </p>
            </>
          ) : (
            <p className="big-c">The live benchmark could not be loaded. Check that the Lineage API is running, then reload.</p>
          )}
        </Reveal>
      </div>

      <Reveal className="matrix" delay={0.05}>
        <div className="matrix-key mono-label">
          <span>
            <i className="cell lost" /> Money got out
          </span>
          <span>
            <i className="cell held" /> Attack stopped
          </span>
          <span>Binding-only and provenance-only rows switch off one layer of Lineage</span>
          <span className="matrix-hint">Hover or tap a column</span>
        </div>

        <div className="matrix-grid" data-hot={hot != null} role="table" aria-label="Attack outcomes by defense, simulated compromised agent" onPointerLeave={() => setHot(null)}>
          <div className="mrow mhead" role="row">
            <div className="mlabel" role="columnheader" />
            <div className="mcells" role="presentation">
              {ATTACKS.map((x, i) => (
                <button key={x.code} className={`mcode mono-label${hot === i ? " is-hot" : ""}`} onPointerEnter={() => setHot(i)} onFocus={() => setHot(i)} onClick={() => setHot(i)} aria-label={`${x.code}, ${x.name}`}>
                  {x.code}
                </button>
              ))}
            </div>
            <div className="mstat mono-label" role="columnheader">
              Attacks won
            </div>
          </div>
          {DEFENSE_ROWS.map((d) => {
            const r = findRow(rows, d.id);
            const wins = r ? r.wins : staticWins[d.id];
            const total = r ? r.attacks : n;
            return (
              <div className={`mrow${d.id === "lineage" ? " is-full" : ""}${d.id === "lineage_prov_only" || d.id === "lineage_bind_only" ? " is-ablate" : ""}`} role="row" key={d.id}>
                <div className="mlabel" role="rowheader">
                  <b>{d.name}</b>
                  <span>{d.blurb}</span>
                </div>
                <div className="mcells" role="presentation">
                  {ATTACKS.map((x, i) => {
                    const lost = x.lost.includes(d.id);
                    return (
                      <i
                        key={x.code}
                        role="cell"
                        aria-label={`${x.code}: ${lost ? "money got out" : "stopped"}`}
                        className={`cell ${lost ? "lost" : "held"}${hot === i ? " is-hot" : ""}`}
                        onPointerEnter={() => setHot(i)}
                      />
                    );
                  })}
                </div>
                <div className="mstat" role="cell">
                  <span className="mstat-n display">
                    {wins}
                    <small>/{total}</small>
                  </span>
                  {r && (
                    <span className="mstat-s mono">
                      {pct(r)}% · {money(r.lost_cents)} lost
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="matrix-read" aria-live="polite">
          {a ? (
            <p>
              <b className="mono-label">
                {a.code} · {a.name}
              </b>
              <span>{a.note}</span>
              <span className="mono">
                Lost under: {a.lost.map((id) => DEFENSE_ROWS.find((d) => d.id === id)?.name).join(", ")}.{" "}
                {a.lost.includes("lineage") ? "" : "Stopped by full Lineage."}
              </span>
            </p>
          ) : (
            <p className="matrix-idle mono-label">Pick an attack to see which defenses let it through.</p>
          )}
        </div>
        {drift && <p className="matrix-drift mono-label">The live totals differ from the per-attack grid recorded in results/latest.md; the grid is from that recorded run.</p>}
      </Reveal>

      <div className="insights">
        <Reveal as="div" className="insight">
          <span className="mono-label">Provenance alone</span>
          <p>
            Stops nine of twelve. It loses A5, A6 and I3: an inflated amount, a repeated invoice, a stale intent. Attacks about a{" "}
            <em>value or its timing</em> rather than where it was born.
          </p>
        </Reveal>
        <Reveal as="div" className="insight" delay={0.08}>
          <span className="mono-label">Binding alone</span>
          <p>
            Stops two: A4 and A5. It loses the other ten, including every injection and every swapped destination. Checking
            values against records is not a substitute for knowing where they came from.
          </p>
        </Reveal>
        <Reveal as="div" className="insight" delay={0.16}>
          <span className="mono-label">Together</span>
          <p>
            Stops all twelve, including A6 and I3, which each layer alone lets through. The layers compound rather than
            overlap. This is a statement about twelve attacks, not about all of them.
          </p>
        </Reveal>
      </div>

      <div className="evidence-cta">
        <Link className="link-u" href="/console?panel=benchmark">
          Open the full benchmark in the Console →
        </Link>
      </div>

      <div className="limits">
        <Reveal as="h3" className="display h3">
          What this does <em>not</em> prove.
        </Reveal>
        <ol>
          {LIMITS.map(([t, d], i) => (
            <Reveal as="li" key={t} delay={i * 0.05}>
              <span className="mono-label">{String(i + 1).padStart(2, "0")}</span>
              <p>
                <b>{t}</b> {d}
              </p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
