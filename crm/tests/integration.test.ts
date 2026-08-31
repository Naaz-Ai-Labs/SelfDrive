/**
 * Integration tests — these hit a REAL Supabase project.
 *
 * They verify the invariants that only exist in the database, and that only fail
 * under concurrency: the advisory-locked reservation, the refund cap trigger, the
 * one-inspection-per-kind index, and the shared rate-limit counter.
 *
 * SAFETY
 *   Every row created here is prefixed `ZZTEST-` and removed in the cleanup step,
 *   including on failure. Nothing touches existing data. The throwaway vehicle is
 *   created inactive so it can never appear on the public site even mid-run.
 *
 * These double as a migration checker: if the RPCs or constraints below are
 * missing, the migrations have not been applied to this project yet.
 *
 * Run: npm run test:integration --prefix crm
 * Skips cleanly when SUPABASE_URL / SUPABASE_SECRET_KEY are absent.
 */

import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { verifyBookingPayment, createBookingPaymentOrder, recordFailedPaymentAttempt, releaseBookingReservation } from "../src/lib/payment-actions";
import { calculateQuote } from "../src/lib/pricing";
import { getVehicleById, getVehicles } from "../src/lib/data";
import { parseIstInstant } from "../src/lib/rental-clock";
import { num } from "../src/lib/supabase-rest";
import { createBooking } from "../src/lib/bookings";

const URL = (
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  ""
).replace(/\/$/, "");

const KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "";

const CONFIGURED = Boolean(URL && KEY);

const TAG = `ZZTEST-${Date.now()}`;

function headers(extra: Record<string, string> = {}) {
  return {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function rest(path: string, init: RequestInit = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: headers(init.headers as Record<string, string>),
    cache: "no-store",
  });

  const text = await res.text();

  let body: unknown = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return {
    ok: res.ok,
    status: res.status,
    body,
  };
}

async function rpc(
  fn: string,
  args: Record<string, unknown>
) {
  return rest(`rpc/${fn}`, {
    method: "POST",
    body: JSON.stringify(args),
  });
}

let vehicleId = 0;
let customerId = 0;

const createdBookingIds: number[] = [];

before(async () => {
  if (!CONFIGURED) return;

  // Inactive so it is invisible to the public site for the life of the test.
  const v = await rest("vehicles", {
    method: "POST",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      slug: `${TAG}-vehicle`.toLowerCase(),
      name: `${TAG} Vehicle`,
      brand: "TestBrand",
      model: "TestModel",
      total_units: 1,
      rate_24h: 100,
      deposit: 100,
      included_km: 100,
      extra_km_rate: 1,
      active: 0,
      status: "available",
    }),
  });

  assert.ok(
    v.ok,
    `could not create test vehicle: ${JSON.stringify(v.body)}`
  );

  vehicleId = Number(
    (v.body as Array<{ id: number }>)[0].id
  );

  const c = await rest("customers", {
    method: "POST",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      name: `${TAG} Customer`,
      phone: `+9199${String(Date.now()).slice(-8)}`,
    }),
  });

  assert.ok(
    c.ok,
    `could not create test customer: ${JSON.stringify(c.body)}`
  );

  customerId = Number(
    (c.body as Array<{ id: number }>)[0].id
  );
});

after(async () => {
  if (!CONFIGURED || !vehicleId) return;

  // Children first — FKs. Runs even when a test above failed.
  await rest(
    `inspections?booking_id=in.(${createdBookingIds.join(",") || 0})`,
    {
      method: "DELETE",
    }
  );

  await rest(
    `refunds?booking_id=in.(${createdBookingIds.join(",") || 0})`,
    {
      method: "DELETE",
    }
  );

  await rest(
    `availability_blocks?vehicle_id=eq.${vehicleId}`,
    {
      method: "DELETE",
    }
  );

  await rest(
    `bookings?vehicle_id=eq.${vehicleId}`,
    {
      method: "DELETE",
    }
  );

  await rest(
    `customers?id=eq.${customerId}`,
    {
      method: "DELETE",
    }
  );

  await rest(
    `vehicles?id=eq.${vehicleId}`,
    {
      method: "DELETE",
    }
  );

  await rest(
    `rate_limits?key=like.${encodeURIComponent(`${TAG}%`)}`,
    {
      method: "DELETE",
    }
  );

  // Backstop for the concurrency test suite below: createBooking() can create a
  // customer row and then throw (e.g. a genuinely failed reservation attempt) before
  // ever returning that id to the caller, so per-test cleanup keyed on the returned
  // customerId cannot always catch it. Every row those tests create is named/tagged
  // with this run's TAG, so a broad sweep on that pattern is a safe, exhaustive
  // backstop regardless of which individual test cleanup ran.
  const concVehicles = await rest(`vehicles?slug=like.${encodeURIComponent(`${TAG.toLowerCase()}-conc-%`)}&select=id`);
  const concVehicleIds = (concVehicles.ok ? (concVehicles.body as Array<{ id: number }>) : []).map((v) => v.id);
  if (concVehicleIds.length) {
    const inList = `(${concVehicleIds.join(",")})`;
    const concBookings = await rest(`bookings?vehicle_id=in.${inList}&select=id`);
    const concBookingIds = (concBookings.ok ? (concBookings.body as Array<{ id: number }>) : []).map((b) => b.id);
    if (concBookingIds.length) {
      await rest(`payments?booking_id=in.(${concBookingIds.join(",")})`, { method: "DELETE" });
      await rest(`booking_history?booking_id=in.(${concBookingIds.join(",")})`, { method: "DELETE" });
    }
    await rest(`availability_blocks?vehicle_id=in.${inList}`, { method: "DELETE" });
    await rest(`bookings?vehicle_id=in.${inList}`, { method: "DELETE" });
    await rest(`vehicle_units?vehicle_id=in.${inList}`, { method: "DELETE" });
    await rest(`vehicles?id=in.${inList}`, { method: "DELETE" });
  }
  await rest(`customers?name=like.${encodeURIComponent(`${TAG}%`)}`, { method: "DELETE" });
});

test(
  "Supabase is reachable and the schema is migrated",
  {
    skip:
      !CONFIGURED &&
      "SUPABASE_URL / SUPABASE_SECRET_KEY not set",
  },
  async () => {
    const probe = await rest(
      "vehicles?select=id&limit=1"
    );

    assert.ok(
      probe.ok,
      `Supabase unreachable: ${JSON.stringify(probe.body)}`
    );
  }
);

test(
  "cancelling a booking releases its vehicle",
  {
    skip: !CONFIGURED && "not configured",
  },
  async () => {
    const pickup = "2030-03-10T08:00";
    const ret = "2030-03-11T08:00";

    const claim = await rpc(
      "reserve_vehicle_slot",
      {
        p_vehicle_id: vehicleId,
        p_pickup_at: pickup,
        p_return_at: ret,
      }
    );

    const holdId = Number(claim.body);

    const bk = await rest("bookings", {
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        booking_no: `${TAG}-B1`,
        customer_id: customerId,
        vehicle_id: vehicleId,
        pickup_at: pickup,
        return_at: ret,
        status: "Pending verification",
        base_amount: 100,
        gst_amount: 6,
        deposit_amount: 100,
        total_amount: 206,
        paid_amount: 0,
      }),
    });

    assert.ok(
      bk.ok,
      `booking insert failed: ${JSON.stringify(bk.body)}`
    );

    const bookingId = Number(
      (bk.body as Array<{ id: number }>)[0].id
    );

    createdBookingIds.push(bookingId);

    await rest(
      `availability_blocks?id=eq.${holdId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          booking_id: bookingId,
          expires_at: null,
        }),
      }
    );

    // The trigger should drop the block.
    await rest(
      `bookings?id=eq.${bookingId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: "Cancelled",
        }),
      }
    );

    const blocks = await rest(
      `availability_blocks?select=id&booking_id=eq.${bookingId}`
    );

    assert.equal(
      (blocks.body as unknown[]).length,
      0,
      "a cancelled booking must not keep blocking its vehicle"
    );
  }
);

test(
  "a refund cannot exceed what was captured",
  {
    skip: !CONFIGURED && "not configured",
  },
  async () => {
    const bk = await rest("bookings", {
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        booking_no: `${TAG}-B2`,
        customer_id: customerId,
        vehicle_id: vehicleId,
        pickup_at: "2030-04-10T08:00",
        return_at: "2030-04-11T08:00",
        status: "Confirmed",
        base_amount: 100,
        gst_amount: 6,
        deposit_amount: 0,
        total_amount: 106,
        paid_amount: 100,
      }),
    });

    assert.ok(
      bk.ok,
      `booking for refund test should be created: ${JSON.stringify(
        bk.body
      )}`
    );

    const bookingId = Number(
      (bk.body as Array<{ id: number }>)[0].id
    );

    createdBookingIds.push(bookingId);

    // Refund of 60 against 100 captured — should succeed.
    const ok = await rest("refunds", {
      method: "POST",
      body: JSON.stringify({
        refund_no: `${TAG}-R1`,
        booking_id: bookingId,
        customer_id: customerId,
        requested_amount: 60,
        approved_amount: 60,
        status: "Approved",
        reason:
          "Integration test refund within captured amount",
      }),
    });

    assert.ok(
      ok.ok,
      `a refund within the captured amount should be allowed: ${JSON.stringify(
        ok.body
      )}`
    );

    // 60 + 60 = 120 against 100 captured.
    // The database trigger must reject this.
    const over = await rest("refunds", {
      method: "POST",
      body: JSON.stringify({
        refund_no: `${TAG}-R2`,
        booking_id: bookingId,
        customer_id: customerId,
        requested_amount: 60,
        approved_amount: 60,
        status: "Approved",
        reason:
          "Integration test refund exceeding captured amount",
      }),
    });

    assert.equal(
      over.ok,
      false,
      `total refunds exceeding the captured amount must be rejected: ${JSON.stringify(
        over.body
      )}`
    );
  }
);

