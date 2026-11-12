import type { Decision, Fragment, LineageEntry, RunDetail, Step, TrustTier } from "../types";
import { tier } from "../format";

/**
 * Pure derivations from a run's server data into what the console draws.
 * Nothing in here invents data: every node and thread comes from `fragments`, `steps` or `decisions`.
 */

export const PAY_TOOLS = ["pay_vendor", "sign_intent"];

export interface DecisionAt {
  stepIndex: number;
  decision: Decision;
}

export function decisionsOf(run: RunDetail): DecisionAt[] {
  const out: DecisionAt[] = [];
  (run.steps ?? []).forEach((s, i) => {
    if (s.decision) out.push({ stepIndex: i, decision: s.decision });
  });
  return out;
}

const fragCache = new WeakMap<RunDetail, Fragment[]>();

/**
 * Every fragment of a run. The server reseeds shared memory for each scenario run, so an older run's
 * memory fragment may no longer be stored; its decision lineage still records it (and what it was derived
 * from), so nodes missing from `fragments` are rebuilt from that lineage.
 */
export function fragmentsOf(run: RunDetail): Fragment[] {
  const hit = fragCache.get(run);
  if (hit) return hit;
  const out: Fragment[] = [...(run.fragments ?? [])];
  const have = new Set(out.map((f) => f.id));
  for (const { decision } of decisionsOf(run)) {
    for (const l of decision.lineage ?? []) {
      for (const o of l.origins ?? []) {
        const chain = o.chain ?? [];
        if (!have.has(o.fragment_id)) {
          have.add(o.fragment_id);
          out.push({ id: o.fragment_id, kind: o.kind, trust: o.trust, source: o.source, snippet: o.snippet, parent_ids: chain.length ? [chain[0].id] : [] });
        }
        chain.forEach((c, i) => {
          if (have.has(c.id)) return;
          have.add(c.id);
          out.push({ id: c.id, kind: c.kind, trust: c.trust, source: "earlier in the chain", snippet: c.snippet, parent_ids: chain[i + 1] ? [chain[i + 1].id] : [] });
        });
      }
    }
  }
  fragCache.set(run, out);
  return out;
}

const FRAG_TAG = /\[(frag_[a-z0-9]+) T\d\]/g;

/** The step index at which each fragment first reaches the agent. Parents surface with their first child. */
export function revealSteps(run: RunDetail): Map<string, number> {
  const steps = run.steps ?? [];
  const frags = fragmentsOf(run);
  const reveal = new Map<string, number>();
  steps.forEach((s, i) => {
    if (s.kind !== "tool_result") return;
    for (const m of s.summary.matchAll(FRAG_TAG)) if (!reveal.has(m[1])) reveal.set(m[1], i);
  });
  const ownerStep = Math.max(0, steps.findIndex((s) => s.kind === "owner"));
  for (const f of frags) if (f.kind === "owner" && !reveal.has(f.id)) reveal.set(f.id, ownerStep);
  // A fragment that nothing printed (e.g. the chat a memory was derived from) appears with its earliest child.
  for (let pass = 0; pass < 4; pass++) {
    for (const f of frags) {
      for (const p of f.parent_ids ?? []) {
        const c = reveal.get(f.id);
        const cur = reveal.get(p);
        if (c !== undefined && (cur === undefined || cur > c)) reveal.set(p, c);
      }
    }
  }
  for (const f of frags) if (!reveal.has(f.id)) reveal.set(f.id, 0);
  return reveal;
}

export function payToolIndex(run: RunDetail): number {
  return (run.steps ?? []).findIndex((s) => s.kind === "tool_call" && PAY_TOOLS.some((t) => s.summary.startsWith(t)));
}

export interface Timeline {
  /** index of the step where the guard receives the call (the pay tool call) */
  guardCall: number;
  /** index where the verdict lands (decision step); for unguarded runs the payment step */
  guardLand: number;
  /** index where the outcome becomes visible */
  outcome: number;
}

