import type { BenchRow, Defense } from "@/lib/types";

export const pct = (r: BenchRow) => (r.attacks ? Math.round((100 * r.wins) / r.attacks) : 0);

/** Rows for the simulated compromised agent, the benchmark mode the landing page reports. */
export function compromisedRows(rows: BenchRow[] | null): BenchRow[] {
  return (rows ?? []).filter((r) => r.mode === "compromised");
}

export function benchSummary(rows: BenchRow[] | null) {
  const comp = compromisedRows(rows);
  const find = (d: Defense) => comp.find((r) => r.defense === d);
  const lineage = find("lineage");
  const none = find("none");
  if (!lineage || !none) return null;
  return {
    attacks: lineage.attacks,
    lineagePct: pct(lineage),
    nonePct: pct(none),
    p95: lineage.p95_ms ? `${lineage.p95_ms < 1 ? "<1" : lineage.p95_ms.toFixed(1)} ms` : null,
  };
}
