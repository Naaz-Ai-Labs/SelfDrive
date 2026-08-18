import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAllSettings } from "@/lib/settings";
import { sbSelect } from "@/lib/supabase-rest";
import { BusinessForm } from "@/components/dashboard/settings/BusinessForm";
import { ConfigForm } from "@/components/dashboard/settings/ConfigForm";
import { CategoryEditor } from "@/components/dashboard/settings/CategoryEditor";
import { BranchBlockPanel } from "@/components/dashboard/settings/BranchBlockPanel";
import { TemplateEditor } from "@/components/dashboard/settings/TemplateEditor";
import { ContentEditors } from "@/components/dashboard/settings/ContentEditors";
import { StaffEditor } from "@/components/dashboard/settings/StaffEditor";

export const metadata: Metadata = { title: "Settings", robots: { index: false, follow: false } };
export const revalidate = 0;

const TABS = [
  { id: "business", label: "Business info" },
  { id: "config", label: "Rental rules & workflow" },
  { id: "categories", label: "Vehicle categories" },
  { id: "branches", label: "Branches" },
  { id: "templates", label: "Message templates" },
  { id: "content", label: "Website content" },
  { id: "staff", label: "Staff & roles" },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/dashboard/login");
  if (user.role !== "admin") redirect("/dashboard");
  const isAdmin = true;

  const sp = await searchParams;
  const active = TABS.some((t) => t.id === sp.tab) ? sp.tab! : "business";

  const [settings, categoriesRes, branchesRes, branchVehiclesRes, templatesRes, testimonialsRes, faqsRes, postsRes, galleryRes, usersRes, historyRes] =
    await Promise.all([
      getAllSettings(),
      sbSelect<Record<string, unknown>>("vehicle_categories", "select=*&order=sort.asc,name.asc"),
      sbSelect<Record<string, unknown>>("branches", "select=id,name,city,blocked&order=name.asc"),
      // Only ids are needed; the count is tallied in memory rather than issuing one
      // query per branch.
      sbSelect<{ branch_id: number | null }>("vehicles", "select=branch_id&active=eq.1"),
      sbSelect<Record<string, unknown>>("message_templates", "select=*&order=name.asc"),
      sbSelect<Record<string, unknown>>("testimonials", "select=*&order=sort.asc,id.asc"),
      sbSelect<Record<string, unknown>>("faqs", "select=*&order=sort.asc,id.asc"),
      sbSelect<Record<string, unknown>>("blog_posts", "select=*&order=created_at.desc"),
      sbSelect<Record<string, unknown>>("gallery", "select=*&order=sort.asc,id.asc"),
      sbSelect<Record<string, unknown>>("users", "select=*&order=is_active.desc,role.asc,name.asc"),
      sbSelect<Record<string, unknown>>("staff_history", "select=*&order=created_at.desc&limit=50"),
    ]);

  for (const [label, res] of [
    ["vehicle categories", categoriesRes],
    ["message templates", templatesRes],
    ["testimonials", testimonialsRes],
    ["FAQs", faqsRes],
    ["blog posts", postsRes],
    ["gallery", galleryRes],
    ["staff accounts", usersRes],
    ["staff history", historyRes],
  ] as const) {
    if (!res.ok) throw new Error(`Could not load ${label}: ${res.error}`);
  }

  const business = (settings.business ?? {}) as Record<string, unknown>;
  const taxPct = Number(settings.tax_pct ?? 5);
  const enquiryStages = (settings.enquiry_stages ?? []) as string[];
  const paymentStatuses = (settings.payment_statuses ?? []) as string[];
  const bookingStatuses = (settings.booking_statuses ?? []) as string[];
  const refundStatuses = (settings.refund_statuses ?? []) as string[];
  const leadSources = (settings.lead_sources ?? []) as string[];
  const rules = (settings.rental_rules ?? {}) as Record<string, unknown>;

  const categories = (categoriesRes.ok ? categoriesRes.data : []) as unknown as Array<{ id: number; name: string; kind: string; icon: string | null; image: string | null; short_desc: string | null; description: string | null; active: number; sort: number }>;

  const vehiclesPerBranch = new Map<number, number>();
  if (branchVehiclesRes.ok) {
    for (const v of branchVehiclesRes.data) {
      const bid = Number(v.branch_id);
      if (Number.isFinite(bid)) vehiclesPerBranch.set(bid, (vehiclesPerBranch.get(bid) ?? 0) + 1);
    }
  }
  const branches = (branchesRes.ok ? branchesRes.data : []).map((b) => ({
    id: Number(b.id),
    name: String(b.name),
    city: b.city ? String(b.city) : null,
    blocked: Number(b.blocked ?? 0),
    vehicle_count: vehiclesPerBranch.get(Number(b.id)) ?? 0,
  }));
  const templates = templatesRes.ok ? templatesRes.data : [];
  const testimonials = testimonialsRes.ok ? testimonialsRes.data : [];
  const faqs = faqsRes.ok ? faqsRes.data : [];
  const posts = postsRes.ok ? postsRes.data : [];
  const galleryItems = galleryRes.ok ? galleryRes.data : [];
  const users = usersRes.ok ? usersRes.data : [];

  // staff_history has two foreign keys into users, so PostgREST cannot infer the
  // embed. Resolve the two name columns from the users list already loaded.
  const usersById = new Map(users.map((u) => [Number(u.id), u]));
  const staffHistory = (historyRes.ok ? historyRes.data : []).map((h): Record<string, unknown> => {
    const staff = usersById.get(Number(h.staff_id));
    const admin = usersById.get(Number(h.performed_by));
    return { ...h, staff_name: staff?.name ?? null, staff_email: staff?.email ?? null, admin_name: admin?.name ?? null };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-900">Settings</h1>
        <p className="mt-1 text-sm text-ink-500">
          {isAdmin ? "Manage everything without touching code." : "Read-only — admin access is required to make changes."}
        </p>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-ink-100 pb-px" aria-label="Settings tabs">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/dashboard/settings?tab=${t.id}`}
            className={`whitespace-nowrap rounded-t-xl px-4 py-2.5 text-sm font-medium transition ${
              active === t.id ? "border-b-2 border-brand-600 text-brand-700" : "text-ink-500 hover:text-ink-900"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {active === "business" && <BusinessForm initial={business} isAdmin={isAdmin} />}
      {active === "config" && (
        <ConfigForm isAdmin={isAdmin} initial={{ taxPct, enquiryStages, paymentStatuses, bookingStatuses, refundStatuses, leadSources, rentalRules: rules }} />
      )}
      {active === "categories" && <CategoryEditor items={categories} isAdmin={isAdmin} />}
      {active === "branches" && <BranchBlockPanel branches={branches} isAdmin={isAdmin} />}
      {active === "templates" && <TemplateEditor items={templates} isAdmin={isAdmin} />}
      {active === "content" && <ContentEditors testimonials={testimonials} faqs={faqs} posts={posts} gallery={galleryItems} isAdmin={isAdmin} />}
      {active === "staff" && <StaffEditor users={users} history={staffHistory} isAdmin={isAdmin} />}
    </div>
  );
}
