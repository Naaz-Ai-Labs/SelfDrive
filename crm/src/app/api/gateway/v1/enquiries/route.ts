import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireGatewayKey } from "@/lib/gateway-auth";
import { getDb } from "@/lib/db";
import { nextNumber, normalizePhone } from "@/lib/utils";
import { logActivity, pushNotification } from "@/lib/activity";

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

  const db = getDb();
  const phone = normalizePhone(parsed.data.phone);
  const enquiryNo = nextNumber("ENQ", null);
  const id = db
    .prepare(
      `INSERT INTO enquiries (enquiry_no, name, phone, email, source, notes, status, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, 'submitted', datetime('now'))`
    )
    .run(enquiryNo, parsed.data.name, phone, parsed.data.email || null, parsed.data.source ?? "Contact form", parsed.data.notes)
    .lastInsertRowid as number;
  logActivity(null, "enquiry_created", "enquiry", id, { enquiry_no: enquiryNo, source: "website" });

  const staff = db.prepare("SELECT id FROM users WHERE role IN ('admin','manager') AND is_active = 1").all() as { id: number }[];
  for (const s of staff) pushNotification(s.id, `New enquiry — ${enquiryNo}`, parsed.data.name, id, null);

  return NextResponse.json({ ok: true, enquiryNo });
}
