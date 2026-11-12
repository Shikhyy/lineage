"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { DEFENSES, DEFENSE_NAMES } from "@/lib/format";
import type { Defense, Mode, Scenario } from "@/lib/types";

function message(e: unknown): string {
  return e instanceof ApiError && e.status !== 0 ? e.message : "Could not reach the Lineage API.";
}

export function RunForm({ scenarios, llmModel }: { scenarios: Scenario[]; llmModel: string | null }) {
  const router = useRouter();
  const [scenario, setScenario] = useState(scenarios[0]?.id ?? "");
  const [mode, setMode] = useState<Mode>("compromised");
  const [defense, setDefense] = useState<Defense>("lineage");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = scenarios.find((s) => s.id === scenario);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { run_id } = await api.startRun({ scenario, mode, defense });
      router.push(`/runs/${run_id}`);
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }

  const group = (kind: Scenario["kind"]) =>
    scenarios
      .filter((s) => s.kind === kind)
      .map((s) => (
        <option key={s.id} value={s.id}>
          {s.class} · {s.title}
        </option>
      ));

  return (
    <>
      <form className="card runform" onSubmit={submit}>
        <label>
          Scenario
          <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
            <optgroup label="Benign">{group("benign")}</optgroup>
            <optgroup label="Attack">{group("attack")}</optgroup>
          </select>
        </label>
        <label>
          Agent mode
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="compromised">compromised (simulated jailbroken agent)</option>
            <option value="scripted">scripted (fixed tool sequence)</option>
            {llmModel && <option value="llm">llm ({llmModel})</option>}
          </select>
        </label>
        <label>
          Defense
          <select value={defense} onChange={(e) => setDefense(e.target.value as Defense)}>
            {DEFENSES.map((d) => (
              <option key={d} value={d}>
                {DEFENSE_NAMES[d] === d ? d : `${d} (${DEFENSE_NAMES[d]})`}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "Running…" : "Run"}
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {selected && (
        <p className="hint">
          Payment rail for this scenario: <b>{selected.rail}</b>
          {selected.kind === "attack" && selected.owner_approves ? " · the owner approves the held payment in this scenario" : ""}
        </p>
      )}
    </>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(secret);
      setSecret("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "Wrong owner secret." : message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card loginform" onSubmit={submit}>
      <label>
        Owner secret
        <input type="password" autoComplete="current-password" required value={secret} onChange={(e) => setSecret(e.target.value)} />
      </label>
      <div>
        <button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function ApprovalActions({ approvalId }: { approvalId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolve(action: "approve" | "reject") {
    setBusy(true);
    setError(null);
    try {
      await api.resolveApproval(approvalId, action);
      router.refresh();
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }

  return (
    <>
      <div className="row">
        <button type="button" className="ok" disabled={busy} onClick={() => resolve("approve")}>
          Approve and pay
        </button>
        <button type="button" className="danger" disabled={busy} onClick={() => resolve("reject")}>
          Reject
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
