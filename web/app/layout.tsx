import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});
const sans = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

const TITLE = "Lineage — pay only what you can trace home";
const DESC =
  "Lineage is a provenance-gated payment guard for AI agents. It traces every payee, address and amount to where it was born, and never lets untrusted text decide where money goes. Try to phish it.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3101"),
  title: { default: TITLE, template: "%s · Lineage" },
  description: DESC,
  applicationName: "Lineage",
  openGraph: { type: "website", siteName: "Lineage", title: TITLE, description: DESC },
  twitter: { card: "summary", title: TITLE, description: DESC },
};

export const viewport: Viewport = { themeColor: "#F2E5C8", colorScheme: "light" };

// Sets the motion flag before first paint so pre-reveal states never flash, and so
// reduced-motion visitors get the full static page with no hidden content.
const MOTION_FLAG = `try{if(!matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.classList.add("mo")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MOTION_FLAG }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
