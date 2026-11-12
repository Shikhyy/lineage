import { api } from "@/lib/api";
import { AttackLab } from "@/components/landing/AttackLab";
import { LandingFooter } from "@/components/landing/Footer";
import { Features } from "@/components/landing/Features";
import { Hero } from "@/components/landing/Hero";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { BenchmarkSection, FinalCta, Honest, Rails, Statement } from "@/components/landing/Sections";
import { Stats } from "@/components/landing/Stats";
import "./landing.css";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const [rows, me] = await Promise.all([api.bench().catch(() => null), api.me().catch(() => null)]);
  return (
    <div className="lp">
      <LandingHeader />
      <main id="top">
        <section className="hero-wrap">
          <Hero />
          <Stats rows={rows} />
        </section>
        <Statement />
        <Features />
        <AttackLab />
        <BenchmarkSection rows={rows} />
        <Rails />
        <Honest />
        <FinalCta simulated={me?.simulated ?? false} />
      </main>
      <LandingFooter />
    </div>
  );
}