test(
  "a booking cannot get two inspections of the same kind",
  {
    skip: !CONFIGURED && "not configured",
  },
  async () => {
    const bk = await rest("bookings", {
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        booking_no: `${TAG}-B3`,
        customer_id: customerId,
        vehicle_id: vehicleId,
        pickup_at: "2030-05-10T08:00",
        return_at: "2030-05-11T08:00",
        status: "Confirmed",
        base_amount: 100,
        gst_amount: 6,
        deposit_amount: 0,
        total_amount: 106,
        paid_amount: 0,
      }),
    });

    assert.ok(
      bk.ok,
      `booking insert failed: ${JSON.stringify(bk.body)}`
    );

    const bookingId = Number(
      (bk.body as Array<{ id: number }>)[0].id
    );

    createdBookingIds.push(bookingId);

    const first = await rest("inspections", {
      method: "POST",
      body: JSON.stringify({
        booking_id: bookingId,
        kind: "return",
        odometer: 100,
      }),
    });

    assert.ok(
      first.ok,
      `first return inspection should be allowed: ${JSON.stringify(
        first.body
      )}`
    );

    // A duplicate would re-run the late-fee and extra-km calculation
    // and increment the booking total a second time.
    const dup = await rest("inspections", {
      method: "POST",
      body: JSON.stringify({
        booking_id: bookingId,
        kind: "return",
        odometer: 200,
      }),
    });

    assert.equal(
      dup.ok,
      false,
      "a second inspection of the same kind must be rejected"
    );
  }
);

test(
  "the shared rate limiter allows up to the cap, then blocks",
  {
    skip: !CONFIGURED && "not configured",
  },
  async () => {
    const key = `${TAG}-rl`;

    const results: boolean[] = [];

    for (let i = 0; i < 4; i++) {
      const r = await rpc(
        "consume_rate_limit",
        {
          p_key: key,
          p_max_attempts: 3,
          p_window_seconds: 60,
          p_block_seconds: 0,
        }
      );

      assert.ok(
        r.ok,
        `consume_rate_limit missing — run the migrations. ${JSON.stringify(
          r.body
        )}`
      );

      results.push(r.body === true);
    }

    assert.deepEqual(
      results,
      [true, true, true, false],
      "should allow exactly 3 then deny"
    );
  }
);

test(
  "concurrent rate-limit calls cannot both consume the last slot",
  {
    skip: !CONFIGURED && "not configured",
  },
  async () => {
    const key = `${TAG}-rl-race`;

    await rpc(
      "consume_rate_limit",
      {
        p_key: key,
        p_max_attempts: 2,
        p_window_seconds: 60,
        p_block_seconds: 0,
      }
    );

    const [a, b] = await Promise.all([
      rpc("consume_rate_limit", {
        p_key: key,
        p_max_attempts: 2,
        p_window_seconds: 60,
        p_block_seconds: 0,
      }),
      rpc("consume_rate_limit", {
        p_key: key,
        p_max_attempts: 2,
        p_window_seconds: 60,
        p_block_seconds: 0,
      }),
    ]);

    const allowed = [a.body, b.body].filter(
      (x) => x === true
    );

    assert.equal(
      allowed.length,
      1,
      "exactly one of two concurrent callers may take the last slot"
    );
  }
);

test(
  "duplicate customer phone numbers are rejected",
  {
    skip: !CONFIGURED && "not configured",
  },
  async () => {
    const phone = `+9198${String(Date.now()).slice(-8)}`;

    const a = await rest("customers", {
      method: "POST",
      body: JSON.stringify({
        name: `${TAG} Dup A`,
        phone,
      }),
    });

    assert.ok(
      a.ok,
      `first customer should insert: ${JSON.stringify(a.body)}`
    );

    const b = await rest("customers", {
      method: "POST",
      body: JSON.stringify({
        name: `${TAG} Dup B`,
        phone,
      }),
    });

    assert.equal(
      b.ok,
      false,
      "the same phone must not create a second customer row"
    );

    await rest(
      `customers?phone=eq.${encodeURIComponent(phone)}`,
      {
        method: "DELETE",
      }
    );
  }
);

test(
  "vehicle soft-deletion removes vehicle immediately from active queries and availability",
  {
    skip: !CONFIGURED && "not configured",
  },
  async () => {
    const slug = `${TAG}-del-vehicle`.toLowerCase();
    const createRes = await rest("vehicles", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        slug,
        name: `${TAG} Delete Vehicle`,
        brand: "TestBrand",
        model: "DeleteModel",
        active: 1,
        status: "available",
        seats: 4,
        rate_24h: 1500,
        deposit: 2000,
        total_units: 1,
      }),
    });

    assert.ok(createRes.ok, `vehicle must be created: ${JSON.stringify(createRes.body)}`);
    const created = Array.isArray(createRes.body) ? (createRes.body[0] as { id: number }) : (createRes.body as { id: number });
    const testVehId = Number(created.id);

    try {
      // 1. Verify it is returned by active vehicles query
      const activeList = await rest(`vehicles?id=eq.${testVehId}&active=eq.1&status=neq.archived`);
      assert.ok(activeList.ok);
      const activeRows = Array.isArray(activeList.body) ? activeList.body : [];
      assert.equal(activeRows.length, 1, "created vehicle must appear in active query");

      // 2. Perform soft delete (mark active = 0, status = 'archived')
      const delRes = await rest(`vehicles?id=eq.${testVehId}`, {
        method: "PATCH",
        body: JSON.stringify({
          active: 0,
          status: "archived",
          updated_at: new Date().toISOString(),
        }),
      });
      assert.ok(delRes.ok, "soft delete mutation must succeed");

      // 3. Verify it is immediately excluded from active query
      const afterDelList = await rest(`vehicles?id=eq.${testVehId}&active=eq.1&status=neq.archived`);
      assert.ok(afterDelList.ok);
      const afterRows = Array.isArray(afterDelList.body) ? afterDelList.body : [];
      assert.equal(afterRows.length, 0, "deleted vehicle must NOT appear in active query");

      // 4. Verify reservation RPC rejects deleted vehicle
      const reserveRes = await rpc("reserve_vehicle_unit_slot", {
        p_vehicle_id: testVehId,
        p_pickup_at: new Date(Date.now() + 86400000).toISOString(),
        p_return_at: new Date(Date.now() + 172800000).toISOString(),
      });
      const reservedBlocks = Array.isArray(reserveRes.body) ? reserveRes.body : [];
      assert.equal(reservedBlocks.length, 0, "deleted vehicle cannot be reserved");
    } finally {
      // Clean up test vehicle
      await rest(`vehicles?id=eq.${testVehId}`, { method: "DELETE" });
    }
  }
);

