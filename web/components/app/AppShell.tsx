import Link from "next/link";
import type { ReactNode } from "react";
import type { Me } from "@/lib/types";
import { AppNav } from "./AppNav";

export function AppShell({ me, children }: { me: Me | null; children: ReactNode }) {
  return (
    <div className="app">
      <header className="top">
        <Link className="brand" href="/">
          Lineage
        </Link>
        <AppNav owner={me?.owner ?? false} />
      </header>
      {me?.simulated && (
        <div className="banner" role="status">
          Payment rail: SIMULATED. No PayPal sandbox credentials are configured, so no money moves, not even sandbox
          money.
        </div>
      )}
      <main className="page">{children}</main>
      <footer className="foot">
        PayPal sandbox only · no real money · <a href="https://github.com/Shikhyy/lineage">source</a>
      </footer>
    </div>
  );
}
