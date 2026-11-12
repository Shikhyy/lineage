"use client";

import { Fragment, useEffect, useRef, type ElementType } from "react";
import { gsap, ScrollTrigger } from "@/lib/motion/gsap";
import { reducedNow } from "@/lib/motion/env";
import { onReady } from "@/lib/motion/ready";
import { groupLines, parseHeadline, plain } from "@/lib/motion/split";

type Props = {
  text: string;
  as?: ElementType;
  className?: string;
  /** "load" waits for the page-ready signal, "scroll" waits for the element to enter. */
  trigger?: "load" | "scroll";
  delay?: number;
  lineStagger?: number;
  duration?: number;
};

/**
 * Line-mask headline reveal. Words are real React spans (hydration-safe); at play time they
 * are grouped into visual lines by layout, and each line rises out of its own mask together.
 */
export function SplitText({
  text,
  as: Tag = "span",
  className,
  trigger = "scroll",
  delay = 0,
  lineStagger = 0.11,
  duration = 1.25,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const words = parseHeadline(text);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const inner = Array.from(root.querySelectorAll<HTMLElement>(".swi"));
    const masks = Array.from(root.querySelectorAll<HTMLElement>(".sw"));
    if (reducedNow()) {
      root.setAttribute("data-split-ready", "");
      return;
    }
    // Mark ready FIRST: until this attribute exists, CSS hides the words with translateY(115%). If GSAP read
    // the transform while that rule still applied, it would bake the 115% in as a fixed pixel offset that no
    // yPercent tween can remove (the headline would never appear). Same task, so nothing paints in between.
    root.setAttribute("data-split-ready", "");
    gsap.set(inner, { y: 0, yPercent: 115 });

    let tween: gsap.core.Tween | null = null;
    const play = () => {
      const lines = groupLines(masks);
      lines.forEach((ln, i) => {
        tween = gsap.to(
          ln.map((m) => m.firstElementChild),
          { yPercent: 0, duration, ease: "expo.out", delay: delay + i * lineStagger },
        );
      });
    };

    let st: ScrollTrigger | null = null;
    let off = () => {};
    if (trigger === "load") off = onReady(play);
    else st = ScrollTrigger.create({ trigger: root, start: "top 90%", once: true, onEnter: play });

    return () => {
      off();
      st?.kill();
      tween?.kill();
      gsap.killTweensOf(inner);
      gsap.set(inner, { clearProps: "transform" });
    };
  }, [text, trigger, delay, lineStagger, duration]);

  return (
    <Tag ref={ref} className={className} data-split aria-label={plain(text)}>
      {words.map((w, i) =>
        w.br ? (
          <br key={i} aria-hidden="true" />
        ) : (
          <Fragment key={i}>
            <span className="sw" aria-hidden="true">
              <span className="swi">{w.em ? <em>{w.text}</em> : w.text}</span>
            </span>{" "}
          </Fragment>
        ),
      )}
    </Tag>
  );
}
