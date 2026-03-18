# Barn Raise V1 — Implementation Plan

## Detailed Build Plan for the Rotational Labor Coordination Utility

**Version:** 1.0
**Date:** March 17, 2026
**Companion Documents:** barn-raise-prd.md, barn-raise-technical-architecture.md

---

## Plan Overview

This document breaks the Barn Raise V1 build into 6 phases across an estimated 10–14 weeks of development. Each phase produces a shippable increment — the app is usable after Phase 3 (week 6), with Phases 4–6 adding polish, reputation, and launch readiness.

The plan assumes **one full-stack developer** working full-time with **architectural guidance** (you as technical non-developer / product lead). Adjust timelines proportionally for a two-person team.

### Phase Summary

| Phase | Focus | Duration | Deliverable |
|---|---|---|---|
| **0** | Project scaffolding & infrastructure | Week 1 | Running dev environment, DB schema deployed, CI/CD pipeline |
| **1** | Auth + Pools | Weeks 2–3 | Users can sign up, create pools, invite members |
| **2** | Events + Claims | Weeks 4–5 | Users can create events, claim slots, view event pages |
| **3** | Verification + Points | Week 6 | Complete core loop: host → verify → points distributed |
| **4** | Reputation + Dashboard | Weeks 7–8 | Pool health, member profiles, reliability scores, notifications |
| **5** | Public event pages + Growth | Weeks 9–10 | Shareable event URLs, SEO, invite flows, mobile polish |
| **6** | Testing, hardening, launch prep | Weeks 11–14 | Load testing, security audit, docs, beta program, deploy |

---

## Phase 0: Project Scaffolding & Infrastructure

**Goal:** Running development environment with database, auth skeleton, and deployment pipeline. Zero user-facing features — this is pure foundation.

**Duration:** Week 1

### 0.1 Repository Setup

**Task:** Initialize the monorepo and configure tooling.

