"use client";

import { useEffect, useRef } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { SplitText } from "@/components/ui/SplitText";
import { gsap } from "@/lib/motion/gsap";
import { SLIPS, STEPS, type SlipData } from "./follow-data";

/* ---------- SVG slip (pinned desktop stage) ---------- */
const SW = 240;
const SH = 100;

function SvgSlip({ slip, x, y, cls }: { slip: SlipData; x: number; y: number; cls: string }) {
  const t2 = slip.chip === "T2";
  return (
    <g transform={`translate(${x} ${y})`}>
    <g className={`slip ${cls}`}>
      <rect x="0" y="0" width={SW} height={SH} className="slip-bg" />
      <rect x="0" y="0" width={SW} height="22" className="slip-bar" />
      <text x="10" y="15" className="slip-label">
        {slip.label.toUpperCase()}
      </text>
      <rect x={SW - 34} y="4" width="26" height="14" fill={t2 ? "var(--t2)" : "var(--t0)"} />
      <text x={SW - 21} y="14.4" textAnchor="middle" className="slip-chip">
        {slip.chip}
      </text>
      {slip.lines.map((line, i) => (
        <text key={i} x="10" y={44 + i * 20} className="slip-line">
          {line.map((s, j) => (
            <tspan key={j} className={s.hot ? "hot" : undefined}>
              {s.t}
            </tspan>
          ))}
        </text>
      ))}
    </g>
    </g>
  );
}

const AROW = 469;
const BROW = 578;

