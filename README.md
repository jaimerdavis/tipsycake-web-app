# TheTipsyCake — Cake Ordering Platform

Full-stack B2C ordering app for a bakery: browse products, customize cakes, schedule fulfillment, pay online, and track orders.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React, Tailwind CSS, shadcn/ui |
| Backend | Convex (database, queries, mutations, actions, cron jobs) |
| Payments | Stripe (embedded), PayPal |
| Maps | Google Maps Platform (Places Autocomplete, Geocoding) |
| Email | Resend |
| SMS | Twilio |
| Forms | React Hook Form + Zod |
| Tests | Vitest |

## Project Structure

```
tipsycake-order/
├── storefront/              # Next.js app
│   ├── convex/              # Convex backend (schema, functions, webhooks)
│   │   ├── admin/           # Admin mutations/queries
│   │   └── lib/             # Shared pure logic (pricing, coupons, auth, audit)
│   ├── src/
│   │   ├── app/             # Next.js pages
│   │   │   ├── (storefront) # Customer-facing: products, cart, checkout, orders
│   │   │   ├── admin/       # Admin panel pages
│   │   │   └── driver/      # Driver portal
│   │   └── components/      # Shared UI components
│   └── tests/               # Vitest unit/integration tests
├── SPEC.md                  # Full requirements specification
└── docs/                    # Launch checklists, risk register, runbook
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- A [Convex](https://convex.dev) account

### 1. Install dependencies

```bash
cd storefront
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in the values in `.env.local`:

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | Yes | From `npx convex dev` |
| `STRIPE_SECRET_KEY` | Yes | Stripe dashboard |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes | Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | Yes | `stripe listen --forward-to` |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | For PayPal | PayPal developer dashboard |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | For autocomplete | Google Cloud Console |
| `GOOGLE_MAPS_API_KEY` | For geocoding | Google Cloud Console |
| `RESEND_API_KEY` | For email | resend.com |
| `TWILIO_ACCOUNT_SID` / `AUTH_TOKEN` / `FROM_NUMBER` | For SMS | twilio.com |

Set the same secrets in the Convex dashboard under your deployment's environment variables.

### 3. Start development

In two terminals:

```bash
# Terminal 1 — Convex backend
cd storefront
npx convex dev
```

```bash
# Terminal 2 — Next.js frontend
cd storefront
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Seed initial data

Once `npx convex dev` is running, go to the Convex dashboard and run the `seed.seedDefaults` mutation to populate:
- Default availability rules (store hours, cutoffs, lead times)
- Default delivery tiers

Then use the Admin panel at `/admin/products` to create your first products.

### 5. Configure auth

Connect an auth provider (Clerk, Auth0, etc.) via the Convex dashboard. The app uses role-based access control with roles: `admin`, `manager`, `kitchen`, `dispatcher`, `driver`, `customer`.

## Testing

```bash
cd storefront
npm test            # run all tests
npm run test:watch  # watch mode
```

47 tests covering: pricing engine, coupon logic, scheduling invariants, coupon limits, webhook idempotency.

## Key Features

- **Catalog**: Products with variants, modifier groups (required/optional, min/max), images via Convex storage
- **Cart**: Guest (localStorage session) + authenticated, coupon apply/remove, tip presets
- **Fulfillment**: Pickup, local delivery (distance tiers + polygon zones), shipping
- **Scheduling**: Store hours, blackout dates, lead times, slot capacity, holds with expiry
- **Payments**: Embedded Stripe (card/Apple Pay/Google Pay) + PayPal, webhook-authoritative
- **Orders**: Full status lifecycle, immutable snapshots, guest-accessible tracking via token URL
- **Notifications**: Order confirmation, status updates, shipped+tracking emails; SMS for delivery milestones
- **Abandoned Cart**: Email/phone capture, scheduled reminders with cart restore links
- **Loyalty**: Points ledger, configurable earn rules, redemption, anti-abuse
- **Admin**: Products, scheduling, delivery zones, coupons, loyalty, orders, drivers, analytics, audit logs
- **Driver Portal**: Assignment view, status updates, location ping, proof-of-delivery upload
