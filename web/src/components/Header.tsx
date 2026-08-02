"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/vehicles", label: "All vehicles" },
  { href: "/vehicles?kind=car", label: "Cars" },
  { href: "/vehicles?kind=bike", label: "Bikes" },
  { href: "/gallery", label: "Gallery" },
  { href: "/insights", label: "Insights" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

// Pages whose content starts with a dark, full-bleed section — a transparent
// header can safely sit on top of these without losing contrast. Every other
// page (booking, gallery, plain articles) stays solid so nav text is never
// white-on-white.
const DARK_HERO_PAGES = ["/", "/vehicles", "/about", "/contact"];

export function Header({ info }: { info: Record<string, unknown> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const name = (info.name as string) ?? "Darshh Holiday";
  const canFloat = DARK_HERO_PAGES.includes(pathname);
  const transparent = canFloat && !scrolled && !open;

  useEffect(() => {
    if (open) setHidden(false);
  }, [open]);

  useEffect(() => {
    let lastY = window.scrollY;
    function onScroll() {
      const y = window.scrollY;
      setScrolled(y > 8);
      // Slide the header out of the way on a real downward scroll (past the
      // hero), and bring it back down the moment the user scrolls up again —
      // it stays pinned near the top rather than disappearing for good.
      if (!open) {
        if (y > lastY + 4 && y > 120) setHidden(true);
        else if (y < lastY - 4 || y < 120) setHidden(false);
      }
      lastY = y;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [open]);

  return (
    <header
      className={`sticky top-0 z-50 transition-[background-color,border-color,transform] duration-300 ${
        transparent ? "border-b-2 border-transparent bg-transparent" : "acrylic border-b-2 border-ink-950"
      } ${scrolled ? "shadow-[0_4px_0_rgba(15,15,19,0.1)]" : ""} ${hidden ? "-translate-y-full" : "translate-y-0"}`}
    >
      <div className={`container-x flex items-center justify-between gap-4 transition-[height] duration-200 ${scrolled ? "h-14" : "h-16"}`}>
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <span className="relative h-12 w-12 shrink-0 sm:h-14 sm:w-14">
            <Image src="/logo.png" alt={name} fill sizes="56px" className="object-contain" priority />
          </span>
          <span className={`font-display text-lg font-semibold leading-tight transition-colors ${transparent ? "text-white" : "text-ink-900"}`}>
            {name}
            <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-brand-500">
              {(info.tagline as string) ?? "Ride More. Explore More."}
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
          {NAV.map((item) => {
            const [base] = item.href.split("?");
            const active = base === "/" ? pathname === "/" : pathname === base;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`overflow-hidden rounded-full px-4 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  transparent
                    ? active
                      ? "bg-white/15 text-white focus-visible:outline-white"
                      : "text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-white"
                    : active
                      ? "bg-brand-600/10 text-brand-700 focus-visible:outline-bblue-500"
                      : "text-ink-700 hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-bblue-500"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link href="/customer/login" className={`text-sm font-medium transition ${transparent ? "text-white/80 hover:text-white" : "text-ink-600 hover:text-brand-700"}`}>
            My booking
          </Link>
          <Link href="/booking" className="btn-primary btn-shine">
            Book now
          </Link>
        </div>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={`flex h-10 w-10 items-center justify-center rounded-full transition lg:hidden ${transparent ? "text-white hover:bg-white/10" : "text-ink-800 hover:bg-ink-100"}`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h10" />}
          </svg>
        </button>
      </div>

      {open && (
        <nav className="dropdown-pop border-t border-ink-100 bg-white px-4 pb-6 pt-2 lg:hidden" aria-label="Mobile navigation">
          <div className="flex flex-col gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-3 text-base font-medium text-ink-800 transition hover:bg-ink-100"
              >
                {item.label}
              </Link>
            ))}
            <Link href="/customer/login" onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 text-base font-medium text-ink-800 transition hover:bg-ink-100">
              My booking
            </Link>
            <Link href="/booking" onClick={() => setOpen(false)} className="btn-primary mt-3 w-full">
              Book now
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