```
barn-raise/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── (auth)/             # Auth-related routes
│   │   ├── (dashboard)/        # Authenticated app routes
│   │   ├── (public)/           # Public-facing routes (event pages)
│   │   └── api/                # API routes
│   ├── components/
│   │   ├── ui/                 # shadcn/ui primitives
│   │   ├── pools/              # Pool-specific components
│   │   ├── events/             # Event-specific components
│   │   └── layout/             # Navigation, sidebar, etc.
│   ├── lib/
│   │   ├── db/                 # Drizzle schema + migrations
│   │   ├── auth/               # NextAuth config
│   │   ├── trpc/               # tRPC router definitions
│   │   ├── validators/         # Zod schemas
│   │   └── utils/              # Shared utilities
│   ├── server/
│   │   ├── routers/            # tRPC routers (pools, events, users)
│   │   └── services/           # Business logic (verification, points)
│   └── types/                  # Shared TypeScript types
├── drizzle/                    # Migration output directory
├── public/
├── .env.local.example
├── drizzle.config.ts
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

**Actions:**
- `npx create-next-app@latest barn-raise --typescript --tailwind --app --src-dir`
- Install core dependencies: `drizzle-orm`, `drizzle-kit`, `@trpc/server`, `@trpc/client`, `@trpc/react-query`, `next-auth`, `zod`, `@tanstack/react-query`, `postgres` (driver)
- Install UI dependencies: `@radix-ui/react-*` components via shadcn/ui CLI
- Configure Biome or ESLint + Prettier
- Create `.env.local.example` with all required env vars
- Initialize git repo, write `.gitignore`

**Acceptance:** `pnpm dev` starts the app at localhost:3000 with a blank page.

### 0.2 Database Setup

**Task:** Provision PostgreSQL, define the complete schema via Drizzle ORM, generate and run initial migration.

**Actions:**
- Provision Neon database (free tier for development, Pro for staging/production)
- Create Drizzle schema files matching the SQL schema from the technical architecture document:
  - `src/lib/db/schema/accounts.ts`
  - `src/lib/db/schema/pools.ts`
  - `src/lib/db/schema/pool-memberships.ts`
  - `src/lib/db/schema/vouchers.ts`
  - `src/lib/db/schema/events.ts`
  - `src/lib/db/schema/event-claims.ts`
  - `src/lib/db/schema/point-transactions.ts`
  - `src/lib/db/schema/audit-log.ts`
  - `src/lib/db/schema/notifications.ts`
- Include all CPP bridge fields (`chain_address`, `chain_tx_hash`, etc.) as nullable columns from day one
- Generate migration: `drizzle-kit generate`
- Run migration: `drizzle-kit push` (dev) or `drizzle-kit migrate` (production)
- Create materialized view `pool_balances` via raw SQL migration
- Create reputation signals view via raw SQL migration
- Seed script with test data (2 pools, 5 users, 3 events in various states)

**Acceptance:** `drizzle-kit studio` shows all tables. Seed data is queryable.

### 0.3 CI/CD Pipeline

**Task:** Configure deployment pipeline.

**Actions:**
- Connect repo to Vercel
- Configure preview deployments on PR branches
- Configure production deployment on `main` branch
- Set up environment variables in Vercel for staging and production
- Configure Neon branching (each preview deployment gets its own DB branch — Neon supports this natively)
- Add GitHub Actions for:
  - Type checking (`tsc --noEmit`)
  - Linting
  - Unit tests (Vitest)
  - Migration validation (`drizzle-kit check`)

**Acceptance:** Push to a branch creates a preview deployment with its own database.

### 0.4 Auth Skeleton

**Task:** Configure NextAuth with email magic link provider.

**Actions:**
- Install `next-auth@5` (Auth.js v5)
- Configure Drizzle adapter for NextAuth (stores sessions and accounts in our Postgres)
- Configure Resend as the email provider for magic links
- Create minimal sign-in page (`/sign-in`)
- Create minimal sign-up page (`/sign-up`) that also collects display name
- Implement session middleware that protects authenticated routes
- Create basic layout with auth state (signed in / signed out)

**Acceptance:** User can enter email, receive magic link, click it, and land on an authenticated dashboard skeleton.

---

## Phase 1: Pools

**Goal:** Users can create labor pools, configure settings, invite members, and see a basic pool dashboard. This is the foundational data structure everything else builds on.

**Duration:** Weeks 2–3

### 1.1 Pool Creation Flow

**Task:** Build the pool creation wizard.

**Screens:**
- `/pools/new` — Multi-step form:
  - Step 1: Pool name, description, location (optional)
  - Step 2: Join policy (open / invite / approval), starting balance (slider: 0–5 hours), max negative balance (slider: -5 to -20 hours)
  - Step 3: Review and create

**Backend:**
- tRPC mutation: `pools.create`
  - Validates inputs via Zod schema
  - Creates `pools` record
  - Creates `pool_memberships` record with role `steward` for the creator
  - Creates `vouchers` record (the pool's labor-hour token) with auto-generated symbol
  - If starting_balance > 0, creates `point_transactions` record (type: `starting_balance`) for the creator
  - Logs to `audit_log`
  - Returns pool ID and invite link

**Acceptance:** User creates a pool and is redirected to the pool dashboard.

### 1.2 Pool Invite System

**Task:** Enable pool stewards to invite others and for invited users to join.

**Backend:**
- tRPC mutation: `pools.generateInvite` — creates a signed invite token (JWT with pool_id, expiry)
- tRPC mutation: `pools.join` — accepts invite token, creates `pool_memberships` record
- tRPC mutation: `pools.requestJoin` — for approval-policy pools, creates a pending membership
- tRPC mutation: `pools.approveJoin` — steward approves pending membership
- tRPC mutation: `pools.rejectJoin` — steward rejects pending membership

**Screens:**
- `/pools/[id]/invite` — Steward view: shows invite link, copy button, QR code
- `/join/[token]` — Public invite landing page: shows pool info, "Join" button (requires auth)
- Steward gets notification of pending join requests (for approval-policy pools)

**Point mechanics on join:**
- When membership is created, if pool's `starting_balance` > 0, insert a `point_transactions` record (type: `starting_balance`)
- This grants the new member their initial hours

**Acceptance:** Steward generates an invite link. Non-member clicks link, signs up or signs in, and joins the pool. Their starting balance appears immediately.

### 1.3 Pool Dashboard

**Task:** Build the main pool view that members see after joining.

**Screen:** `/pools/[id]`

**Sections:**
1. **Header:** Pool name, description, member count, total hours exchanged
2. **Upcoming Events:** List of events in `open` or `confirmed` status (placeholder for Phase 2)
3. **Recent Activity:** Feed of recent events (completed/verified), new members, etc.
4. **Members:** List of pool members with basic stats (hours earned, hours spent, balance, member since)
5. **My Stats:** Current user's balance, events attended, events hosted

**Backend:**
- tRPC query: `pools.dashboard` — returns pool metadata + aggregated stats
- tRPC query: `pools.members` — returns paginated member list with stats from `pool_balances` materialized view
- tRPC query: `pools.activity` — returns recent audit log entries formatted as a feed

**Acceptance:** Pool dashboard renders with real data. Members list shows accurate starting balances.

### 1.4 Pool Settings

**Task:** Stewards can edit pool configuration.

**Screen:** `/pools/[id]/settings`

**Sections:**
- Edit pool name, description, location
- Adjust starting balance for new members
- Adjust max negative balance
- Set event frequency limit (optional)
- Member management: view all members, remove members (with confirmation), promote/demote stewards
- Danger zone: delete pool (only if no verified events exist)

**Backend:**
- tRPC mutation: `pools.updateSettings` — steward-only, validates inputs, logs to audit
- tRPC mutation: `pools.removeMember` — steward-only, sets `left_at` on membership, logs reason
- tRPC mutation: `pools.updateMemberRole` — promote to steward or demote to member

**Acceptance:** Steward can change all pool settings. Changes reflect immediately on the dashboard.

### 1.5 My Pools View

**Task:** User's home screen showing all pools they belong to.

**Screen:** `/dashboard` (authenticated home)

**Layout:**
- List of pool cards, each showing: pool name, member count, your balance, upcoming events count
- "Create a Pool" button
- "Join a Pool" prompt (if user has no pools)

**Backend:**
- tRPC query: `users.myPools` — returns all pools for current user with per-pool balance summary

**Acceptance:** User sees all their pools on the dashboard with accurate balances.

---

## Phase 2: Events + Claims

**Goal:** The full event creation and claiming flow. After this phase, someone can create a barn raise, share it, and others can sign up. Verification doesn't work yet — that's Phase 3.

**Duration:** Weeks 4–5

### 2.1 Event Creation

**Task:** Build the event creation flow within a pool.

**Screen:** `/pools/[id]/events/new`

**Form fields (matching PRD):**
- Title (required)
- Description (rich text — markdown or basic editor)
- Date and time: start datetime, end datetime (with smart defaults — "This Saturday 9am–3pm")
- Location: text field + optional map pin (use browser geolocation or manual entry)
- Total hours needed (required, auto-calculated from: participants × duration, or manually set)
- Max participants (required)
- Min participants (optional, default 1)
- Flexible hours toggle (default on — allows partial shifts)
- Skill tags (multi-select from predefined list + custom input)
- Potluck URL (optional text field)
- Photo upload (optional, up to 3 images — store in Vercel Blob or S3)

**Validation rules:**
- Host must be a pool member
- Host's balance + max_negative_balance must accommodate the event's total hours (they need enough "credit" to host)
- Event date must be in the future
- End time must be after start time
- If pool has event_frequency_limit, check host hasn't exceeded it

**Backend:**
- tRPC mutation: `events.create`
  - Validates all inputs
  - Checks host's balance permits the event
  - Creates `events` record with status `draft`
  - Returns event ID

**Status transitions:**
- Created as `draft`
- Host can preview and then publish → status becomes `open`
- tRPC mutation: `events.publish` — sets status to `open`, sends notifications to pool members

**Acceptance:** Host creates an event, publishes it, and it appears on the pool dashboard.

### 2.2 Event Detail Page (Authenticated)

**Task:** The main event view for pool members.

**Screen:** `/events/[id]` (within authenticated layout)

**Layout:**
- **Header:** Title, date/time, location, host name + avatar
- **Description:** Full event description
- **Labor Progress:** Visual bar showing "14 of 20 hours claimed" with percentage
- **Participants:** List of claimed contributors with their committed hours
- **Skills:** Tag chips
- **Potluck:** Embedded link or iframe if Potluck URL is set
- **Actions:**
  - "Claim a Slot" button (if user hasn't claimed)
  - "Edit My Claim" (if user has claimed)
  - "Cancel My Claim" (if user has claimed)
  - "Edit Event" (if user is host and event is still open)
  - "Cancel Event" (if user is host)

### 2.3 Slot Claiming

**Task:** Pool members can commit to contributing labor at an event.

**Interaction:**
- User clicks "Claim a Slot"
- If flexible_hours is on: slider or input to choose hours (1 to event duration)
- If flexible_hours is off: fixed to full event duration
- Confirmation dialog showing: "You're committing X hours to [Event Name] on [Date]"
- Submit

**Backend:**
- tRPC mutation: `events.claim`
  - Validates user is a pool member
  - Validates event is in `open` or `confirmed` status
  - Validates event hasn't hit max_participants
  - Validates total claimed hours won't exceed total_hours_needed (soft cap — allow slight over-claiming)
  - Creates `event_claims` record (status: `claimed`)
  - Updates `events.hours_claimed` and `events.participants_count` (denormalized)
  - If min_participants reached, transitions event to `confirmed`
  - Sends notification to host
  - Returns claim ID

- tRPC mutation: `events.updateClaim` — modify hours_committed (before event starts)
- tRPC mutation: `events.cancelClaim`
  - Sets claim status to `cancelled`
  - If within 24h of event: sets `late_cancel = TRUE`
  - Updates event aggregate counts
  - Sends notification to host

**Acceptance:** Member claims a slot, sees themselves in the participant list. Host receives notification. Progress bar updates.

### 2.4 Event Listing & Filtering

**Task:** Pool members can browse and filter events.

**Screen:** Integrated into pool dashboard (Section: Upcoming Events expanded)

**Filters:**
- Status: upcoming (open + confirmed), past (completed + verified), all
- Date range
- Skill tags
- Events I've claimed

**Sort options:**
- Date (soonest first — default)
- Hours needed (most help needed first)
- Fill rate (least full first — "needs you most")

**Backend:**
- tRPC query: `events.list` — paginated, filterable, pool-scoped
- tRPC query: `events.myEvents` — events the user has claimed across all pools

**Acceptance:** Pool dashboard shows upcoming events. User can filter and find events they want to join.

### 2.5 Event State Machine Automation

**Task:** Implement automatic state transitions based on time.

**Implementation:** A scheduled function (Vercel Cron Job) that runs every 15 minutes:

```
Every 15 minutes:
  1. Events where date_start <= NOW() and status = 'confirmed' or 'open':
     → Set status to 'in_progress'
  2. Events where date_end <= NOW() and status = 'in_progress':
     → Set status to 'completed'
     → Send notification to host: "Your event is complete. Please verify attendance."
  3. Events where date_end < NOW() - 7 days and status = 'completed':
     → Send reminder to host: "You haven't verified attendance for [Event]. Please verify."
