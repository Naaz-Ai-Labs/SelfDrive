# Darshh CRM

Staff CRM, database owner, and API gateway for the Darshh Holiday vehicle rental platform.

## Stack
Next.js (App Router) + Supabase (Postgres/Storage) + Upstash Redis + Razorpay.

## Dev
```bash
npm install
npm run dev   # localhost:3001
```

## Structure
- `src/app/dashboard` — staff-facing pages (bookings, fleet, payments, refunds)
- `src/app/api/gateway` — public site's API surface, gateway-key authenticated
- `src/lib` — server actions, pricing, availability, refunds, PDF generation
- `supabase/migrations` (repo root) — schema changes

## Notes
- `refunds`, `bookings`, and vehicle-availability logic enforce their invariants both in app code and DB triggers/constraints.
- See `crm/AGENTS.md` for Next.js version-specific conventions.
