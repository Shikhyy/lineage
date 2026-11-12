import { Reveal } from "@/components/ui/Reveal";
import { SplitText } from "@/components/ui/SplitText";

const RULES = [
  {
    n: "1",
    title: "Label at the door.",
    body: "Every fragment that enters the agent's context, an email, a chat message, a memory entry, a tool's output, is filed with its source, a trust tier and a pointer to its parent before the model reads a word of it. Inbound text is T0 by default.",
    specimen: [
      ["fragment", "email"],
      ["source", "billing@acme-supp1ies.com"],
      ["tier", "T0 · untrusted"],
      ["parent", "none, born here"],
    ],
    note: "A signature, a letterhead or a 'trusted partner' banner is still just T0 text.",
  },
  {
    n: "2",
    title: "Trace at the gate.",
    body: "When the agent calls pay_vendor, the guard asks of every field, payee, address, amount: where was this value born? It follows the value back through chats, memory and tool output to its origins. If every origin is T0, the value may not decide where money goes.",
    specimen: [
      ["payee", "attacker@sandbox.test"],
      ["  ← chat reply", "T0"],
      ["    ← memory entry", "T0"],
      ["      ← inbound email", "T0  origin"],
      ["verdict", "ASK_OWNER"],
    ],
    note: "Tracing is exact-match: it follows identifiers, not paraphrases. The limits are listed under Evidence.",
  },
  {
    n: "3",
    title: "Bind to records.",
    body: "A trusted origin alone is not enough. The payee has to match the vendor master, the amount has to stay inside the approved purchase order, the invoice has to belong to that vendor. Values bind to records the owner already trusts, not to whoever wrote last.",
    specimen: [
      ["payee", "vendor-a@sandbox.test  =  v_acme"],
      ["amount", "$1,250.00  ≤  PO po_1"],
      ["invoice", "inv_1  ∈  v_acme"],
      ["verdict", "ALLOW"],
    ],
    note: "This is the layer that catches an inflated amount or a repeated invoice, where the payee looks clean.",
  },
];

const TIERS = [
  { t: "T3", name: "Owner", src: "The owner's own instructions and approvals, given in the console.", may: true },
  { t: "T2", name: "Trusted records", src: "The vendor master, purchase orders, invoice records.", may: true },
  { t: "T1", name: "Known sender", src: "An address seen before. Spoofable, so informational only.", may: false },
  { t: "T0", name: "Untrusted", src: "Inbound email, chat, agent memory, tool output.", may: false },
];

export function Rules() {
  return (
    <section className="rules" id="rules">
      <div className="sec-head">
        <p className="mono-label sec-no">§ 02 — The rules</p>
        <p className="mono-label sec-aside">Enforced outside the model</p>
      </div>

      <div className="rules-intro">
        <SplitText as="h2" className="display h2" text={"Three rules the model\nnever gets a *vote* on."} />
      </div>

      <div className="rules-list">
        {RULES.map((r) => (
          <article className="rule" key={r.n}>
            <div className="rule-n display" aria-hidden="true">
              {r.n}
            </div>
            <div className="rule-b">
              <Reveal as="h3" className="display rule-t">
                {r.title}
              </Reveal>
              <Reveal as="p" className="rule-p" delay={0.05}>
                {r.body}
              </Reveal>
              <Reveal className="specimen" delay={0.1}>
                <p className="mono-label specimen-h">Specimen</p>
                <dl>
                  {r.specimen.map(([k, v]) => (
                    <div key={k + v}>
                      <dt>{k}</dt>
                      <dd className={/T0|ASK_OWNER/.test(v) ? "bad" : /ALLOW/.test(v) ? "ok" : undefined}>{v}</dd>
                    </div>
                  ))}
                </dl>
              </Reveal>
            </div>
            <Reveal as="aside" className="rule-note" delay={0.15}>
              <span className="mono-label">Margin</span>
              <p>{r.note}</p>
            </Reveal>
          </article>
        ))}
      </div>

      <div className="ledger-wrap">
        <div className="ledger-head">
          <Reveal as="h3" className="display h3">
            Who may say <em>where the money goes.</em>
          </Reveal>
          <Reveal as="p" className="ledger-p" delay={0.08}>
            Trust is a property of the source, fixed before the model speaks. Only the top two tiers can set a payment field.
          </Reveal>
        </div>
        <Reveal className="ledger" delay={0.05}>
          <table>
            <caption className="sr-only">Trust tiers and whether each may set payment fields</caption>
            <thead>
              <tr className="mono-label">
                <th scope="col">Tier</th>
                <th scope="col">Name</th>
                <th scope="col">Where it comes from</th>
                <th scope="col" className="ledger-may">
                  May set payee, address, amount
                </th>
              </tr>
            </thead>
            <tbody>
              {TIERS.map((t) => (
                <tr key={t.t} data-tier={t.t}>
                  <th scope="row">
                    <span className="ledger-t display">{t.t}</span>
                  </th>
                  <td className="ledger-name">{t.name}</td>
                  <td className="ledger-src">{t.src}</td>
                  <td className="ledger-may">
                    <span className={`may ${t.may ? "yes" : "no"}`}>{t.may ? "Yes" : "No"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
      </div>

      <div className="custody">
        <Reveal className="custody-copy">
          <p className="mono-label">Chain of custody, kept</p>
          <h3 className="display h3">
            Every decision is <em>written down,</em> and linked to the last.
          </h3>
          <p>
            ALLOW, ASK_OWNER and BLOCK all land in an append-only audit log. Each record carries the hash of the record
            before it, so altering one breaks the chain at that exact record. ASK_OWNER holds the payment until the owner
            approves it in the console, and that approval is appended too.
          </p>
        </Reveal>
        <Reveal className="chain" delay={0.1} aria-hidden="true">
          {[
            ["Record n−1", "decision · ASK_OWNER"],
            ["Record n", "approval · owner"],
            ["Record n+1", "decision · ALLOW"],
            ["Record n+2", "payout · rail"],
          ].map(([a, b], i) => (
            <div className="link" key={a}>
              <div className="link-card">
                <span className="mono-label">{a}</span>
                <b>{b}</b>
                <span className="link-h mono">prev = hash(record {["n−2", "n−1", "n", "n+1"][i]})</span>
              </div>
              {i < 3 && <i className="link-join" />}
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
