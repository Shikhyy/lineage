export type Verdict = "ALLOW" | "ASK_OWNER" | "BLOCK";
export type Mode = "compromised" | "scripted" | "llm";
export type Defense = "none" | "prompt" | "static" | "lineage" | "lineage_prov_only" | "lineage_bind_only";
export type TrustTier = "T0" | "T1" | "T2" | "T3";

export interface Me {
  owner: boolean;
  simulated: boolean;
  llm: boolean;
  llm_model: string;
  rail: "paypal" | "simulated";
}

export interface BenchRow {
  defense: Defense;
  mode: Mode;
  attacks: number;
  wins: number;
  benign: number;
  benign_ok: number;
  lost_cents: number;
  p95_ms: number;
}

export interface Reason {
  code: string;
  message: string;
  effect: string;
}

// ---- attack lab ----
export type AttackChannel = "email" | "chat" | "tool";

export interface AttackRequest {
  message: string;
  channel: AttackChannel;
  from?: string;
}

export interface LabOrigin {
  id: string;
  kind: string;
  trust: TrustTier;
  label: string;
  snippet: string;
}

export interface LabLineage {
  field: string;
  value: string;
  grounded: boolean;
  source: string;
  origins: LabOrigin[] | null;
}

export interface LabTrace {
  verdict: Verdict;
  payee: string;
  amount_cents: number;
  reasons: Reason[] | null;
  lineage: LabLineage[] | null;
}

export interface LabPayment {
  payee: string;
  invoice_id: string;
  amount_cents: number;
  asset?: string;
  ttl_seconds?: number;
}

export interface LabResult {
  defense: "none" | "lineage";
  paid: LabPayment[] | null;
  trace: LabTrace[] | null;
  diverted: boolean;
  pending_owner: number;
  blocked: number;
}

export interface AttackResponse {
  vendor: string;
  invoice_cents: number;
  results: LabResult[];
}

// ---- audit ----
export interface AuditRecord {
  seq: number;
  prev_hash: string;
  record_hash: string;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface AuditVerify {
  ok: boolean;
  records: number;
  broken_seq?: number;
}

// ---- runs ----
export interface Scenario {
  id: string;
  class: string;
  kind: "benign" | "attack";
  title: string;
  rail: string;
  owner_approves: boolean;
}

export interface CustomAttack {
  message: string;
  channel: AttackChannel;
  from?: string;
}

/** A library scenario or a visitor-written attack, never both. */
export type RunRequest =
  | { scenario: string; mode: Mode; defense: Defense }
  | { custom: CustomAttack; mode: Mode; defense: Defense };

/** What a fragment is: the unit of provenance. `parent_ids` link a fragment to what it was derived from (memory <- chat). */
export interface Fragment {
  id: string;
  kind: string;
  trust: number;
  source: string;
  snippet: string;
  parent_ids: string[] | null;
}

export interface Run {
  id: string;
  mode: Mode;
  defense: Defense;
  scenario_id: string;
  started_at: string;
  finished_at: string;
}

export interface ChainLink {
  id: string;
  kind: string;
  trust: number;
  snippet: string;
}

export interface Origin {
  fragment_id: string;
  kind: string;
  trust: number;
  source: string;
  snippet: string;
  chain: ChainLink[] | null;
}

export interface LineageEntry {
  field: string;
  value: string;
  grounded: boolean;
  source: string;
  origins: Origin[] | null;
}

export interface PayArgs {
  invoice_id: string;
  payee: string;
  amount_cents: number;
  currency: string;
}

export interface Decision {
  id: string;
  run_id: string;
  verdict: Verdict;
  reasons: Reason[] | null;
  lineage: LineageEntry[] | null;
  args: PayArgs;
  approval: { id: string; status: "pending" | "approved" | "rejected" } | null;
  payment: { status: string; rail: string } | null;
  created: string;
}

export type StepKind = "owner" | "assistant" | "tool_call" | "tool_result" | "decision" | "payment" | "error";

export interface Step {
  id: number;
  kind: StepKind;
  summary: string;
  decision: Decision | null;
}

export interface Payout {
  payee: string;
  cents: number;
  rail: string;
  status: string;
}

export interface RunDetail {
  run: Run;
  rail: string;
  outcome: string;
  outcome_class: "safe" | "moved" | "failed";
  scenario_title: string;
  scenario_kind: "benign" | "attack";
  steps: Step[] | null;
  payouts: Payout[] | null;
  fragments: Fragment[] | null;
}

export interface Approvals {
  pending: Decision[] | null;
  resolved: Decision[] | null;
}
