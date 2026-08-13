import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { sbSelect } from "@/lib/supabase-rest";
import { StaffEditor } from "@/components/dashboard/settings/StaffEditor";

export const metadata: Metadata = { title: "Staff Accounts Management", robots: { index: false, follow: false } };
export const revalidate = 0;

export default async function StaffManagementPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/dashboard/login");
  if (user.role !== "admin") redirect("/dashboard");

  const [usersRes, historyRes] = await Promise.all([
    sbSelect<Record<string, unknown>>("users", "select=*&order=created_at.desc"),
    sbSelect<Record<string, unknown>>("staff_history", "select=*&order=created_at.desc&limit=50"),
  ]);
  if (!usersRes.ok) throw new Error(`Could not load staff accounts: ${usersRes.error}`);
  if (!historyRes.ok) throw new Error(`Could not load staff history: ${historyRes.error}`);

  const users = usersRes.data;
  // staff_history references users twice (staff_id, performed_by), which PostgREST
  // cannot disambiguate — both names come from the roster above.
  const usersById = new Map(users.map((u) => [Number(u.id), u]));
  const history = historyRes.data.map((h): Record<string, unknown> => {
    const staffUser = usersById.get(Number(h.staff_id));
    const admin = usersById.get(Number(h.performed_by));
    return { ...h, staff_name: staffUser?.name ?? null, staff_email: staffUser?.email ?? null, admin_name: admin?.name ?? null };
  });

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
