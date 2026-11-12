"use client";

import { Reveal } from "@/components/ui/Reveal";
import { SplitText } from "@/components/ui/SplitText";
import { railLabel, useMe } from "./MeContext";

export function Rails() {
  const me = useMe();
  const rail = railLabel(me);
  return (
    <section className="rails" id="rails">
      <div className="sec-head">
        <p className="mono-label sec-no">§ 05 — The rails</p>
        <p className="mono-label sec-aside">Where an ALLOW can land</p>
      </div>
      <div className="rails-intro">
        <SplitText as="h2" className="display h2" text={"Two rails. *One* of them\nis finished."} />
      </div>
      <div className="rails-grid">
        <Reveal as="article" className="rail rail-ok">
          <p className="mono-label rail-status">
            <i aria-hidden="true" /> Working · sandbox
          </p>
          <h3 className="display">PayPal Payouts</h3>
          <p>
            Allowed payments pay out through the PayPal Payouts API. This path has been exercised against the real PayPal
            sandbox, end to end: a real sandbox payout was accepted by PayPal. The host is pinned to the sandbox in code, so
            there is no path to live PayPal.
          </p>
          <dl className="rail-facts mono">
            <div><dt>Environment</dt><dd>PayPal sandbox</dd></div>
            <div><dt>Status</dt><dd>Exercised in the sandbox</dd></div>
            <div><dt>Real money</dt><dd>No</dd></div>
          </dl>
        </Reveal>
        <Reveal as="article" className="rail rail-wip" delay={0.1}>
          <p className="mono-label rail-status">
            <i aria-hidden="true" /> Signer built · execution in testing
          </p>
          <h3 className="display">NEAR Intents</h3>
          <p>
            A Rust signer for NEAR Intents is built and sits behind the same guard. Real on-chain execution is not done yet:
            it is in testing. The benchmark covers four intent attack classes against the guard, not live settlement.
          </p>
          <dl className="rail-facts mono">
            <div><dt>Signer</dt><dd>Built (Rust)</dd></div>
            <div><dt>Execution</dt><dd>In testing</dd></div>
            <div><dt>Real money</dt><dd>No</dd></div>
          </dl>
        </Reveal>
      </div>
      <Reveal className="rails-live" delay={0.05}>
        <span className="mono-label">This deployment</span>
        <span className="rails-live-v" data-live={rail.ok ? (rail.real ? "sandbox" : "sim") : "off"}>
          <i aria-hidden="true" /> {rail.short}
        </span>
        <p>{rail.long}</p>
      </Reveal>
    </section>
  );
}
