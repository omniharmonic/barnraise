# Barn Raise

A time-banking tool for communities who coordinate work through voluntary reciprocity. Neighbors helping neighbors — tracked in labor hours, not dollars.

Barn Raise draws from a global tradition of rotational labor: Gotong Royong (Indonesia), Meitheal (Ireland), Minga (Andes), Naffīr (Sudan), Dugnad (Norway), and the American barn raising.

## How It Works

1. **Create a Pool** — Invite your neighbors, co-op, or community group. Set governance rules: how people join, starting balances, and negative limits.
2. **Host Events** — Need help with a garden build, a move, or a repair day? Create an event. Members claim slots and commit hours.
3. **Earn & Spend Hours** — Show up → earn hours. Host → spend hours. Over time, reciprocity flows naturally.

### Hosting Types

- **Solo** — You fund the full event from your balance. Balance-checked at creation.
- **Group** — Multiple co-hosts pledge hours. Event enters a "pledging" phase until fully funded, then opens for labor claims.

### Verification

After an event, the host verifies attendance. Contributors earn hours; hosts (or co-hosts) spend them. No-shows are flagged. For group events, costs split proportionally among co-hosts using largest-remainder rounding.

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript
- **Database:** PostgreSQL via Drizzle ORM
- **API:** tRPC v11 (type-safe end-to-end)
- **Auth:** NextAuth v5 (credentials with bcrypt)
- **Styling:** Tailwind CSS v4 with custom design tokens
- **State:** React Query (TanStack Query v5)
- **Components:** Radix UI primitives, CVA variants

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- pnpm

### Setup

```bash
# Install dependencies
pnpm install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL

# Push schema to database
DATABASE_URL=postgresql://localhost:5432/barnraise npx drizzle-kit push

# Run development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | NextAuth secret (generate with `openssl rand -base64 32`) |

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/             # Sign in/up (no navbar)
│   ├── (dashboard)/        # Authenticated pages (with navbar)
│   │   ├── dashboard/      # My pools overview
│   │   ├── events/[id]/    # Event detail, edit, verify
│   │   ├── pools/          # Pool dashboard, settings, health, create
│   │   └── profile/        # Personal dashboard
│   ├── (public)/           # Public pages (join pool)
│   ├── api/                # API routes (auth, tRPC, upload)
│   └── landing.tsx         # Landing page
├── components/
│   ├── layout/             # Navbar, providers, notifications
│   └── ui/                 # Button, Card, Badge, Input, etc.
├── lib/
│   ├── auth/               # NextAuth configuration
│   ├── db/schema/          # Drizzle ORM schemas
│   ├── trpc/               # tRPC client & server setup
│   ├── utils/              # Helpers (formatting, gradients)
│   └── validators/         # Zod schemas for pools & events
└── server/
    ├── routers/            # tRPC routers (events, pools, users)
    └── services/           # Notifications service
```

## Database Schema

**Core tables:** `accounts`, `pools`, `pool_memberships`, `events`, `event_claims`, `event_pledges`, `point_transactions`, `vouchers`, `audit_log`, `notifications`

Key design: balances are computed from `point_transactions` aggregation (earn/spend/starting_balance), not stored directly. This ensures consistency and auditability.

## Event Lifecycle

```
Solo:   open → confirmed → in_progress → completed → verified
Group:  pledging → open → confirmed → in_progress → completed → verified
```

Events auto-transition based on time (lazy evaluation in `getById`). Cancellation is available from any pre-completion status.

## License

Private — not yet open source.