function Stage() {
  return (
    <svg className="stage-svg" viewBox="0 0 1000 640" role="img" aria-label="A diagram. An attacker's address is born in an email, copied to memory, repeated in a chat and handed to the payment tool; the guard stops that thread. A second thread from the vendor record passes through and is paid.">
      <defs>
        <filter id="rough" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" />
        </filter>
        <pattern id="ledger" width="10" height="32" patternUnits="userSpaceOnUse">
          <line x1="0" y1="31.5" x2="10" y2="31.5" stroke="var(--ink)" strokeOpacity="0.07" />
        </pattern>
      </defs>
      <rect width="1000" height="640" fill="url(#ledger)" />

      {/* registration marks */}
      {[
        [8, 8],
        [992, 8],
        [8, 632],
        [992, 632],
      ].map(([x, y]) => (
        <g key={`${x}${y}`} className="reg" transform={`translate(${x} ${y})`}>
          <line x1="-6" y1="0" x2="6" y2="0" />
          <line x1="0" y1="-6" x2="0" y2="6" />
          <circle r="3.4" />
        </g>
      ))}

      {/* guard */}
      <g className="gate">
        <text x="760" y="30" textAnchor="middle" className="gate-label">
          GUARD · OUTSIDE THE MODEL
        </text>
        <line className="gate-line g1" x1="760" y1="44" x2="760" y2="548" />
        <line className="gate-line g2" x1="760" y1="608" x2="760" y2="632" />
        <line className="gate-line g3" x1="754" y1="44" x2="766" y2="44" />
        <rect className="gate-door" x="754" y="550" width="12" height="56" />
      </g>

      {/* red thread: T0 all the way */}
      <path className="thread t1" pathLength={1} d="M250 64 C320 64 280 100 280 149" />
      <path className="thread t2" pathLength={1} d="M400 199 C470 199 430 235 430 284" />
      <path className="thread t3" pathLength={1} d="M550 334 C620 334 580 370 580 419" />
      <path className="thread t4" pathLength={1} d={`M700 ${AROW} L738 ${AROW}`} />
      <text x="306" y="96" className="tlabel tl1">COPIED</text>
      <text x="456" y="231" className="tlabel tl2">REPEATED</text>
      <text x="606" y="366" className="tlabel tl3">PASSED TO THE TOOL</text>

      {/* the fray at the gate */}
      <g className="fray">
        {[
          "M738 469 C746 462 750 452 756 442",
          "M738 469 C748 466 753 463 759 457",
          "M738 469 C748 470 754 474 758 470",
          "M738 469 C746 474 750 482 756 490",
          "M738 469 C744 478 746 490 750 502",
        ].map((d, i) => (
          <path key={i} className="fray-s" pathLength={1} d={d} />
        ))}
      </g>
      <path className="ghost" d={`M760 ${AROW} L818 ${AROW}`} />

      {/* slips */}
      <SvgSlip slip={SLIPS.email} x={10} y={14} cls="s-email" />
      <rect className="hot-line" x="49" y="103" width="151" height="2" />
      <SvgSlip slip={SLIPS.memory} x={160} y={149} cls="s-mem" />
      <SvgSlip slip={SLIPS.chat} x={310} y={284} cls="s-chat" />
      <SvgSlip slip={SLIPS.pay} x={460} y={419} cls="s-pay" />
      <SvgSlip slip={SLIPS.vendor} x={10} y={528} cls="s-vendor" />

      {/* green thread: T2, through the door */}
      <path className="thread good gt" pathLength={1} d={`M250 ${BROW} L818 ${BROW}`} />
      <text x="262" y={BROW - 8} className="tlabel good-l tl4">T2 · TRUSTED RECORD</text>

      {/* payment ledger */}
      <g className="pay">
        <text x="820" y="418" className="tlabel">PAYMENT RAIL</text>
        <g className="pay-a" transform={`translate(820 ${AROW - 34})`}>
          <rect width="172" height="68" className="pay-bg ghosted" />
          <text x="10" y="26" className="pay-t">attacker@sandbox.test</text>
          <text x="10" y="48" className="pay-s">$1,250.00 · HELD</text>
        </g>
        <g className="pay-b" transform={`translate(820 ${BROW - 34})`}>
          <rect width="172" height="68" className="pay-bg" />
          <rect className="pay-fill" width="172" height="68" />
          <text x="10" y="26" className="pay-t">vendor-a@sandbox.test</text>
          <text x="10" y="48" className="pay-s">$1,250.00 · PAID</text>
        </g>
      </g>

      {/* stamps */}
      <g transform="translate(878 318) rotate(-8)" filter="url(#rough)">
        <g className="stamp stamp-hold">
          <rect x="-98" y="-34" width="196" height="68" rx="2" />
          <rect x="-92" y="-28" width="184" height="56" rx="1" className="inner" />
          <text x="0" y="6" textAnchor="middle" className="stamp-t">ASK_OWNER</text>
          <text x="0" y="21" textAnchor="middle" className="stamp-s">NOTHING MOVED</text>
        </g>
      </g>
      <g transform="translate(906 529) rotate(5)" filter="url(#rough)">
        <g className="stamp stamp-paid">
          <rect x="-50" y="-17" width="100" height="34" rx="2" />
          <text x="0" y="8" textAnchor="middle" className="stamp-t sm">PAID</text>
        </g>
      </g>
    </svg>
  );
}