test(
  "recovering a booking from an unlinked payment prices it the same way a normal booking is priced",
  {
    skip: !CONFIGURED && "not configured",
  },
  async () => {
    // Regression test for: a booking recovered via payment-actions.ts's auto-link
    // path (payment settles with no linked booking, matched back to a draft enquiry
    // by phone) used to insert only total_amount (= whatever was paid) and leave
    // base_amount/gst_amount/deposit_amount unset — the CRM Booking Review screen
    // then showed "Base Rental ₹0, GST ₹0, Total ₹2,014" for a genuinely paid
    // booking. The fix reconstructs the SAME quote calculateQuote()/createBooking()
    // use for the normal path — this test proves that end to end, through the real
    // verifyBookingPayment() function, not a reimplementation of the pricing math.
    //
    // Needs its own ACTIVE throwaway vehicle (the shared fixture above is
    // deliberately inactive) because reserve_vehicle_unit_slot/reserve_vehicle_slot
    // refuse to claim a slot on an inactive vehicle — matching the "vehicle
    // soft-deletion" test above, which needs the same for the same reason.
    const slug = `${TAG}-recovery-vehicle`.toLowerCase();
    const vRes = await rest("vehicles", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        slug,
        name: `${TAG} Recovery Vehicle`,
        brand: "TestBrand",
        model: "RecoveryModel",
        active: 1,
        status: "available",
        seats: 4,
        rate_24h: 900,
        weekend_rate_24h: 950,
        deposit: 1000,
        included_km: 100,
        extra_km_rate: 4,
        total_units: 1,
      }),
    });
    assert.ok(vRes.ok, `recovery test vehicle must be created: ${JSON.stringify(vRes.body)}`);
    const recVehicleId = Number((vRes.body as Array<{ id: number }>)[0].id);

    const phone = `+9197${String(Date.now()).slice(-8)}`;
    const custRes = await rest("customers", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ name: `${TAG} Recovery Customer`, phone }),
    });
    assert.ok(custRes.ok, `recovery test customer must be created: ${JSON.stringify(custRes.body)}`);
    const recCustomerId = Number((custRes.body as Array<{ id: number }>)[0].id);

    const pickupIso = "2031-03-10T08:00:00+05:30";
    const returnIso = "2031-03-11T08:00:00+05:30";

    let enqId = 0;
    let paymentId = 0;
    let recoveredBookingId: number | undefined;

    try {
      // A draft the customer abandoned mid-checkout (browser closed right after
      // paying) — exactly what the auto-link path matches against by phone.
      const enqRes = await rest("enquiries", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          enquiry_no: `${TAG}-DR1`,
          vehicle_id: recVehicleId,
          pickup_date: pickupIso,
          return_date: returnIso,
          location: "HASSAN",
          phone,
          name: `${TAG} Recovery Customer`,
          data: JSON.stringify({
            categoryId: null,
            vehicleId: recVehicleId,
            pickupAt: pickupIso,
            returnAt: returnIso,
            location: "HASSAN",
            passengers: null,
            step: 5,
            contact: { name: `${TAG} Recovery Customer`, phone },
          }),
          status: "draft",
          draft_token: `${TAG}-token`,
        }),
      });
      assert.ok(enqRes.ok, `draft enquiry must be created: ${JSON.stringify(enqRes.body)}`);
      enqId = Number((enqRes.body as Array<{ id: number }>)[0].id);

      // The payment DID capture — this is the "unlinked payment" the recovery path
      // exists to handle. razorpay_payment_id is fake, so fetchRazorpayPayment()
      // will fail against the real Razorpay API inside verifyBookingPayment(); that
      // only affects paid_amount (fed by a separate, unmodified step), never the
      // base/gst/deposit/total fields this test is about.
      const payRes = await rest("payments", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          payment_no: `${TAG}-PY1`,
          booking_id: null,
          customer_id: recCustomerId,
          amount: 2014,
          amount_paise: 201400,
          currency: "INR",
          kind: "full",
          status: "Paid",
          gateway_ref: `${TAG}-order`,
          razorpay_order_id: `${TAG}-order`,
          razorpay_payment_id: `${TAG}-payment`,
        }),
      });
      assert.ok(payRes.ok, `unlinked payment must be created: ${JSON.stringify(payRes.body)}`);
      paymentId = Number((payRes.body as Array<{ id: number }>)[0].id);

      // Independently computed — the exact function the recovery path now calls —
      // so this test fails if the two ever diverge, instead of hardcoding numbers
      // that would silently go stale if a pricing rule changes.
      const vehicle = await getVehicleById(recVehicleId, false);
      assert.ok(vehicle, "test vehicle must be readable via getVehicleById");
      const pickup = parseIstInstant(pickupIso);
      const ret = parseIstInstant(returnIso);
      assert.ok(pickup && ret);
      const expectedQuote = await calculateQuote(vehicle!, pickup!, ret!);
      assert.ok(expectedQuote.baseAmount > 0, "sanity check on the test fixture itself");

      const result = await verifyBookingPayment({
        paymentId,
        razorpayOrderId: `${TAG}-order`,
        razorpayPaymentId: `${TAG}-payment`,
        razorpaySignature: "test-signature",
        skipSignatureCheck: true,
      });

      assert.ok(result.ok, `recovery should succeed: ${JSON.stringify(result)}`);
      assert.ok((result as { bookingId?: number }).bookingId, "recovery must produce a real booking id");
      recoveredBookingId = (result as { bookingId?: number }).bookingId;

      const bookingRes = await rest(
        `bookings?id=eq.${recoveredBookingId}&select=base_amount,gst_amount,deposit_amount,total_amount,included_km,paid_amount,enquiry_id,vehicle_id`
      );
      assert.ok(bookingRes.ok);
      const booking = (bookingRes.body as Array<Record<string, unknown>>)[0];
      assert.ok(booking, "recovered booking row must exist");

      // The actual bug: these used to be 0/unset while total_amount held the
      // captured amount.
      assert.equal(num(booking.base_amount), expectedQuote.baseAmount, "base_amount must match the authoritative quote, not be 0");
      assert.equal(num(booking.gst_amount), expectedQuote.gstAmount, "gst_amount must match the authoritative quote, not be 0");
      assert.equal(num(booking.deposit_amount), expectedQuote.depositAmount, "deposit_amount must match the authoritative quote");
      assert.equal(num(booking.total_amount), expectedQuote.totalAmount, "total_amount must match the authoritative quote");
      assert.equal(num(booking.included_km), expectedQuote.includedKm, "included_km must match the authoritative quote");

      // Internal consistency the bug report asked for explicitly.
      assert.equal(
        num(booking.base_amount) + num(booking.gst_amount),
        num(booking.total_amount) - expectedQuote.offSchedulePickupFee - expectedQuote.gatewayFeeAmount,
        "base + GST (plus any timing/gateway fee) must equal the total rental fare"
      );

      // paid_amount is driven by increment_booking_paid, fed by effectivePaid: the
      // real captured amount from fetchRazorpayPayment when that live lookup
      // succeeds, or the payment's own stored amount (2014 here) when it doesn't —
      // e.g. for this fake razorpay_payment_id, which fails against the real API.
      assert.equal(num(booking.paid_amount), 2014, "paid_amount must fall back to the payment's own stored amount when the live Razorpay lookup fails");
    } finally {
      if (recoveredBookingId) {
        await rest(`invoices?booking_id=eq.${recoveredBookingId}`, { method: "DELETE" });
        await rest(`booking_history?booking_id=eq.${recoveredBookingId}`, { method: "DELETE" });
        await rest(`messages?booking_id=eq.${recoveredBookingId}`, { method: "DELETE" });
      }
      await rest(`availability_blocks?vehicle_id=eq.${recVehicleId}`, { method: "DELETE" });
      if (recoveredBookingId) await rest(`bookings?id=eq.${recoveredBookingId}`, { method: "DELETE" });
      if (paymentId) await rest(`payments?id=eq.${paymentId}`, { method: "DELETE" });
      if (enqId) await rest(`enquiries?id=eq.${enqId}`, { method: "DELETE" });
      await rest(`customers?id=eq.${recCustomerId}`, { method: "DELETE" });
      await rest(`vehicles?id=eq.${recVehicleId}`, { method: "DELETE" });
    }
  }
);

