import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getSetting, rentalRules } from "@/lib/settings";
import { BusinessForm } from "@/components/dashboard/settings/BusinessForm";
import { ConfigForm } from "@/components/dashboard/settings/ConfigForm";
import { CategoryEditor } from "@/components/dashboard/settings/CategoryEditor";
import { TemplateEditor } from "@/components/dashboard/settings/TemplateEditor";
import { ContentEditors } from "@/components/dashboard/settings/ContentEditors";
import { StaffEditor } from "@/components/dashboard/settings/StaffEditor";

export const metadata: Metadata = { title: "Settings", robots: { index: false, follow: false } };
export const revalidate = 0;

const TABS = [
  { id: "business", label: "Business info" },
  { id: "config", label: "Rental rules & workflow" },
  { id: "categories", label: "Vehicle categories" },
  { id: "templates", label: "Message templates" },
  { id: "content", label: "Website content" },
  { id: "staff", label: "Staff & roles" },
];

export default function SettingsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const user = getCurrentUser();
  if (!user) redirect("/dashboard/login");
  const isAdmin = user.role === "admin";
  const db = getDb();

  const active = TABS.some((t) => t.id === searchParams.tab) ? searchParams.tab! : "business";
  const business = getSetting<Record<string, unknown>>("business", {});
  const taxPct = Number(getSetting("tax_pct", 5));
  const enquiryStages = getSetting<string[]>("enquiry_stages", []);
  const paymentStatuses = getSetting<string[]>("payment_statuses", []);
  const bookingStatuses = getSetting<string[]>("booking_statuses", []);
  const refundStatuses = getSetting<string[]>("refund_statuses", []);
  const leadSources = getSetting<string[]>("lead_sources", []);

  const categories = (db.prepare("SELECT * FROM vehicle_categories ORDER BY sort, name").all() as Array<Record<string, unknown>>).map((r) => ({ ...r })) as unknown as Array<{ id: number; name: string; kind: string; icon: string | null; image: string | null; short_desc: string | null; description: string | null; active: number; sort: number }>;
  const templates = (db.prepare("SELECT * FROM message_templates ORDER BY name").all() as Array<Record<string, unknown>>).map((r) => ({ ...r }));
  const testimonials = (db.prepare("SELECT * FROM testimonials ORDER BY sort, id").all() as Array<Record<string, unknown>>).map((r) => ({ ...r }));
  const faqs = (db.prepare("SELECT * FROM faqs ORDER BY sort, id").all() as Array<Record<string, unknown>>).map((r) => ({ ...r }));
  const posts = (db.prepare("SELECT * FROM blog_posts ORDER BY created_at DESC").all() as Array<Record<string, unknown>>).map((r) => ({ ...r }));
  const galleryItems = (db.prepare("SELECT * FROM gallery ORDER BY sort, id").all() as Array<Record<string, unknown>>).map((r) => ({ ...r }));
  const users = (db.prepare("SELECT * FROM users ORDER BY role, name").all() as Array<Record<string, unknown>>).map((r) => ({ ...r }));

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
        <ConfigForm isAdmin={isAdmin} initial={{ taxPct, enquiryStages, paymentStatuses, bookingStatuses, refundStatuses, leadSources, rentalRules: rentalRules() }} />
      )}
      {active === "categories" && <CategoryEditor items={categories} isAdmin={isAdmin} />}
      {active === "templates" && <TemplateEditor items={templates} isAdmin={isAdmin} />}
      {active === "content" && <ContentEditors testimonials={testimonials} faqs={faqs} posts={posts} gallery={galleryItems} isAdmin={isAdmin} />}
      {active === "staff" && <StaffEditor users={users} isAdmin={isAdmin} />}
    </div>
  );
}
