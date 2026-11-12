import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="site-foot">
      <span>© Lineage · MIT</span>
      <span>
        <a href="https://github.com/Shikhyy/lineage">Source</a> · <Link href="/bench">Benchmark</Link> ·{" "}
        <Link href="/audit">Audit log</Link> · <Link href="/demo">Demo</Link>
      </span>
    </footer>
  );
}
