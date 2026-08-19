export type ServiceScope =
  | "bookings"
  | "enquiries"
  | "vehicles"
  | "allocations"
  | "payments"
  | "refunds"
  | "problem_tickets"
  | "customers"
  | "reports"
  | "settings"
  | "staff";

export const SERVICE_SCOPES: Array<{
  id: ServiceScope;
  label: string;
  description: string;
  path: string;
}> = [
  { id: "bookings", label: "Bookings & Check-ins", description: "View, create, manage customer bookings and PDF inspection reports", path: "/dashboard/bookings" },
  { id: "enquiries", label: "Enquiries & Leads", description: "Manage customer inquiries and sales pipeline stages", path: "/dashboard/enquiries" },
  { id: "vehicles", label: "Fleet & Vehicles", description: "Add, edit, catalog vehicles and manage fleet models", path: "/dashboard/vehicles" },
  { id: "allocations", label: "Branch Allocations", description: "Transfer and allocate physical vehicle units between branches", path: "/dashboard/allocations" },
  { id: "payments", label: "Payments & Invoices", description: "View transactions, tax invoices, and payment verifications", path: "/dashboard/payments" },
  { id: "refunds", label: "Refunds Processing", description: "Review and process customer security deposit refunds", path: "/dashboard/refunds" },
  { id: "problem_tickets", label: "Problem Tickets", description: "Record maintenance issues, damages, and support tickets", path: "/dashboard/problem-tickets" },
  { id: "customers", label: "Customer Records", description: "View customer KYC documents, phone numbers, and rental history", path: "/dashboard/customers" },
  { id: "reports", label: "Reports & Analytics", description: "Revenue analytics, fleet utilization, and financial exports", path: "/dashboard/reports" },
  { id: "settings", label: "System Settings", description: "Pricing rules, business hours, and operational policies", path: "/dashboard/settings" },
  { id: "staff", label: "Staff Management", description: "Create staff accounts and configure service scopes", path: "/dashboard/staff" },
];

export const DEFAULT_ROLE_SCOPES: Record<string, ServiceScope[]> = {
  admin: ["bookings", "enquiries", "vehicles", "allocations", "payments", "refunds", "problem_tickets", "customers", "reports", "settings", "staff"],
  manager: ["bookings", "enquiries", "vehicles", "allocations", "payments", "refunds", "problem_tickets", "customers", "reports"],
  finance: ["payments", "refunds", "reports"],
  staff: ["bookings", "enquiries", "vehicles", "allocations", "problem_tickets", "customers"],
};

export function pathToScope(path: string): ServiceScope | null {
  if (path.startsWith("/dashboard/bookings")) return "bookings";
  if (path.startsWith("/dashboard/enquiries")) return "enquiries";
  if (path.startsWith("/dashboard/vehicles")) return "vehicles";
  if (path.startsWith("/dashboard/allocations")) return "allocations";
  if (path.startsWith("/dashboard/payments")) return "payments";
  if (path.startsWith("/dashboard/refunds")) return "refunds";
  if (path.startsWith("/dashboard/problem-tickets")) return "problem_tickets";
  if (path.startsWith("/dashboard/customers")) return "customers";
  if (path.startsWith("/dashboard/reports")) return "reports";
  if (path.startsWith("/dashboard/settings")) return "settings";
  if (path.startsWith("/dashboard/staff")) return "staff";
  return null;
}

export function parsePermissions(raw: unknown, role: string): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {}
  }
  return DEFAULT_ROLE_SCOPES[role] ?? DEFAULT_ROLE_SCOPES.staff;
}
