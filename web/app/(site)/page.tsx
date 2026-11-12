import { api } from "@/lib/api";
import { Evidence } from "@/components/landing/Evidence";
import { Follow } from "@/components/landing/Follow";
import { Hero } from "@/components/landing/Hero";
import { Lab } from "@/components/landing/Lab";
import { Rails } from "@/components/landing/Rails";
import { Rules } from "@/components/landing/Rules";
import { findRow } from "@/components/landing/bench";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const rows = await api.bench().catch(() => null);
  const none = findRow(rows, "none");
  const full = findRow(rows, "lineage");
  const stat = none && full ? { attacks: none.attacks, noneWins: none.wins, fullWins: full.wins } : null;
  return (
    <>
      <Hero stat={stat} />
      <Follow />
      <Rules />
      <Lab />
      <Evidence rows={rows} />
      <Rails />
    </>
  );
}
