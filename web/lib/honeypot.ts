export type HoneypotOutcome = "blocked" | "held" | "signed_to_vendor" | "broken" | "nothing";

export interface Attempt {
  id: number;
  at: string;
  channel: string;
  message: string;
  outcome: HoneypotOutcome;
  reasons: string[];
  destination?: string;
  unguarded?: string;
  break: boolean;
}

export interface HoneypotStats {
  attempts: number;
  blocked: number;
  held: number;
  signed_to_vendor: number;
  nothing: number;
  breaks: number;
  unguarded_would_lose: number;
}

export interface Feed {
  attempts: Attempt[];
  stats: HoneypotStats;
  simulated: boolean;
}

export class HoneypotError extends Error {
  constructor(
    message: string,
    readonly kind: "rate" | "bad" | "down",
  ) {
    super(message);
  }
}

export async function fetchFeed(after = 0): Promise<Feed> {
  const res = await fetch(`/api/honeypot/feed?after=${after}&limit=50`, { cache: "no-store" });
  if (!res.ok) throw new HoneypotError("feed unavailable", "down");
  return (await res.json()) as Feed;
}

export async function submitAttempt(message: string, channel: "email" | "chat" | "tool"): Promise<Attempt> {
  let res: Response;
  try {
    res = await fetch("/api/honeypot/attempt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, channel }),
    });
  } catch {
    throw new HoneypotError("The Lineage API is not reachable right now.", "down");
  }
  if (res.status === 429) throw new HoneypotError("Slow down: at most 10 attempts a minute.", "rate");
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new HoneypotError(body?.error ?? "That attempt was rejected.", "bad");
  return body as Attempt;
}

export const OUTCOME_LABEL: Record<HoneypotOutcome, string> = {
  blocked: "Blocked",
  held: "Held for owner",
  signed_to_vendor: "Signed to the real vendor",
  broken: "BREAK: guard bypassed",
  nothing: "Nothing signed",
};

export const REASON_PLAIN: Record<string, string> = {
  UNTRUSTED_PAYEE_CHANGE: "destination only appears in untrusted text",
  INTENT_TTL_TOO_LONG: "deadline is longer than allowed",
  ASSET_NOT_ALLOWED: "asset is not on the allowlist",
  AMOUNT_EXCEEDS_PO: "amount is above the approved purchase order",
  NONCE_REUSED: "nonce was already used",
};
