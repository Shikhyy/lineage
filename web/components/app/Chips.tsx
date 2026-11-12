import { tier, tierLabel } from "@/lib/format";

export function VerdictChip({ value }: { value: string }) {
  return <span className={`chip v-${value.toLowerCase()}`}>{value}</span>;
}

export function TrustChip({ trust, withLabel }: { trust: number; withLabel?: boolean }) {
  const t = tier(trust);
  return (
    <span className={`chip t-${t}`}>
      {t}
      {withLabel ? ` ${tierLabel(t)}` : ""}
    </span>
  );
}
