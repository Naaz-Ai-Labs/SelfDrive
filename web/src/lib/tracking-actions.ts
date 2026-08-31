import { gatewayGet } from "./gateway";
import { createClient } from "@supabase/supabase-js";

export type TrackingData = {
  id: number;
  booking_no: string;
  status: string;
  notes?: string | null;
  pickup_at: string;
  return_at: string;
  pickup_branch: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  vehicle_name?: string | null;
  registration_no?: string | null;
  photo_url?: string | null;
  base_amount: number;
  gst_amount: number;
  deposit_amount: number;
  total_amount: number;
  paid_amount: number;
  documents: Array<{
    id: number;
    kind: string;
    number: string | null;
    verified: boolean;
  }>;
  total_docs: number;
  verified_docs: number;
  is_all_docs_verified: boolean;
  payments: Array<{
    payment_no: string;
    amount: number;
    kind: string;
    status: string;
    method: string;
    paid_at: string | null;
  }>;
  history: Array<{
    action: string;
    created_at: string;
  }>;
  invoice_no: string;
  created_at: string;
};

export async function getBookingTrackingData(bookingNo: string): Promise<TrackingData | null> {
  const cleanNo = bookingNo.trim();
  if (!cleanNo) return null;

  // 1. Primary: Query CRM Gateway
  try {
    const res = await gatewayGet<{ ok: boolean; data?: TrackingData; error?: string }>(
      `/api/gateway/v1/customer/track/${encodeURIComponent(cleanNo)}`
    );
    if (res && res.ok && res.data) {
      return res.data;
    }
  } catch (err) {
    console.warn("Gateway tracking lookup error, attempting Supabase fallback:", err);
  }

  // 2. Fallback: Query direct Supabase
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const sb = createClient(supabaseUrl, supabaseKey);
      // Never matched on the raw numeric id — this fallback is reachable by anyone
      // holding (or guessing) a booking reference, and the primary key is a small,
      // sequential integer. Matching it directly let /track/1, /track/2, ... walk
      // every booking's name/vehicle/dates/amounts (this query also selects the full
      // customer row, phone included). booking_no is long and non-sequential, so it
      // isn't practically enumerable the same way. Still tolerates a bare numeric
      // suffix typed without its "BK-" prefix, matched against booking_no itself, not id.
      const query = sb
        .from("bookings")
        .select("*, vehicles(*), customers(*)")
        .or(/^\d+$/.test(cleanNo) ? `booking_no.eq.${cleanNo},booking_no.eq.BK-${cleanNo}` : `booking_no.eq.${cleanNo}`);
      const { data: b } = await query.single();
      if (b) {
        const cust = b.customers || {};
        const veh = b.vehicles || {};

        // Fetch docs
        let docs: any[] = [];
        try {
          const { data: dList } = await sb.from("customer_documents").select("*").eq("booking_id", b.id);
          if (dList) docs = dList;
        } catch {}

        const verifiedCount = docs.filter((d) => Number(d.verified) === 1).length;
        // 0 is a legitimate "nothing paid yet" value — `b.paid_amount || b.total_amount`
        // treated it as falsy and fell through to the total, which displayed a booking
        // that had never been paid for as fully "Paid".
        const paidAmountNum = b.paid_amount != null ? Number(b.paid_amount) : 0;

        return {
          id: b.id,
          booking_no: b.booking_no || `BK-${b.id}`,
          status: b.status || "Pending",
          notes: b.notes || null,
          pickup_at: b.pickup_at,
          return_at: b.return_at,
          pickup_branch: "Darshh Holiday - Hassan & Sakleshpura Branch",
          customer_name: cust.name || b.name || "Customer",
          customer_phone: cust.phone || b.phone || "",
          vehicle_name: veh.name || "Vehicle",
          registration_no: veh.registration_no || "",
          photo_url: veh.primary_photo || "/vehicles/mahindra-thar.avif",
          base_amount: Number(b.base_amount || (b.total_amount - (b.gst_amount || 60))),
          gst_amount: Number(b.gst_amount || 60),
          deposit_amount: Number(b.deposit_amount || 1000),
          total_amount: Number(b.total_amount || 1000),
          paid_amount: paidAmountNum,
          documents: docs.map((d) => ({
            id: Number(d.id),
            kind: String(d.kind),
            number: d.number ? String(d.number) : null,
            verified: Number(d.verified) === 1,
          })),
          total_docs: docs.length,
          verified_docs: verifiedCount,
          is_all_docs_verified: docs.length > 0 && verifiedCount === docs.length,
          // Only fabricate a payment-history row when something was actually paid —
          // an unpaid booking must never show a "Paid" line in this fallback.
          payments:
            paidAmountNum > 0
              ? [
                  {
                    payment_no: `PY-${b.id}`,
                    amount: paidAmountNum,
                    kind: "full",
                    status: "Paid",
                    method: "Online",
                    paid_at: b.created_at,
                  },
                ]
              : [],
          history: [],
          invoice_no: `INV-${new Date().getFullYear()}-${String(b.id).padStart(5, "0")}`,
          created_at: b.created_at || new Date().toISOString(),
        };
      }
    } catch (err: any) {
      console.error("Supabase direct tracking error:", err?.message || err);
    }
  }

  return null;
}
