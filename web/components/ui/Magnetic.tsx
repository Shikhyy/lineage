"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { gsap } from "@/lib/motion/gsap";
import { finePointer, reducedNow } from "@/lib/motion/env";

/** Pulls its child toward the pointer. Fine pointers only; inert under reduced motion. */
export function Magnetic({ children, strength = 0.32 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    const inner = el?.firstElementChild as HTMLElement | null;
    if (!el || !inner || !finePointer() || reducedNow()) return;
    const x = gsap.quickTo(inner, "x", { duration: 0.5, ease: "power3.out" });
    const y = gsap.quickTo(inner, "y", { duration: 0.5, ease: "power3.out" });
    const move = (e: PointerEvent) => {
      const r = inner.getBoundingClientRect();
      x((e.clientX - (r.left + r.width / 2)) * strength);
      y((e.clientY - (r.top + r.height / 2)) * strength);
    };
    const leave = () => {
      gsap.to(inner, { x: 0, y: 0, duration: 1, ease: "elastic.out(1, 0.38)", overwrite: true });
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      gsap.killTweensOf(inner);
      gsap.set(inner, { clearProps: "transform" });
    };
  }, [strength]);
  return (
    <span ref={ref} className="magnetic">
      {children}
    </span>
  );
}
