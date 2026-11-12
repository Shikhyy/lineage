"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import type { Approvals, Me, Run, Scenario } from "@/lib/types";

export type Load<T> = { state: "loading" } | { state: "ok"; data: T } | { state: "error"; message: string; status: number };

function failure(e: unknown): { state: "error"; message: string; status: number } {
  if (e instanceof ApiError) return { state: "error", message: e.message, status: e.status };
  return { state: "error", message: "Unexpected error.", status: 0 };
}

export function errorText(e: unknown): string {
  return e instanceof ApiError && e.status !== 0 ? e.message : "Could not reach the Lineage API.";
}

/** Fetches and hands the outcome to `set`, so effects never set state synchronously. */
async function load<T>(fn: () => Promise<T>, set: (l: Load<T>) => void): Promise<void> {
  try {
    set({ state: "ok", data: await fn() });
  } catch (e) {
    set(failure(e));
  }
}

interface Store {
  me: Load<Me>;
  scenarios: Load<Scenario[]>;
  runs: Load<Run[]>;
  approvals: Load<Approvals>;
  owner: boolean;
  pending: number;
  refreshRuns: () => Promise<void>;
  refreshApprovals: () => Promise<void>;
  refreshMe: () => Promise<void>;
  reloadAll: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Load<Me>>({ state: "loading" });
  const [scenarios, setScenarios] = useState<Load<Scenario[]>>({ state: "loading" });
  const [runs, setRuns] = useState<Load<Run[]>>({ state: "loading" });
  const [approvals, setApprovals] = useState<Load<Approvals>>({ state: "loading" });

  const owner = me.state === "ok" && me.data.owner;

  const refreshMe = useCallback(() => load(api.me, setMe), []);
  const refreshScenarios = useCallback(() => load(api.scenarios, setScenarios), []);
  const refreshRuns = useCallback(() => load(api.runs, setRuns), []);
  const refreshApprovals = useCallback(() => load(api.approvals, setApprovals), []);

  const reloadAll = useCallback(async () => {
    await Promise.all([refreshMe(), refreshScenarios(), refreshRuns()]);
  }, [refreshMe, refreshScenarios, refreshRuns]);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  // Approvals are owner-only: fetch once the owner session is known, then poll gently.
  useEffect(() => {
    if (!owner) return;
    void refreshApprovals();
    const t = window.setInterval(() => void refreshApprovals(), 15000);
    return () => window.clearInterval(t);
  }, [owner, refreshApprovals]);

  const pending = approvals.state === "ok" && owner ? (approvals.data.pending?.length ?? 0) : 0;

  const value = useMemo<Store>(
    () => ({ me, scenarios, runs, approvals, owner, pending, refreshRuns, refreshApprovals, refreshMe, reloadAll }),
    [me, scenarios, runs, approvals, owner, pending, refreshRuns, refreshApprovals, refreshMe, reloadAll],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
