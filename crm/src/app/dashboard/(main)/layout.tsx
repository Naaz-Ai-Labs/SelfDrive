import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Avatar } from "@/components/ui";
import { SidebarNav, MobileNav } from "@/components/dashboard/NavLinks";
import { SearchBox, NotificationBell } from "@/components/dashboard/TopBar";
import { getNotifications } from "@/lib/topbar-actions";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" },
  { href: "/dashboard/enquiries", label: "Enquiries", icon: "M9 12h6M9 8h6M9 16h4M4 21V5a2 2 0 012-2h12a2 2 0 012 2v16l-4-2-4 2-4-2-4 2z" },
  { href: "/dashboard/bookings", label: "Bookings", icon: "M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { href: "/dashboard/vehicles", label: "Vehicles", icon: "M5 17h14M5 17a2 2 0 104 0M5 17V9l2-4h10l2 4v8M15 17a2 2 0 104 0" },
  { href: "/dashboard/payments", label: "Payments", icon: "M3 10h18M7 15h2m4 0h4M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" },
  { href: "/dashboard/refunds", label: "Refunds", icon: "M3 10h11a5 5 0 010 10H9M3 10l4-4M3 10l4 4" },
  { href: "/dashboard/problem-tickets", label: "Problem tickets", icon: "M12 9v4m0 4h.01M10.29 3.86l-8.18 14.14A1.5 1.5 0 003.5 20h17a1.5 1.5 0 001.39-2l-8.18-14.14a1.5 1.5 0 00-2.62 0z" },
  { href: "/dashboard/customers", label: "Customers", icon: "M17 20h5v-2a3 3 0 00-5.36-1.86M9 20H4v-2a3 3 0 015.36-1.86M13 7a3 3 0 11-6 0 3 3 0 016 0zm4 3a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" },
  { href: "/dashboard/settings", label: "Settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = getCurrentUser();
  if (!user) redirect("/dashboard/login");
  const { items: notifications, unread } = await getNotifications();

  return (
    <div className="flex min-h-screen bg-ink-50">
      {/* Full-height dark frosted-glass sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col bg-ink-950/95 backdrop-blur-xl lg:flex">
        <Link href="/dashboard" className="flex items-center gap-2.5 px-5 py-5">
          <img src="/logo.png" alt="" className="h-12 w-12 shrink-0 object-contain" />
          <span className="leading-tight">
            <span className="block font-display text-base font-semibold text-white">Darshh Holiday</span>
            <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500">CRM</span>
          </span>
        </Link>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav items={NAV} />
        </div>
        <div className="flex items-center gap-3 border-t border-white/10 px-4 py-4">
          <Avatar name={user.name} size="sm" />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-white">{user.name}</p>
            <p className="text-xs capitalize text-ink-500">{user.role}</p>
          </div>
          <form action="/api/auth/logout" method="post" className="ml-auto">
            <button type="submit" aria-label="Log out" className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 transition hover:bg-white/5 hover:text-white">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-white/50 bg-white/70 px-4 py-3 backdrop-blur-xl sm:px-6">
          <MobileNav items={NAV} />
          <div className="hidden flex-1 lg:block">
            <SearchBox />
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell initialItems={notifications} initialUnread={unread} />
          </div>
        </div>
        <div className="p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