```

**Alternative (simpler):** Skip the cron job in V1 and handle state transitions lazily — when anyone loads the event page, check if the status should have transitioned and update it. Less elegant but zero infrastructure.

**Recommendation:** Lazy evaluation for V1. Add cron for notifications in Phase 4.

**Acceptance:** Event status automatically reflects current time (in-progress during the event, completed after).

---

## Phase 3: Verification + Points

**Goal:** Close the core loop. After an event, the host verifies who showed up and how long they worked. Points are distributed. Balances update. This is the moment the system becomes real.

**Duration:** Week 6

### 3.1 Verification Interface

**Task:** Build the post-event verification screen for hosts.

**Screen:** `/events/[id]/verify` (host only, event status must be `completed`)

**Layout:**
- Event summary header (title, date, total hours)
- Table/card list of all claimed contributors:
  - Name + avatar
  - Hours committed
  - "Attended?" toggle (Yes / No) — default: Yes
  - "Hours worked" input (default: committed hours; editable up or down)
- Summary footer:
  - Total hours to be distributed
  - Host's resulting balance change
  - Warning if host would exceed max_negative_balance
- "Submit Verification" button with confirmation dialog

**UX details:**
- No-shows are marked by toggling "Attended?" to No
- If a contributor stayed longer than committed, host can increase hours
- If a contributor left early, host can decrease hours
- The host sees the balance impact in real-time as they adjust numbers

### 3.2 Verification Backend

**Task:** Implement the point distribution logic.

**Backend:**
- tRPC mutation: `events.verify`
  - Input: array of `{ claimId, attended: boolean, actualHours: number }`
  - Validates host is the event host
  - Validates event status is `completed`
  - Wraps everything in a database transaction:

```
FOR each verification:
  IF attended:
    - Update event_claim: status → 'verified_attended', hours_verified = actualHours
    - INSERT point_transaction: type='earn', hours=actualHours, account=contributor
  ELSE:
    - Update event_claim: status → 'verified_noshow', hours_verified = 0

