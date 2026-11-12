"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getLenis } from "@/lib/motion/lenis";
import { Mark } from "./Mark";
import { railLabel, useMe } from "./MeContext";

const LINKS = [
  { href: "#follow", label: "How it works" },
  { href: "#lab", label: "Attack lab" },
  { href: "#evidence", label: "Evidence" },
  { href: "/console", label: "Console" },
];

export function Nav() {
  const me = useMe();
  const rail = railLabel(me);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [solid, setSolid] = useState(false);
  const last = useRef(0);

  useEffect(() => {
    const on = () => {
      const y = window.scrollY;
      setSolid(y > 24);
      if (Math.abs(y - last.current) > 6) {
        setHidden(y > last.current && y > 280);
        last.current = y;
      }
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  useEffect(() => {
    const lenis = getLenis();
    if (open) lenis?.stop();
    else lenis?.start();
    document.body.style.overflow = open ? "hidden" : "";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
      getLenis()?.start();
    };
  }, [open]);

  return (
    <header className={`nav${solid ? " is-solid" : ""}${hidden && !open ? " is-hidden" : ""}${open ? " is-open" : ""}`}>
      <div className="nav-in">
        <Link href="/" className="wordmark" aria-label="Lineage, home" onClick={() => setOpen(false)}>
          <Mark />
          <span>Lineage</span>
        </Link>

        <nav className="nav-links" aria-label="Primary">
          {LINKS.map((l) =>
            l.href.startsWith("#") ? (
              <a key={l.href} href={l.href} className="mono-label nav-link">
                {l.label}
              </a>
            ) : (
              <Link key={l.href} href={l.href} className="mono-label nav-link">
                {l.label}
              </Link>
            ),
          )}
        </nav>

        <div className="nav-right">
          <span className="rail-chip mono-label" title={rail.long} data-live={rail.ok ? (rail.real ? "sandbox" : "sim") : "off"}>
            <i aria-hidden="true" />
            <span className="rail-full">sandbox / {rail.short}</span>
            <span className="rail-compact">{rail.compact}</span>
          </span>
          <button className="nav-burger" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((v) => !v)}>
            <span className="mono-label">{open ? "Close" : "Menu"}</span>
          </button>
        </div>
      </div>

      <div id="mobile-menu" className="nav-sheet" hidden={!open}>
        {LINKS.map((l, i) => {
          const inner = (
            <>
              <span className="mono-label">0{i + 1}</span>
              <span className="display">{l.label}</span>
            </>
          );
          return l.href.startsWith("#") ? (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {inner}
            </a>
          ) : (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {inner}
            </Link>
          );
        })}
        <p className="mono-label sheet-rail">{rail.short} · sandbox only</p>
      </div>
    </header>
  );
}
