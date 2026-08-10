"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui";
import { LogoutButton } from "@/components/dashboard/TopBar";

type NavItem = { href: string; label: string; icon: string };
type User = { id: number; name: string; email?: string; role: string };

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
              active ? "bg-brand-500 text-ink-950 font-semibold shadow-sm" : "text-ink-300 hover:bg-white/5 hover:text-white"
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

export function MobileNav({ items, user }: { items: NavItem[]; user?: User }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close burger drawer automatically on route navigation
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const activeItem = items.find((i) => isActive(pathname, i.href)) || items[0];
  const isAdmin = user?.role === "admin";

  return (
    <div className="lg:hidden">
      {/* Mobile Top Bar Header Controls: Hamburger Button + Current Section Name */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "Close mobile menu" : "Open mobile menu"}
          aria-expanded={isOpen}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-ink-200 bg-white text-ink-800 shadow-sm transition hover:bg-ink-50 active:scale-95 shrink-0"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {isOpen ? (
              <path d="M18 6L6 18M6 6l12 12" />
            ) : (
              <path d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>

        {/* Current Active Section Badge for Phones */}
        <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
          <img src="/logo.png" alt="Logo" className="h-6 w-6 object-contain shrink-0" />
          <div className="leading-tight truncate">
            <span className="block text-xs font-bold text-ink-900 truncate">{activeItem?.label || "CRM"}</span>
            <span className="block text-[8px] font-semibold text-brand-600 uppercase tracking-wider">Darshh Holiday</span>
          </div>
        </Link>
      </div>

      {/* OFF-CANVAS RESPONSIVE BURGER MENU DRAWER (Rendered via React Portal onto document.body to avoid stacking context traps) */}
      {isOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[99999]">
          {/* Semi-transparent Backdrop Overlay */}
          <div
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-[99998] bg-black/75 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            aria-hidden="true"
          />

          {/* Full-Height Slide-in Mobile Drawer Panel */}
          <aside className="fixed inset-y-0 left-0 z-[99999] flex h-[100dvh] w-[285px] max-w-[85vw] flex-col bg-ink-950 text-white shadow-2xl border-r border-white/10 animate-in slide-in-from-left duration-200">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4 shrink-0 bg-black/30">
              <Link href="/dashboard" onClick={() => setIsOpen(false)} className="flex items-center gap-2.5">
                <img src="/logo.png" alt="Logo" className="h-8 w-8 object-contain" />
                <div className="leading-tight">
                  <span className="block font-display text-sm font-semibold text-white">Darshh Holiday</span>
                  <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-amber-400">CRM Mobile</span>
                </div>
              </Link>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1.5 text-ink-400 hover:bg-white/10 hover:text-white"
                aria-label="Close menu"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Drawer Scrollable Navigation Links */}
            <nav className="flex-1 overflow-y-auto p-3 space-y-1" aria-label="Mobile CRM modules">
              {items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition",
                      active
                        ? "bg-brand-500 text-ink-950 font-bold shadow"
                        : "text-ink-300 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={active ? "text-ink-950" : "text-ink-400"}>
                      <path d={item.icon} />
                    </svg>
                    <span>{item.label}</span>
                    {active && (
                      <span className="ml-auto h-2 w-2 rounded-full bg-ink-950" />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Drawer User Footer */}
            {user && (
              <div className="border-t border-white/10 bg-black/60 p-3.5 shrink-0">
                <div className="flex items-center gap-3">
                  <Avatar name={user.name} size="sm" />
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate text-xs font-semibold text-white">{user.name}</p>
                    <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${isAdmin ? "bg-amber-500/20 text-amber-300" : "bg-blue-500/20 text-blue-300"}`}>
                      {isAdmin ? "Admin" : "Staff"}
                    </span>
                  </div>
                  <LogoutButton compact />
                </div>
              </div>
            )}
          </aside>
        </div>,
        document.body
      )}
    </div>
  );
}