INSERT point_transaction: type='spend', hours=totalDistributed, account=host

UPDATE event: status → 'verified', hours_verified = totalDistributed

REFRESH MATERIALIZED VIEW pool_balances
```

  - Sends notifications to all contributors:
    - Attended: "You earned X hours for [Event Name]!"
    - No-show: "You were marked as a no-show for [Event Name]."
  - Returns success with summary

**Edge cases:**
- Host submits verification but total would push them below max_negative_balance → block with error message explaining the limit
- Host tries to verify an already-verified event → reject (idempotency guard)
- Event has 0 claims → auto-verify with 0 hours distributed (host can still move to verified to close it out)

**Acceptance:** Host verifies attendance. Contributors see their new balances immediately. Host's balance decreases by total hours distributed.

### 3.3 Balance Display Updates

**Task:** Ensure balances are accurate and visible everywhere after verification.

**Locations that display balance:**
- Pool dashboard (My Stats section)
- Pool member list
- My Pools overview (dashboard cards)
- Event host preview (balance check during event creation)

**Implementation:**
- After verification triggers `REFRESH MATERIALIZED VIEW CONCURRENTLY pool_balances`, all balance queries automatically reflect the update
- Add a "last updated" timestamp to balance displays
- For real-time feel: after the verify mutation succeeds, invalidate relevant tRPC queries client-side so React Query refetches

**Acceptance:** After verification, every balance display in the app shows the correct updated numbers without requiring a page refresh.

### 3.4 Core Loop Smoke Test

**Task:** Manually walk through the complete lifecycle to verify everything works end-to-end.

**Test script:**
1. User A creates a pool "Test Pool" (starting balance: 2 hours)
2. User A invites User B and User C
3. User B and User C join → each gets 2 hours starting balance
4. User A creates an event: "Help Me Move" — 3 participants, 4 hours each, 12 total hours needed
5. User B claims 4 hours. User C claims 4 hours. User A claims 4 hours (as the host, they're also working).
6. Event time passes. Status transitions to `completed`.
7. User A verifies: B attended (4h), C attended (3h — left early), A attended (4h — self-verify)
8. Verify balances:
   - User B: 2 (starting) + 4 (earned) = 6 hours
   - User C: 2 (starting) + 3 (earned) = 5 hours
   - User A: 2 (starting) + 4 (earned) - 11 (spent as host) = -5 hours
9. Verify User A can still create another event (within max_negative_balance of -10)
10. Verify reputation signals: all attended, 0 no-shows

**Acceptance:** All numbers are correct. The core loop works.

---

## Phase 4: Reputation + Notifications + Dashboard Polish

**Goal:** Surface trust signals, add the notification system, and polish the pool dashboard to make pool health visible at a glance.

**Duration:** Weeks 7–8

### 4.1 Reputation Signals

**Task:** Calculate and display reputation metrics on member profiles.

**Member profile page:** `/pools/[id]/members/[userId]`

**Displayed metrics (from `reputation_signals` view + additional queries):**
- **Attendance reliability:** Events attended / Events claimed (percentage) — shown as a visual indicator
- **Balance (give/receive ratio):** Hours earned / Hours spent — above 1.0 = net giver
- **Events attended:** Total count, with a mini-timeline of recent events
- **Events hosted:** Total count
- **No-shows (90 day):** Count and list of specific events missed
- **Late cancellations:** Count
- **Member since:** Date with tenure badge
- **Skills:** From user profile

**Visual treatment:**
- Green indicators for healthy metrics (high reliability, positive balance)
- Amber for concerning (declining reliability, high negative balance)
- No "red" or punitive styling — the data speaks for itself
- No numerical reputation "score" — just transparent signals

**Backend:**
- tRPC query: `users.poolProfile` — returns all reputation signals for a user within a specific pool
- Computed from `event_claims`, `point_transactions`, and `pool_memberships` tables

### 4.2 No-Show Flagging System

**Task:** Implement the 3-strikes-in-90-days escalation path.

**Logic:**
- After each verification, check if any no-show contributors have hit 3 no-shows in a rolling 90-day window
- If threshold met:
  - Add a `noshow_flagged` boolean on the membership record
  - Send notification to all pool stewards: "[Member] has 3 no-shows in the last 90 days."
  - Add a subtle flag icon next to the member's name in the member list
- Stewards decide what to do (conversation, warning, removal) — no automated action

**Acceptance:** After a third no-show, stewards receive a notification. The member's profile shows the flag.

### 4.3 Notification System

**Task:** Implement in-app notifications and email digests.

**Notification types (from PRD):**
| Type | Trigger | Priority |
|---|---|---|
| `new_event` | Event published in your pool | Normal |
| `slot_claimed` | Someone claimed your event | Normal |
| `event_confirmed` | Event hit min participants | Normal |
| `event_reminder` | 24h before an event you claimed | High |
| `verify_request` | Your event is complete, please verify | High |
| `points_earned` | Verification complete, you earned hours | Normal |
| `noshow_marked` | You were marked as a no-show | High |
| `member_joined` | Someone joined your pool | Low |
| `invite_received` | You were invited to a pool | Normal |
| `noshow_flag` | A member hit 3 no-shows (steward only) | High |

**Implementation:**
- **In-app:** Insert records into `notifications` table. Bell icon in nav bar with unread count. Dropdown showing recent notifications.
- **Email:** Resend integration. Configurable per-user: instant (for high priority), daily digest (batched), weekly digest, or off. Default: instant for high priority, daily digest for normal/low.
- **Cron job** (Vercel Cron, runs hourly): sends pending email digests, event reminders (24h before), verification reminders (3 days after event with no verification)

**Backend:**
- Service: `NotificationService.send({ accountId, type, title, body, data })` — creates DB record and optionally triggers email
- tRPC query: `notifications.list` — paginated, unread-first
- tRPC mutation: `notifications.markRead` — marks single or all as read
- tRPC mutation: `notifications.updatePreferences` — sets email frequency per category

### 4.4 Pool Health Dashboard

**Task:** Add pool-wide health indicators to the pool dashboard.

**New dashboard section: "Pool Health"**

**Metrics:**
- **Reciprocity distribution:** Histogram showing how many members are at each give/receive ratio band. Healthy = bell curve near 1.0. Unhealthy = bimodal (chronic givers + chronic takers)
- **Participation trend:** Line chart showing events per month over time
- **Active members:** Members who have attended or hosted in the last 30 days vs. total members
- **Average fill rate:** Percentage of available hours that get claimed across recent events
- **No-show rate:** Percentage of claims that resulted in no-shows (target: under 15%)

**Implementation:**
- tRPC query: `pools.health` — returns aggregated health metrics
- Charts via recharts (already available in the artifact environment, lightweight)
- Only visible to pool stewards? Or all members? **Recommendation:** Visible to all members — transparency is a core principle.

### 4.5 My Activity Feed

**Task:** User's cross-pool activity timeline.

**Screen:** `/dashboard` (enhanced from Phase 1)

**Addition:** Below the pool cards, add a "Recent Activity" section showing:
- Events you've attended (with hours earned)
- Events you've hosted (with hours distributed)
- Upcoming events you've claimed
- Invitations pending

**Grouped by date, most recent first. Across all pools.**

---

## Phase 5: Public Event Pages + Growth Features

**Goal:** Make the event page the viral engine. Anyone can see an event page — but you need to join the pool to participate. This phase also adds the invite and onboarding flows that turn viewers into pool members.

**Duration:** Weeks 9–10

### 5.1 Public Event Page

**Task:** Build the shareable, SEO-optimized public event page.

**Screen:** `/e/[slug]` (short URL for sharing — slug derived from pool symbol + event ID)

**This is the most important single page in the application.** When someone shares "Help me build raised beds this Saturday" on their group text, the link lands here.

**Layout for non-authenticated visitors:**
- Hero section: Event title, date/time (with "Add to Calendar" links — Google Cal, iCal), location (with map link)
- Host info: Name, avatar, pool membership tenure
- Description: Full event description, photos
- Labor progress bar: "8 of 12 hours filled — 4 hours still needed!"
- Participant list: First names and hours committed (no full profiles — privacy)
- Skill tags
- Potluck link (if present)
- **CTA: "Join [Pool Name] to Help Out"** — links to join flow
- Pool description: brief context about what this pool is

**For authenticated pool members:**
- Same layout, but CTA becomes "Claim a Slot" (inline — no page navigation)

**SEO / Social sharing:**
- Dynamic Open Graph metadata: title, description, image (auto-generated OG image showing event title, date, progress bar)
- `next/og` image generation for social cards
- JSON-LD structured data (Event schema)

**Performance:**
- Static generation with ISR (revalidate every 60 seconds) — event pages should load fast even on slow connections
- Critical path rendering: title, date, CTA above the fold

### 5.2 OG Image Generation

**Task:** Auto-generate social sharing images for events.

**Implementation:**
- Use `next/og` (Vercel OG) to generate images at `/api/og/event/[id]`
- Template: Pool name, event title, date, progress bar, "X hours still needed"
- Warm, earthy color palette matching the app's design language
- Set as `og:image` in event page head

**Acceptance:** When someone pastes an event URL into iMessage, Slack, or social media, a rich preview card appears with the event details.

### 5.3 Join Flow Optimization

**Task:** Make the path from "I saw this event" to "I'm a pool member" as frictionless as possible.

**Flow:**
1. Non-member visits public event page
2. Clicks "Join [Pool Name] to Help Out"
3. If not authenticated: redirect to sign-up with `redirectTo` param (returns to event page after auth)
4. If authenticated but not a pool member:
   - For open pools: instant join, redirect back to event page with claim modal open
   - For invite pools: show "Request to Join" and notify steward
   - For approval pools: show "Request to Join" and notify steward
5. If authenticated and already a member: show claim slot interface directly

**Key optimization:** The join-and-claim should feel like one action, not two. After joining an open pool from an event page, auto-open the claim modal.

### 5.4 Invite Landing Page

**Task:** Build the invite acceptance page.

**Screen:** `/join/[token]`

**Layout:**
- Pool name, description, member count
- Who invited you (if tracked)
- What the pool is about
- "Join this Pool" button (requires auth)
- After joining: "You're in! Here are the upcoming events:" with event list

### 5.5 Mobile Responsiveness Audit

**Task:** Ensure every screen works beautifully on mobile.

**Priority order (by mobile usage likelihood):**
1. Public event page (shared via text message)
2. Event detail page with claim flow (used on-site at events)
3. Pool dashboard
4. My Pools overview
5. Verification interface (host uses after event)
6. Event creation form
7. Pool settings

**Actions:**
- Test every screen at 375px width (iPhone SE) and 390px (iPhone 14)
- Fix overflow, touch target sizes (minimum 44px), form usability
- Ensure the claim flow works with one thumb

---

## Phase 6: Testing, Hardening, Launch Prep

**Goal:** Production-ready application with real-world testing, security hardening, documentation, and a beta launch plan.

**Duration:** Weeks 11–14

### 6.1 Automated Test Suite

**Task:** Write comprehensive tests for all critical paths.

**Test framework:** Vitest (unit + integration) + Playwright (E2E)

**Unit tests (Vitest):**
- Point transaction logic: earn, spend, starting_balance calculations
- Balance computation: verify materialized view matches manual calculation
- Event state machine: all valid and invalid transitions
- Validation schemas: all Zod validators with edge cases
- No-show detection: 90-day rolling window logic
- Reputation signal calculation

**Integration tests (Vitest + test database):**
- Full event lifecycle: create pool → create event → claim → verify → check balances
- Invite flow: generate invite → join → verify membership
- Edge cases:
  - Host tries to verify twice (idempotency)
  - Claim after event started (should fail)
  - Host creates event that would exceed max_negative_balance (should fail)
  - Member leaves pool mid-event (claims should still resolve)
  - Pool with 0 events (dashboard renders correctly)

**E2E tests (Playwright):**
- Happy path: sign up → create pool → create event → verify → check balance
- Invite flow: generate link → open in incognito → sign up → join pool
- Public event page: renders correctly for anonymous users
- Mobile viewport tests for critical flows

**Target:** 80%+ coverage on business logic (server/services). E2E covers the 3 most critical user journeys.

### 6.2 Security Hardening

**Task:** Audit and harden the application for production use.

**Checklist:**
- [ ] All tRPC mutations check pool membership (no IDOR — users can't access other pools' data)
- [ ] Steward-only actions validated server-side (not just hidden in UI)
- [ ] Rate limiting on all mutations (especially: account creation, event creation, claim submission)
- [ ] CSRF protection via NextAuth
- [ ] Input sanitization: all user-provided text (event descriptions, pool names) sanitized before rendering to prevent XSS
- [ ] SQL injection: verified via Drizzle ORM parameterized queries (no raw SQL from user input)
- [ ] Environment variables: no secrets in client-side code; verify `.env` handling
- [ ] Invite tokens: signed with expiry, single-use for approval-policy pools
- [ ] File uploads: validate MIME types and file size for event photos
- [ ] Error handling: no stack traces or internal details in production error responses
- [ ] Dependency audit: `pnpm audit` for known vulnerabilities

### 6.3 Performance Optimization

**Task:** Ensure the app is fast on real-world connections.

**Actions:**
- Database: add missing indexes for common query patterns (especially event listing with filters)
- Materialized view refresh: ensure `REFRESH MATERIALIZED VIEW CONCURRENTLY` doesn't block reads during verification
- Image optimization: all user-uploaded photos served via Vercel Image Optimization
- Bundle analysis: `next/bundle-analyzer` to identify and eliminate heavy client-side dependencies
- Lighthouse audit: target 90+ on Performance, Accessibility, Best Practices
- Cache headers: static assets cached at CDN edge; API responses with appropriate cache-control
- Database connection pooling: ensure Neon's connection pooler is properly configured

**Acceptance:** Lighthouse scores 90+ across all categories. Event page loads in under 2 seconds on 3G connection.

### 6.4 Documentation

**Task:** Write the docs necessary for launch.

**Documents:**
1. **User Guide** — How to use Barn Raise (for pool stewards and members). Cover: creating a pool, inviting members, creating events, claiming slots, verifying attendance, understanding your balance. Written in plain language with screenshots.
2. **FAQ** — Common questions: "What if someone doesn't show up?", "Can I be in multiple pools?", "How do starting balances work?", "Can I owe more hours than I've given?"
3. **API Documentation** — Auto-generated from tRPC router definitions (for future integrations)
4. **Developer README** — How to run locally, environment setup, database migrations, deployment
5. **Privacy Policy + Terms** — Basic legal docs covering data handling, user responsibilities

### 6.5 Beta Launch Plan

**Task:** Define and execute a controlled beta launch.

**Beta structure:**
- **Week 11:** Internal testing with 2–3 pools of people you know personally. Collect feedback via a shared document or Telegram group.
- **Week 12:** Fix critical bugs from internal testing. Expand to 5–8 pools including at least 2 communities outside your immediate network (OpenCivics community members, Ethereum Localism contacts).
- **Week 13:** Second round of fixes. Prepare launch communications.
- **Week 14:** Public launch on barnraise.xyz (or chosen domain). Announcement via OpenCivics channels.

**Beta feedback collection:**
- In-app feedback button (bottom-right corner) that opens a simple form (title, description, screenshot capture)
- Weekly 15-minute check-in calls with beta stewards
- Track key metrics from day one:
  - Pools created
  - Events created
  - Events with 100% fill rate
  - Verification completion rate
  - No-show rate
  - DAU / WAU

### 6.6 Launch Deployment

**Task:** Production deployment and monitoring setup.

**Actions:**
- Configure production environment on Vercel (custom domain, production env vars)
- Set up Neon production database (Pro tier for connection pooling and autoscaling)
- Configure monitoring:
  - Vercel Analytics (web vitals, traffic)
  - Sentry (error tracking — already in the Sarafu Network codebase, good precedent)
  - Simple uptime monitoring (BetterUptime or similar)
- Configure database backups (Neon handles this automatically with point-in-time recovery)
- Set up Resend production sending domain with DKIM/SPF

---

## Dependency Map

This shows which tasks block which. Critical path is bolded.

```
Phase 0 (all tasks) 
    │
    ├──▶ **Phase 1.1 (Pool Creation)** ──▶ Phase 1.2 (Invites) ──▶ Phase 1.3 (Dashboard)
    │                                                                    │
    │                                                               Phase 1.4 (Settings)
    │                                                               Phase 1.5 (My Pools)
    │                                                                    │
    ├──▶ **Phase 2.1 (Event Creation)** ──▶ **Phase 2.2 (Event Detail)**
    │                                              │
    │                                    **Phase 2.3 (Claiming)**
    │                                              │
    │                                    Phase 2.4 (Listing)
    │                                    Phase 2.5 (State Machine)
    │                                              │
    ├──▶ **Phase 3.1 (Verify UI)** ──▶ **Phase 3.2 (Verify Backend)** ──▶ Phase 3.3 (Balances)
    │                                                                           │
    │                                                                    **Phase 3.4 (Smoke Test)**
    │                                                                           │
    ├──▶ Phase 4 (Reputation, Notifications, Polish) ──── parallel tracks ──────┤
    │                                                                           │
    ├──▶ Phase 5 (Public Pages, Growth) ────────────────────────────────────────┤
    │                                                                           │
    └──▶ Phase 6 (Testing, Hardening, Launch) ──────────────────────────────────┘
