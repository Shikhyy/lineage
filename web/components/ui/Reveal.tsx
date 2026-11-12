"use client";

import { useEffect, useRef, type ElementType, type ReactNode, type CSSProperties } from "react";
import { gsap, ScrollTrigger } from "@/lib/motion/gsap";
import { reducedNow } from "@/lib/motion/env";

type Props = {
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  delay?: number;
  y?: number;
  id?: string;
};

/** Fade-and-rise on first entry. Static, fully visible content under reduced motion. */
export function Reveal({ as: Tag = "div", className, style, children, delay = 0, y = 22, id }: Props) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedNow()) {
      el.setAttribute("data-revealed", "");
      return;
    }
    gsap.set(el, { opacity: 0, y });
    el.setAttribute("data-revealed", "");
    const st = ScrollTrigger.create({
      trigger: el,
      start: "top 92%",
      once: true,
      onEnter: () => gsap.to(el, { opacity: 1, y: 0, duration: 1.1, delay, ease: "expo.out", clearProps: "transform,opacity" }),
    });
    return () => {
      st.kill();
      gsap.killTweensOf(el);
      gsap.set(el, { clearProps: "all" });
    };
  }, [delay, y]);
  return (
    <Tag ref={ref} id={id} className={className} style={style} data-reveal>
      {children}
    </Tag>
  );
}
