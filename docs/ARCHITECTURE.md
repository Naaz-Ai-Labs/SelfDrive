# Architecture & Guardrails

Rules that hold this system together. Each one exists because breaking it caused a
real production defect.

## 1. Supabase/PostgreSQL is the only persistent source of truth

There is no second database. There is no local mirror.

**Do not reintroduce:** SQLite, a writable local DB, hydration loops, bidirectional
sync, or "write here then sync there" persistence.

*Why:* the CRM previously mirrored all 39 tables into a SQLite file in `os.tmpdir()`.
On Vercel that file is per-lambda and wiped on cold start, so every instance had a
different database. It was simultaneously the latency problem (cold start
re-hydrated 39 tables) and the data-loss problem (~20 fire-and-forget syncs that the
lambda froze before completing).

## 2. Never report success for a write that did not land

Booking, payment, refund, session and document operations must return an explicit
failure when the authoritative write fails.

*Why:* `submitBooking` used to return `{ok: true}` with a fabricated `BK-…` number
when everything failed. Customers received confirmations for bookings that existed
in no system.

## 3. Never invent business data to make a path succeed

No synthetic customer IDs, prices, booking numbers, invoice numbers or payment
records.

*Why:* the fallback defaulted `customerId` to `25` — a real customer — attaching
strangers' bookings to their account. Invoices defaulted to `₹1000`/`₹60` when a
value was missing, printing figures on a tax document that nobody was charged.

## 4. Primary and fallback are two transports into ONE business operation

The emergency direct-Supabase path must not re-implement business rules.

**A business rejection is final.** If the gateway answers `ok: false` — unavailable,
below the weekend minimum, missing documents — that is a decision, not an outage. Do
not retry it down a path with fewer rules.

*Why:* the fallback triggered on any `ok: false`, so every rule the CRM enforced could
be defeated by being rejected once. It performed no availability check and wrote no
`availability_blocks` row, silently overbooking units.

## 5. Correctness invariants live in the database

Application checks are not enough when two requests race.

Enforced in Postgres today:
- `reserve_vehicle_slot()` — advisory lock, counts units, claims in one transaction
- unique `customers.phone`
- unique `inspections(booking_id, kind)` — a second return inspection double-charged
- refund total may not exceed captured amount (trigger)
- unique `payment_events.event_id` — webhook idempotency
- availability released by trigger on terminal booking status

## 6. Public and private storage never share a bucket

- `vehicle-photos` — public, marketing media
- `customer-documents` — **private**, government IDs, served only via
  `/api/files/doc` behind a staff session

*Why:* Aadhaar cards and licences were written to the public bucket and referenced by
public URL. Anyone with the link could read them.

## 7. Public endpoints get an explicit projection

A route reachable without authentication returns only fields chosen for that purpose.
Never `select=*` straight into a public response.

*Why:* the tracking endpoint returned raw licence numbers, customer phone, internal
notes and the audit trail to anonymous callers — and matched on the numeric primary
key, so `/track/1,2,3…` enumerated every booking.

## 8. Security counters must be shared and fail closed

Rate limits and idempotency keys must not live in a module-level `Map`; that is
per-lambda and resets on cold start. Use `lib/rate-limit.ts` (Postgres-backed).

The Redis helper silently degrades to in-process memory when unconfigured — it is
fine for caching, never for a security or correctness invariant.

## 9. Money is NUMERIC, and PostgREST returns it as a string

Always `Number()` / `num()` before arithmetic. `"100" + "50"` is `"10050"`.

## 10. Time is Asia/Kolkata, always

Never use the runtime's local timezone for rental-day logic. Vercel runs UTC; the
browser runs the visitor's zone. Use `lib/rental-clock.ts`.

*Why:* the booking clock used `new Date().getHours()`, so server-rendered HTML and
client hydration disagreed by 5.5 hours and time slots visibly reset on load.

## 11. One implementation per business rule

Pricing lives in `lib/pricing.ts` + `lib/rental-clock.ts`, mirrored between apps and
kept in sync. Do not add a local copy of a calculation.

*Why:* four independent implementations of rental pricing existed simultaneously and
disagreed, so the site quoted one price and the CRM charged another.

## 12. Schema changes go through migrations

`supabase/migrations/`, dated, idempotent, re-runnable. Not dashboard edits.

## Deployment shape

```
www.selfdrive.bike  → web/  (Vercel root: web)
crm.selfdrive.bike  → crm/  (Vercel root: crm)
                ↓
        CRM API gateway  (x-gateway-key)
                ↓
        Supabase Postgres + Storage
```

Required env on both projects: `GATEWAY_API_KEY` (identical), `SESSION_SECRET`,
`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
`RAZORPAY_WEBHOOK_SECRET`. All fail closed when absent — by design.
