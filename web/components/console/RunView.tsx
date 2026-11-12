"use client";

import { useEffect, useState } from "react";
import { DEFENSE_NAMES, formatTime, modeLabel } from "@/lib/format";
import { decisionsOf, outcomeOf } from "@/lib/console/model";
import { useReplay } from "@/lib/console/replay";
import type { RunDetail } from "@/lib/types";
import { ApprovalButtons } from "./ApprovalsPanel";
import { Graph, type Selection } from "./Graph";
import { Inspector } from "./Inspector";
import { Replay } from "./Replay";
import { useStore } from "./store";

const delayFor = (steps: RunDetail["steps"]) => (i: number) => {
  const k = steps?.[i]?.kind;
  return k === "decision" ? 1300 : k === "payment" ? 900 : k === "tool_result" ? 620 : 480;
};

/** Ignore global shortcuts while the user is typing in a field. */
export function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function RunView({
  run,
  scenarioClass,
  onResolved,
  openPanel,
}: {
  run: RunDetail;
  scenarioClass: string | null;
  onResolved: (runId: string, status: string) => void;
  openPanel: (p: "approvals") => void;
}) {
  const { owner } = useStore();
  const steps = run.steps ?? [];
  const [selection, setSelection] = useState<Selection>(null);
  const [delay] = useState(() => delayFor(run.steps));
  const rp = useReplay(steps.length, run.run.id, delay);
  const [copied, setCopied] = useState(false);
  const [dockOpen, setDockOpen] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " " && !(e.target as HTMLElement | null)?.closest("button, [role=button], a, summary")) {
        e.preventDefault();
        rp.toggle();
      } else if (e.key === "ArrowRight" && !(e.target as HTMLElement | null)?.closest("input[type=range]")) rp.seek(rp.index + 1);
      else if (e.key === "ArrowLeft" && !(e.target as HTMLElement | null)?.closest("input[type=range]")) rp.seek(rp.index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rp]);

  const decs = decisionsOf(run);
  const outcome = outcomeOf(run);
  const held = outcome.kind === "held" && outcome.approvalId;
  const actions = held ? (
    owner ? (
      <ApprovalButtons approvalId={outcome.approvalId!} onResolved={onResolved} compact />
    ) : (
      <button type="button" className="btn" onClick={() => openPanel("approvals")}>
        Sign in as owner to decide
      </button>
    )
  ) : undefined;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable: the URL is already in the address bar */
    }
  };

  return (
    <div className="rv">
      <div className="rv-head">
        <div className="rv-title">
          <span className={`classbadge ${run.scenario_kind}`}>{scenarioClass ?? (run.run.scenario_id === "custom" ? "YOU" : "·")}</span>
          <h1>{run.scenario_title || run.run.scenario_id}</h1>
        </div>
        <div className="rv-meta">
          <span className={`dtag d-${run.run.defense}`}>{DEFENSE_NAMES[run.run.defense]}</span>
          <span className="rv-dim">{modeLabel(run.run.mode)}</span>
          <span className="rv-dim rv-id">{run.run.id}</span>
          <span className="rv-dim rv-time">{formatTime(run.run.started_at)}</span>
          <button type="button" className="linkbtn" onClick={copy}>
            {copied ? "copied" : "copy link"}
          </button>
        </div>
      </div>
      <div className="rv-graph">
        <Graph run={run} step={rp.index} selection={selection} onSelect={setSelection} outcomeActions={actions} />
      </div>
      <Replay steps={steps} index={rp.index} playing={rp.playing} onSeek={rp.seek} onToggle={rp.toggle} onReplay={rp.replay} />
      <div className={`rv-dock${dockOpen ? "" : " is-closed"}`}>
        <Inspector run={run} selection={selection} onSelect={setSelection} step={rp.index} onSeek={rp.seek} open={dockOpen} onToggle={() => setDockOpen((o) => !o)} />
        <div className="rv-sum">
          <div className="micro">What happened</div>
          <p className={`rv-outcome kind-${outcome.kind}`}>{run.outcome}</p>
          <p className="rv-dim">
            {decs.length === 0
              ? "No guard decision was recorded: this defense never looked at where the payee came from."
              : decs.length === 1
                ? "One payment call reached the guard. Select the guard or any fragment to see why."
                : `${decs.length} payment calls reached the guard.`}
          </p>
        </div>
      </div>
    </div>
  );
}