test(
  "expired temporary reservation holds do not reduce displayed availability",
  {
    skip: !CONFIGURED && "not configured",
  },
  async () => {
    // Regression test for: availability_blocks with booking_id IS NULL were counted
    // as occupying a unit regardless of expires_at, so a stale temporary hold (e.g.
    // a reservation claim from an abandoned checkout, past its 10-minute expiry)
    // permanently reduced availability until release_expired_holds() happened to run.
    // hydrateVehicles()'s blocks query now excludes expired NULL-booking holds itself,
    // so the read path is correct even if cleanup has not run yet.
    const WINDOW = { pickupAt: "2032-04-10T08:00:00+05:30", returnAt: "2032-04-11T08:00:00+05:30" };
    const past = new Date(Date.now() - 3600_000).toISOString();
    const future = new Date(Date.now() + 3600_000).toISOString();

    const vRes = await rest("vehicles", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        slug: `${TAG}-expholds-vehicle`.toLowerCase(),
        name: `${TAG} Expired Holds Vehicle`,
        brand: "TestBrand",
        model: "ExpiredHoldModel",
        active: 1,
        status: "available",
        seats: 4,
        rate_24h: 500,
        deposit: 500,
        included_km: 100,
        extra_km_rate: 4,
        total_units: 2,
      }),
    });
    assert.ok(vRes.ok, `test vehicle must be created: ${JSON.stringify(vRes.body)}`);
    const vehId = Number((vRes.body as Array<{ id: number }>)[0].id);

    const u1Res = await rest("vehicle_units", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ vehicle_id: vehId, unit_identifier: `${TAG}-U1`, status: "available", current_branch_id: 1, active: 1 }),
    });
    const u2Res = await rest("vehicle_units", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ vehicle_id: vehId, unit_identifier: `${TAG}-U2`, status: "available", current_branch_id: 1, active: 1 }),
    });
    assert.ok(u1Res.ok && u2Res.ok, "both test units must be created");
    const unit1 = Number((u1Res.body as Array<{ id: number }>)[0].id);

    const availableUnitsFor = async () => {
      const list = await getVehicles({ availabilityWindow: WINDOW }, true);
      return list.find((v) => v.id === vehId)?.available_units;
    };

    try {
      // Case 1: 2 units, 0 active holds -> 2/2
      assert.equal(await availableUnitsFor(), 2, "Case 1: no holds at all");

      // Case 2: 1 unexpired NULL-booking hold -> 1/2
      const hold2 = await rest("availability_blocks", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          vehicle_id: vehId, vehicle_unit_id: unit1, booking_id: null,
          starts_at: WINDOW.pickupAt, ends_at: WINDOW.returnAt, reason: "manual_block", expires_at: future,
        }),
      });
      assert.ok(hold2.ok, `case 2 hold insert failed: ${JSON.stringify(hold2.body)}`);
      assert.equal(await availableUnitsFor(), 1, "Case 2: one unexpired temporary hold");
      await rest(`availability_blocks?id=eq.${Number((hold2.body as Array<{ id: number }>)[0].id)}`, { method: "DELETE" });

      // Case 3: same hold, but ALREADY EXPIRED -> 2/2 — this is the actual bug.
      const hold3 = await rest("availability_blocks", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          vehicle_id: vehId, vehicle_unit_id: unit1, booking_id: null,
          starts_at: WINDOW.pickupAt, ends_at: WINDOW.returnAt, reason: "manual_block", expires_at: past,
        }),
      });
      assert.ok(hold3.ok, `case 3 hold insert failed: ${JSON.stringify(hold3.body)}`);
      assert.equal(await availableUnitsFor(), 2, "Case 3: an EXPIRED temporary hold must not reduce availability");
      await rest(`availability_blocks?id=eq.${Number((hold3.body as Array<{ id: number }>)[0].id)}`, { method: "DELETE" });

      // Case 4: one real booking on a unit -> 1/2
      const bk4 = await rest("bookings", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          booking_no: `${TAG}-EXPH1`, vehicle_id: vehId, vehicle_unit_id: unit1,
          pickup_at: WINDOW.pickupAt, return_at: WINDOW.returnAt, status: "Confirmed",
          base_amount: 500, gst_amount: 30, deposit_amount: 500, total_amount: 530, paid_amount: 0,
        }),
      });
      assert.ok(bk4.ok, `case 4 booking insert failed: ${JSON.stringify(bk4.body)}`);
      assert.equal(await availableUnitsFor(), 1, "Case 4: a real active booking still occupies its unit");
      await rest(`bookings?id=eq.${Number((bk4.body as Array<{ id: number }>)[0].id)}`, { method: "DELETE" });

      // Case 5: permanent staff block (expires_at IS NULL) -> 1/2
      const hold5 = await rest("availability_blocks", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          vehicle_id: vehId, vehicle_unit_id: unit1, booking_id: null,
          starts_at: WINDOW.pickupAt, ends_at: WINDOW.returnAt, reason: "manual_block", expires_at: null,
        }),
      });
      assert.ok(hold5.ok, `case 5 hold insert failed: ${JSON.stringify(hold5.body)}`);
      assert.equal(await availableUnitsFor(), 1, "Case 5: a permanent staff block (no expiry) still occupies its unit");
      await rest(`availability_blocks?id=eq.${Number((hold5.body as Array<{ id: number }>)[0].id)}`, { method: "DELETE" });
    } finally {
      await rest(`availability_blocks?vehicle_id=eq.${vehId}`, { method: "DELETE" });
      await rest(`bookings?vehicle_id=eq.${vehId}`, { method: "DELETE" });
      await rest(`vehicle_units?vehicle_id=eq.${vehId}`, { method: "DELETE" });
      await rest(`vehicles?id=eq.${vehId}`, { method: "DELETE" });
    }
  }
);

test(
  "branch-specific availability reflects only that branch's own inventory",
  {
    skip: !CONFIGURED && "not configured",
  },
  async () => {
    // Case 6 from the expired-holds fix spec: a 2-unit vehicle with one unit at each
    // of two branches must show branch-scoped counts, not the global 2-unit total,
    // when a specific branch is requested. Guards that the expired-holds fix did not
    // disturb this — it only changed which rows feed bookedUnitIds, not how
    // branch_distribution is derived from it.
    const WINDOW = { pickupAt: "2032-05-10T08:00:00+05:30", returnAt: "2032-05-11T08:00:00+05:30" };

    const vRes = await rest("vehicles", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        slug: `${TAG}-branch-vehicle`.toLowerCase(),
        name: `${TAG} Branch Vehicle`,
        brand: "TestBrand",
        model: "BranchModel",
        active: 1,
        status: "available",
        seats: 4,
        rate_24h: 500,
        deposit: 500,
        included_km: 100,
        extra_km_rate: 4,
        total_units: 2,
      }),
    });
    assert.ok(vRes.ok, `test vehicle must be created: ${JSON.stringify(vRes.body)}`);
    const vehId = Number((vRes.body as Array<{ id: number }>)[0].id);

    try {
      const uA = await rest("vehicle_units", {
        method: "POST",
        body: JSON.stringify({ vehicle_id: vehId, unit_identifier: `${TAG}-BA`, status: "available", current_branch_id: 1, active: 1 }),
      });
      const uB = await rest("vehicle_units", {
        method: "POST",
        body: JSON.stringify({ vehicle_id: vehId, unit_identifier: `${TAG}-BB`, status: "available", current_branch_id: 2, active: 1 }),
      });
      assert.ok(uA.ok && uB.ok, "both branch units must be created");

      const list = await getVehicles({ availabilityWindow: WINDOW, branchId: 1 }, true);
      const v = list.find((x) => x.id === vehId);
      const branchA = v?.branch_distribution?.find((bd) => bd.branch_id === 1);

      assert.equal(branchA?.total_units, 1, "Branch 1 has exactly one unit, not the global 2");
      assert.equal(branchA?.available_units, 1, "Branch 1's availability reflects only Branch 1's own inventory");
    } finally {
      await rest(`vehicle_units?vehicle_id=eq.${vehId}`, { method: "DELETE" });
      await rest(`vehicles?id=eq.${vehId}`, { method: "DELETE" });
    }
  }
);

// ===========================================================================
// Booking/payment concurrency hardening — 20260826_booking_reservation_concurrency.sql
//
// These require that migration's two columns (bookings.idempotency_key,
// payments.attempt_number) to exist. They fail with a clear "column does not
// exist" error, not a false pass, if it hasn't been run yet.
// ===========================================================================

async function makeConcurrencyTestVehicle(units: number, branchId = 1) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const v = await rest("vehicles", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      slug: `${TAG}-conc-${suffix}`.toLowerCase(),
      name: `${TAG} Concurrency Vehicle`,
      brand: "TestBrand",
      model: "ConcModel",
      active: 1,
      status: "available",
      seats: 4,
      rate_24h: 500,
      deposit: 500,
      included_km: 100,
      extra_km_rate: 4,
      total_units: units,
    }),
  });
  assert.ok(v.ok, `concurrency test vehicle must be created: ${JSON.stringify(v.body)}`);
  const vehId = Number((v.body as Array<{ id: number }>)[0].id);
  const unitIds: number[] = [];
  for (let i = 0; i < units; i++) {
    const u = await rest("vehicle_units", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ vehicle_id: vehId, unit_identifier: `${TAG}-U${i}-${suffix}`, status: "available", current_branch_id: branchId, active: 1 }),
    });
    assert.ok(u.ok, `concurrency test unit must be created: ${JSON.stringify(u.body)}`);
    unitIds.push(Number((u.body as Array<{ id: number }>)[0].id));
  }
  return { vehId, unitIds };
}

async function cleanupConcurrencyTestVehicle(vehId: number, bookingIds: number[], customerIds: number[]) {
  const bIds = bookingIds.filter((n) => Number.isFinite(n));
  if (bIds.length) {
    await rest(`payments?booking_id=in.(${bIds.join(",")})`, { method: "DELETE" });
    await rest(`booking_history?booking_id=in.(${bIds.join(",")})`, { method: "DELETE" });
  }
  await rest(`availability_blocks?vehicle_id=eq.${vehId}`, { method: "DELETE" });
  if (bIds.length) await rest(`bookings?id=in.(${bIds.join(",")})`, { method: "DELETE" });
  await rest(`vehicle_units?vehicle_id=eq.${vehId}`, { method: "DELETE" });
  await rest(`vehicles?id=eq.${vehId}`, { method: "DELETE" });
  const cIds = [...new Set(customerIds)].filter((n) => Number.isFinite(n));
  if (cIds.length) await rest(`customers?id=in.(${cIds.join(",")})`, { method: "DELETE" });
}

function testPhone(seed: number): string {
  return `+91${(6000000000 + (Date.now() % 900000000) + seed).toString().slice(0, 10)}`;
}

