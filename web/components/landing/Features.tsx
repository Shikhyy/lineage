import Link from "next/link";
import type { ReactNode } from "react";
import { Reveal } from "./Reveal";

const MONO = "ui-monospace,Menlo,monospace";

type FeatureProps = {
  reverse?: boolean;
  icon: ReactNode;
  tag: string;
  title: string;
  children: ReactNode;
  cta: ReactNode;
  diagram: ReactNode;
};

function Feature({ reverse, icon, tag, title, children, cta, diagram }: FeatureProps) {
  return (
    <Reveal as="article" className={`feat${reverse ? " reverse" : ""}`}>
      <div className="feat-text">
        <span className="ico">{icon}</span>
        <p className="tag">{tag}</p>
        <h3>{title}</h3>
        <p>{children}</p>
        {cta}
      </div>
      <div className="diagram">{diagram}</div>
    </Reveal>
  );
}

const iconProps = { viewBox: "0 0 24 24", width: 26, height: 26, "aria-hidden": true } as const;
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function Features() {
  return (
    <section className="features block">
      <div className="features-head">
        <Reveal as="h2">
          Everything you need to stop a <em>bad payment.</em>
        </Reveal>
        <Reveal as="p" delay={1}>
          Guardrails that cap amounts and keep allowlists don’t ask the one question that matters:{" "}
          <strong>where did this payee come from, and is that source allowed to set it?</strong> Lineage does.
        </Reveal>
      </div>

      <Feature
        icon={
          <svg {...iconProps}>
            <path d="M4 6h6M4 12h6M4 18h6M14 12h6M10 6c3 0 3 6 4 6M10 18c3 0 3-6 4-6" {...stroke} />
          </svg>
        }
        tag="PROVENANCE"
        title="Label at the door, trace at the gate"
        cta={
          <Link className="dark-btn small" href="/demo">
            See a trace →
          </Link>
        }
        diagram={
          <svg viewBox="0 0 420 250" role="img" aria-label="Email and memory sources marked untrusted and a vendor record marked trusted all point to the payee, asking where it came from">
            <g fontFamily={MONO} fontSize="11">
              <g><rect x="16" y="22" width="150" height="34" rx="17" className="dn bad" /><text x="32" y="43">email · T0</text></g>
              <g><rect x="16" y="108" width="150" height="34" rx="17" className="dn bad" /><text x="32" y="129">memory · T0</text></g>
              <g><rect x="16" y="194" width="150" height="34" rx="17" className="dn good" /><text x="32" y="215">vendor record · T2</text></g>
              <path d="M166 39 C 240 39 230 112 262 118" className="ln bad" />
              <path d="M166 125 C 220 125 230 125 262 125" className="ln bad" />
              <path d="M166 211 C 240 211 230 140 262 132" className="ln good" />
              <g>
                <rect x="262" y="96" width="140" height="58" rx="12" className="dn node" />
                <text x="276" y="120">payee</text>
                <text x="276" y="138" fill="#8E826C">its origin?</text>
              </g>
            </g>
          </svg>
        }
      >
        Every email, chat message, memory entry and tool result becomes a fragment with a trust tier assigned by{" "}
        <em>our code</em>. Before payment, the payee is traced back through the context to the exact message that put it
        there.
      </Feature>

      <Feature
        reverse
        icon={
          <svg {...iconProps}>
            <rect x="3" y="4" width="8" height="8" rx="1.5" {...stroke} />
            <rect x="13" y="12" width="8" height="8" rx="1.5" {...stroke} />
            <path d="M11 8h3a2 2 0 012 2v2" {...stroke} />
          </svg>
        }
        tag="BINDING"
        title="Bound to records, not to the agent’s say-so"
        cta={
          <a className="dark-btn small" href="#benchmark">
            See the ablations →
          </a>
        }
        diagram={
          <svg viewBox="0 0 420 250" role="img" aria-label="Invoice, purchase order and vendor records checked against each other: amount within the PO, vendor matches, payee belongs to the vendor">
            <g fontFamily={MONO} fontSize="11">
              <rect x="30" y="30" width="110" height="46" rx="10" className="dn node" /><text x="44" y="57">invoice</text>
              <rect x="280" y="30" width="110" height="46" rx="10" className="dn node" /><text x="304" y="57">PO</text>
              <rect x="155" y="170" width="110" height="46" rx="10" className="dn node" /><text x="176" y="197">vendor</text>
              <path d="M140 53H280M85 76 C 90 130 120 170 155 190M335 76 C 330 130 300 170 265 190" className="ln good" />
              <g className="ck"><circle cx="210" cy="53" r="12" /><path d="M204 53l4 4 8-9" /></g>
              <text x="150" y="104" fill="#625542">amount ≤ PO</text>
              <text x="20" y="140" fill="#625542">vendor matches</text>
              <text x="296" y="140" fill="#625542">payee is theirs</text>
            </g>
          </svg>
        }
      >
        The invoice, purchase order and vendor come from the database. The amount can’t exceed the approved PO, and a
        payee that belongs to <em>another</em> vendor is rejected, the confused-deputy case a plain allowlist waves
        through.
      </Feature>

      <Feature
        icon={
          <svg {...iconProps}>
            <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" {...stroke} />
            <path d="M9 12l2 2 4-4" {...stroke} />
          </svg>
        }
        tag="OWNER IN THE LOOP"
        title="Holds become approvals, approvals become evidence"
        cta={
          <Link className="dark-btn small" href="/audit">
            Verify the audit log →
          </Link>
        }
        diagram={
          <svg viewBox="0 0 420 250" role="img" aria-label="A decision becomes an approval becomes a payment, with the owner approving only if the argument hash matches">
            <g fontFamily={MONO} fontSize="11">
              <rect x="20" y="40" width="104" height="54" rx="10" className="dn node" /><text x="34" y="64">#a91f</text><text x="34" y="82" fill="#8E826C">decision</text>
              <rect x="158" y="40" width="104" height="54" rx="10" className="dn node" /><text x="172" y="64">#77c2</text><text x="172" y="82" fill="#8E826C">approval</text>
              <rect x="296" y="40" width="104" height="54" rx="10" className="dn node" /><text x="310" y="64">#3e08</text><text x="310" y="82" fill="#8E826C">payment</text>
              <path d="M124 67H158M262 67H296" className="ln good" />
              <rect x="108" y="140" width="204" height="62" rx="31" className="dn good" />
              <text x="150" y="168">owner approves</text>
              <text x="150" y="186" fill="#E3EFD9">args hash must match</text>
              <path d="M210 140V94" className="ln good" strokeDasharray="4 5" />
            </g>
          </svg>
        }
      >
        An untrusted change turns into an owner approval that shows its lineage. The executor only pays the exact
        arguments that were decided, once, and every step lands in a hash-chained audit log you can verify.
      </Feature>
    </section>
  );
}
