import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireGatewayKey } from "@/lib/gateway-auth";
import { sbInsert } from "@/lib/supabase-rest";
import { nextNumber, normalizePhone } from "@/lib/utils";
import { logActivity, notifyRoles } from "@/lib/activity";

const schema = z.object({
  name: z.string().min(2),
  phone: z.string().min(8),
  email: z.string().email().optional().or(z.literal("")),
  source: z.string().optional(),
  notes: z.string().min(5),
});

/** Public contact-form submissions land here with no auth — this is the anonymous-visitor
 * entry point into the CRM, notifying staff the same way a manually-logged enquiry would. */
export async function POST(req: NextRequest) {
  const denied = requireGatewayKey(req);
  if (denied) return denied;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please complete all required fields." }, { status: 400 });

  const phone = normalizePhone(parsed.data.phone);
  const enquiryNo = nextNumber("ENQ", null);
  const now = new Date().toISOString();

  const inserted = await sbInsert<{ id: number }>("enquiries", {
    enquiry_no: enquiryNo,
    name: parsed.data.name,
    phone,
    email: parsed.data.email || null,
    source: parsed.data.source ?? "Contact form",
    notes: parsed.data.notes,
    status: "submitted",
    submitted_at: now,
    created_at: now,
    updated_at: now,
  });
  // A dropped enquiry is a lost customer: never answer OK when the write failed.
  if (!inserted.ok) {
    return NextResponse.json({ error: "We could not record your enquiry. Please try again." }, { status: 502 });
  }

  const id = Number(inserted.data.id);
  await logActivity(null, "enquiry_created", "enquiry", id, { enquiry_no: enquiryNo, source: "website" });
  await notifyRoles(["admin", "manager"], `New enquiry — ${enquiryNo}`, parsed.data.name, id, null);

  return NextResponse.json({ ok: true, enquiryNo });
}
