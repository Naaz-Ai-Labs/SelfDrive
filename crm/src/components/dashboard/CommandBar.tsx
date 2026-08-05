"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type SearchItem = {
  id: string;
  title: string;
  category: string;
  href: string;
  icon: string;
};

const DEFAULT_ITEMS: SearchItem[] = [
  { id: "1", title: "Main Dashboard Overview", category: "Navigation", href: "/dashboard", icon: "📊" },
  { id: "2", title: "Bookings Management & Verification", category: "Navigation", href: "/dashboard/bookings", icon: "📋" },
  { id: "3", title: "Fleet & Vehicle Inventory", category: "Navigation", href: "/dashboard/vehicles", icon: "🛵" },
  { id: "4", title: "Customer Database & Identity Docs", category: "Navigation", href: "/dashboard/customers", icon: "👥" },
  { id: "5", title: "Payments & Financial Transactions", category: "Navigation", href: "/dashboard/payments", icon: "💰" },
  { id: "6", title: "Problem Tickets & Customer Support", category: "Navigation", href: "/dashboard/problem-tickets", icon: "🎫" },
  { id: "7", title: "Refund Requests & Adjustments", category: "Navigation", href: "/dashboard/refunds", icon: "💳" },
  { id: "8", title: "Staff Accounts & Supabase Sync", category: "Admin", href: "/dashboard/staff", icon: "🔑" },
  { id: "9", title: "Business Reports & Executive Analytics", category: "Admin", href: "/dashboard/reports", icon: "📈" },
  { id: "10", title: "System Settings & Rental Rules", category: "Admin", href: "/dashboard/settings", icon: "⚙️" },
];

export function CommandBar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Toggle Command Bar with Ctrl+K or Cmd+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const filteredItems = DEFAULT_ITEMS.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.category.toLowerCase().includes(query.toLowerCase())
  );

  function navigateTo(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <>
      {/* Floating Trigger Chip */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-2 rounded-xl border border-ink-200 bg-ink-100/60 px-3 py-1.5 text-xs text-ink-600 hover:border-brand-500 transition shadow-xs"
      >
        <span>🔍 Search or jump to...</span>
        <kbd className="rounded border border-ink-300 bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink-700">
          Ctrl K
        </kbd>
      </button>

      {/* Modal Backdrop */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-950/60 p-4 pt-20 backdrop-blur-sm animate-fadeIn">
          <div className="card w-full max-w-xl overflow-hidden shadow-2xl border-2 border-brand-400">
            {/* Input Header */}
            <div className="flex items-center border-b border-ink-100 px-4 py-3 bg-white">
              <span className="text-xl mr-3">⚡</span>
              <input
                autoFocus
                type="text"
                placeholder="Type a command, customer, or module name... (Esc to close)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-transparent text-sm font-medium text-ink-900 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-ink-400 hover:text-ink-700"
              >
                Esc ✕
              </button>
            </div>

            {/* Command List */}
            <div className="max-h-80 overflow-y-auto p-2 divide-y divide-ink-50 bg-white">
              {filteredItems.length === 0 ? (
                <p className="py-6 text-center text-xs text-ink-400">No matching command found.</p>
              ) : (
                filteredItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateTo(item.href)}
                    className="w-full flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-brand-50 text-left transition group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{item.icon}</span>
                      <div>
                        <p className="text-xs font-bold text-ink-900 group-hover:text-brand-900">
                          {item.title}
                        </p>
                        <p className="text-[10px] text-ink-500">{item.href}</p>
                      </div>
                    </div>
                    <span className="badge bg-ink-100 text-ink-700 group-hover:bg-brand-200 group-hover:text-brand-900 text-[10px]">
                      {item.category}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