export function Follow() {
  const root = useRef<HTMLElement>(null);
  const pin = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mm = gsap.matchMedia();
    mm.add("(min-width: 1000px) and (min-height: 620px) and (prefers-reduced-motion: no-preference)", () => {
      const st = stage.current;
      const copy = pin.current;
      if (!st || !copy) return;
      const q = gsap.utils.selector(st);
      const c = gsap.utils.selector(copy);
      const blocks = c(".fcopy");
      const ticks = c(".fticks i");

      // initial states
      gsap.set(q(".slip:not(.s-email)"), { opacity: 0, y: 14 });
      gsap.set(q(".thread,.fray-s"), { strokeDasharray: 1, strokeDashoffset: 1, opacity: 0 });
      gsap.set(q(".tlabel"), { opacity: 0 });
      gsap.set(q(".hot-line"), { scaleX: 0, transformOrigin: "0 50%" });
      gsap.set(q(".ghost,.pay-a,.pay-b,.pay > .tlabel"), { opacity: 0 });
      gsap.set(q(".pay-fill"), { opacity: 0 });
      gsap.set(q(".stamp-hold"), { opacity: 0, scale: 1.9, rotation: -16 });
      gsap.set(q(".stamp-paid"), { opacity: 0, scale: 1.8, rotation: -12 });
      gsap.set(q(".gate-door"), { fill: "var(--paper)" });
      gsap.set(blocks, { opacity: 0, y: 28 });
      gsap.set(blocks[0], { opacity: 1, y: 0 });
      gsap.set(ticks, { scaleX: 0, transformOrigin: "0 50%" });
      gsap.set(ticks[0], { scaleX: 1 });

      const tl = gsap.timeline({
        defaults: { ease: "power2.inOut" },
        scrollTrigger: {
          trigger: copy,
          start: "top top",
          end: () => "+=" + Math.round(window.innerHeight * 5.6),
          pin: true,
          scrub: 0.9,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      });

      const swap = (from: number, to: number, at: number) => {
        tl.to(blocks[from], { opacity: 0, y: -28, duration: 0.5 }, at);
        tl.to(blocks[to], { opacity: 1, y: 0, duration: 0.6 }, at + 0.35);
        tl.to(ticks[to], { scaleX: 1, duration: 0.5 }, at + 0.35);
      };

      // 01: the address, underlined in the email
      tl.to(q(".hot-line"), { scaleX: 1, duration: 1.2 }, 0.1);
      // 02: copied into memory
      swap(0, 1, 1.5);
      tl.set(q(".t1"), { opacity: 1 }, 1.9)
        .to(q(".t1"), { strokeDashoffset: 0, duration: 1.3 }, 1.9)
        .to(q(".tl1"), { opacity: 1, duration: 0.4 }, 2.6)
        .to(q(".s-mem"), { opacity: 1, y: 0, duration: 0.7 }, 2.7);
      // 03: repeated in a chat
      swap(1, 2, 4.2);
      tl.set(q(".t2"), { opacity: 1 }, 4.6)
        .to(q(".t2"), { strokeDashoffset: 0, duration: 1.3 }, 4.6)
        .to(q(".tl2"), { opacity: 1, duration: 0.4 }, 5.3)
        .to(q(".s-chat"), { opacity: 1, y: 0, duration: 0.7 }, 5.4);
      // 04: handed to the payment tool
      swap(2, 3, 6.9);
      tl.set(q(".t3"), { opacity: 1 }, 7.3)
        .to(q(".t3"), { strokeDashoffset: 0, duration: 1.3 }, 7.3)
        .to(q(".tl3"), { opacity: 1, duration: 0.4 }, 8.0)
        .to(q(".s-pay"), { opacity: 1, y: 0, duration: 0.7 }, 8.1)
        .set(q(".t4"), { opacity: 1 }, 8.8)
        .to(q(".t4"), { strokeDashoffset: 0, duration: 0.7 }, 8.8);
      // 05: the thread stops
      swap(3, 4, 9.8);
      tl.set(q(".fray-s"), { opacity: 1 }, 10.1)
        .to(q(".fray-s"), { strokeDashoffset: 0, duration: 0.7, stagger: 0.07 }, 10.1)
        .to(q(".gate-line"), { stroke: "var(--signal)", duration: 0.3 }, 10.5)
        .to(q(".ghost,.pay-a,.pay > .tlabel"), { opacity: 1, duration: 0.5 }, 10.7)
        .to(q(".stamp-hold"), { opacity: 1, scale: 1, rotation: 0, duration: 0.45, ease: "back.out(2.4)" }, 11.0);
      // 06: the vendor record walks through
      swap(4, 5, 12.4);
      tl.to(q(".s-vendor"), { opacity: 1, y: 0, duration: 0.7 }, 12.7)
        .to(q(".tl4"), { opacity: 1, duration: 0.4 }, 13.3)
        .set(q(".gt"), { opacity: 1 }, 13.1)
        .to(q(".gt"), { strokeDashoffset: 0, duration: 1.9, ease: "power1.inOut" }, 13.1)
        .to(q(".gate-line"), { stroke: "var(--ink)", duration: 0.3 }, 13.4)
        .to(q(".gate-door"), { fill: "var(--t3)", duration: 0.3 }, 14.2)
        .to(q(".pay-b"), { opacity: 1, duration: 0.4 }, 14.6)
        .to(q(".pay-fill"), { opacity: 0.16, duration: 0.5 }, 15.0)
        .to(q(".stamp-paid"), { opacity: 1, scale: 1, rotation: 0, duration: 0.45, ease: "back.out(2.4)" }, 15.2);
      tl.to({}, { duration: 1.4 }, 15.6); // hold the final state before unpinning

      return () => {
        tl.scrollTrigger?.kill();
        tl.kill();
      };
    });
    return () => mm.revert();
  }, []);

  return (
    <section className="follow" id="follow" ref={root}>
      <div className="sec-head">
        <p className="mono-label sec-no">§ 01 — The signature</p>
        <p className="mono-label sec-aside">Six custody links, one decision</p>
      </div>

      <div className="follow-intro">
        <SplitText as="h2" className="display h2" text={"Follow the\n*payee.*"} />
        <Reveal as="p" className="follow-lede" delay={0.1}>
          Most payment fraud is not clever code. It is a value with a bad birthplace, passed along until nobody remembers where
          it came from. This is one address, from the email it was born in to the payment it was meant for, and the exact
          point where Lineage stops it.
        </Reveal>
      </div>

      {/* pinned, scroll-driven stage (desktop, motion allowed) */}
      <div className="follow-pin" ref={pin}>
        <div className="follow-grid">
          <div className="follow-copy">
            {STEPS.map((s, i) => (
              <article className="fcopy" key={s.n} aria-label={`Step ${s.n}`} data-tier={s.tier}>
                <div className="fnum display" aria-hidden="true">
                  {s.n}
                </div>
                <h3 className="display">{s.title}</h3>
                <p>{s.body}</p>
                <p className="mono-label fmeta">
                  <i className={`tdot tdot-${s.tier}`} aria-hidden="true" />
                  {s.tier === "T0" ? "Tier T0 · untrusted at every link" : "Tier T2 · trusted record"} · link {i + 1} of 6
                </p>
              </article>
            ))}
            <div className="fticks" aria-hidden="true">
              {STEPS.map((s) => (
                <span key={s.n}>
                  <i />
                </span>
              ))}
            </div>
          </div>
          <div className="follow-stage" ref={stage}>
            <Stage />
          </div>
        </div>
      </div>

      {/* vertical, non-pinned version: mobile, short screens, reduced motion */}
      <ol className="follow-list">
        {STEPS.map((s) => {
          const slip = SLIPS[s.slip];
          return (
            <li key={s.n} className={`fitem ${s.tier === "T2" ? "is-good" : "is-red"}${s.halt ? " is-halt" : ""}`}>
              <span className="fitem-n display" aria-hidden="true">
                {s.n}
              </span>
              <div className="fitem-b">
                <h3 className="display">{s.title}</h3>
                <p>{s.body}</p>
                <div className="hslip">
                  <p className="mono-label hslip-bar">
                    <span>{slip.label}</span>
                    <b className={slip.chip === "T2" ? "t2" : "t0"}>{slip.chip}</b>
                  </p>
                  {slip.lines.map((line, i) => (
                    <p key={i} className="hslip-l">
                      {line.map((seg, j) => (seg.hot ? <mark key={j}>{seg.t}</mark> : <span key={j}>{seg.t}</span>))}
                    </p>
                  ))}
                  {s.halt && <p className="hslip-stamp mono-label">ASK_OWNER · nothing moved</p>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
