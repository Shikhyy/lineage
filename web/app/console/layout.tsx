import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { ConsoleApp } from "@/components/console/ConsoleApp";
import "./console.css";

export const metadata: Metadata = {
  title: "Console",
  description: "Mission control for one payment: run an attack, watch where every payment detail came from, and see what the guard decided.",
};

export const viewport: Viewport = { themeColor: "#130B07" };

/** The console is one persistent app: this layout holds the shell, and the route pages only choose the view. */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={<div className="cx cx-boot" aria-busy="true" />}>
        <ConsoleApp />
      </Suspense>
      {children}
    </>
  );
}
