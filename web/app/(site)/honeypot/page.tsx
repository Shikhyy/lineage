import type { Metadata } from "next";
import { Honeypot } from "@/components/honeypot/Honeypot";

export const metadata: Metadata = {
  title: "Honeypot · Lineage",
  description: "Try to make a simulated compromised agent sign the wrong NEAR intent. Every attempt is public.",
};

export default function HoneypotPage() {
  return <Honeypot />;
}
