"use client";

import type { Step } from "@/lib/types";
import { stepGlyph, stepTitle } from "@/lib/console/model";

/** Timeline scrubber: one tick per recorded step, coloured by kind. Fully keyboard operable (native range input). */
export function Replay({
  steps,
  index,
  playing,
  onSeek,
  onToggle,
  onReplay,
  total,
  label = "Replay",
  percent = false,
}: {
  total?: number;
  label?: string;
  percent?: boolean;
  steps: Step[];
  index: number;
  playing: boolean;
  onSeek: (i: number) => void;
  onToggle: () => void;
  onReplay: () => void;
}) {
  const n = total ?? steps.length;
  const cur = percent ? undefined : steps[Math.min(index, n - 1)];
  return (
    <div className="rp" role="group" aria-label={label}>
      <div className="rp-ctrl">
        <button type="button" className="iconbtn" onClick={onToggle} aria-label={playing ? "Pause replay" : "Play replay"} title="Play / pause (Space)">
          {playing ? (
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
          ) : (
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>
          )}
        </button>
        <button type="button" className="iconbtn" onClick={onReplay} aria-label="Restart replay" title="Restart">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.5v3h3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      <div className="rp-track">
        <div className="rp-ticks" aria-hidden="true">
          {!percent && steps.map((s, i) => (
            <button
              key={s.id}
              type="button"
              tabIndex={-1}
              className={`rp-tick k-${s.kind}${i <= index ? " is-past" : ""}${i === index ? " is-now" : ""}`}
              style={{ left: `${n > 1 ? (i / (n - 1)) * 100 : 0}%` }}
              onClick={() => onSeek(i)}
              title={`${i + 1}. ${stepGlyph(s)}`}
            />
          ))}
        </div>
        <input
          className="rp-range"
          type="range"
          min={0}
          max={Math.max(0, n - 1)}
          step={1}
          value={Math.min(index, Math.max(0, n - 1))}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label={`${label} position`}
          aria-valuetext={cur ? `Step ${index + 1} of ${n}: ${stepGlyph(cur)} ${stepTitle(cur)}` : undefined}
        />
      </div>
      <div className="rp-now" aria-live="polite">
        {percent && (
          <>
            <span className="rp-glyph k-owner">SYNC</span>
            <span className="rp-title">{label}</span>
            <span className="rp-pos">{index}%</span>
          </>
        )}
        {cur && (
          <>
            <span className={`rp-glyph k-${cur.kind}`}>{stepGlyph(cur)}</span>
            <span className="rp-title">{stepTitle(cur)}</span>
            <span className="rp-pos">
              {index + 1}/{n}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
