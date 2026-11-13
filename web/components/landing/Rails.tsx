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
            <i aria-hidden="true" /> Signer wired in · settlement not run
          </p>
          <h3 className="display">NEAR Intents</h3>
          <p>
            A Rust signer for NEAR Intents sits behind the same guard. When it is running, allowed or owner-approved
            intents get a real NEP-413 signature that the console checks in your browser; held and blocked ones are never
            signed. Without it, signatures are simulated and labelled so. Settlement on NEAR mainnet has not been run, and
            the benchmark covers four intent attack classes, not live settlement.
          </p>
          <dl className="rail-facts mono">
            <div><dt>Signing</dt><dd>Real when the signer runs</dd></div>
            <div><dt>Settlement</dt><dd>Not run</dd></div>
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