test(
  "Test 1 — 40 concurrent reservations for 1 available unit: exactly 1 succeeds, 39 fail",
  { skip: !CONFIGURED && "not configured" },
  async () => {
    const { vehId } = await makeConcurrencyTestVehicle(1);
    const pickup = "2033-01-10T08:00:00+05:30";
    const ret = "2033-01-12T08:00:00+05:30";
    let bookingIds: number[] = [];
    let customerIds: number[] = [];
    try {
      const results = await Promise.allSettled(
        Array.from({ length: 40 }, (_, i) =>
          createBooking({
            vehicleId: vehId,
            pickupAt: pickup,
            returnAt: ret,
            customer: { name: `${TAG} User ${i}`, phone: testPhone(i) },
            idempotencyKey: `${TAG}-t1-${i}`, // 40 genuinely DISTINCT logical requests
          })
        )
      );
      const succeeded = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ bookingId: number; bookingNo: string; customerId: number }>[];
      const failed = results.filter((r) => r.status === "rejected");
      bookingIds = succeeded.map((s) => s.value.bookingId);
      customerIds = succeeded.map((s) => s.value.customerId);

      assert.equal(succeeded.length, 1, `expected exactly 1 success, got ${succeeded.length}`);
      assert.equal(failed.length, 39, `expected exactly 39 failures, got ${failed.length}`);

      const blocks = await rest(`availability_blocks?vehicle_id=eq.${vehId}&select=id`);
      assert.equal((blocks.body as unknown[]).length, 1, "exactly one availability block must exist");

      const bookings = await rest(`bookings?vehicle_id=eq.${vehId}&select=id`);
      assert.equal((bookings.body as unknown[]).length, 1, "exactly one booking must exist");
    } finally {
      await cleanupConcurrencyTestVehicle(vehId, bookingIds, customerIds);
    }
  }
);

test(
  "Test 2 — the same logical reservation request, sent 10 times concurrently: exactly one booking, one reservation",
  { skip: !CONFIGURED && "not configured" },
  async () => {
    const { vehId } = await makeConcurrencyTestVehicle(2); // 2 units — proves dedup, not just capacity
    const pickup = "2033-02-10T08:00:00+05:30";
    const ret = "2033-02-12T08:00:00+05:30";
    const key = `${TAG}-t2-samekey`;
    const phone = testPhone(200);
    let bookingIds: number[] = [];
    let customerIds: number[] = [];
    try {
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          createBooking({
            vehicleId: vehId,
            pickupAt: pickup,
            returnAt: ret,
            customer: { name: `${TAG} Same User`, phone },
            idempotencyKey: key,
          })
            .then((r) => ({ ok: true as const, r }))
            .catch((e) => ({ ok: false as const, e: e instanceof Error ? e.message : String(e) }))
        )
      );
      const oks = results.filter((r): r is { ok: true; r: { bookingId: number; bookingNo: string; customerId: number } } => r.ok);
      assert.equal(oks.length, 10, `all 10 idempotent retries should resolve successfully: ${JSON.stringify(results.filter((r) => !r.ok))}`);

      const distinctBookingIds = new Set(oks.map((o) => o.r.bookingId));
      assert.equal(distinctBookingIds.size, 1, "all 10 retries must return the SAME booking id");
      bookingIds = [...distinctBookingIds];
      customerIds = [...new Set(oks.map((o) => o.r.customerId))];

      const blocks = await rest(`availability_blocks?vehicle_id=eq.${vehId}&select=id`);
      assert.equal((blocks.body as unknown[]).length, 1, "exactly one availability block despite 10 concurrent calls");

      const bookings = await rest(`bookings?vehicle_id=eq.${vehId}&select=id`);
      assert.equal((bookings.body as unknown[]).length, 1, "exactly one booking row must exist");
    } finally {
      await cleanupConcurrencyTestVehicle(vehId, bookingIds, customerIds);
    }
  }
);

test(
  "Test 3 — two customers concurrently reserving a 2-unit vehicle both succeed, on two DIFFERENT units",
  { skip: !CONFIGURED && "not configured" },
  async () => {
    const { vehId } = await makeConcurrencyTestVehicle(2);
    const pickup = "2033-03-10T08:00:00+05:30";
    const ret = "2033-03-12T08:00:00+05:30";
    let bookingIds: number[] = [];
    let customerIds: number[] = [];
    try {
      const [a, b] = await Promise.all([
        createBooking({ vehicleId: vehId, pickupAt: pickup, returnAt: ret, customer: { name: `${TAG} A`, phone: testPhone(301) }, idempotencyKey: `${TAG}-t3-a` }),
        createBooking({ vehicleId: vehId, pickupAt: pickup, returnAt: ret, customer: { name: `${TAG} B`, phone: testPhone(302) }, idempotencyKey: `${TAG}-t3-b` }),
      ]);
      bookingIds = [a.bookingId, b.bookingId];
      customerIds = [a.customerId, b.customerId];
      assert.notEqual(a.bookingId, b.bookingId, "must be two distinct bookings");

      const blocksRes = await rest(`availability_blocks?vehicle_id=eq.${vehId}&select=vehicle_unit_id`);
      const unitIds = new Set((blocksRes.body as Array<{ vehicle_unit_id: number }>).map((x) => x.vehicle_unit_id));
      assert.equal(unitIds.size, 2, "the two bookings must occupy two DIFFERENT physical units — the lock must not over-serialize unrelated capacity");
    } finally {
      await cleanupConcurrencyTestVehicle(vehId, bookingIds, customerIds);
    }
  }
);

test(
  "Test 4 — an expired temporary hold does not block a new reservation of the same unit",
  { skip: !CONFIGURED && "not configured" },
  async () => {
    const { vehId, unitIds } = await makeConcurrencyTestVehicle(1);
    const pickup = "2033-04-10T08:00:00+05:30";
    const ret = "2033-04-12T08:00:00+05:30";
    let bookingIds: number[] = [];
    let customerIds: number[] = [];
    try {
      await rest("availability_blocks", {
        method: "POST",
        body: JSON.stringify({
          vehicle_id: vehId,
          vehicle_unit_id: unitIds[0],
          booking_id: null,
          starts_at: pickup,
          ends_at: ret,
          reason: "manual_block",
          expires_at: new Date(Date.now() - 3600_000).toISOString(),
        }),
      });
      const res = await createBooking({ vehicleId: vehId, pickupAt: pickup, returnAt: ret, customer: { name: `${TAG} C`, phone: testPhone(401) }, idempotencyKey: `${TAG}-t4` });
      bookingIds = [res.bookingId];
      customerIds = [res.customerId];
      assert.ok(res.bookingId, "reservation must succeed despite the expired hold sitting on the unit");
    } finally {
      await cleanupConcurrencyTestVehicle(vehId, bookingIds, customerIds);
    }
  }
);

test(
  "Test 5/6 — payment attempts 1 and 2 failing leave the booking Pending payment with its reservation intact",
  { skip: !CONFIGURED && "not configured" },
  async () => {
    const { vehId } = await makeConcurrencyTestVehicle(1);
    const pickup = "2033-05-10T08:00:00+05:30";
    const ret = "2033-05-12T08:00:00+05:30";
    const booking = await createBooking({ vehicleId: vehId, pickupAt: pickup, returnAt: ret, customer: { name: `${TAG} D`, phone: testPhone(501) }, idempotencyKey: `${TAG}-t567` });
    try {
      const p1 = await rest("payments", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ payment_no: `${TAG}-P1`, booking_id: booking.bookingId, amount: 1, status: "Pending", attempt_number: 1, razorpay_order_id: `${TAG}-o1-${booking.bookingId}` }),
      });
      const p1Id = Number((p1.body as Array<{ id: number }>)[0].id);
      const r1 = await recordFailedPaymentAttempt(p1Id);
      assert.ok(r1.ok && r1.attemptNumber === 1 && !r1.attemptsExhausted, `attempt 1: ${JSON.stringify(r1)}`);

      let b = await rest(`bookings?id=eq.${booking.bookingId}&select=status`);
      assert.equal((b.body as Array<{ status: string }>)[0].status, "Pending payment");
      let blocks = await rest(`availability_blocks?booking_id=eq.${booking.bookingId}&select=id`);
      assert.equal((blocks.body as unknown[]).length, 1, "reservation remains after attempt 1 fails");

      const p2 = await rest("payments", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ payment_no: `${TAG}-P2`, booking_id: booking.bookingId, amount: 1, status: "Pending", attempt_number: 2, razorpay_order_id: `${TAG}-o2-${booking.bookingId}` }),
      });
      const p2Id = Number((p2.body as Array<{ id: number }>)[0].id);
      const r2 = await recordFailedPaymentAttempt(p2Id);
      assert.ok(r2.ok && r2.attemptNumber === 2 && !r2.attemptsExhausted, `attempt 2: ${JSON.stringify(r2)}`);

      b = await rest(`bookings?id=eq.${booking.bookingId}&select=status`);
      assert.equal((b.body as Array<{ status: string }>)[0].status, "Pending payment");
      blocks = await rest(`availability_blocks?booking_id=eq.${booking.bookingId}&select=id`);
      assert.equal((blocks.body as unknown[]).length, 1, "reservation remains after attempt 2 fails");
    } finally {
      await cleanupConcurrencyTestVehicle(vehId, [booking.bookingId], [booking.customerId]);
    }
  }
);

