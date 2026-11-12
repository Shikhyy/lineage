import type { Decision, Me, RunDetail } from "@/lib/types";
import type { AttackChannel } from "@/lib/types";

/** The newest run payload carries fragments and titles; lib/types lags, so extend locally. */
export interface LabFragment {
  id: string;
  kind: string;
  trust: number;
  source: string;
  snippet: string;
  parent_ids: string[] | null;
}
export type LandingRun = RunDetail & {
  scenario_title?: string;
  scenario_kind?: string;
  fragments?: LabFragment[] | null;
};

export class LabError extends Error {
  constructor(
    message: string,
    readonly kind: "rate" | "bad" | "down" | "other",
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      cache: "no-store",
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    throw new LabError("The Lineage API is not reachable right now.", "down");
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  const msg = (body as { error?: string } | null)?.error;
  if (res.status === 429) throw new LabError(msg || "Slow down: 30 runs a minute per visitor.", "rate");
  if (res.status === 400) throw new LabError(msg || "That input was rejected.", "bad");
  if (!res.ok) {
    if (msg) throw new LabError(msg, "other");
    throw new LabError("The Lineage API is not reachable right now.", "down");
  }
  return body as T;
}

export type AttackInput = { message: string; channel: AttackChannel; from: string };
export type Duel = { none: LandingRun; lineage: LandingRun };

async function runOnce(input: AttackInput, defense: "none" | "lineage"): Promise<LandingRun> {
  const { run_id } = await call<{ run_id: string }>("/api/run", {
    method: "POST",
    body: JSON.stringify({
      custom: { message: input.message, channel: input.channel, ...(input.from ? { from: input.from } : {}) },
      mode: "compromised",
      defense,
    }),
  });
  return call<LandingRun>(`/api/runs/${encodeURIComponent(run_id)}`);
}

/** Two sequential real runs of the same attack: no guard, then Lineage. */
export async function runDuel(input: AttackInput): Promise<Duel> {
  const none = await runOnce(input, "none");
  const lineage = await runOnce(input, "lineage");
  return { none, lineage };
}

export const fetchMe = () => call<Me>("/api/me");

export function decisionsOf(run: LandingRun): Decision[] {
  return (run.steps ?? []).flatMap((s) => (s.decision ? [s.decision] : []));
}
