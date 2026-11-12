"use client";

import type { Scenario } from "@/lib/types";
import type { Source } from "./Library";

/** What the graph area shows before anything has run: a ghost of the three columns and a clear prompt. */
export function EmptyGraph({
  scenario,
  src,
  down,
  onRun,
  onCompare,
  latestRunId,
  onOpenLatest,
  busy,
}: {
  scenario: Scenario | null;
  src: Source;
  down: boolean;
  onRun: () => void;
  onCompare: () => void;
  latestRunId: string | null;
  onOpenLatest: () => void;
  busy: string | null;
}) {
  return (
    <div className="eg">
      <div className="eg-ghost" aria-hidden="true">
        <div className="eg-col">
          {["owner", "record", "email", "chat"].map((k, i) => (
            <div className="eg-node" key={k} style={{ animationDelay: `${i * 120}ms` }}>
              <i className={`t${i === 0 ? 3 : i === 1 ? 2 : i === 2 ? 1 : 0}`} />
              <b>{k}</b>
              <span />
            </div>
          ))}
        </div>
        <svg className="eg-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
          {[12, 37, 62, 87].map((y, i) => (
            <path key={i} d={`M0 ${y} C 40 ${y}, 60 50, 100 50`} />
          ))}
        </svg>
        <div className="eg-guard">guard</div>
        <div className="eg-out">outcome</div>
      </div>
      <div className="eg-copy">
        {down ? (
          <>
            <h2>The Lineage API is not reachable</h2>
            <p>The console needs the Go API to run scenarios. Start it and reload this page.</p>
          </>
        ) : (
          <>
            <div className="micro">mission control for one payment</div>
            <h2>{src.kind === "custom" ? "Your attack" : (scenario?.title ?? "Pick a scenario")}</h2>
            <p>
              Every value an agent pays with is traced to where it came from. Run an attack and watch the payee&apos;s lineage thread run
              from its origin to the guard, then to what happened to the money.
            </p>
            <div className="eg-actions">
              <button type="button" className="btn primary" onClick={onRun} disabled={!!busy}>
                {busy === "run" ? "Running…" : "Run it"} <kbd>R</kbd>
              </button>
              <button type="button" className="btn" onClick={onCompare} disabled={!!busy}>
                {busy === "compare" ? "Comparing…" : "Compare: no defense vs lineage"} <kbd>C</kbd>
              </button>
              {latestRunId && (
                <button type="button" className="linkbtn" onClick={onOpenLatest}>
                  open latest run
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