test(
  "Test 7 — payment attempt 3 failing releases the reservation exactly once",
  { skip: !CONFIGURED && "not configured" },
  async () => {
    const { vehId } = await makeConcurrencyTestVehicle(1);
    const pickup = "2033-06-10T08:00:00+05:30";
    const ret = "2033-06-12T08:00:00+05:30";
    const booking = await createBooking({ vehicleId: vehId, pickupAt: pickup, returnAt: ret, customer: { name: `${TAG} E`, phone: testPhone(701) }, idempotencyKey: `${TAG}-t7` });
    try {
      const p3 = await rest("payments", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ payment_no: `${TAG}-P3`, booking_id: booking.bookingId, amount: 1, status: "Pending", attempt_number: 3, razorpay_order_id: `${TAG}-o3-${booking.bookingId}` }),
      });
      const p3Id = Number((p3.body as Array<{ id: number }>)[0].id);

      const r3 = await recordFailedPaymentAttempt(p3Id);
      assert.ok(r3.ok && r3.attemptNumber === 3 && r3.attemptsExhausted && r3.released, `attempt 3: ${JSON.stringify(r3)}`);

      const b = await rest(`bookings?id=eq.${booking.bookingId}&select=status`);
      assert.equal((b.body as Array<{ status: string }>)[0].status, "Rejected", "booking must no longer consume inventory");

      const blocks = await rest(`availability_blocks?booking_id=eq.${booking.bookingId}&select=id`);
      assert.equal((blocks.body as unknown[]).length, 0, "reservation must be released");

      const again = await releaseBookingReservation(booking.bookingId);
      assert.ok(again.ok && again.released === false, "a second release call must be a safe no-op, not a double release");
    } finally {
      await cleanupConcurrencyTestVehicle(vehId, [booking.bookingId], [booking.customerId]);
    }
  }
);

test(
  "Test 8 — payment succeeding on attempt 2 confirms the booking and keeps the reservation",
  { skip: !CONFIGURED && "not configured" },
  async () => {
    const { vehId } = await makeConcurrencyTestVehicle(1);
    const pickup = "2033-07-10T08:00:00+05:30";
    const ret = "2033-07-12T08:00:00+05:30";
    const booking = await createBooking({ vehicleId: vehId, pickupAt: pickup, returnAt: ret, customer: { name: `${TAG} F`, phone: testPhone(801) }, idempotencyKey: `${TAG}-t8` });
    try {
      const p1 = await rest("payments", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ payment_no: `${TAG}-P1b`, booking_id: booking.bookingId, amount: 1, status: "Pending", attempt_number: 1, razorpay_order_id: `${TAG}-o1b-${booking.bookingId}` }),
      });
      await recordFailedPaymentAttempt(Number((p1.body as Array<{ id: number }>)[0].id));

      const p2 = await rest("payments", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ payment_no: `${TAG}-P2b`, booking_id: booking.bookingId, amount: 1, status: "Pending", attempt_number: 2, razorpay_order_id: `${TAG}-o2b-${booking.bookingId}` }),
      });
      const p2Id = Number((p2.body as Array<{ id: number }>)[0].id);

      const verify = await verifyBookingPayment({
        paymentId: p2Id,
        razorpayOrderId: `${TAG}-o2b-${booking.bookingId}`,
        razorpayPaymentId: `${TAG}-pay2b-${booking.bookingId}`,
        razorpaySignature: "x",
        skipSignatureCheck: true,
      });
      assert.ok(verify.ok, JSON.stringify(verify));

      const b = await rest(`bookings?id=eq.${booking.bookingId}&select=status`);
      assert.equal((b.body as Array<{ status: string }>)[0].status, "Confirmed");
      const blocks = await rest(`availability_blocks?booking_id=eq.${booking.bookingId}&select=id`);
      assert.equal((blocks.body as unknown[]).length, 1, "reservation must remain after confirmation — attempt 1's earlier failure must not have released it");
    } finally {
      await cleanupConcurrencyTestVehicle(vehId, [booking.bookingId], [booking.customerId]);
    }
  }
);

test(
  "Test 9 — simultaneous browser callback + webhook confirmation: exactly one confirmation, no duplicate financial effect",
  { skip: !CONFIGURED && "not configured" },
  async () => {
    const { vehId } = await makeConcurrencyTestVehicle(1);
    const pickup = "2033-08-10T08:00:00+05:30";
    const ret = "2033-08-12T08:00:00+05:30";
    const booking = await createBooking({ vehicleId: vehId, pickupAt: pickup, returnAt: ret, customer: { name: `${TAG} G`, phone: testPhone(901) }, idempotencyKey: `${TAG}-t9` });
    try {
      const pay = await rest("payments", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ payment_no: `${TAG}-P9`, booking_id: booking.bookingId, amount: 1, status: "Pending", attempt_number: 1, razorpay_order_id: `${TAG}-o9-${booking.bookingId}` }),
      });
      const payId = Number((pay.body as Array<{ id: number }>)[0].id);

      const args = { paymentId: payId, razorpayOrderId: `${TAG}-o9-${booking.bookingId}`, razorpayPaymentId: `${TAG}-pay9-${booking.bookingId}`, razorpaySignature: "x", skipSignatureCheck: true };
      const [r1, r2] = await Promise.all([verifyBookingPayment(args), verifyBookingPayment(args)]);
      assert.ok(r1.ok && r2.ok, JSON.stringify({ r1, r2 }));

      const b = await rest(`bookings?id=eq.${booking.bookingId}&select=status,paid_amount`);
      assert.equal((b.body as Array<{ status: string }>)[0].status, "Confirmed");
      assert.equal(Number((b.body as Array<{ paid_amount: number }>)[0].paid_amount), 1, "paid_amount must reflect exactly ONE increment, not two");
    } finally {
      await cleanupConcurrencyTestVehicle(vehId, [booking.bookingId], [booking.customerId]);
    }
  }
);

test(
  "Test 10 — repeated confirmation calls for an already-Paid payment are a safe no-op",
  { skip: !CONFIGURED && "not configured" },
  async () => {
    const { vehId } = await makeConcurrencyTestVehicle(1);
    const pickup = "2033-09-10T08:00:00+05:30";
    const ret = "2033-09-12T08:00:00+05:30";
    const booking = await createBooking({ vehicleId: vehId, pickupAt: pickup, returnAt: ret, customer: { name: `${TAG} H`, phone: testPhone(1001) }, idempotencyKey: `${TAG}-t10` });
    try {
      const pay = await rest("payments", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ payment_no: `${TAG}-P10`, booking_id: booking.bookingId, amount: 1, status: "Pending", attempt_number: 1, razorpay_order_id: `${TAG}-o10-${booking.bookingId}` }),
      });
      const payId = Number((pay.body as Array<{ id: number }>)[0].id);
      const args = { paymentId: payId, razorpayOrderId: `${TAG}-o10-${booking.bookingId}`, razorpayPaymentId: `${TAG}-pay10-${booking.bookingId}`, razorpaySignature: "x", skipSignatureCheck: true };

      for (let i = 0; i < 5; i++) {
        const r = await verifyBookingPayment(args);
        assert.ok(r.ok, `duplicate call ${i} should succeed/no-op cleanly: ${JSON.stringify(r)}`);
      }
      const b = await rest(`bookings?id=eq.${booking.bookingId}&select=status,paid_amount`);
      assert.equal((b.body as Array<{ status: string }>)[0].status, "Confirmed");
      assert.equal(Number((b.body as Array<{ paid_amount: number }>)[0].paid_amount), 1, "5 repeated confirmations must not increment paid_amount more than once");
    } finally {
      await cleanupConcurrencyTestVehicle(vehId, [booking.bookingId], [booking.customerId]);
    }
  }
);

