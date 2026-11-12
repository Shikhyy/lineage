"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "@/lib/motion/gsap";
import { reducedNow } from "@/lib/motion/env";
import { onReady } from "@/lib/motion/ready";

type Case = {
  payee: string;
  born: string;
  via: string;
  tier: "T0" | "T2";
  tierName: string;
  may: "no" | "yes";
  verdict: string;
};

// Each case mirrors a real run of the demo data (seeded vendor v_acme, invoice inv_1).
const CASES: Case[] = [
  { payee: "attacker@sandbox.test", born: "Inbound email", via: "billing@acme-supp1ies.com", tier: "T0", tierName: "Untrusted", may: "no", verdict: "ASK_OWNER" },
  { payee: "vendor-a@sandbox.test", born: "Vendor master", via: "record v_acme", tier: "T2", tierName: "Trusted record", may: "yes", verdict: "ALLOW" },
  { payee: "attacker@sandbox.test", born: "Agent memory", via: "parent: an earlier chat", tier: "T0", tierName: "Untrusted", may: "no", verdict: "ASK_OWNER" },
];

const GLYPHS = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789@._-";

function scramble(el: HTMLElement, to: string, dur = 0.7) {
  const o = { p: 0 };
  return gsap.to(o, {
    p: 1,
    duration: dur,
    ease: "none",
    onUpdate: () => {
      const n = Math.floor(o.p * to.length);
      let out = to.slice(0, n);
      for (let i = n; i < to.length; i++) out += to[i] === " " ? " " : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      el.textContent = out;
    },
    onComplete: () => {
      el.textContent = to;
    },
  });
}

/** A paper evidence tag on a string. It cycles through real classes of payee, each with its birthplace. */
export function EvidenceTag() {
  const [i, setI] = useState(0);
  const tag = useRef<HTMLDivElement>(null);
  const fields = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  // entrance + sway
  useEffect(() => {
    const el = tag.current;
    if (!el || reducedNow()) return;
    gsap.set(el, { yPercent: -112, rotation: 3, transformOrigin: "50% 0" });
    let sway: gsap.core.Tween | null = null;
    const off = onReady(() => {
      gsap.to(el, {
        yPercent: 0,
        duration: 1.9,
        ease: "elastic.out(1, 0.55)",
        delay: 0.5,
        onComplete: () => {
          sway = gsap.to(el, { rotation: -1.4, duration: 4.6, ease: "sine.inOut", yoyo: true, repeat: -1 });
        },
      });
      gsap.to(el, { rotation: 0, duration: 1.9, ease: "power2.out", delay: 0.5 });
    });
    return () => {
      off();
      sway?.kill();
      gsap.killTweensOf(el);
    };
  }, []);

  // cycle
  useEffect(() => {
    if (reducedNow()) return;
    const id = window.setInterval(() => setI((v) => (v + 1) % CASES.length), 5200);
    return () => window.clearInterval(id);
  }, []);

  // decode on change
  useEffect(() => {
    const root = fields.current;
    if (!root) return;
    if (first.current) {
      first.current = false;
      return;
    }
    if (reducedNow()) return;
    const c = CASES[i];
    const set = (sel: string, text: string, d = 0.6) => {
      const node = root.querySelector<HTMLElement>(sel);
      if (node) scramble(node, text, d);
    };
    set("[data-f='payee']", c.payee, 0.8);
    set("[data-f='born']", c.born, 0.45);
    set("[data-f='via']", c.via, 0.55);
    set("[data-f='tier']", `${c.tier} ${c.tierName.toUpperCase()}`, 0.5);
    set("[data-f='verdict']", c.verdict, 0.5);
    return () => {
      root.querySelectorAll("[data-f]").forEach((n) => gsap.killTweensOf(n));
    };
  }, [i]);

  const c = CASES[i];
  return (
    <div className="etag-wrap" aria-hidden="false">
      <div className="etag" ref={tag} data-t={c.tier}>
        <svg className="etag-string" viewBox="0 0 2 400" preserveAspectRatio="none" aria-hidden="true">
          <line x1="1" y1="0" x2="1" y2="400" stroke="var(--ink)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="etag-hole" aria-hidden="true" />
        <div className="etag-head mono-label">
          <span>Payee under inspection</span>
          <span>{String(i + 1).padStart(2, "0")}/{String(CASES.length).padStart(2, "0")}</span>
        </div>
        <div ref={fields} className="etag-body" aria-live="off">
          <p className="etag-payee display" data-f="payee">{c.payee}</p>
          <dl>
            <dt className="mono-label">Born in</dt>
            <dd data-f="born">{c.born}</dd>
            <dt className="mono-label">Via</dt>
            <dd data-f="via">{c.via}</dd>
            <dt className="mono-label">Tier</dt>
            <dd data-f="tier" className={`tier-${c.tier}`}>
              {c.tier} {c.tierName.toUpperCase()}
            </dd>
            <dt className="mono-label">May set payee</dt>
            <dd>{c.may === "yes" ? "Yes" : "No"}</dd>
          </dl>
        </div>
        <div className={`etag-verdict ${c.verdict === "ALLOW" ? "ok" : "hold"}`}>
          <span className="mono-label">Decision</span>
          <strong data-f="verdict">{c.verdict}</strong>
        </div>
        <p className="etag-foot mono-label">Guard runs outside the model</p>
      </div>
    </div>
  );
}
