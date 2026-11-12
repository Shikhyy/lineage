import type Lenis from "lenis";

let inst: Lenis | null = null;
export const setLenis = (l: Lenis | null) => {
  inst = l;
};
export const getLenis = () => inst;

/** Scroll to an element through Lenis when it is running, natively otherwise. */
export function scrollToEl(target: HTMLElement | number, offset = 0) {
  if (inst) {
    const to = typeof target === "number" ? target : target.getBoundingClientRect().top + window.scrollY;
    const dist = Math.abs(to + offset - window.scrollY);
    const duration = Math.min(2.6, Math.max(1.1, dist / 4500));
    inst.scrollTo(target, { offset, duration, easing: (t: number) => 1 - Math.pow(1 - t, 4) });
    return;
  }
  const top = typeof target === "number" ? target : target.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: top + offset });
}