test(
  "Test 11 — retrying order creation before any attempt fails reuses the same pending payment, not a new attempt",
  { skip: !CONFIGURED && "not configured" },
  async () => {
    const { vehId } = await makeConcurrencyTestVehicle(1);
    const pickup = "2033-10-10T08:00:00+05:30";
    const ret = "2033-10-12T08:00:00+05:30";
    const booking = await createBooking({ vehicleId: vehId, pickupAt: pickup, returnAt: ret, customer: { name: `${TAG} I`, phone: testPhone(1101) }, idempotencyKey: `${TAG}-t11` });
    try {
      const o1 = await createBookingPaymentOrder(booking.bookingId);
      const o2 = await createBookingPaymentOrder(booking.bookingId);
      assert.ok(o1.ok && o2.ok, JSON.stringify({ o1, o2 }));
      if (o1.ok && o2.ok) {
        assert.equal(o1.paymentId, o2.paymentId, "a retry before the first attempt fails must reuse the same payment, not mint a second attempt");
      }
    } finally {
      await cleanupConcurrencyTestVehicle(vehId, [booking.bookingId], [booking.customerId]);
    }
  }
);
test(
  "Test 12 — a Pending payment reservation older than 15 minutes stops blocking its unit, and the sweep releases it",
  {
    skip: !CONFIGURED && "not configured",
  },
  async () => {
    const pickup = "2033-06-10T08:00:00+05:30";
    const ret = "2033-06-12T08:00:00+05:30";
    const { vehId } = await makeConcurrencyTestVehicle(1);
    const bookingIds: number[] = [];
    const customerIds: number[] = [];

    try {
      const first = await createBooking({
        vehicleId: vehId, pickupAt: pickup, returnAt: ret,
        customer: { name: `${TAG} TTL`, phone: testPhone(1201) },
        idempotencyKey: `${TAG}-t12-a`,
      });
      bookingIds.push(first.bookingId); customerIds.push(first.customerId);

      // Fresh reservation on the only unit: a different customer must be refused.
      await assert.rejects(
        createBooking({
          vehicleId: vehId, pickupAt: pickup, returnAt: ret,
          customer: { name: `${TAG} TTL2`, phone: testPhone(1202) },
          idempotencyKey: `${TAG}-t12-b`,
        }),
        /unavailable|not available/i,
        "a reservation inside its 15-minute TTL must still hold the unit"
      );

      // Close the authoritative window. created_at is deliberately NOT touched: the
      // deadline is the stored payment_window_expires_at, not a value derived from it.
      const backdated = new Date(Date.now() - 60 * 1000).toISOString();
      const aged = await rest(`bookings?id=eq.${first.bookingId}`, {
        method: "PATCH", body: JSON.stringify({ payment_window_expires_at: backdated }),
      });
      assert.ok(aged.ok, `could not backdate the reservation: ${JSON.stringify(aged.body)}`);

      // The RPC itself must now ignore it — this is the TTL enforcement point, and it
      // works without any sweep/cron having run.
      const second = await createBooking({
        vehicleId: vehId, pickupAt: pickup, returnAt: ret,
        customer: { name: `${TAG} TTL2`, phone: testPhone(1202) },
        idempotencyKey: `${TAG}-t12-b`,
      });
      bookingIds.push(second.bookingId); customerIds.push(second.customerId);
      assert.notEqual(second.bookingId, first.bookingId, "an expired reservation must not be handed back as the winner");

      // And the sweep formally releases the abandoned one rather than leaving it
      // sitting in the CRM as Pending payment forever.
      const swept = await rpc("release_expired_reservations", {});
      assert.ok(swept.ok, `release_expired_reservations must exist: ${JSON.stringify(swept.body)}`);
      const after = await rest(`bookings?id=eq.${first.bookingId}&select=status`);
      assert.equal((after.body as Array<{ status: string }>)[0].status, "Rejected", "the swept reservation must end up Rejected");
    } finally {
      await cleanupConcurrencyTestVehicle(vehId, bookingIds, customerIds);
    }
  }
);

test(
  "Test 13 — the payment window and the 3-attempt limit gate the SAME reservation lifecycle",
  {
    skip: !CONFIGURED && "not configured",
  },
  async () => {
    const pickup = "2033-07-10T08:00:00+05:30";
    const ret = "2033-07-12T08:00:00+05:30";
    const { vehId } = await makeConcurrencyTestVehicle(1);
    const bookingIds: number[] = [];
    const customerIds: number[] = [];

    try {
      const booking = await createBooking({
        vehicleId: vehId, pickupAt: pickup, returnAt: ret,
        customer: { name: `${TAG} Window`, phone: testPhone(1301) },
        idempotencyKey: `${TAG}-t13`,
      });
      bookingIds.push(booking.bookingId); customerIds.push(booking.customerId);

      // The reservation carries ONE authoritative deadline, issued by the database.
      assert.ok(booking.paymentWindowExpiresAt, "a reservation must be issued a payment window deadline");
      const deadline = new Date(booking.paymentWindowExpiresAt as string).getTime();
      const fromNow = deadline - Date.now();
      assert.ok(fromNow > 10 * 60 * 1000 && fromNow <= 16 * 60 * 1000, `deadline should be ~15 min out, got ${Math.round(fromNow / 60000)} min`);

      // Inside the window, attempts are allowed.
      const gateOpen = await rpc("can_start_payment_attempt", { p_booking_id: booking.bookingId });
      assert.equal(gateOpen.body, "ok", "an active reservation inside its window must accept an attempt");

      // Three attempts consume the allowance; the 4th is refused on attempt count
      // alone, while the window is still open.
      for (let i = 1; i <= 3; i++) {
        const ins = await rest("payments", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            payment_no: `${TAG}-PY-${i}-${Date.now()}`, booking_id: booking.bookingId,
            amount: 1, currency: "INR", kind: "full", status: "Pending", attempt_number: i,
            created_at: new Date().toISOString(),
          }),
        });
        assert.ok(ins.ok, `attempt ${i} row must insert: ${JSON.stringify(ins.body)}`);
      }
      const gate4 = await rpc("can_start_payment_attempt", { p_booking_id: booking.bookingId });
      assert.equal(gate4.body, "attempts_exhausted", "a 4th attempt must be refused even with time left on the clock");

      // A fresh reservation, expired by moving its authoritative deadline into the
      // past, is refused on the window instead — with attempts still available.
      const second = await createBooking({
        vehicleId: vehId, pickupAt: "2033-08-10T08:00:00+05:30", returnAt: "2033-08-12T08:00:00+05:30",
        customer: { name: `${TAG} Window2` , phone: testPhone(1302) },
        idempotencyKey: `${TAG}-t13-b`,
      });
      bookingIds.push(second.bookingId); customerIds.push(second.customerId);
      const expire = await rest(`bookings?id=eq.${second.bookingId}`, {
        method: "PATCH",
        body: JSON.stringify({ payment_window_expires_at: new Date(Date.now() - 60 * 1000).toISOString() }),
      });
      assert.ok(expire.ok, "could not close the payment window");
      const gateClosed = await rpc("can_start_payment_attempt", { p_booking_id: second.bookingId });
      assert.equal(gateClosed.body, "window_closed", "no attempt may start once the authoritative window has closed");

      // And the order-creation path itself refuses, not just the raw gate — this is
      // what previously let a customer pay after the unit had been released.
      const order = await createBookingPaymentOrder(second.bookingId);
      assert.equal(order.ok, false, "createBookingPaymentOrder must refuse an expired reservation");
      if (!order.ok) assert.match(order.error, /expired|window/i, `unexpected refusal reason: ${order.error}`);

      // A verified payment outranks both limits.
      const paidRow = await rest("payments", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          payment_no: `${TAG}-PY-PAID-${Date.now()}`, booking_id: second.bookingId,
          amount: 1, currency: "INR", kind: "full", status: "Paid", attempt_number: 1,
          created_at: new Date().toISOString(),
        }),
      });
      assert.ok(paidRow.ok, "paid row must insert");
      const gatePaid = await rpc("can_start_payment_attempt", { p_booking_id: second.bookingId });
      assert.equal(gatePaid.body, "already_paid", "a verified payment must stop further attempts, outranking the closed window");
      const stillExpired = await rpc("is_expired_reservation", { p_booking_id: second.bookingId });
      assert.equal(stillExpired.body, false, "a reservation with a verified payment must never be treated as expired");
    } finally {
      await cleanupConcurrencyTestVehicle(vehId, bookingIds, customerIds);
    }
  }
);

test(
  "Test 14 — a booking OUTSIDE the requested window must not make the vehicle read as unavailable",
  {
    skip: !CONFIGURED && "not configured",
  },
  async () => {
    // The bug this guards: getVehicleById()/hydrateVehicles() without a window ask
    // "is this vehicle out at ANY point from now on". A single-unit vehicle with a
    // booking in October then reported status "unavailable" for a September request —
    // which surfaced in the booking form as "The selected vehicle is currently
    // unavailable or the branch is temporarily blocked".
    const { vehId } = await makeConcurrencyTestVehicle(1);
    const bookingIds: number[] = [];
    const customerIds: number[] = [];

    try {
      // Occupy the unit in OCTOBER.
      const october = await createBooking({
        vehicleId: vehId,
        pickupAt: "2033-10-10T08:00:00+05:30",
        returnAt: "2033-10-12T08:00:00+05:30",
        customer: { name: `${TAG} Oct`, phone: testPhone(1401) },
        idempotencyKey: `${TAG}-t14`,
      });
      bookingIds.push(october.bookingId); customerIds.push(october.customerId);

      // Ask about SEPTEMBER — no overlap at all.
      const sept = { pickupAt: "2033-09-10T08:00:00+05:30", returnAt: "2033-09-12T08:00:00+05:30" };
      const dated = await getVehicleById(vehId, true, sept);
      assert.ok(dated, "the vehicle must still be found");
      assert.equal(dated!.status, "available", "a booking outside the window must not mark the vehicle unavailable");
      assert.ok((dated!.available_units ?? 0) > 0, `expected free capacity in September, got ${dated!.available_units}`);

      // And the window is genuinely respected in the other direction: asking about the
      // dates that ARE booked must report no capacity.
      const clash = await getVehicleById(vehId, true, { pickupAt: "2033-10-10T08:00:00+05:30", returnAt: "2033-10-12T08:00:00+05:30" });
      assert.equal(clash!.available_units, 0, "the vehicle must report no capacity for its own booked dates");
    } finally {
      await cleanupConcurrencyTestVehicle(vehId, bookingIds, customerIds);
    }
  }
);

