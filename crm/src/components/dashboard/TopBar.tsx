"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { globalSearch, markAllNotificationsRead, markNotificationRead, type SearchResult } from "@/lib/topbar-actions";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<SearchResult["type"], string> = {
  booking: "M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  customer: "M17 20h5v-2a3 3 0 00-5.36-1.86M9 20H4v-2a3 3 0 015.36-1.86M13 7a3 3 0 11-6 0 3 3 0 016 0z",
  vehicle: "M5 17h14M5 17a2 2 0 104 0M5 17V9l2-4h10l2 4v8M15 17a2 2 0 104 0",
  enquiry: "M9 12h6M9 8h6M9 16h4M4 21V5a2 2 0 012-2h12a2 2 0 012 2v16l-4-2-4 2-4-2-4 2z",
};

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function SearchBox() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await globalSearch(query);
      setResults(r);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        boxRef.current?.querySelector("input")?.focus();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div ref={boxRef} className="relative w-full max-w-sm">
      <div className="flex items-center gap-2 rounded-lg border border-white/60 bg-white/50 px-3 py-2 backdrop-blur-md">
        <Icon d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" className="text-ink-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search bookings, customers, vehicles..."
          className="w-full bg-transparent text-sm text-ink-800 outline-none placeholder:text-ink-400"
        />
      </div>
      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-96 overflow-y-auto rounded-xl border border-white/60 bg-white/80 dropdown-pop shadow-lg backdrop-blur-xl">
          {loading && <p className="px-4 py-3 text-sm text-ink-400">Searching…</p>}
          {!loading && results.length === 0 && <p className="px-4 py-3 text-sm text-ink-400">No matches for "{query}"</p>}
          {!loading &&
            results.map((r) => (
              <button
                key={`${r.type}-${r.id}`}
                onClick={() => {
                  setOpen(false);
                  setQuery("");
                  router.push(r.href);
                }}
                className="flex w-full items-center gap-3 border-b border-ink-50 px-4 py-2.5 text-left last:border-0 hover:bg-ink-50"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-700">
                  <Icon d={TYPE_ICON[r.type]} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink-900">{r.label}</span>
                  <span className="block truncate text-xs text-ink-400">{r.sub}</span>
                </span>
                <span className="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-wider text-ink-300">{r.type}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

type NotificationItem = { id: number; title: string; body: string | null; read: number; enquiry_id: number | null; booking_id: number | null; created_at: string };

export function NotificationBell({ initialItems, initialUnread }: { initialItems: NotificationItem[]; initialUnread: number }) {
  const [items, setItems] = useState(initialItems);
  const [unread, setUnread] = useState(initialUnread);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    setItems(initialItems);
    setUnread(initialUnread);
  }, [initialItems, initialUnread]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function openItem(n: NotificationItem) {
    if (!n.read) {
      await markNotificationRead(n.id);
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, read: 1 } : i)));
      setUnread((u) => Math.max(0, u - 1));
    }
    setOpen(false);
    if (n.booking_id) router.push(`/dashboard/bookings/${n.booking_id}`);
    else if (n.enquiry_id) router.push(`/dashboard/enquiries/${n.enquiry_id}`);
  }

  async function markAll() {
    await markAllNotificationsRead();
    setItems((prev) => prev.map((i) => ({ ...i, read: 1 })));
    setUnread(0);
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-white/60 bg-white/50 text-ink-600 backdrop-blur-md hover:border-brand-300"
      >
        <Icon d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.66V5a2 2 0 10-4 0v.34A6 6 0 006 11v3.2a2 2 0 01-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-white/60 bg-white/80 dropdown-pop shadow-lg backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2.5">
            <p className="text-sm font-semibold text-ink-900">Notifications</p>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs font-medium text-brand-700 hover:underline">Mark all read</button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-400">No notifications yet.</p>}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => openItem(n)}
                className={cn("flex w-full flex-col gap-0.5 border-b border-ink-50 px-4 py-2.5 text-left last:border-0 hover:bg-ink-50", !n.read && "bg-brand-500/5")}
              >
                <span className="flex items-center gap-2">
                  {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />}
                  <span className={cn("truncate text-sm", n.read ? "font-medium text-ink-700" : "font-semibold text-ink-900")}>{n.title}</span>
                </span>
                {n.body && <span className="truncate pl-3.5 text-xs text-ink-400">{n.body}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
