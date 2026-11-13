"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFENSE_NAMES, money, tier, tierLabel } from "@/lib/format";
import { decisionsOf, fragmentsOf, orderFragments, outcomeOf, threadsFor, timeline, revealSteps, type Thread } from "@/lib/console/model";
import type { Fragment, RunDetail } from "@/lib/types";

export type Selection = { type: "fragment"; id: string } | { type: "guard" } | { type: "outcome" } | null;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Geom {
  w: number;
  h: number;
  stacked: boolean;
  frag: Record<string, Rect>;
  guard: Rect | null;
  out: Rect | null;
}

const GROUPS: Record<number, string> = { 0: "Owner · T3", 1: "Trusted records · T2", 2: "Known sender · T1", 3: "Untrusted · T0" };
const rankOf = (f: Fragment) => (f.kind === "owner" ? 0 : f.trust >= 2 ? 1 : f.trust === 1 ? 2 : 3);

function rectOf(el: HTMLElement, root: DOMRect): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left - root.left, y: r.top - root.top, w: r.width, h: r.height };
}

/** Draws one thread. In wide layouts: a bezier into the guard's left edge. Stacked: a bus lane down the right gutter. */
function threadPath(g: Geom, f: Rect, idx: number, total: number, lane: number): string {
  const guard = g.guard!;
  if (g.stacked) {
    const fx = f.x + f.w;
    const fy = f.y + f.h / 2;
    const laneX = g.w - 10 - lane * 6;
    const gy = guard.y + guard.h / 2;
    const gx = guard.x + guard.w;
    return `M${fx} ${fy} H${laneX - 8} Q${laneX} ${fy} ${laneX} ${fy + 8} V${gy - 8} Q${laneX} ${gy} ${laneX - 8} ${gy} H${gx}`;
  }
  const fx = f.x + f.w;
  const fy = f.y + f.h / 2;
  const span = Math.min(guard.h - 36, Math.max(0, (total - 1) * 9));
  const gy = guard.y + guard.h / 2 + (total > 1 ? (idx / (total - 1) - 0.5) * span : 0);
  const gx = guard.x;
  const dx = Math.max(40, (gx - fx) * 0.55);
  return `M${fx} ${fy} C${fx + dx} ${fy} ${gx - dx} ${gy} ${gx} ${gy}`;
}

function parentPath(p: Rect, c: Rect): string {
  const px = p.x;
  const py = p.y + p.h / 2;
  const cx = c.x;
  const cy = c.y + c.h / 2;
  const bulge = 15;
  return `M${px} ${py} C${px - bulge} ${py} ${cx - bulge} ${cy} ${cx} ${cy}`;
}

