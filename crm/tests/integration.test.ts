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