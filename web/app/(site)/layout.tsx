import { api } from "@/lib/api";
import { Footer } from "@/components/landing/Footer";
import { MeProvider } from "@/components/landing/MeContext";
import { Nav } from "@/components/landing/Nav";
import { benchLine } from "@/components/landing/bench";
import { Cursor } from "@/components/ui/Cursor";
import { SmoothScroll } from "@/components/ui/SmoothScroll";
import "@/components/landing/landing.css";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [me, rows] = await Promise.all([api.me().catch(() => null), api.bench().catch(() => null)]);
  return (
    <MeProvider me={me}>
      <div className="site">
        <SmoothScroll />
        <Cursor />
        <div className="grain" aria-hidden="true" />
        <Nav />
        <main id="main">{children}</main>
        <Footer benchLine={benchLine(rows)} />
      </div>
    </MeProvider>
  );
}
