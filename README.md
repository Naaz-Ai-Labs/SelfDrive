# Darshh Holiday

Self-drive bike, scooter, car and tempo-traveller rental — Sakleshpura & Hassan, Karnataka.

This repo is two Next.js apps that together run the business:

| App | Port | Role |
|---|---|---|
| [`web/`](web) | `3000` | Public website + customer portal (browse, book, pay, track a booking). No database access of its own. |
| [`crm/`](crm) | `3001` | Staff CRM. **Owns the database** and exposes it to `web` through an authenticated API gateway (`/api/gateway/v1/*`). |

## Architecture

```
Browser ──► web (3000) ──[server-side, x-gateway-key]──► crm (3001) ──► SQLite (crm/data/darshan.db)
```

- `web` never touches the database directly — every page that needs live data (vehicles, pricing, bookings, gallery, etc.) calls `crm`'s gateway API from server components, authenticated with a shared secret (`GATEWAY_API_KEY`).
- `crm` is the only thing that reads or writes `crm/data/darshan.db` (Node's built-in `node:sqlite`, no external DB server required).
- The gateway is deliberately the *only* crossing point between the two apps — the CRM's own dashboard routes are session-authenticated and separate from it.

## Getting started

Requires Node 22+ (for `node:sqlite`).

```bash
# 1. Install dependencies in both apps
cd crm && npm install
cd ../web && npm install

# 2. Configure environment — copy the examples and fill in real values
cp crm/.env.example crm/.env.local
cp web/.env.example web/.env.local
```

Both `.env.local` files need the **same** `GATEWAY_API_KEY` — generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`crm/.env.local` also takes Razorpay keys (optional — booking falls back to "pay at pickup" without them).

```bash
# 3. Seed the database (creates crm/data/darshan.db)
cd crm && npm run seed

# 4. Run both apps (separate terminals)
cd crm && npm run dev   # http://localhost:3001
cd web && npm run dev   # http://localhost:3000
```

Seed output prints a demo admin login for the CRM dashboard — **change that password** before this ever touches real customer data.

## Common scripts (run inside `web/` or `crm/`)

```bash
npm run dev         # start the dev server
npm run typecheck   # tsc --noEmit
npm run build        # production build
npm run seed         # crm only — (re)seed the database
```

## Security notes

- `.env`, `.env.local`, and every `data/` directory (the SQLite database, its WAL/SHM files, and any uploaded licence/ID documents) are git-ignored — never commit real secrets or customer data. `.env.example` in each app documents what's needed without real values.
- The gateway key in `GATEWAY_API_KEY` is the trust boundary between the two apps — treat it like any other production secret and rotate it if it's ever exposed.
- The CRM database contains real customer PII (names, phone numbers) once seeded/used — back it up separately from this repo, not inside it.
