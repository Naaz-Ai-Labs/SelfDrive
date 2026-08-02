import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { StaffLogin } from "@/components/dashboard/StaffLogin";

export const metadata: Metadata = { title: "Staff Login", robots: { index: false, follow: false } };

export default function DashboardLoginPage() {
  const user = getCurrentUser();
  if (user) redirect("/dashboard");
  return (
    <div className="container-x flex max-w-md flex-col items-center py-16">
      <div className="card w-full p-8">
        <h1 className="font-display text-2xl font-semibold text-ink-900">Staff login</h1>
        <p className="mt-1 text-sm text-ink-500">Darshh Holiday — Admin CRM</p>
        <StaffLogin />
      </div>
    </div>
  );
}
