import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";
import { Suspense } from "react";
import { ConsoleApp } from "@/components/console/ConsoleApp";
import "./console.css";

export const metadata: Metadata = {
  title: "Console",
  description: "Mission control for one payment: run an attack, watch where every payment detail came from, and see what the guard decided.",
};

// The console has its own type: a grotesk for the interface and a typewriter-ish mono for data and
// labels, with the brand serif kept for titles and the one headline outcome. The families are exposed as
// :root variables (not a wrapper class) because drawers render outside the console shell.
const ui = Schibsted_Grotesk({ subsets: ["latin"], display: "swap" });
const data = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });
const FACES = `:root{--cx-sans-face:${ui.style.fontFamily};--cx-mono-face:${data.style.fontFamily}}`;

export const viewport: Viewport = { themeColor: "#130B07" };

/** The console is one persistent app: this layout holds the shell, and the route pages only choose the view. */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{FACES}</style>
      <Suspense fallback={<div className="cx cx-boot" aria-busy="true" />}>
        <ConsoleApp />
      </Suspense>
      {children}
    </>
  );
}
