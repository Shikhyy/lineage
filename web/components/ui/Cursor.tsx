"use client";

import { useEffect, useRef } from "react";
import { gsap } from "@/lib/motion/gsap";
import { finePointer, reducedNow } from "@/lib/motion/env";

/** Dot + ring cursor for fine pointers. Never active on touch; steps aside over text fields. */
export function Cursor() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const d = dot.current;
    const r = ring.current;
    if (!d || !r || !finePointer() || reducedNow()) return;
    const html = document.documentElement;
    const dx = gsap.quickTo(d, "x", { duration: 0.05, ease: "none" });
    const dy = gsap.quickTo(d, "y", { duration: 0.05, ease: "none" });
    const rx = gsap.quickTo(r, "x", { duration: 0.45, ease: "power3.out" });
    const ry = gsap.quickTo(r, "y", { duration: 0.45, ease: "power3.out" });
    let shown = false;
    let state = "";

    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      if (!shown) {
        shown = true;
        gsap.set([d, r], { x: e.clientX, y: e.clientY, opacity: 1 });
        html.classList.add("has-cursor");
      }
      dx(e.clientX);
      dy(e.clientY);
      rx(e.clientX);
      ry(e.clientY);
      const t = e.target as Element | null;
      const next = t?.closest("input,textarea,select,[contenteditable='true']")
        ? "hidden"
        : t?.closest("a,button,summary,label,[role='button'],[data-cursor]")
          ? "link"
          : "idle";
      if (next !== state) {
        state = next;
        r.dataset.state = next;
        d.dataset.state = next === "link" ? "hidden" : next;
      }
    };
    const leave = () => {
      shown = false;
      gsap.set([d, r], { opacity: 0 });
      html.classList.remove("has-cursor");
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      html.classList.remove("has-cursor");
      gsap.killTweensOf([d, r]);
    };
  }, []);

  return (
    <>
      <div ref={ring} className="cursor-ring" aria-hidden="true" />
      <div ref={dot} className="cursor-dot" aria-hidden="true" />
    </>
  );
}
