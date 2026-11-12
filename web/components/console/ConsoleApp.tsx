"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Defense, Mode, RunRequest } from "@/lib/types";
import { ApprovalsPanel } from "./ApprovalsPanel";
import { AuditPanel } from "./AuditPanel";
import { BenchPanel } from "./BenchPanel";
import { CompareView } from "./CompareView";
import { Drawer } from "./Drawer";
import { EmptyGraph } from "./EmptyGraph";
import { HelpOverlay } from "./HelpOverlay";
import { EXAMPLES, Library, MAX_MESSAGE, type Draft, type Source } from "./Library";
import { RunView, typing } from "./RunView";
import { errorText, StoreProvider, useStore } from "./store";
import { TopBar, type PanelName } from "./TopBar";
import { useRunDetail } from "./useRunDetail";

const PANELS: PanelName[] = ["approvals", "audit", "benchmark"];
const DEFAULT_SCENARIO = "a2-bec-vendor-change";
const PANEL_TITLE: Record<PanelName, { title: string; kicker: string }> = {
  approvals: { title: "Owner approvals", kicker: "A held payment waits here" },
  audit: { title: "Audit log", kicker: "Hash-chained decisions" },
  benchmark: { title: "Benchmark", kicker: "PayBench-BEC" },
};

export function ConsoleApp() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

