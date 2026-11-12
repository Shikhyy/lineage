import Link from "next/link";
import { Mark } from "@/components/landing/Mark";
import "@/components/landing/landing.css";

export const metadata = { title: "Not on file" };

export default function NotFound() {
  return (
    <div className="nf site">
      <div className="grain" aria-hidden="true" />
      <header className="nf-top">
        <Link href="/" className="wordmark">
          <Mark />
          <span>Lineage</span>
        </Link>
        <span className="mono-label">Error 404 · record not found</span>
      </header>
      <div className="nf-body">
        <p className="mono-label">The thread ends here</p>
        <h1 className="display nf-h">
          This page has no <em>provenance.</em>
        </h1>
        <p className="nf-p">
          We followed the link back as far as it goes and found no origin: no page, no record, nothing to trace. Nothing was
          paid, nothing was held.
        </p>
        <div className="nf-cta">
          <Link href="/" className="btn">
            <span>Back to the start</span>
            <span className="btn-arrow" aria-hidden="true">→</span>
          </Link>
          <Link href="/console" className="btn btn--line">
            <span>Open the console</span>
            <span className="btn-arrow" aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
      <svg className="nf-thread" viewBox="0 0 400 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <path d="M200 0 C200 180 120 220 160 330 C190 410 300 400 262 500" fill="none" stroke="var(--signal)" strokeWidth="2" />
        <path d="M262 500 l-10 18 M262 500 l4 22 M262 500 l16 14 M262 500 l24 6" stroke="var(--signal)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}
