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
