import type { Defense, Mode, TrustTier } from "./types";

export function money(cents: number): string {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const DEFENSES: Defense[] = ["none", "prompt", "static", "lineage", "lineage_prov_only", "lineage_bind_only"];

export const DEFENSE_NAMES: Record<Defense, string> = {
  none: "no guard",
  prompt: "prompt only",
  static: "static limits",
  lineage: "lineage",
  lineage_prov_only: "provenance only",
  lineage_bind_only: "binding only",
};

export function modeLabel(mode: Mode): string {
  return mode === "compromised" ? "simulated compromised agent" : mode;
}

export function tier(trust: number): TrustTier {
  return `T${Math.min(3, Math.max(0, trust))}` as TrustTier;
}

const TIER_LABELS: Record<TrustTier, string> = {
  T0: "Untrusted",
  T1: "Known sender",
  T2: "Trusted record",
  T3: "Owner",
};

export function tierLabel(t: TrustTier): string {
  return TIER_LABELS[t];
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export const DEFENSE_BLURB: Record<Defense, string> = {
  none: "The agent's payment goes straight through.",
  prompt: "A system prompt asks the agent to be careful. Nothing enforces it.",
  static: "Fixed limits: per-payment cap and an allowlist.",
  lineage: "Full guard: provenance and argument binding, outside the model.",
  lineage_prov_only: "Ablation: provenance checks without argument binding.",
  lineage_bind_only: "Ablation: argument binding without provenance checks.",
};

/** First and last characters of a hash, for dense displays. */
export function shortHash(h: string, n = 8): string {
  return h.length <= n * 2 + 1 ? h : `${h.slice(0, n)}…${h.slice(-4)}`;
}

/** "12s ago" style label for run history. */
export function ago(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function clock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(11, 19);
}
