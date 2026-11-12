import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Lineage · The payment agent that can't be phished", template: "%s · Lineage" },
  description:
    "Lineage traces where every payment detail came from and holds values from untrusted sources before money moves. Try to phish it.",
};

export const viewport: Viewport = { themeColor: "#F2E5C8" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
