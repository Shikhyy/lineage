"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

type Props = {
  as?: ElementType;
  delay?: 1 | 2 | 3;
  className?: string;
  children: ReactNode;
};

/** Fades its content in the first time it scrolls into view. Reduced-motion users see it at once (CSS). */
export function Reveal({ as: Tag = "div", delay, className = "", children }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  const cls = ["reveal", delay ? `d${delay}` : "", shown ? "in" : "", className].filter(Boolean).join(" ");
  return (
    <Tag ref={ref} className={cls}>
      {children}
    </Tag>
  );
}