function Shell() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { scenarios, runs, me, refreshRuns, reloadAll } = useStore();

  const runId = pathname.match(/^\/console\/runs\/([^/]+)/)?.[1] ?? null;
  const isCompare = pathname.startsWith("/console/compare");
  const panelParam = sp.get("panel");
  const panel = PANELS.includes(panelParam as PanelName) ? (panelParam as PanelName) : null;

  const [src, setSrc] = useState<Source>({ kind: "scenario", id: DEFAULT_SCENARIO });
  const [draft, setDraft] = useState<Draft>(EXAMPLES[0].draft);
  const [libTab, setLibTab] = useState<"library" | "write" | "history">("library");
  const [libOpen, setLibOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [mode, setMode] = useState<Mode>("compromised");
  const [defense, setDefense] = useState<Defense>("lineage");
  const [busy, setBusy] = useState<"run" | "compare" | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const detail = useRunDetail(runId, nonce);

  // Opening a run points the library at that run's scenario, so Run and Compare act on what you are looking at.
  const [syncedRun, setSyncedRun] = useState<string | null>(null);
  if (detail.state === "ok" && detail.data.run.id !== syncedRun) {
    setSyncedRun(detail.data.run.id);
    if (detail.data.run.scenario_id !== "custom") setSrc({ kind: "scenario", id: detail.data.run.scenario_id });
  }

  const scenarioList = useMemo(() => (scenarios.state === "ok" ? scenarios.data : []), [scenarios]);
  const scenario = src.kind === "scenario" ? (scenarioList.find((s) => s.id === src.id) ?? null) : null;
  const customReady = draft.message.trim().length > 0 && draft.message.length <= MAX_MESSAGE;
  const ready = src.kind === "custom" ? customReady : scenarios.state !== "error";

  const href = useCallback(
    (path: string, p: PanelName | null) => (p ? `${path}?panel=${p}` : path),
    [],
  );

  const setPanel = useCallback(
    (p: PanelName | null) => {
      const q = new URLSearchParams(sp.toString());
      if (p) q.set("panel", p);
      else q.delete("panel");
      const qs = q.toString();
      router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, pathname, sp],
  );

  const bodyFor = useCallback(
    (d: Defense): RunRequest =>
      src.kind === "custom"
        ? { custom: { message: draft.message.trim(), channel: draft.channel, ...(draft.from.trim() ? { from: draft.from.trim() } : {}) }, mode, defense: d }
        : { scenario: src.id, mode, defense: d },
    [src, draft, mode],
  );

  const run = useCallback(async () => {
    if (busy || !ready) return;
    setBusy("run");
    setFlash(null);
    try {
      const { run_id } = await api.startRun(bodyFor(defense));
      void refreshRuns();
      router.push(`/console/runs/${run_id}`);
    } catch (e) {
      setFlash(errorText(e));
    } finally {
      setBusy(null);
    }
  }, [busy, ready, bodyFor, defense, refreshRuns, router]);

  const compare = useCallback(async () => {
    if (busy || !ready) return;
    setBusy("compare");
    setFlash(null);
    try {
      // The server serializes runs, so these go one after the other.
      const a = await api.startRun(bodyFor("none"));
      const b = await api.startRun(bodyFor("lineage"));
      void refreshRuns();
      router.push(`/console/compare?a=${a.run_id}&b=${b.run_id}`);
    } catch (e) {
      setFlash(errorText(e));
    } finally {
      setBusy(null);
    }
  }, [busy, ready, bodyFor, refreshRuns, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        if (help) setHelp(false);
        else if (libOpen) setLibOpen(false);
        else if (panel) setPanel(null);
        return;
      }
      if (typing(e.target)) return;
      if (e.key === "?") {
        e.preventDefault();
        setHelp((h) => !h);
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        void run();
      } else if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        void compare();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, compare, help, libOpen, panel, setPanel]);

  const openRun = useCallback(
    (id: string) => {
      setLibOpen(false);
      router.push(`/console/runs/${id}`);
    },
    [router],
  );

  const onResolved = useCallback(
    (resolvedRun: string) => {
      setNonce((n) => n + 1);
      void refreshRuns();
      if (resolvedRun !== runId) router.push(`/console/runs/${resolvedRun}`);
    },
    [refreshRuns, router, runId],
  );

  const setSource = (s: Source) => {
    setSrc(s);
    if (s.kind === "scenario" && libTab === "write") setLibTab("library");
    setLibOpen(false);
  };

  const down = me.state === "error" && me.status === 0;
  const scenarioClass = useMemo(() => {
    if (detail.state !== "ok") return null;
    return scenarioList.find((s) => s.id === detail.data.run.scenario_id)?.class ?? null;
  }, [detail, scenarioList]);

  const library = (
    <Library
      scenarios={scenarios}
      runs={runs}
      src={src}
      setSrc={setSource}
      draft={draft}
      setDraft={setDraft}
      activeRunId={runId}
      onOpenRun={openRun}
      tab={libTab}
      setTab={setLibTab}
      busy={busy !== null}
    />
  );

  const latest = runs.state === "ok" && runs.data.length ? runs.data[0].id : null;

  return (
    <div className="cx" data-view={isCompare ? "compare" : runId ? "run" : "home"}>
      <TopBar
        mode={mode}
        setMode={setMode}
        defense={defense}
        setDefense={setDefense}
        onRun={run}
        onCompare={compare}
        busy={busy}
        panel={panel}
        onPanel={setPanel}
        onLibrary={() => setLibOpen(true)}
        hasCustomReady={ready}
        onHelp={() => setHelp(true)}
      />
      <div className="cx-body">
        <aside className="cx-rail" aria-label="Scenario library">
          {library}
        </aside>
        <main className="cx-main" id="main">
          {flash && (
            <div className="flash" role="alert">
              <span>{flash}</span>
              <button type="button" className="linkbtn" onClick={() => setFlash(null)}>
                dismiss
              </button>
            </div>
          )}
          {busy && (
            <div className="working" role="status">
              <i /> {busy === "compare" ? "Running the same attack twice, with no defense and then with lineage…" : "Running…"}
            </div>
          )}
          {isCompare ? (
            <CompareView a={sp.get("a")} b={sp.get("b")} />
          ) : runId ? (
            detail.state === "loading" ? (
              <div className="rv" aria-busy="true" aria-label="Loading run">
                <div className="skel head" />
                <div className="skel hero" />
                <div className="skel bar" />
              </div>
            ) : detail.state === "error" ? (
              <div className="msg-page">
                <h2>{detail.status === 0 ? "The Lineage API is not reachable" : "This run cannot be opened"}</h2>
                <p>{detail.message}</p>
                <div className="eg-actions">
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => {
                      void reloadAll();
                      setNonce((n) => n + 1);
                    }}
                  >
                    Try again
                  </button>
                  <Link className="btn" href={href("/console", panel)}>
                    Back to the console
                  </Link>
                </div>
              </div>
            ) : (
              <RunView key={detail.data.run.id} run={detail.data} scenarioClass={scenarioClass} onResolved={onResolved} openPanel={setPanel} />
            )
          ) : (
            <EmptyGraph
              scenario={scenario}
              src={src}
              down={down}
              onRun={run}
              onCompare={compare}
              latestRunId={latest}
              onOpenLatest={() => latest && openRun(latest)}
              busy={busy}
            />
          )}
        </main>
      </div>

      {panel && (
        <Drawer title={PANEL_TITLE[panel].title} kicker={PANEL_TITLE[panel].kicker} wide={panel === "benchmark" || panel === "audit"} onClose={() => setPanel(null)}>
          {panel === "approvals" && <ApprovalsPanel onOpenRun={openRun} onResolved={onResolved} />}
          {panel === "audit" && <AuditPanel activeRunId={runId} />}
          {panel === "benchmark" && <BenchPanel />}
        </Drawer>
      )}
      {libOpen && (
        <Drawer title="Library" kicker="Scenarios" side="left" onClose={() => setLibOpen(false)}>
          {library}
        </Drawer>
      )}
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </div>
  );
}