export function timeline(run: RunDetail): Timeline {
  const steps = run.steps ?? [];
  const call = payToolIndex(run);
  const decs = decisionsOf(run);
  const pay = steps.findIndex((s) => s.kind === "payment");
  const land = decs.length ? decs[0].stepIndex : pay >= 0 ? pay : call;
  const outcome = pay >= 0 && pay >= land ? pay : land;
  return { guardCall: call, guardLand: land, outcome: Math.max(outcome, 0) };
}

export type ThreadTone = "t0" | "t1" | "good" | "neutral";

export interface Thread {
  key: string;
  fragmentId: string;
  field: string;
  value: string;
  tone: ThreadTone;
  /** true when the link was matched by text because the guard did not run (defense none) or recorded no origin */
  inferred: boolean;
  grounded: boolean | null;
  /** the fragment this one was derived from, when the chain walks back further */
  chain: string[];
}

function toneFor(trust: number, grounded: boolean): ThreadTone {
  if (trust === 0) return "t0";
  if (trust === 1) return "t1";
  return grounded ? "good" : "neutral";
}

function payeeFromSteps(run: RunDetail): string | null {
  const s = (run.steps ?? []).find((x) => x.kind === "tool_call" && PAY_TOOLS.some((t) => x.summary.startsWith(t)));
  if (!s) return null;
  const j = s.summary.slice(s.summary.indexOf(" ") + 1);
  try {
    const o = JSON.parse(j) as Record<string, unknown>;
    const v = o.payee ?? o.destination;
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

/** Threads from origin fragments to the guard, for one decision (or, without a decision, by text match on the payee). */
export function threadsFor(run: RunDetail, decision: Decision | null): Thread[] {
  const frags = fragmentsOf(run);
  const byId = new Map(frags.map((f) => [f.id, f]));
  const out: Thread[] = [];
  const seen = new Set<string>();
  const add = (t: Thread) => {
    const k = `${t.fragmentId}|${t.field}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };
  if (decision?.lineage?.length) {
    for (const l of decision.lineage) {
      const origins = l.origins ?? [];
      for (const o of origins) {
        add({
          key: `${o.fragment_id}|${l.field}`,
          fragmentId: o.fragment_id,
          field: l.field,
          value: l.value,
          tone: toneFor(o.trust, l.grounded),
          inferred: false,
          grounded: l.grounded,
          chain: (o.chain ?? []).map((c) => c.id),
        });
      }
      if (!origins.length && l.value) {
        // Grounded values may carry no origin list: the record that holds the value is the origin.
        for (const f of frags) {
          if (f.trust >= 2 && f.snippet.includes(l.value)) {
            add({
              key: `${f.id}|${l.field}`,
              fragmentId: f.id,
              field: l.field,
              value: l.value,
              tone: toneFor(f.trust, l.grounded),
              inferred: true,
              grounded: l.grounded,
              chain: [],
            });
          }
        }
      }
    }
  } else {
    const payee = payeeFromSteps(run);
    if (payee) {
      for (const f of frags) {
        if (f.kind !== "owner" && f.snippet.includes(payee)) {
          add({
            key: `${f.id}|payee`,
            fragmentId: f.id,
            field: "payee",
            value: payee,
            tone: toneFor(f.trust, false),
            inferred: true,
            grounded: null,
            chain: [],
          });
        }
      }
    }
  }
  return out.filter((t) => byId.has(t.fragmentId));
}

/** Left-column ordering: families by trust (owner and records up top, hostile sources last), parents directly above children. */
export function orderFragments(frags: Fragment[]): Fragment[] {
  const byId = new Map(frags.map((f) => [f.id, f]));
  const rank = (f: Fragment) => (f.kind === "owner" ? 0 : f.trust >= 2 ? 1 : f.trust === 1 ? 2 : 3);
  const base = [...frags].sort((a, b) => rank(a) - rank(b) || a.source.localeCompare(b.source));
  const placed = new Set<string>();
  const out: Fragment[] = [];
  const place = (f: Fragment) => {
    if (placed.has(f.id)) return;
    placed.add(f.id);
    for (const p of f.parent_ids ?? []) {
      const pf = byId.get(p);
      if (pf) place(pf);
    }
    out.push(f);
  };
  base.forEach(place);
  return out;
}

export interface OutcomeView {
  kind: "moved-bad" | "moved-ok" | "held" | "blocked" | "failed" | "idle";
  headline: string;
  detail: string;
  payee: string | null;
  cents: number | null;
  rail: string | null;
  status: string | null;
  approvalId: string | null;
  approvalStatus: "pending" | "approved" | "rejected" | null;
}

export function outcomeOf(run: RunDetail): OutcomeView {
  const decs = decisionsOf(run);
  const last = decs.length ? decs[decs.length - 1].decision : null;
  const payout = (run.payouts ?? [])[0] ?? null;
  const base = {
    payee: payout?.payee ?? last?.args.payee ?? null,
    cents: payout?.cents ?? last?.args.amount_cents ?? null,
    rail: payout?.rail ?? last?.payment?.rail ?? null,
    status: payout?.status ?? last?.payment?.status ?? null,
    approvalId: last?.approval?.id ?? null,
    approvalStatus: last?.approval?.status ?? null,
  };
  if (run.outcome_class === "failed") {
    return { ...base, kind: "failed", headline: "Payout failed", detail: "The rail rejected or could not complete the payout. No money moved." };
  }
  if (run.outcome_class === "moved") {
    const bad = run.scenario_kind === "attack";
    if (last?.approval?.status === "approved") {
      return {
        ...base,
        kind: bad ? "moved-bad" : "moved-ok",
        headline: "Paid after owner approval",
        detail: bad ? "The owner approved the held payment, so the payout executed." : "The owner approved the held payment and the payout executed.",
      };
    }
    return {
      ...base,
      kind: bad ? "moved-bad" : "moved-ok",
      headline: bad ? "Money moved" : "Paid",
      detail: bad ? "The payout executed to the destination the attacker chose." : "The payout executed to the vendor on record.",
    };
  }
  if (last?.approval && last.approval.status === "pending") {
    return { ...base, kind: "held", headline: "Held for the owner", detail: "Nothing is paid until the owner approves this exact payment." };
  }
  if (last?.approval && last.approval.status === "rejected") {
    return { ...base, kind: "blocked", headline: "Owner rejected", detail: "The owner rejected the held payment. Nothing was paid." };
  }
  if (last?.verdict === "BLOCK") {
    return { ...base, kind: "blocked", headline: "Blocked", detail: "The guard refused the call. Nothing was paid." };
  }
  if (!last) return { ...base, kind: "idle", headline: "No payment attempted", detail: run.outcome };
  return { ...base, kind: "idle", headline: "No money moved", detail: run.outcome };
}

export function stepGlyph(s: Step): string {
  switch (s.kind) {
    case "owner":
      return "OWNER";
    case "assistant":
      return "AGENT";
    case "tool_call":
      return "CALL";
    case "tool_result":
      return "RESULT";
    case "decision":
      return "GUARD";
    case "payment":
      return "PAYOUT";
    default:
      return "ERROR";
  }
}

/** Pulls a short, readable title from a step's summary. */
export function stepTitle(s: Step): string {
  switch (s.kind) {
    case "owner":
      return s.summary.replace(/^Owner instruction:\s*/, "");
    case "tool_call": {
      const i = s.summary.indexOf(" ");
      return i < 0 ? s.summary : `${s.summary.slice(0, i)}(${s.summary.slice(i + 1).length > 1 ? "…" : ""})`;
    }
    case "tool_result":
      return s.summary.replace(/\[frag_[a-z0-9]+ T\d\]\s*/, "").replace(/\s+/g, " ").slice(0, 80);
    case "decision":
      return s.decision ? `${s.decision.verdict}${s.decision.reasons?.length ? ` · ${s.decision.reasons.map((r) => r.code).join(", ")}` : ""}` : s.summary;
    default:
      return s.summary.replace(/\s+/g, " ").slice(0, 90);
  }
}

export function tierOf(f: Fragment): TrustTier {
  return tier(f.trust);
}

export function lineageEntryTone(l: LineageEntry): ThreadTone {
  const t0 = (l.origins ?? []).some((o) => o.trust === 0);
  if (t0) return "t0";
  return l.grounded ? "good" : "neutral";
}

/** Stable key for the "same attack" across two runs, used for the compare headline. */
export function runLabel(run: RunDetail): string {
  return run.scenario_title || run.run.scenario_id;
}
