import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, canAccessModule } from "@/lib/auth";
import { Avatar } from "@/components/ui";
import { SidebarNav, MobileNav } from "@/components/dashboard/NavLinks";
import { SearchBox, NotificationBell, LogoutButton } from "@/components/dashboard/TopBar";
import { CommandBar } from "@/components/dashboard/CommandBar";
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
  { href: "/dashboard/staff", label: "Staff Accounts", icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" },
  { href: "/dashboard/reports", label: "Reports & Analytics", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  { href: "/dashboard/settings", label: "Settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/dashboard/login");
  const { items: notifications, unread } = await getNotifications();

  const isAdmin = user.role === "admin";
  const navItems = NAV.filter((item) => canAccessModule(user.role, item.href));

  // Serialize to pure plain objects for React Server Components -> Client Components boundary
  const plainUser = {
    id: Number(user.id),
    name: String(user.name ?? ""),
    email: String(user.email ?? ""),
    role: String(user.role ?? "staff"),
  };

  const plainNotifications = notifications.map((n) => ({
    id: Number(n.id),
    title: String(n.title ?? ""),
    body: n.body ? String(n.body) : null,
    read: Number(n.read),
    enquiry_id: n.enquiry_id ? Number(n.enquiry_id) : null,
    booking_id: n.booking_id ? Number(n.booking_id) : null,
    created_at: String(n.created_at ?? ""),
  }));

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
          <SidebarNav items={navItems} />
        </div>
        <div className="flex items-center gap-3 border-t border-white/10 px-4 py-4">
          <Avatar name={user.name} size="sm" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-semibold text-white">{user.name}</p>
            <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${isAdmin ? "bg-amber-500/20 text-amber-300" : "bg-blue-500/20 text-blue-300"}`}>
              {isAdmin ? "Admin" : "Staff"}
            </span>
          </div>
          <LogoutButton compact />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-white/50 bg-white/70 px-4 py-3 backdrop-blur-xl sm:px-6">
          <MobileNav items={navItems} user={plainUser} />
          <div className="hidden flex-1 lg:flex items-center gap-3">
            <SearchBox />
            <CommandBar />
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell initialItems={plainNotifications} initialUnread={unread} />
            <LogoutButton />
          </div>
        </div>
        <div className="p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
