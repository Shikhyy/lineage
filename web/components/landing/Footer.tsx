import Link from "next/link";
import { Reveal } from "@/components/ui/Reveal";

export function Footer({ benchLine }: { benchLine: string | null }) {
  return (
    <footer className="foot" id="end">
      <div className="foot-top">
        <Reveal className="foot-lead">
          <p className="mono-label">End of the chain</p>
          <p className="foot-q display">
            Every payment, <em>traced home</em> before it leaves.
          </p>
        </Reveal>
        <nav className="foot-cols" aria-label="Footer">
          <div>
            <p className="mono-label foot-h">Product</p>
            <Link className="link-u" href="/console">Console</Link>
            <Link className="link-u" href="/honeypot">Honeypot</Link>
            <Link className="link-u" href="/console?panel=benchmark">Benchmark</Link>
            <Link className="link-u" href="/console?panel=audit">Audit log</Link>
            <Link className="link-u" href="/console?panel=approvals">Approvals</Link>
          </div>
          <div>
            <p className="mono-label foot-h">Page</p>
            <a className="link-u" href="#follow">How it works</a>
            <a className="link-u" href="#lab">Attack lab</a>
            <a className="link-u" href="#evidence">Evidence</a>
            <a className="link-u" href="#rails">Rails</a>
          </div>
          <div>
            <p className="mono-label foot-h">Source</p>
            <a className="link-u" href="https://github.com/Shikhyy/lineage" target="_blank" rel="noreferrer">GitHub</a>
            <span>MIT license</span>
            <span>Sandbox only</span>
          </div>
        </nav>
      </div>

      <div className="foot-word" aria-hidden="true">
        <span className="display">Lineage</span>
      </div>

      <div className="foot-base mono-label">
        <span>{benchLine ?? "Benchmark unavailable"}</span>
        <span>Sandbox only. Nothing here moves real money.</span>
        <a href="#top" className="link-u">Back to top ↑</a>
      </div>
    </footer>
  );
}