```

**Critical path:** Phase 0 → 1.1 → 2.1 → 2.2 → 2.3 → 3.1 → 3.2 → 3.4

Everything else can be parallelized or deferred.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Materialized view refresh causes performance issues under load** | Medium | High | Use `CONCURRENTLY` flag; add DB-level locking monitoring; fallback to computed queries if needed |
| **Event page doesn't generate shares / go viral** | High | High | Invest heavily in OG image quality and event page UX in Phase 5; A/B test CTA copy |
| **Users don't complete verification after events** | Medium | High | Aggressive notification cadence (day-of, +1 day, +3 days, +7 days); make verification as fast as possible (smart defaults) |
| **Starting balance exploitation (create pool, get free hours, leave)** | Low | Medium | Starting balance is pool-scoped; no cross-pool transfer in V1; leaving a pool doesn't transfer hours |
| **Pool steward goes inactive** | Medium | Medium | Allow multiple stewards; surface "this pool has no active steward" warning; V2: steward rotation mechanism |
| **Scope creep into V2 features** | High | Medium | This plan explicitly defers: cross-pool, tokens, TrustGraph, wallet connect. Maintain discipline |

---

## Cost Estimate

### Infrastructure (Monthly, Post-Launch)

| Service | Tier | Monthly Cost |
|---|---|---|
| Vercel | Pro | $20 |
| Neon PostgreSQL | Scale | $19 |
| Resend | Pro (50K emails) | $20 |
| Domain (barnraise.xyz) | Annual / 12 | ~$3 |
| Sentry | Developer (free tier) | $0 |
| **Total** | | **~$62/mo** |

### Development (One-Time, Through Launch)

| Item | Estimate |
|---|---|
| Developer time (10–14 weeks) | Variable (depends on rate) |
| Design assets (illustrations, OG template) | $500–1,500 (if commissioned) |
| Legal (privacy policy, terms) | $500–2,000 (if attorney-reviewed) |
| Beta testing costs (food for test events!) | $200–500 |

---

## Definition of Done: V1 Launch

The V1 launch is complete when all of the following are true:

- [ ] A user can sign up with email and land on a dashboard
- [ ] A user can create a pool with custom settings
- [ ] A user can invite others to a pool via shareable link
- [ ] A user can join a pool and receive a starting balance
- [ ] A user can create an event within a pool
- [ ] Pool members can browse and claim slots on events
- [ ] Event status transitions automatically based on time
- [ ] A host can verify attendance after an event
- [ ] Points are correctly distributed upon verification
- [ ] Balances are accurate and visible throughout the app
- [ ] Reputation signals (reliability, contribution ratio) are displayed on member profiles
- [ ] No-show tracking works with 3-in-90-day steward alerts
- [ ] Notifications are delivered in-app and via email
- [ ] Public event pages are shareable with rich social previews
- [ ] The app works on mobile browsers
- [ ] All critical paths have automated tests
- [ ] The app passes a basic security audit
- [ ] At least 3 real pools have used the app through beta testing
- [ ] Documentation exists for users, developers, and legal compliance
- [ ] The database schema includes all CPP bridge fields for V2 migration
