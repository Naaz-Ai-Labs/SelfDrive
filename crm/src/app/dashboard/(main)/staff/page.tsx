import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { StaffEditor } from "@/components/dashboard/settings/StaffEditor";

export const metadata: Metadata = { title: "Staff Accounts Management", robots: { index: false, follow: false } };
export const revalidate = 0;

export default async function StaffManagementPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/dashboard/login");
  if (user.role !== "admin") redirect("/dashboard");

  const db = getDb();
  const users = (db.prepare("SELECT * FROM users ORDER BY created_at DESC").all() as Array<Record<string, unknown>>).map((r) => ({ ...r }));
  const history = (db.prepare("SELECT h.*, u.name AS staff_name, u.email AS staff_email, a.name AS admin_name FROM staff_history h LEFT JOIN users u ON u.id = h.staff_id LEFT JOIN users a ON a.id = h.performed_by ORDER BY h.created_at DESC LIMIT 50").all() as Array<Record<string, unknown>>).map((r) => ({ ...r }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-900">Staff Accounts & Roster</h1>
        <p className="text-sm text-ink-500">Staff credentials creation, access management, and activity audit logs</p>
      </div>

      <StaffEditor users={users} history={history} isAdmin={true} />
    </div>
  );
}
