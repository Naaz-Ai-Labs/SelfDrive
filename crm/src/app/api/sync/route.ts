import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { syncLatestFromSupabase } from "@/lib/hydrate-db";
import { razorpayConfigured } from "@/lib/razorpay";

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const syncedSupabase = await syncLatestFromSupabase(db);

    let syncedRazorpayCount = 0;
    // Check if Razorpay credentials are set to fetch captured orders
    if (razorpayConfigured()) {
      try {
        const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        if (keyId && keySecret) {
          const authHeader = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
          const rzpRes = await fetch("https://api.razorpay.com/v1/payments?count=20", {
            headers: { Authorization: authHeader },
          });
          const rzpData = await rzpRes.json();
          if (rzpData && Array.isArray(rzpData.items)) {
            for (const item of rzpData.items) {
              if (item.status === "captured" && item.id) {
                const notes = item.notes || {};
                const bookingNo = notes["Booking No"] || notes["booking_no"];
                if (bookingNo) {
                  // Check if booking exists in SQLite
                  const bRow = db.prepare("SELECT id FROM bookings WHERE booking_no = ?").get(bookingNo) as { id: number } | undefined;
                  if (bRow) {
                    db.prepare(
                      "UPDATE payments SET status = 'Paid', razorpay_payment_id = ?, paid_at = datetime('now') WHERE booking_id = ?"
                    ).run(item.id, bRow.id);
                    db.prepare("UPDATE bookings SET status = 'Confirmed' WHERE id = ?").run(bRow.id);
                    syncedRazorpayCount++;
                  }
                }
              }
            }
          }
        }
      } catch {}
    }

    return NextResponse.json({
      ok: true,
      syncedSupabase,
      syncedRazorpayCount,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Sync error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
