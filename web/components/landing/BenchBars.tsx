"use client";

import { useEffect, useState } from "react";
import { DEFENSE_NAMES } from "@/lib/format";
import type { BenchRow, Defense } from "@/lib/types";
import { compromisedRows, pct } from "./bench";

const ORDER: Defense[] = ["none", "prompt", "static", "lineage_bind_only", "lineage_prov_only", "lineage"];

export function BenchBars({ rows }: { rows: BenchRow[] | null }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGrown(true), 80);
    return () => clearTimeout(t);
  }, []);

  const comp = compromisedRows(rows);
  if (!comp.length) {
    return (
      <p className="muted">
        Benchmark results are unavailable. Run <code>make bench</code> to generate them, then reload.
      </p>
    );
  }
  return (
    <>
      {ORDER.map((d) => {
        const r = comp.find((x) => x.defense === d);
        if (!r) return null;
        const p = pct(r);
        return (
          <div key={d} className={`bar${p === 0 ? " good" : ""}`}>
            <span className="name">{DEFENSE_NAMES[d]}</span>
            <div className="track2">
              <div className="fill" style={{ width: grown ? `${Math.max(p, 1)}%` : 0 }} />
            </div>
            <span className="pct">
              {p}%<small>{`${r.wins}/${r.attacks}`}</small>
            </span>
          </div>
        );
      })}
    </>
  );
}
