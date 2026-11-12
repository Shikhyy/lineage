"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

const LINKS = [
  { href: "/demo", label: "Demo" },
  { href: "/approvals", label: "Approvals" },
  { href: "/audit", label: "Audit" },
  { href: "/bench", label: "Benchmark" },
];

export function AppNav({ owner }: { owner: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await api.logout().catch(() => undefined);
    setBusy(false);
    router.refresh();
  }

  return (
    <nav className="main-nav" aria-label="Main">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={pathname === l.href ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
      {owner ? (
        <button type="button" className="link" onClick={signOut} disabled={busy}>
          Sign out
        </button>
      ) : (
        <Link href="/approvals">Owner sign-in</Link>
      )}
    </nav>
  );
}
