"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: string };

function isActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
}

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5 p-3" aria-label="CRM navigation">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
              active ? "bg-brand-500 text-ink-950" : "text-ink-300 hover:bg-white/5 hover:text-white"
            )}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={active ? "text-ink-950" : "text-ink-500 group-hover:text-white"} aria-hidden>
              <path d={item.icon} />
            </svg>
            {item.label}
            {active && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ml-auto" aria-hidden>
                <path d="M9 6l6 6-6 6" />
              </svg>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto text-sm lg:hidden" aria-label="CRM mobile navigation">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-1.5 font-medium transition",
              active ? "bg-brand-500/15 text-brand-800" : "text-ink-600 hover:bg-ink-100"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
