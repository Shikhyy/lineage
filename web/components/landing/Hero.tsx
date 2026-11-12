"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { SplitText } from "@/components/ui/SplitText";
import { gsap } from "@/lib/motion/gsap";
import { reducedNow } from "@/lib/motion/env";
import { onReady } from "@/lib/motion/ready";
import { EvidenceTag } from "./EvidenceTag";

type Stat = { attacks: number; noneWins: number; fullWins: number } | null;

export function Hero({ stat }: { stat: Stat }) {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || reducedNow()) {
      el?.setAttribute("data-intro", "done");
      return;
    }
    const q = gsap.utils.selector(el);
    gsap.set(q("[data-in]"), { opacity: 0, y: 18 });
    gsap.set(q(".hero-rule"), { scaleX: 0, transformOrigin: "0 50%" });
    const off = onReady(() => {
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      tl.to(q(".hero-rule"), { scaleX: 1, duration: 1.6 }, 0.1)
        .to(q("[data-in]"), { opacity: 1, y: 0, duration: 1.1, stagger: 0.09 }, 0.55);
    });
    return () => {
      off();
      gsap.killTweensOf(q("[data-in],.hero-rule"));
    };
  }, []);

  return (
    <section className="hero" id="top" ref={root}>
      <div className="hero-meta mono-label" data-in>
        <span>Provenance-gated payments for AI agents</span>
        <span className="hero-meta-r">File no. 01 · Chain of custody</span>
      </div>
      <div className="hero-rule" aria-hidden="true" />

      <EvidenceTag />

      <h1 className="display hero-h">
        <SplitText as="span" className="hero-hl" trigger="load" lineStagger={0.13} text={"Pay only\nwhat you can\n*trace home.*"} />
      </h1>

      <div className="hero-foot">
        <p className="hero-lede" data-in>
          Lineage follows every payee, address and amount back to the place it was born. If it was born in an inbound email,
          a chat or a memory, it can <em>never</em> decide where money goes. The rule runs outside the model, so even a
          jailbroken agent cannot talk its way past it.
        </p>
        <div className="hero-cta" data-in>
          <Button href="#lab">Try to phish it</Button>
          <Button href="/console" variant="line">
            Open the console
          </Button>
        </div>
      </div>

      <div className="hero-base mono-label" data-in>
        <span className="hero-scroll">
          <i aria-hidden="true" /> Scroll to follow a payee
        </span>
        <span className="hero-fact">
          {stat ? (
            <>
              Simulated compromised agent · {stat.noneWins}/{stat.attacks} attacks land with no guard · <b>{stat.fullWins}/{stat.attacks}</b> behind Lineage
            </>
          ) : (
            <>Benchmark numbers unavailable: API unreachable</>
          )}
        </span>
        <span className="hero-sbx">Sandbox only</span>
      </div>
    </section>
  );
}
