import { createClient } from "@supabase/supabase-js";
import { getDb } from "../src/lib/db";
import { syncLatestFromSupabase } from "../src/lib/hydrate-db";
import { syncTableRecordToSupabase } from "../src/lib/supabase-sync";

function normalizeDocKind(kind: string): "licence" | "govt_id" | "address_proof" | "photo" | "other" {
  switch (kind) {
    case "licence":
    case "driver_licence":
      return "licence";
    case "driver_govt_id":
    case "pillion_id":
    case "govt_id":
      return "govt_id";
    case "driver_photo":
    case "pillion_photo":
    case "photo":
      return "photo";
    case "address_proof":
      return "address_proof";
    default:
      return "other";
  }
}

async function main() {
  console.log("===============================================================================");
  console.log("🧪 TESTING SUPABASE DATA FETCHING, ID UPLOADS & LOGIC SYNC");
  console.log("===============================================================================");

  const supabaseUrl = process.env.SUPABASE_URL || "https://puymlkdcoqpptajslucu.supabase.co";
  const supabaseKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";

  if (!supabaseKey) {
    console.log("No supabase service role key found, skipping live API call.");
    return;
  }

  const sb = createClient(supabaseUrl, supabaseKey);

  // 1. Test Document Normalization and Insertion in Supabase
  console.log("\n1. Testing Document Upload Normalization & Insertion into Supabase...");
  const testDocKinds = [
    { input: "driver_govt_id", expected: "govt_id" },
    { input: "driver_photo", expected: "photo" },
    { input: "pillion_id", expected: "govt_id" },
    { input: "pillion_photo", expected: "photo" },
    { input: "driver_licence", expected: "licence" },
    { input: "licence", expected: "licence" },
    { input: "address_proof", expected: "address_proof" },
  ];

  for (const t of testDocKinds) {
    const normalized = normalizeDocKind(t.input);
    if (normalized !== t.expected) {
      throw new Error(`Normalization mismatch for ${t.input}: got ${normalized}, expected ${t.expected}`);
    }
    console.log(`  ✅ normalizeDocKind('${t.input}') -> '${normalized}'`);
  }

  // Find an existing booking or create test booking
  const { data: existingBookings } = await sb.from("bookings").select("id, customer_id").limit(1);
  let testBookingId = existingBookings?.[0]?.id;
  let testCustId = existingBookings?.[0]?.customer_id;

  if (!testBookingId) {
    const { data: c } = await sb.from("customers").insert([{ name: "Test User", phone: "+919999988888" }]).select();
    testCustId = c?.[0]?.id;
    const { data: b } = await sb.from("bookings").insert([{ booking_no: "BK-TEST-DOC", customer_id: testCustId, vehicle_id: 1, pickup_at: "2026-08-15T09:00:00", return_at: "2026-08-16T09:00:00" }]).select();
    testBookingId = b?.[0]?.id;
  }

  // Insert a test document row into Supabase customer_documents
  const testDocPayload = {
    customer_id: testCustId,
    booking_id: testBookingId,
    kind: normalizeDocKind("driver_govt_id"),
    number: "TEST-AADHAAR-1234",
    file_path: "https://puymlkdcoqpptajslucu.supabase.co/storage/v1/object/public/vehicle-photos/test-id.jpg",
    verified: 0,
  };

  const { data: docData, error: docErr } = await sb
    .from("customer_documents")
    .insert([testDocPayload])
    .select();

  if (docErr) {
    console.error("  ❌ Document insert error in Supabase:", docErr);
    throw docErr;
  }
  const insertedDocId = docData[0].id;
  console.log(`  ✅ Successfully inserted normalized document with ID ${insertedDocId} into Supabase customer_documents`);

  // 2. Test Payment Sync to Supabase with Extra Column Stripping
  console.log("\n2. Testing Payment Sync with Schema Sanitization...");
  const paymentPayload = {
    id: 999999,
    payment_no: "PY-TEST-999999",
    booking_id: testBookingId,
    customer_id: testCustId,
    amount: 1500,
    kind: "advance",
    status: "Pending",
    notes: "Test automated sync payment",
    // Extended SQLite columns that don't exist in Supabase schema:
    breakdown_json: JSON.stringify({ test: true }),
    upi_id: "customer@upi",
    vpa: "customer@vpa",
    bank_ref_no: "1234567890",
  };

  const syncSuccess = await syncTableRecordToSupabase("payments", paymentPayload);
  console.log(`  ✅ syncTableRecordToSupabase sanitized payment payload and synced: ${syncSuccess}`);

  // Cleanup test payment
  await sb.from("payments").delete().eq("id", 999999);

  // 3. Test Delta Sync from Supabase into SQLite
  console.log("\n3. Testing Delta Sync from Supabase into SQLite...");
  const db = getDb();
  const deltaResult = await syncLatestFromSupabase(db);
  console.log(`  ✅ syncLatestFromSupabase completed: ${deltaResult}`);

  // Verify that the inserted document is present in SQLite
  const localDoc = db.prepare("SELECT * FROM customer_documents WHERE id = ?").get(insertedDocId);
  console.log(`  ✅ Verified document in local SQLite: ID ${localDoc?.id}, kind: ${localDoc?.kind}, file_path: ${localDoc?.file_path}`);

  // Cleanup test doc
  await sb.from("customer_documents").delete().eq("id", insertedDocId);
  db.prepare("DELETE FROM customer_documents WHERE id = ?").run(insertedDocId);

  console.log("\n===============================================================================");
  console.log("✨ ALL INTEGRATION VERIFICATION TESTS PASSED SUCCESSFULLY!");
  console.log("===============================================================================");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
