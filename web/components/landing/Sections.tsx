import Link from "next/link";
import { BenchBars } from "./BenchBars";
import { Reveal } from "./Reveal";
import type { BenchRow } from "@/lib/types";

export function Statement() {
  return (
    <section className="statement block" id="how">
      <Reveal as="p" className="eyebrow">The idea</Reveal>
      <Reveal as="p" delay={1} className="big">
        Every value has a <em>birthplace.</em> Lineage makes the agent show its papers before a single cent moves.
      </Reveal>
    </section>
  );
}

export function BenchmarkSection({ rows }: { rows: BenchRow[] | null }) {
  const attacks = rows?.find((r) => r.mode === "compromised" && r.defense === "lineage")?.attacks;
  return (
    <section id="benchmark" className="block">
      <Reveal as="p" className="eyebrow">Benchmark</Reveal>
      <Reveal as="h2" delay={1}>
        Measured, <em>not claimed.</em>
      </Reveal>
      <Reveal as="p" delay={2} className="sub">
        The share of {attacks ?? ""} attacks that moved money to the attacker, by defense. Numbers come from{" "}
        <code>make bench</code>; the attacker is simulated, and each layer alone misses a different class of attack.
      </Reveal>
      <Reveal className="bars">
        <div aria-live="polite" className="bars-inner">
          <BenchBars rows={rows} />
        </div>
      </Reveal>
      <Reveal as="p" className="foot">
        <Link href="/bench">Full table and per-scenario matrix →</Link>
      </Reveal>
    </section>
  );
}

export function Rails() {
  return (
    <section id="rails" className="block">
      <Reveal as="p" className="eyebrow">One engine, two rails</Reveal>
      <Reveal as="h2" delay={1}>
        Fiat and crypto, <em>same guard.</em>
      </Reveal>
      <div className="rails">
        <Reveal as="article" className="rail">
          <h3>PayPal Payouts</h3>
          <p>
            Sandbox payouts through the Payouts API. Credentials live only in the executor, so the agent can’t reach
            PayPal directly.
          </p>
          <span className="badge">Sandbox</span>
        </Reveal>
        <Reveal as="article" delay={1} className="rail">
          <h3>NEAR Intents</h3>
          <p>
            A Rust signer produces NEP-413 signatures only for intents the guard authorized, with destination, asset,
            deadline and nonce rules.
          </p>
          <span className="badge dim">Signer built · execution in testing</span>
        </Reveal>
      </div>
    </section>
  );
}

export function Honest() {
  return (
    <section className="block honest">
      <Reveal as="p" className="eyebrow">What it doesn’t do</Reveal>
      <Reveal as="ul">
        <li>Tracing matches identifiers exactly. It doesn’t follow derived values, so amounts are bounded by the PO instead.</li>
        <li>A poisoned vendor master or a compromised owner channel is out of scope.</li>
        <li>
          The benchmark is small and author-written, and its attacker is simulated. It shows a deterministic enforcement
          point, not a proof of security.
        </li>
      </Reveal>
    </section>
  );
}

export function FinalCta({ simulated }: { simulated: boolean }) {
  return (
    <section className="final-wrap">
      <div className="final">
        <Reveal as="h2">
          Watch an attacker <em>fail.</em>
        </Reveal>
        <Reveal delay={1} className="cta-wrap">
          <Link className="cream-btn" href="/demo">
            Run the demo <span aria-hidden="true">▸</span>
          </Link>
        </Reveal>
        <Reveal as="p" delay={2}>
          Sandbox only. No real money.{simulated ? " This instance uses a simulated payment rail." : ""}
        </Reveal>
      </div>
    </section>
  );
}
