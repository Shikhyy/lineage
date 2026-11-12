import { useSyncExternalStore } from "react";

const RM = "(prefers-reduced-motion: reduce)";

export const reducedNow = () => typeof window !== "undefined" && window.matchMedia(RM).matches;
export const finePointer = () =>
  typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(RM);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(RM).matches,
    () => false,
  );
}
