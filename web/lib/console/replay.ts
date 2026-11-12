"use client";

import { useCallback, useEffect, useState } from "react";

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface State {
  key: string;
  total: number;
  index: number;
  playing: boolean;
}

/**
 * Replay position over `total` steps. Starts playing once per `key` (unless reduced motion is on, then it
 * jumps to the final state). When `total` grows while parked on the last step it follows the new end.
 */
export function useReplay(total: number, key: string, delayFor: (index: number) => number = () => 520) {
  const [s, setS] = useState<State>(() => ({
    key,
    total,
    index: prefersReducedMotion() || total <= 1 ? Math.max(0, total - 1) : 0,
    playing: !prefersReducedMotion() && total > 1,
  }));

  // Derived-state resets during render, per React guidance, instead of effects.
  let cur = s;
  if (s.key !== key) {
    const reduced = prefersReducedMotion();
    cur = { key, total, index: reduced || total <= 1 ? Math.max(0, total - 1) : 0, playing: !reduced && total > 1 };
    setS(cur);
  } else if (s.total !== total) {
    const atEnd = s.index >= s.total - 1;
    cur = { ...s, total, index: atEnd ? Math.max(0, total - 1) : Math.min(s.index, Math.max(0, total - 1)), playing: s.playing && total > 1 };
    setS(cur);
  }

  const { index, playing } = cur;

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => {
      setS((p) => (p.index + 1 >= p.total ? { ...p, playing: false } : { ...p, index: p.index + 1 }));
    }, delayFor(index));
    return () => window.clearTimeout(t);
  }, [playing, index, delayFor]);

  const seek = useCallback((i: number) => setS((p) => ({ ...p, index: Math.min(Math.max(0, i), Math.max(0, p.total - 1)), playing: false })), []);
  const toggle = useCallback(
    () =>
      setS((p) => {
        if (p.playing) return { ...p, playing: false };
        const restart = p.index >= p.total - 1;
        return { ...p, playing: p.total > 1, index: restart ? 0 : p.index };
      }),
    [],
  );
  const finish = useCallback(() => setS((p) => ({ ...p, index: Math.max(0, p.total - 1), playing: false })), []);
  const replay = useCallback(() => setS((p) => ({ ...p, index: 0, playing: p.total > 1 && !prefersReducedMotion() })), []);

  return { index, playing, seek, toggle, finish, replay };
}
