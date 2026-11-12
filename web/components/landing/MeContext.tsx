"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Me } from "@/lib/types";

const Ctx = createContext<Me | null>(null);

export function MeProvider({ me, children }: { me: Me | null; children: ReactNode }) {
  return <Ctx.Provider value={me}>{children}</Ctx.Provider>;
}

/** null means /api/me could not be read: the UI says so instead of guessing. */
export const useMe = () => useContext(Ctx);

export function railLabel(me: Me | null): { short: string; compact: string; long: string; real: boolean; ok: boolean } {
  if (!me) return { short: "api offline", compact: "api off", long: "The Lineage API could not be reached, so the rail is unknown.", real: false, ok: false };
  if (me.rail === "paypal")
    return {
      short: "rail: paypal sandbox", compact: "paypal sbx",
      long: "This deployment is wired to the PayPal sandbox. Approved payments pay out in the sandbox only: test money, never real money.",
      real: true,
      ok: true,
    };
  return {
    short: "rail: simulated", compact: "simulated",
    long: "This deployment runs a simulated rail. Nothing real moves, anywhere.",
    real: false,
    ok: true,
  };
}
