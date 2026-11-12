import { HeroArt } from "./HeroArt";
import { Reveal } from "./Reveal";

const LEFT = `{"fragment":"frag_9c2e","kind":"email",
 "trust":"T0","source":"billing@acme-supp1ies.com",
 "sha256":"3f1a9be0…"}
decide(pay_vendor) →
  payee  attacker@sandbox.test
  vendor vendor-a@sandbox.test
  trace  only in T0 sources
  ⇒ ASK_OWNER UNTRUSTED_PAYEE_CHANGE
{"audit":{"seq":14,"prev":"a91f…",
 "hash":"77c2…"}}
C2 amount ≤ approved PO  ✓
C2 invoice vendor = PO vendor ✓
C3 payee grounded in T2  ✗`;

const RIGHT = `memory.recall("payout")
→ "Acme payout email: …"
  trust T0 (written from a stranger
  chat), parent frag_41d0
tool.lookup_vendor →
  vendor record T2 ✓
  injected text T0 ✗
nonce  reused?  no
deadline ttl    ≤ 300s ✓
asset  allowlisted ✓
guard 0.2 ms · outside the LLM`;

export function Hero() {
  return (
    <div className="hero">
      <pre className="code left" aria-hidden="true">{LEFT}</pre>
      <pre className="code right" aria-hidden="true">{RIGHT}</pre>

      <div className="hero-in">
        <Reveal as="p" className="chip">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M8 1l2 4.5 4.8.5-3.6 3.2 1 4.8L8 11.6 3.8 14l1-4.8L1.2 6l4.8-.5z" fill="currentColor" />
          </svg>{" "}
          Provenance-gated payments for AI agents
        </Reveal>
        <Reveal as="h1" delay={1}>
          Move beyond blind trust. Pay only what has <em>provenance.</em>
        </Reveal>
        <Reveal as="p" delay={2} className="lede">
          Lineage traces where every payee, address and amount came from, and holds anything that originated in an
          untrusted email, chat or memory. The rule runs <strong>outside the model</strong>, so even a jailbroken agent
          can’t pay an attacker.
        </Reveal>
        <Reveal delay={3} className="cta">
          <a className="dark-btn big" href="#lab">
            Try to phish it <span aria-hidden="true">▸</span>
          </a>
          <a className="ghost-btn" href="#benchmark">
            See the benchmark
          </a>
        </Reveal>
      </div>

      <HeroArt />
    </div>
  );
}
