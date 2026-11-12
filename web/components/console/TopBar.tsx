"use client";

import Link from "next/link";
import { DEFENSES, DEFENSE_BLURB, DEFENSE_NAMES } from "@/lib/format";
import type { Defense, Mode } from "@/lib/types";
import { Mark } from "@/components/landing/Mark";
import { railLabel } from "./Graph";
import { useStore } from "./store";

export type PanelName = "approvals" | "audit" | "benchmark";

/** The same mark as the landing page and the favicon, so the brand reads as one product. */
export function BrandMark() {
  return <Mark size={26} />;
}

export function TopBar({
  mode,
  setMode,
  defense,
  setDefense,
  onRun,
  onCompare,
  busy,
  panel,
  onPanel,
  onLibrary,
  hasCustomReady,
  onHelp,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  defense: Defense;
  setDefense: (d: Defense) => void;
  onRun: () => void;
  onCompare: () => void;
  busy: string | null;
  panel: PanelName | null;
  onPanel: (p: PanelName | null) => void;
  onLibrary: () => void;
  hasCustomReady: boolean;
  onHelp: () => void;
}) {
  const { me, owner, pending } = useStore();
  const rail = me.state === "ok" ? me.data.rail : null;
  const down = me.state === "error" && me.status === 0;
  const canRun = hasCustomReady && !busy && !down;
  return (
    <header className="tb">
      <div className="tb-brand">
        <Link href="/" className="tb-logo" aria-label="Lineage home">
          <BrandMark />
          <span className="tb-name">Lineage</span>
        </Link>
        <span className="tb-console">console</span>
      </div>

      <div className="tb-status">
        {down && <span className="railbadge rail-down">API unreachable</span>}
        {rail && <span className={`railbadge rail-${rail}`} title="Where a payout would go if a payment executes">{railLabel(rail)}</span>}
      </div>

      <div className="tb-controls">
        <button type="button" className="btn tb-lib" onClick={onLibrary}>
          Library
        </button>
        <label className="tb-sel">
          <span>agent</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} aria-label="Agent mode">
            <option value="compromised">simulated compromised agent</option>
            <option value="scripted">scripted</option>
            {me.state === "ok" && me.data.llm && <option value="llm">llm · {me.data.llm_model}</option>}
          </select>
        </label>
        <label className="tb-sel">
          <span>defense</span>
          <select value={defense} onChange={(e) => setDefense(e.target.value as Defense)} aria-label="Defense" title={DEFENSE_BLURB[defense]}>
            {DEFENSES.map((d) => (
              <option key={d} value={d}>
                {d === "lineage" ? "lineage (full guard)" : DEFENSE_NAMES[d]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn primary" onClick={onRun} disabled={!canRun} title="Run (R)">
          {busy === "run" ? "Running…" : "Run"} <kbd>R</kbd>
        </button>
        <button type="button" className="btn" onClick={onCompare} disabled={!canRun} title="Run the same attack with no defense, then with lineage (C)">
          {busy === "compare" ? "Comparing…" : "Compare"} <kbd>C</kbd>
        </button>
      </div>

      <nav className="tb-panels" aria-label="Panels">
        <button type="button" className={`tb-pbtn${panel === "approvals" ? " is-on" : ""}`} onClick={() => onPanel(panel === "approvals" ? null : "approvals")} aria-pressed={panel === "approvals"}>
          Approvals
          {pending > 0 && <span className="badge" aria-label={`${pending} pending`}>{pending}</span>}
          {!owner && me.state === "ok" && <span className="lock" aria-hidden="true">owner</span>}
        </button>
        <button type="button" className={`tb-pbtn${panel === "audit" ? " is-on" : ""}`} onClick={() => onPanel(panel === "audit" ? null : "audit")} aria-pressed={panel === "audit"}>
          Audit
        </button>
        <button type="button" className={`tb-pbtn${panel === "benchmark" ? " is-on" : ""}`} onClick={() => onPanel(panel === "benchmark" ? null : "benchmark")} aria-pressed={panel === "benchmark"}>
          Benchmark
        </button>
        <button type="button" className="tb-pbtn tb-help" onClick={onHelp} aria-label="Keyboard shortcuts" title="Shortcuts (?)">
          ?
        </button>
      </nav>
    </header>
  );
}
