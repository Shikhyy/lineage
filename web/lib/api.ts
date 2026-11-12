import type {
  Approvals,
  AttackRequest,
  AttackResponse,
  AuditRecord,
  AuditVerify,
  BenchRow,
  Me,
  Run,
  RunDetail,
  RunRequest,
  Scenario,
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type Fetched<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

/** Where the Go API lives from this runtime's point of view: the same origin in the browser, GO_API_URL on the server. */
function base(): string {
  return typeof window === "undefined" ? (process.env.GO_API_URL ?? "http://localhost:8080") : "";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(base() + path, {
      ...init,
      cache: "no-store",
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    });
  } catch {
    throw new ApiError("Could not reach the Lineage API.", 0);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error;
    // A 5xx without a JSON error body comes from the proxy, meaning the Go API itself is down.
    if (!msg && res.status >= 500) throw new ApiError("Could not reach the Lineage API.", 0);
    throw new ApiError(msg ?? `The API answered ${res.status}.`, res.status);
  }
  return body as T;
}

/** Wraps a request so server components can render an error state instead of throwing. */
export async function fetched<T>(promise: Promise<T>): Promise<Fetched<T>> {
  try {
    return { ok: true, data: await promise };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, status: e.status };
    return { ok: false, error: "Unexpected error.", status: 0 };
  }
}

type Opts = { cookie?: string };
const withCookie = (o?: Opts): RequestInit => (o?.cookie ? { headers: { cookie: o.cookie } } : {});

export const api = {
  me: (o?: Opts) => request<Me>("/api/me", withCookie(o)),
  bench: () => request<BenchRow[]>("/api/bench"),
  benchReport: () => request<{ markdown: string }>("/api/bench/report"),
  scenarios: () => request<Scenario[]>("/api/scenarios"),
  runs: () => request<Run[]>("/api/runs"),
  run: (id: string) => request<RunDetail>(`/api/runs/${encodeURIComponent(id)}`),
  approvals: (o?: Opts) => request<Approvals>("/api/approvals", withCookie(o)),
  audit: (limit: number) => request<AuditRecord[]>(`/v1/audit?limit=${limit}`),
  auditVerify: () => request<AuditVerify>("/v1/audit/verify"),

  attack: (body: AttackRequest) => request<AttackResponse>("/api/attack", { method: "POST", body: JSON.stringify(body) }),
  startRun: (body: RunRequest) => request<{ run_id: string }>("/api/run", { method: "POST", body: JSON.stringify(body) }),
  login: (secret: string) => request<{ owner: true }>("/api/login", { method: "POST", body: JSON.stringify({ secret }) }),
  logout: () => request<{ owner: false }>("/api/logout", { method: "POST" }),
  resolveApproval: (id: string, action: "approve" | "reject") =>
    request<{ run_id: string; status: string }>(`/api/approvals/${encodeURIComponent(id)}/resolve`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
};
