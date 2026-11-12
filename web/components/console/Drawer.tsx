"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Right-hand drawer used by approvals, audit and benchmark. Closes on Escape or backdrop click, restores focus. */
export function Drawer({ title, kicker, wide, onClose, children, side = "right" }: { title: string; kicker?: string; wide?: boolean; onClose: () => void; children: ReactNode; side?: "right" | "left" }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => prev?.focus?.();
  }, []);
  return (
    <div className="drawer-root">
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`drawer side-${side}${wide ? " is-wide" : ""}`}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <header className="drawer-head">
          <div>
            {kicker && <div className="micro">{kicker}</div>}
            <h2>{title}</h2>
          </div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label={`Close ${title}`}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}