export function Graph({
  run,
  step,
  selection,
  onSelect,
  compact = false,
  outcomeActions,
}: {
  run: RunDetail;
  step: number;
  selection: Selection;
  onSelect: (s: Selection) => void;
  compact?: boolean;
  outcomeActions?: ReactNode;
}) {
  const ordered = useMemo(() => orderFragments(fragmentsOf(run)), [run]);
  const reveal = useMemo(() => revealSteps(run), [run]);
  const tl = useMemo(() => timeline(run), [run]);
  const decs = useMemo(() => decisionsOf(run), [run]);
  const outcome = useMemo(() => outcomeOf(run), [run]);

  // The decision on screen: the latest one that has landed, else the first.
  const activeDec = useMemo(() => {
    const landed = decs.filter((d) => d.stepIndex <= step);
    return landed.length ? landed[landed.length - 1].decision : null;
  }, [decs, step]);
  const finalDec = decs.length ? decs[decs.length - 1].decision : null;
  const threads = useMemo(() => threadsFor(run, activeDec), [run, activeDec]);
  // Unguarded runs have no decision at all, so threads fall back to text matching once the payment lands.
  const guardLanded = step >= tl.guardLand && tl.guardLand >= 0;
  const guardState: "idle" | "evaluating" | "landed" = guardLanded ? "landed" : tl.guardCall >= 0 && step >= tl.guardCall ? "evaluating" : "idle";
  const outcomeShown = step >= tl.outcome && (decs.length > 0 || tl.guardLand >= 0);
  const threadsShown = guardLanded;

  const [hover, setHover] = useState<string | null>(null);
  const focusId = hover ?? (selection?.type === "fragment" ? selection.id : null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<string, HTMLElement | null>>({});
  const guardRef = useRef<HTMLDivElement>(null);
  const outRef = useRef<HTMLDivElement>(null);
  const [geom, setGeom] = useState<Geom | null>(null);

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const rr = root.getBoundingClientRect();
    const frag: Record<string, Rect> = {};
    for (const [id, el] of Object.entries(nodeRefs.current)) if (el) frag[id] = rectOf(el, rr);
    const guard = guardRef.current ? rectOf(guardRef.current, rr) : null;
    const out = outRef.current ? rectOf(outRef.current, rr) : null;
    const stacked = guard && out ? out.y > guard.y + guard.h - 4 && guard.x < 40 : false;
    setGeom({ w: rr.width, h: rr.height, stacked: Boolean(stacked), frag, guard, out });
  }, []);

  // The guard and outcome cards are sticky, so threads re-anchor while the fragment list scrolls.
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    sc.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      sc.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [measure]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(root);
    if (guardRef.current) ro.observe(guardRef.current);
    if (outRef.current) ro.observe(outRef.current);
    return () => ro.disconnect();
  }, [measure, ordered.length]);

  // When the verdict lands, bring the payee's origin into view if the fragment list scrolls.
  const firstOrigin = threads[0]?.fragmentId ?? null;
  useEffect(() => {
    const sc = scrollRef.current;
    const node = firstOrigin ? nodeRefs.current[firstOrigin] : null;
    if (!guardLanded || !sc || !node || sc.scrollHeight <= sc.clientHeight + 4) return;
    const top = node.offsetTop - sc.clientHeight / 2 + node.offsetHeight / 2;
    sc.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [guardLanded, firstOrigin]);

  const threadIds = new Set(threads.map((t) => t.fragmentId));
  const threadByFrag = new Map<string, Thread[]>();
  for (const t of threads) threadByFrag.set(t.fragmentId, [...(threadByFrag.get(t.fragmentId) ?? []), t]);
  const chainIds = new Set(threads.flatMap((t) => t.chain));

  const payeeTone = threads.find((t) => t.field === "payee")?.tone ?? (activeDec ? (activeDec.lineage?.[0]?.grounded ? "good" : "neutral") : "neutral");
  const fieldLabel = (t: Thread) => (t.field === "payee" ? "payee" : t.field);

  let lane = 0;
  const drawn = threads.map((t, i) => ({ t, i, lane: lane++ }));

  const headers = useMemo(() => {
    const m = new Map<string, string>();
    let prev = -1;
    for (const f of ordered) {
      const r = rankOf(f);
      if (r !== prev) m.set(f.id, GROUPS[r]);
      prev = r;
    }
    return m;
  }, [ordered]);

  const guardTitle =
    decs.length || run.run.defense.startsWith("lineage") ? "Lineage guard" : DEFENSE_NAMES[run.run.defense];
  const hasGuardRuntime = decs.length > 0;

  return (
    <div className={`gx-scroll${compact ? " is-compact" : ""}`} ref={scrollRef}>
      <div className="gx" ref={rootRef} data-stacked={geom?.stacked ? "1" : "0"}>
        <svg className="gx-threads" width={geom?.w ?? 0} height={geom?.h ?? 0} aria-hidden="true">
          {geom?.guard && (
            <>
              {/* parent threads: what a poisoned fragment was derived from */}
              {ordered.flatMap((f) =>
                (f.parent_ids ?? []).map((pid) => {
                  const p = geom.frag[pid];
                  const c = geom.frag[f.id];
                  if (!p || !c) return null;
                  const shown = (reveal.get(f.id) ?? 0) <= step;
                  const hot = focusId === f.id || focusId === pid;
                  const dim = focusId && !hot;
                  return (
                    <path
                      key={`p-${pid}-${f.id}`}
                      d={parentPath(p, c)}
                      className={`th th-parent tone-${tier(f.trust).toLowerCase()}${hot ? " is-hot" : ""}${dim ? " is-dim" : ""}`}
                      style={{ opacity: shown ? undefined : 0 }}
                      pathLength={1}
                    />
                  );
                }),
              )}
              {/* context threads: everything the agent saw funnels through the guard, quietly */}
              {!geom.stacked &&
                ordered.map((f) => {
                  const r = geom.frag[f.id];
                  if (!r || threadIds.has(f.id)) return null;
                  const shown = (reveal.get(f.id) ?? 0) <= step;
                  const guardBox = geom.guard!;
                  const gy = guardBox.y + guardBox.h / 2;
                  const fx = r.x + r.w;
                  const fy = r.y + r.h / 2;
                  const gx = guardBox.x;
                  const dx = Math.max(40, (gx - fx) * 0.55);
                  return (
                    <path
                      key={`c-${f.id}`}
                      d={`M${fx} ${fy} C${fx + dx} ${fy} ${gx - dx} ${gy} ${gx} ${gy}`}
                      className={`th th-ctx${focusId ? " is-dim" : ""}`}
                      style={{ opacity: shown ? undefined : 0 }}
                    />
                  );
                })}
              {/* the lineage threads of the payment arguments */}
              {threadsShown &&
                drawn.map(({ t, i, lane: ln }) => {
                  const r = geom.frag[t.fragmentId];
                  if (!r) return null;
                  const hot = focusId === t.fragmentId;
                  const dim = focusId && !hot;
                  return (
                    <g key={`${run.run.id}-${t.key}-${activeDec?.id ?? "x"}`}>
                      <path
                        d={threadPath(geom, r, i, drawn.length, ln)}
                        className={`th th-main tone-${t.tone}${t.inferred ? " is-inferred" : ""}${hot ? " is-hot" : ""}${dim ? " is-dim" : ""}`}
                        style={{ animationDelay: `${i * 140}ms` }}
                        pathLength={1}
                      />
                    </g>
                  );
                })}
              {/* guard -> outcome */}
              {outcomeShown && geom.out && (
                <path
                  key={`out-${run.run.id}`}
                  className={`th th-out kind-${outcome.kind}`}
                  pathLength={1}
                  d={
                    geom.stacked
                      ? `M${geom.guard.x + geom.guard.w / 2} ${geom.guard.y + geom.guard.h} V${geom.out.y}`
                      : `M${geom.guard.x + geom.guard.w} ${geom.guard.y + geom.guard.h / 2} C${geom.guard.x + geom.guard.w + 40} ${geom.guard.y + geom.guard.h / 2} ${geom.out.x - 40} ${geom.out.y + geom.out.h / 2} ${geom.out.x} ${geom.out.y + geom.out.h / 2}`
                  }
                />
              )}
            </>
          )}
        </svg>

        <section className="gx-col gx-frags" aria-label="Fragments that reached the agent">
          <h3 className="gx-colhead">
            <span>What reached the agent</span>
            <span className="gx-count">{ordered.length} fragments</span>
          </h3>
          {ordered.length === 0 && <p className="gx-empty">This run recorded no fragments.</p>}
          {ordered.map((f) => {
            const t = tier(f.trust);
            const shown = (reveal.get(f.id) ?? 0) <= step;
            const rank = rankOf(f);
            const header = headers.get(f.id) ?? null;
            const own = threadByFrag.get(f.id);
            const isOrigin = threadsShown && !!own;
            const inChain = threadsShown && chainIds.has(f.id);
            const selected = selection?.type === "fragment" && selection.id === f.id;
            const dim = focusId && focusId !== f.id && !(f.parent_ids ?? []).includes(focusId) && !ordered.some((o) => o.id === focusId && (o.parent_ids ?? []).includes(f.id));
            const parentKinds = (f.parent_ids ?? []).map((p) => ordered.find((o) => o.id === p)).filter(Boolean) as Fragment[];
            return (
              <div key={f.id} className="gx-fragwrap">
                {header && <div className={`gx-group g${rank}`}>{header}</div>}
                <button
                  type="button"
                  ref={(el) => {
                    nodeRefs.current[f.id] = el;
                  }}
                  className={`gx-frag tier-${t.toLowerCase()}${shown ? " is-shown" : ""}${isOrigin ? " is-origin" : ""}${inChain ? " is-chain" : ""}${selected ? " is-selected" : ""}${dim ? " is-dim" : ""}`}
                  onMouseEnter={() => setHover(f.id)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(f.id)}
                  onBlur={() => setHover(null)}
                  onClick={() => onSelect({ type: "fragment", id: f.id })}
                  aria-pressed={selected}
                  aria-label={`${tierLabel(t)} fragment, ${f.kind}, ${f.source}`}
                >
                  <span className="gx-frag-head">
                    <span className={`tierchip tier-${t.toLowerCase()}`}>{t}</span>
                    <span className="gx-frag-kind">{f.kind}</span>
                    {isOrigin && (
                      <span className={`gx-origin tone-${own![0].tone}`}>
                        origin of {own!.map(fieldLabel).filter((v, i, a) => a.indexOf(v) === i).join(" + ")}
                        {own!.some((o) => o.inferred) ? " (value match)" : ""}
                      </span>
                    )}
                    {!isOrigin && inChain && <span className="gx-origin tone-t0">in the chain</span>}
                  </span>
                  <span className="gx-frag-src">{f.source}</span>
                  <span className="gx-frag-snip">{f.snippet}</span>
                  {parentKinds.length > 0 && (
                    <span className="gx-frag-parent">
                      derived from {parentKinds.map((p) => `${p.kind} (${tier(p.trust)})`).join(", ")}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </section>

        <section className="gx-col gx-guardcol" aria-label="Guard">
          <h3 className="gx-colhead">
            <span>Decision</span>
          </h3>
          <div
            ref={guardRef}
            className={`gx-guard state-${guardState} v-${(activeDec?.verdict ?? "none").toLowerCase()}${selection?.type === "guard" ? " is-selected" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => onSelect({ type: "guard" })}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect({ type: "guard" });
              }
            }}
            aria-label="Guard decision. Open details."
          >
            <div className="gx-guard-label">
              <span className="gx-pulse" /> {guardTitle} · {hasGuardRuntime ? "outside the model" : "no provenance check"}
            </div>
            {guardState === "idle" && <div className="gx-guard-wait">Waiting for the agent to call a payment tool.</div>}
            {guardState === "evaluating" && <div className="gx-guard-wait">Inspecting the call&hellip;</div>}
            {guardState === "landed" && activeDec && (
              <>
                <div className="gx-verdict" key={`${run.run.id}-${activeDec.id}`}>
                  {activeDec.verdict.replace("_", " ")}
                </div>
                <div className="gx-reasons">
                  {(activeDec.reasons ?? []).length === 0 && <span className="gx-reason ok">no objections</span>}
                  {(activeDec.reasons ?? []).map((r) => (
                    <span key={r.code} className={`gx-reason eff-${r.effect.toLowerCase()}`} title={r.message}>
                      {r.code}
                    </span>
                  ))}
                </div>
                <div className="gx-args">
                  <span className="gx-args-k">pay</span> {money(activeDec.args.amount_cents)}
                  <span className="gx-args-k"> to </span>
                  <span className={`gx-payee tone-${payeeTone}`}>{activeDec.args.payee}</span>
                </div>
                {activeDec.lineage?.[0] && (
                  <div className={`gx-grounded ${activeDec.lineage[0].grounded ? "yes" : "no"}`}>
                    {activeDec.lineage[0].grounded ? "payee grounded in a trusted record" : "payee not grounded"}
                  </div>
                )}
              </>
            )}
            {guardState === "landed" && !activeDec && (
              <>
                <div className="gx-verdict none">NO VERDICT</div>
                <div className="gx-guard-wait">
                  <b>{DEFENSE_NAMES[run.run.defense]}</b> ran no provenance check, so the call went straight to the rail.
                  {threads.length > 0 && " Threads follow the payee value by text match."}
                </div>
              </>
            )}
            {decs.length > 1 && <div className="gx-multi">decision {decs.findIndex((d) => d.decision.id === activeDec?.id) + 1} of {decs.length}</div>}
          </div>
        </section>

        <section className="gx-col gx-outcol" aria-label="Outcome">
          <h3 className="gx-colhead">
            <span>Outcome</span>
          </h3>
          <div
            ref={outRef}
            className={`gx-out kind-${outcomeShown ? outcome.kind : "wait"}${selection?.type === "outcome" ? " is-selected" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => onSelect({ type: "outcome" })}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect({ type: "outcome" });
              }
            }}
            aria-label="Outcome. Open details."
          >
            {!outcomeShown && <div className="gx-guard-wait">Nothing has happened to the money yet.</div>}
            {outcomeShown && (
              <div key={`${run.run.id}-${outcome.kind}`} className="gx-out-in">
                <div className="gx-out-head">{outcome.headline}</div>
                {outcome.cents !== null && (
                  <div className="gx-out-amt">
                    {money(outcome.cents)}
                    {outcome.payee && <span className="gx-out-to"> to </span>}
                    {outcome.payee && <span className={`gx-payee tone-${payeeTone}`}>{outcome.payee}</span>}
                  </div>
                )}
                <div className="gx-out-detail">{outcome.detail}</div>
                <div className="gx-out-meta">
                  <span className={`railbadge rail-${(outcome.rail ?? run.rail).toLowerCase()}`}>
                    {railLabel(outcome.rail ?? run.rail)}
                  </span>
                  {outcome.status && <span className="gx-status">status {outcome.status}</span>}
                  {outcome.approvalStatus && <span className="gx-status">approval {outcome.approvalStatus}</span>}
                </div>
                {outcomeActions && (
                  <div className="gx-out-actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    {outcomeActions}
                  </div>
                )}
              </div>
            )}
          </div>
          {finalDec === null && outcomeShown && <p className="gx-note">Money moved on the destination in the agent&apos;s call. No guard stood in between.</p>}
        </section>
      </div>
    </div>
  );
}

export function railLabel(rail: string): string {
  const r = rail.toLowerCase();
  if (r === "simulated") return "Simulated rail · no real money";
  if (r === "paypal") return "PayPal sandbox";
  if (r === "near") return "NEAR testnet intent";
  if (r === "near-adapter") return "NEAR · signed by the Rust signer";
  if (r === "near-simulated") return "NEAR · simulated signature";
  return rail;
}
