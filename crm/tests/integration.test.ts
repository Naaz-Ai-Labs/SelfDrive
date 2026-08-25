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
import { verifyBookingPayment } from "../src/lib/payment-actions";
import { calculateQuote } from "../src/lib/pricing";
import { getVehicleById, getVehicles } from "../src/lib/data";
import { parseIstInstant } from "../src/lib/rental-clock";
import { num } from "../src/lib/supabase-rest";

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
  "two concurrent reservations for a 1-unit vehicle: exactly one wins",
  {
    skip: !CONFIGURED && "not configured",
  },
  async () => {
    const pickup = "2030-01-10T08:00";
    const ret = "2030-01-11T08:00";

    // Fired together on purpose — this is the double-booking race.
    // Before the advisory lock existed, both callers passed the
    // availability check and both bookings were confirmed against
    // one physical vehicle.
    const [a, b] = await Promise.all([
      rpc("reserve_vehicle_slot", {
        p_vehicle_id: vehicleId,
        p_pickup_at: pickup,
        p_return_at: ret,
      }),
      rpc("reserve_vehicle_slot", {
        p_vehicle_id: vehicleId,
        p_pickup_at: pickup,
        p_return_at: ret,
      }),
    ]);

    assert.ok(
      a.ok && b.ok,
      `reserve_vehicle_slot missing — run the migrations. ${JSON.stringify(
        a.body
      )} ${JSON.stringify(b.body)}`
    );

    const winners = [a.body, b.body].filter(
      (x) => x !== null && x !== undefined
    );

    assert.equal(
      winners.length,
      1,
      `expected exactly one winner, got ${winners.length}`
    );
  }
);

test(
  "an expired hold stops blocking inventory",
  {
    skip: !CONFIGURED && "not configured",
  },
  async () => {
    const pickup = "2030-02-10T08:00";
    const ret = "2030-02-11T08:00";

    const claim = await rpc(
      "reserve_vehicle_slot",
      {
        p_vehicle_id: vehicleId,
        p_pickup_at: pickup,
        p_return_at: ret,
      }
    );

    assert.ok(
      claim.body,
      "first claim should succeed"
    );

    const holdId = Number(claim.body);

    // Backdate the hold: simulates a lambda that died
    // between claiming and linking.
    await rest(
      `availability_blocks?id=eq.${holdId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          expires_at: "2020-01-01T00:00:00Z",
        }),
      }
    );

    const second = await rpc(
      "reserve_vehicle_slot",
      {
        p_vehicle_id: vehicleId,
        p_pickup_at: pickup,
        p_return_at: ret,
      }
    );

    assert.ok(
      second.body,
      "a lapsed hold must not block the unit forever"
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

      // paid_amount is driven by a SEPARATE, unmodified step (increment_booking_paid
      // fed by fetchRazorpayPayment's result) — not part of this fix. With a fake
      // razorpay_payment_id that lookup fails against the real API, so paid_amount
      // stays 0 here; in production it is fed the real captured amount by that
      // untouched code. This assertion documents that boundary rather than papering
      // over it.
      assert.equal(num(booking.paid_amount), 0, "paid_amount tracks the real Razorpay capture via the untouched increment step, not this fix");
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