import { Reveal } from "./Reveal";
import { benchSummary } from "./bench";
import type { BenchRow } from "@/lib/types";

export function Stats({ rows }: { rows: BenchRow[] | null }) {
  const s = benchSummary(rows);
  return (
    <Reveal as="dl" className="stats">
      <div>
        <dt>Attack scenarios</dt>
        <dd>{s ? s.attacks : "—"}</dd>
      </div>
      <div>
        <dt>Succeed against Lineage</dt>
        <dd className="good">{s ? `${s.lineagePct}%` : "—"}</dd>
        <small>this benchmark · simulated attacker</small>
      </div>
      <div>
        <dt>Succeed with no guard</dt>
        <dd className="bad">{s ? `${s.nonePct}%` : "—"}</dd>
      </div>
      <div>
        <dt>Guard decision, p95</dt>
        <dd>{s?.p95 ?? "—"}</dd>
      </div>
    </Reveal>
  );
}
