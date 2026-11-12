"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { gsap, ScrollTrigger } from "@/lib/motion/gsap";
import { reducedNow } from "@/lib/motion/env";
import { setLenis, scrollToEl } from "@/lib/motion/lenis";
import { markReady } from "@/lib/motion/ready";

/**
 * Lenis + GSAP ScrollTrigger on one ticker. Mounted by the (site) layout only, so the Console never
 * gets smooth scrolling. Everything is torn down on unmount (route change).
 */
export function SmoothScroll() {
  useEffect(() => {
    const reduced = reducedNow();
    // Pinned sections make browser scroll restoration land in the wrong place; we place deep links ourselves.
    const prevRestoration = history.scrollRestoration;
    history.scrollRestoration = "manual";
    let lenis: Lenis | null = null;
    let tick: ((t: number) => void) | null = null;

    if (!reduced) {
      lenis = new Lenis({ lerp: 0.095, smoothWheel: true });
      setLenis(lenis);
      lenis.on("scroll", ScrollTrigger.update);
      tick = (t: number) => lenis?.raf(t * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
    }

    // In-page anchors go through Lenis; keyboard + native anchors keep working without it.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      const a = (e.target as Element | null)?.closest?.("a[href^='#']") as HTMLAnchorElement | null;
      if (!a) return;
      const id = a.getAttribute("href") ?? "";
      if (id === "#" || id === "#top") {
        e.preventDefault();
        scrollToEl(0);
        return;
      }
      const target = document.querySelector<HTMLElement>(id);
      if (!target) return;
      e.preventDefault();
      scrollToEl(target, 0);
      history.replaceState(null, "", id);
    };
    document.addEventListener("click", onClick);

    let dead = false;
    // Deep links: place once layout is final, and again shortly after in case the browser restores a stale
    // position late. Stops as soon as the visitor scrolls themselves.
    let moved = false;
    const mark = () => {
      moved = true;
    };
    window.addEventListener("wheel", mark, { passive: true, once: true });
    window.addEventListener("touchstart", mark, { passive: true, once: true });
    window.addEventListener("keydown", mark, { once: true });
    const hashTimers: number[] = [];
    const toHash = () => {
      if (moved) return;
      const target = location.hash.length > 1 ? document.querySelector<HTMLElement>(location.hash) : null;
      if (!target) return;
      if (lenis) lenis.scrollTo(target, { immediate: true, force: true });
      else target.scrollIntoView();
    };
    const settle = () => {
      if (dead) return;
      ScrollTrigger.refresh();
      toHash();
      [300, 900].forEach((ms) => hashTimers.push(window.setTimeout(toHash, ms)));
      markReady();
    };
    const fallback = window.setTimeout(settle, 1400);
    document.fonts.ready.then(() => {
      window.clearTimeout(fallback);
      requestAnimationFrame(settle);
    });
    const onLoad = () => {
      ScrollTrigger.refresh();
      toHash();
    };
    window.addEventListener("load", onLoad);

    return () => {
      dead = true;
      history.scrollRestoration = prevRestoration;
      hashTimers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener("wheel", mark);
      window.removeEventListener("touchstart", mark);
      window.removeEventListener("keydown", mark);
      window.clearTimeout(fallback);
      window.removeEventListener("load", onLoad);
      document.removeEventListener("click", onClick);
      if (tick) gsap.ticker.remove(tick);
      lenis?.destroy();
      setLenis(null);
      ScrollTrigger.getAll().forEach((t) => t.kill());
      gsap.ticker.lagSmoothing(500, 33);
      delete document.documentElement.dataset.ready;
    };
  }, []);
  return null;
}