test(
  "Test 15 — a unit physically out on a rental is still bookable for a non-overlapping window",
  {
    skip: !CONFIGURED && "not configured",
  },
  async () => {
    // The bug this guards: handover sets vehicle_units.status (and used to set
    // vehicles.status) to "booked", and both the RPC and hydrateVehicles treated that
    // as a date-blind gate. One rental today therefore removed the vehicle from EVERY
    // future date — "blocking the whole timeline" — even though occupancy is already
    // decided per-date by the bookings/availability_blocks checks.
    const { vehId, unitIds } = await makeConcurrencyTestVehicle(1);
    const bookingIds: number[] = [];
    const customerIds: number[] = [];

    try {
      // Book September and mark it handed over, exactly as the CRM does at pickup.
      const sept = await createBooking({
        vehicleId: vehId,
        pickupAt: "2033-09-10T08:00:00+05:30",
        returnAt: "2033-09-12T08:00:00+05:30",
        customer: { name: `${TAG} Out`, phone: testPhone(1501) },
        idempotencyKey: `${TAG}-t15`,
      });
      bookingIds.push(sept.bookingId); customerIds.push(sept.customerId);

      const out = await rest(`vehicle_units?id=eq.${unitIds[0]}`, {
        method: "PATCH", body: JSON.stringify({ status: "booked" }),
      });
      assert.ok(out.ok, `could not mark the unit out: ${JSON.stringify(out.body)}`);

      // A window that does NOT overlap the rental must still be claimable.
      const nov = await rpc("reserve_vehicle_unit_slot", {
        p_vehicle_id: vehId, p_pickup_at: "2033-11-10T08:00:00+05:30",
        p_return_at: "2033-11-12T08:00:00+05:30", p_branch_id: null,
      });
      const novRows = Array.isArray(nov.body) ? nov.body : [];
      assert.equal(novRows.length, 1, "a unit out on another rental must still be bookable for a non-overlapping window");
      await rest(`availability_blocks?id=eq.${novRows[0].block_id}`, { method: "DELETE" });

      // And the dates it IS out for must still be refused.
      const clash = await rpc("reserve_vehicle_unit_slot", {
        p_vehicle_id: vehId, p_pickup_at: "2033-09-11T08:00:00+05:30",
        p_return_at: "2033-09-12T08:00:00+05:30", p_branch_id: null,
      });
      assert.equal((Array.isArray(clash.body) ? clash.body : []).length, 0, "the dates the unit is genuinely out for must stay blocked");

      // A genuinely date-blind reason must still block every date.
      await rest(`vehicle_units?id=eq.${unitIds[0]}`, { method: "PATCH", body: JSON.stringify({ status: "maintenance" }) });
      const maint = await rpc("reserve_vehicle_unit_slot", {
        p_vehicle_id: vehId, p_pickup_at: "2033-11-10T08:00:00+05:30",
        p_return_at: "2033-11-12T08:00:00+05:30", p_branch_id: null,
      });
      assert.equal((Array.isArray(maint.body) ? maint.body : []).length, 0, "maintenance must still block every date");
    } finally {
      await cleanupConcurrencyTestVehicle(vehId, bookingIds, customerIds);
    }
  }
);

test(
  "Test 16 — a manual counter booking holds its unit and is immune to the 15-minute sweep",
  {
    skip: !CONFIGURED && "not configured",
  },
  async () => {
    // createBooking() produces status "Pending payment" with a 15-minute window. A
    // walk-in booking left in that state would be rejected by
    // release_expired_reservations() a quarter of an hour after the customer paid at
    // the counter, freeing their vehicle. This is the guard for that.
    const pickup = "2033-12-10T08:00:00+05:30";
    const ret = "2033-12-12T08:00:00+05:30";
    const { vehId } = await makeConcurrencyTestVehicle(1);
    const bookingIds: number[] = [];
    const customerIds: number[] = [];

    try {
      const booking = await createBooking({
        vehicleId: vehId, pickupAt: pickup, returnAt: ret,
        customer: { name: `${TAG} Walkin`, phone: testPhone(1601) },
        idempotencyKey: `${TAG}-t16`,
      });
      bookingIds.push(booking.bookingId); customerIds.push(booking.customerId);

      // What createManualBooking() does immediately after createBooking().
      const promoted = await rest(`bookings?id=eq.${booking.bookingId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "Pending verification", source: "manual", payment_window_expires_at: null }),
      });
      assert.ok(promoted.ok, `could not mark the booking manual: ${JSON.stringify(promoted.body)}`);

      // Even with the window nulled and time long past, the sweep must not touch it.
      const expired = await rpc("is_expired_reservation", { p_booking_id: booking.bookingId });
      assert.equal(expired.body, false, "a manual counter booking must never count as an expired reservation");

      const swept = await rpc("release_expired_reservations", {});
      assert.ok(swept.ok, "sweep must run");
      const after = await rest(`bookings?id=eq.${booking.bookingId}&select=status,source`);
      const row = (after.body as Array<{ status: string; source: string }>)[0];
      assert.equal(row.status, "Pending verification", "the sweep must not reject a counter booking");
      assert.equal(row.source, "manual", "source must record how the booking was taken");

      // And it genuinely holds the unit: a second customer cannot take those dates.
      await assert.rejects(
        createBooking({
          vehicleId: vehId, pickupAt: pickup, returnAt: ret,
          customer: { name: `${TAG} Other`, phone: testPhone(1602) },
          idempotencyKey: `${TAG}-t16-b`,
        }),
        /unavailable|not available/i,
        "a counter booking must hold its unit against other bookings"
      );
    } finally {
      await cleanupConcurrencyTestVehicle(vehId, bookingIds, customerIds);
    }
  }
);

test(
  "Test 17 — an instant counter booking is created, handed over, and takes its unit out in one step",
  {
    skip: !CONFIGURED && "not configured",
  },
  async () => {
    // Mirrors what createManualBooking({ instant: true }) does: create through the
    // shared reservation path, mark it manual/Confirmed, then record the handover via
    // the SAME recordInspection action the scheduled flow uses.
    const now = new Date();
    const pickup = new Date(now.getTime() + 60 * 1000).toISOString();
    const ret = new Date(now.getTime() + 2 * 24 * 3600 * 1000).toISOString();
    const { vehId, unitIds } = await makeConcurrencyTestVehicle(1);
    const bookingIds: number[] = [];
    const customerIds: number[] = [];

    try {
      const booking = await createBooking({
        vehicleId: vehId, pickupAt: pickup, returnAt: ret,
        customer: { name: `${TAG} Instant`, phone: testPhone(1701) },
        idempotencyKey: `${TAG}-t17`,
      });
      bookingIds.push(booking.bookingId); customerIds.push(booking.customerId);

      await rest(`bookings?id=eq.${booking.bookingId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "Confirmed", source: "manual", payment_window_expires_at: null }),
      });

      // The handover leg, as recordInspection performs it.
      const handedOver = await rest(`bookings?id=eq.${booking.bookingId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "Vehicle handed over",
          actual_pickup_at: new Date().toISOString(),
          start_odometer: 12345,
        }),
      });
      assert.ok(handedOver.ok, `handover patch failed: ${JSON.stringify(handedOver.body)}`);
      await rest(`vehicle_units?id=eq.${unitIds[0]}`, { method: "PATCH", body: JSON.stringify({ status: "booked" }) });

      const row = await rest(`bookings?id=eq.${booking.bookingId}&select=status,source,actual_pickup_at,start_odometer`);
      const b = (row.body as Array<Record<string, unknown>>)[0];
      assert.equal(b.status, "Vehicle handed over", "an instant booking must end up handed over, not pending");
      assert.equal(b.source, "manual", "must be recorded as a counter booking");
      assert.ok(b.actual_pickup_at, "actual_pickup_at must be stamped so the return leg has a start time");
      assert.equal(Number(b.start_odometer), 12345, "start_odometer must be stored or extra km can never be billed on return");

      // Still immune to the reservation sweep.
      const expired = await rpc("is_expired_reservation", { p_booking_id: booking.bookingId });
      assert.equal(expired.body, false, "a handed-over counter booking must never be swept");

      // And the unit is genuinely out for these dates.
      await assert.rejects(
        createBooking({
          vehicleId: vehId, pickupAt: pickup, returnAt: ret,
          customer: { name: `${TAG} Other17`, phone: testPhone(1702) },
          idempotencyKey: `${TAG}-t17-b`,
        }),
        /unavailable|not available/i,
        "the handed-over unit must not be bookable for the same window"
      );
    } finally {
      await cleanupConcurrencyTestVehicle(vehId, bookingIds, customerIds);
    }
  }
);
