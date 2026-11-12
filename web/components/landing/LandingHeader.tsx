"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Wordmark } from "./Wordmark";

const SECTIONS = [
  { id: "top", label: "Home" },
  { id: "how", label: "How it works" },
  { id: "lab", label: "Attack lab" },
  { id: "benchmark", label: "Benchmark" },
  { id: "rails", label: "Rails" },
];

export function LandingHeader() {
  const [active, setActive] = useState("top");

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    for (const s of SECTIONS) {
      const n = document.getElementById(s.id);
      if (n) io.observe(n);
    }
    return () => io.disconnect();
  }, []);

  return (
    <header className="nav">
      <Wordmark />
      <nav className="pills" aria-label="Sections">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className={active === s.id ? "on" : undefined} aria-current={active === s.id ? "true" : undefined}>
            {s.label}
          </a>
        ))}
      </nav>
      <Link className="dark-btn" href="/demo">
        Run the demo
      </Link>
    </header>
  );
}
