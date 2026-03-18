# Barn Raise — Product Requirements Document

## Rotational Labor Coordination Utility Built on the Commitment Pooling Protocol

**Version:** 1.0 Draft
**Author:** OpenCivics Labs
**Date:** March 17, 2026
**Status:** Pre-Development

---

## Executive Summary

Barn Raise is a web application for coordinating collective work events within relational labor pools. It is a UX-first front end for the Commitment Pooling Protocol (CPP), designed to make the ancient practice of rotational labor associations digitally accessible without destroying the social fabric that makes them work.

The core loop: a group of people form a pool. Any member can host a "barn raise" — a work party where others show up to help. Contributors earn labor hours. Over time, everyone both gives and receives. The system tracks commitments, surfaces accountability, and coordinates logistics — but the social relationships remain the foundation.

Barn Raise is the second "solidarity primitive" in the OpenCivics civic utility stack, designed to compose with Tool Potluck (material/resource coordination) and future modules for governance, funding, and identity.

---

## Product Vision

**For** communities, neighbors, cooperatives, and mutual aid networks
**Who** need to coordinate collective labor for projects too big for any individual
**Barn Raise is** a rotational labor coordination tool
**That** makes it simple to form labor pools, host work events, track reciprocal commitments, and build trust through visible participation
**Unlike** time banking platforms (which handle bilateral exchanges) or gig economy apps (which commodify labor)
**Barn Raise** preserves the relational, reciprocal, and bounded nature of traditional rotational labor associations while giving them digital infrastructure

---

## Design Philosophy

### Core Principles

**1. Relational, not transactional.** Labor hours exist within pools of people who know each other. Points are not globally fungible. The pool is the trust boundary.

**2. Earn by giving.** You accumulate hours by showing up for others. The system rewards contribution, not consumption.

**3. One hour = one hour.** All labor is valued equally. A carpenter's hour and a cook's hour earn the same credit. This is the egalitarian principle that sustains every rotational labor tradition worldwide.

**4. Bounded pools, social accountability.** Pools are small enough for reputation to matter. Transparency — not algorithmic enforcement — is the primary accountability mechanism.

**5. The host invests.** The person calling a barn raise isn't just receiving free labor — they're committing their own hours to the pool and taking responsibility for the event (direction, safety, hospitality).

**6. Composable, not comprehensive.** Barn Raise does one thing well: labor coordination. Material needs go to Potluck. Governance goes to other tools. Identity and trust go to TrustGraph. The system is modular.

### Ancestral Design References

This tool formalizes patterns that have operated for millennia under many names: Mweria (Kenya), Minga (Andes), Tequio (Oaxaca), Mutirão (Brazil), Ayni (Bolivia/Peru), Gotong Royong (Indonesia), Letsema (South Africa), and barn raising (North America). The design must honor these traditions by maintaining their essential character — reciprocity within relationship — while making them accessible through digital coordination.

### Technical Foundation: Commitment Pooling Protocol

Barn Raise is built on top of the Commitment Pooling Protocol (CPP) developed by Grassroots Economics Foundation. CPP provides four core interfaces that map directly onto Barn Raise's functionality:

| CPP Interface | Barn Raise Implementation |
|---|---|
| **Curation** | Pool creation and membership management — who is in the pool, what commitments are recognized |
| **Valuation** | 1 hour = 1 point, uniform across all labor types within a pool |
| **Limitation** | Caps on event size, frequency guardrails, balance visibility to prevent exploitation |
| **Exchange** | Points earned through verified labor participation, redeemable by hosting future events |

Barn Raise interacts with Sarafu Network (open source dApp on Celo) as its backend ledger, with the option for pools to operate off-chain in V1 and migrate to on-chain representation when ready.

---

## User Personas

### Pool Steward (Creator/Admin)

Someone embedded in a community who sees the need for mutual labor support. They create the pool, invite initial members, and set the tone. Often a neighborhood organizer, cooperative member, or community leader. Moderate technical literacy — comfortable with web apps but not necessarily crypto-native.

*Motivation:* "We keep hiring contractors for things we could help each other with. I want to formalize the mutual aid that already happens informally so it's more reliable and more people participate."

### Event Host

A pool member who needs help with a specific project — moving, building, gardening, cleaning, event setup, harvest, renovation. They define the work, set the labor budget, and verify participation afterward.

*Motivation:* "I need to move this Saturday and I can't afford movers. I've helped three other people in the pool this month — now it's my turn to ask."

### Contributor

A pool member who shows up to work events, earns hours, and builds reputation within the pool. May range from highly active (attending multiple events per month) to occasional.

*Motivation:* "I have free weekends and I like helping people. I also know that when I need to reroof my shed, I'll have hours banked and people who'll show up."

### New Member

Someone who's been invited to join a pool but hasn't yet participated. Needs clear onboarding, understanding of how the system works, and a low barrier to first participation.

*Motivation:* "My neighbor invited me to this thing. I'm curious but not sure what I'm committing to."

---

## Functional Requirements

### Module 1: Pools

Pools are the atomic unit of Barn Raise. Everything — events, points, reputation — exists within the context of a pool.

#### 1.1 Pool Creation

- Any user can create a pool
- Required fields:
  - **Pool name** (e.g., "North Boulder Neighbors," "Sunrise Farm Crew")
  - **Description** — what the pool is for, what kinds of work it covers
  - **Location** (optional) — geographic anchor (neighborhood, town, bioregion)
  - **New member policy:** Open (anyone with a link can join), Invite-only (existing members can invite), or Approval (new members require steward approval)
- Pool receives a unique shareable link and invite code
- Creator becomes the initial Pool Steward

#### 1.2 Pool Membership

- Members join via invite link, invite code, or request (depending on pool policy)
- Each member has a pool-specific profile showing:
  - **Hours earned** (total labor contributed to others' events)
  - **Hours spent** (total labor received from hosting events)
  - **Balance** (earned minus spent)
  - **Events attended** (count and list)
  - **Events hosted** (count and list)
  - **Attendance reliability score** (events attended / events claimed — visible to pool members)
  - **Member since** date
- Members can belong to multiple pools simultaneously
- Members can leave a pool at any time (their historical record remains visible to the pool)
- Minimum pool size: 3 members to activate event creation

#### 1.3 Pool Governance

- **Steward role:** One or more members designated as stewards. Stewards can:
  - Approve/deny membership requests
  - Remove members (with reason visible to the pool)
  - Edit pool description and settings
  - Designate additional stewards
- **Transparency log:** All steward actions (approvals, removals, setting changes) are logged and visible to pool members
- Pool-level settings:
  - **New member starting balance:** 0-5 hours (default: 2). This is the "regenerative debt" — a community investment in new members that creates positive obligation
  - **Maximum negative balance:** How far into "debt" a member can go by hosting events without contributing (default: -10 hours). Prevents exploitation
  - **Event frequency limit:** Optional cap on how often a single member can host (e.g., max 1 event per week)

#### 1.4 Pool Dashboard

- Overview showing:
  - Total pool hours exchanged (all time)
  - Active members count
  - Upcoming events
  - Recent activity feed
  - Member leaderboard (hours contributed — opt-in visibility)
  - Pool health indicators (ratio of give-to-receive across members, participation trends)

### Module 2: Events (Barn Raises)

Events are the core interaction unit — a specific work party hosted by a pool member.

#### 2.1 Event Creation

- Any pool member can create an event (subject to pool-level frequency limits and balance constraints)
- Required fields:
  - **Title** (e.g., "Saturday Garden Build," "Help Us Move!")
  - **Description** — what the work involves, what skills are helpful (not required), what the host provides (food, drinks, tools)
  - **Date and time** — start time and estimated end time
  - **Location** — address or description
  - **Total labor hours needed** — the host's estimate of total person-hours required
  - **Maximum participants** — how many people can contribute
  - **Minimum participants** — threshold below which the event doesn't make sense (optional)
- Optional fields:
  - **Skill tags** — categories like "physical labor," "gardening," "construction," "cooking," "cleaning," "tech," "childcare," "moving," "painting," etc. These are descriptive, not gatekeeping — they help contributors self-select
  - **Potluck link** — URL to an associated Tool Potluck for material/tool needs
  - **Photos** — of the project site or work to be done
  - **Flexible hours** — toggle that allows contributors to claim partial shifts (e.g., "I can do 3 of the 6 hours")

#### 2.2 Event States

Events move through a lifecycle:

```
DRAFT → OPEN → CONFIRMED → IN PROGRESS → COMPLETED → VERIFIED
                    ↓
                CANCELLED
```

- **Draft:** Host is editing, not yet visible to pool
- **Open:** Published to pool, accepting claims
- **Confirmed:** Minimum participants reached (or host manually confirms). Claims still accepted up to max
- **In Progress:** Event date/time has arrived
- **Completed:** Event end time has passed, awaiting host verification
- **Verified:** Host has confirmed attendance; points distributed
- **Cancelled:** Host cancelled (claimed slots released, no point impact)

#### 2.3 Slot Claiming

- Pool members browse upcoming events and claim slots
- When claiming, the contributor specifies:
  - **Hours committed** — how many hours they plan to contribute (if flexible hours is enabled, this can be less than the full event duration)
- The event page shows:
  - Total hours needed vs. hours claimed
  - Visual progress indicator (e.g., "14 of 20 hours claimed")
  - List of committed contributors (names and hours)
  - Remaining slots/hours available
- Contributors can modify their claim (increase/decrease hours) until the event starts
- Contributors can cancel their claim before the event (no penalty if done 24+ hours before; flagged if done within 24 hours — visible on their profile)

#### 2.4 Post-Event Verification

- After the event ends, the host enters verification mode
- Host sees list of all claimed contributors and confirms:
  - **Showed up:** Yes / No
  - **Hours actually worked:** May differ from hours claimed (e.g., someone claimed 4 but stayed 6, or claimed 4 and left after 2)
- Verification triggers point distribution:
  - Confirmed contributors receive points equal to their verified hours
  - The host's balance decreases by the total verified hours distributed
  - No-shows (claimed but didn't attend) receive:
    - **No points** for the event
    - **Reliability score impact** — their attendance reliability percentage decreases
    - A visible "no-show" flag on their profile for this event
- If a contributor disputes the host's verification, the dispute is visible to the pool and can be discussed — but there is no automated arbitration in V1. Social resolution within the pool is the mechanism.

#### 2.5 Event Page (Public-Facing)

- Every event has a shareable URL (works for non-members to view, but claiming requires pool membership)
- The event page is the primary viral surface — it needs to be compelling enough that someone shares it and their friends want to join the pool to participate
- Page displays:
  - Event details (title, description, date, location, skills)
  - Host profile (name, pool history, reliability)
  - Current claim status (visual progress)
  - Pool context (pool name, size, description)
  - Call to action: "Join this pool to participate" (for non-members) or "Claim a slot" (for members)
  - Potluck embed (if linked) showing material/tool needs

### Module 3: Points & Reputation

#### 3.1 Point Mechanics

- **Earning:** Points are earned by having labor verified by an event host. 1 verified hour = 1 point.
- **Spending:** Points are "spent" by hosting events. When a host's event is verified, their balance decreases by the total hours distributed.
- **Starting balance:** New members receive the pool's configured starting balance (default: 2 hours). This allows new members to host a small event before they've contributed, creating the "regenerative debt" that pulls them into reciprocity.
- **Negative balance:** Members can go into negative balance up to the pool-configured limit. Going negative means you've received more than you've given — this is visible and creates social pressure to contribute.
- **Points are pool-scoped.** A member's points in Pool A are completely separate from their points in Pool B. There is no cross-pool point transfer in V1.

#### 3.2 Reputation Signals

Reputation is not a single score but a set of transparent signals visible to pool members:

- **Attendance reliability:** Events attended / Events claimed (percentage). A no-show drops this number.
- **Contribution ratio:** Hours earned / Hours spent. Above 1.0 means net giver; below 1.0 means net receiver.
- **Participation history:** Timeline of events attended and hosted, visible on member profile.
- **No-show record:** Specific events where the member claimed but didn't attend, with dates.
- **Late cancellation count:** Claims cancelled within 24 hours of an event.
- **Member tenure:** How long they've been in the pool.

These signals are descriptive, not prescriptive. The pool decides what they mean socially. A new member with a 0.3 contribution ratio is expected — they're ramping up. A long-standing member with a 0.3 ratio and multiple no-shows is a different story, and the pool can address it through conversation or steward action.

#### 3.3 No-Show Consequences

When a host marks a contributor as a no-show during verification:

1. The contributor receives **0 points** for the event
2. Their **attendance reliability score** decreases
3. A **no-show flag** appears on their event history (visible to pool members)
4. If a contributor accumulates **3 no-shows within a rolling 90-day window**, they receive a system notification and a flag on their profile visible to stewards. Stewards can then take action (conversation, warning, or removal) at their discretion
5. No automated bans or penalties beyond visibility. The social layer handles enforcement.

### Module 4: Notifications & Communication

#### 4.1 Notification Types

- **New event in your pool** — when a pool member creates an event
- **Slot claimed on your event** — when someone claims a slot on an event you're hosting
- **Event confirmed** — when minimum participants reached
- **Event reminder** — 24 hours before an event you've claimed
- **Verification request** — prompting hosts to verify attendance after an event
- **Verification complete** — confirming points earned/lost after host verifies
- **New member joined** — when someone joins your pool
- **Invite received** — when you're invited to a pool

#### 4.2 Communication Channels

- In-app notifications (always on)
- Email digest (configurable: instant, daily, weekly, off)
- Future: SMS/text for event reminders (V2)
- No in-app messaging in V1 — pools are expected to have their own communication channels (group text, Signal, Discord, etc.)

### Module 5: User Accounts & Identity

#### 5.1 Authentication

- Email/password signup (V1 baseline)
- Magic link / passwordless login
- Future: wallet connection for CPP/Sarafu Network integration (V2)
- Future: Sign-in with Ethereum for on-chain identity (V2)

#### 5.2 User Profile

- Display name
- Profile photo (optional)
- Bio (optional)
- Location (optional — neighborhood-level, not precise)
- Skills/offerings (free-form tags)
- Pool memberships (list of pools with per-pool stats)
- Cross-pool aggregate stats (total hours contributed across all pools — visible only to the user themselves, not to pool members, to preserve pool-scoped accountability)

---

## CPP Integration Architecture

### V1: Off-Chain with CPP-Compatible Data Model

In V1, Barn Raise operates as a traditional web application with a database that mirrors CPP data structures:

- **Pools** map to CPP Commitment Pools
- **Members** map to CPP participants with Community Asset Vouchers representing their labor commitments
- **Points** map to CPP voucher balances
- **Events** are a Barn Raise-specific coordination layer on top of CPP (events don't have a direct CPP analog — they're the UX innovation)

The data model is designed so that a pool can "upgrade" to on-chain representation on Sarafu Network without restructuring. Each pool's point ledger can be exported as a set of CAV transactions.

### V2: Hybrid On-Chain Integration

- Pools that choose to go on-chain create a corresponding Commitment Pool on Sarafu Network
- Labor hour vouchers become CAVs on Celo
- Point balances become verifiable on-chain
- Cross-pool exchange becomes possible through CPP's liquidity pool mechanism
- TrustGraph attestations can inform cross-pool trust (a member with high trust attestations in Pool A carries that signal into Pool B)

### V2+: Full CPP Native

- Barn Raise becomes a pure front-end for CPP
- All pools, balances, and transactions live on Sarafu Network
- Barn Raise adds event coordination UX, notification infrastructure, and the public event page — none of which CPP currently provides
- Other front-ends could interact with the same underlying pools

---

## Technical Specifications

### Stack (Recommended)

- **Frontend:** Next.js (React) — consistent with existing OpenCivics tooling
- **Backend:** Next.js API routes or separate Node.js service
- **Database:** PostgreSQL (relational data model maps well to pools/members/events/points)
- **Auth:** NextAuth.js with email/magic link providers, extensible to wallet connect
- **Hosting:** Vercel (frontend) + managed Postgres (Supabase, Neon, or Railway)
- **Notifications:** Email via Resend or SendGrid; in-app via database polling or WebSocket

### Data Model (Core Entities)

```
User
  - id, email, display_name, avatar_url, bio, location, skills[], created_at

Pool
  - id, name, description, location, join_policy (open|invite|approval)
  - starting_balance, max_negative_balance, event_frequency_limit
  - created_at, created_by (User)

PoolMembership
  - id, pool_id, user_id, role (member|steward), joined_at
  - starting_balance_granted (hours)

Event
  - id, pool_id, host_id (User), title, description
  - date_start, date_end, location, location_coords
  - total_hours_needed, max_participants, min_participants
  - skill_tags[], potluck_url, flexible_hours (boolean)
  - status (draft|open|confirmed|in_progress|completed|verified|cancelled)
  - created_at

EventClaim
  - id, event_id, user_id, hours_committed
  - status (claimed|cancelled|verified_attended|verified_noshow)
  - hours_verified (actual hours confirmed by host)
  - cancelled_at, verified_at

PointTransaction
  - id, pool_id, user_id, event_id
  - type (earn|spend|starting_balance)
  - hours, created_at

AuditLog
  - id, pool_id, actor_id (User), action, target_type, target_id
  - details (JSON), created_at
```

### API Surface (Key Endpoints)

```
# Pools
POST   /api/pools                    — Create pool
GET    /api/pools/:id                — Get pool details + dashboard data
POST   /api/pools/:id/join           — Join pool (or request to join)
POST   /api/pools/:id/invite         — Invite user to pool
PATCH  /api/pools/:id/settings       — Update pool settings (steward only)
DELETE /api/pools/:id/members/:uid   — Remove member (steward only)

# Events
POST   /api/pools/:id/events         — Create event
GET    /api/events/:id               — Get event details (public)
PATCH  /api/events/:id               — Update event
POST   /api/events/:id/claim         — Claim a slot
DELETE /api/events/:id/claim         — Cancel a claim
POST   /api/events/:id/verify        — Submit verification (host only)

# Users
GET    /api/users/me                 — Get own profile + cross-pool stats
GET    /api/users/:id/pool/:pid      — Get user's pool-specific profile
GET    /api/pools/:id/members        — List pool members with stats

# Notifications
GET    /api/notifications            — Get user's notifications
PATCH  /api/notifications/settings   — Update notification preferences
```

---

## UX Requirements

### Design Language

Barn Raise should feel warm, grounded, and communal — not corporate, not crypto-native. Think community bulletin board meets modern web app. The aesthetic should communicate: "this is a place where real people help each other."

- **Typography:** Approachable, humanist sans-serif. Nothing too techy or too playful
- **Color palette:** Earthy, warm — ambers, deep greens, warm grays, terracotta accents. Not the typical Web3 palette
- **Imagery/iconography:** Hand-drawn or organic illustration style for empty states and onboarding. Photography of real community work events where possible
- **Tone of voice:** Direct, warm, unpretentious. "You earned 4 hours helping Sarah move" not "4 $LABOR tokens credited to your wallet"

### Key Screens

1. **Home / My Pools** — List of pools you belong to, quick stats, upcoming events across all pools
2. **Pool Dashboard** — Pool overview, member list, upcoming events, recent activity, pool health
3. **Create Event** — Step-by-step event creation form with preview
4. **Event Page** — The showpiece. Shareable, compelling, shows progress toward filling the event. Must work beautifully as a shared link
5. **Event Verification** — Post-event screen for host to confirm attendance and hours
6. **Member Profile (Pool Context)** — Per-pool reputation signals, event history, contribution stats
7. **Pool Settings** — Governance configuration (steward only)
8. **Onboarding** — Explain the concept, join first pool, understand how points work

### Mobile-Responsiveness

- V1 is web-first but must be fully responsive
- The event page and claim flow must work flawlessly on mobile (this is how people will interact on the day of an event)
- V2 consideration: PWA or native app

---

## V2 Roadmap (Prioritized)

### V2.1: On-Chain Identity & TrustGraph Integration

- Wallet connection (Celo / Ethereum) for users who want on-chain identity
- EAS (Ethereum Attestation Service) attestations for verified labor contributions
- TrustGraph integration: trust scores from attestations inform cross-pool reputation
- Hats Protocol compatibility: pool steward role can be represented as a Hats NFT
- This layer is optional — pools can continue operating fully off-chain

### V2.2: Cross-Pool Event Collaboration

- Two or more pools can co-host an event
- Members of all participating pools can claim slots
- Points earned go to the contributor's home pool
- The hosting pool (or designated lead pool) manages verification
- Cross-pool events require steward approval from all participating pools
- This is event-specific collaboration, not permanent pool merging

### V2.3: Token Layer

- Pools that opt in can create a CAV (Community Asset Voucher) on Sarafu Network representing their labor hours
- Pool-level configuration for token parameters (what 1 hour is worth in the pool's CAV)
- Liquidity pool creation for cross-pool exchange via CPP
- Bonding curve or flat-rate mechanism for fiat on/off ramps (pool-configured)
- This is strictly opt-in and per-pool — pools that want to stay off-chain and non-tokenized can do so indefinitely

### V2.4: Potluck Integration

- Embed a Tool Potluck directly within a Barn Raise event
- Material needs and labor needs shown side-by-side on the event page
- Contributors can offer labor, materials, or both
- Potluck contributions don't earn labor points (they're a separate value stream) but are tracked and visible

---

## Success Metrics

### V1 Launch Targets (First 6 Months)

- **5+ active pools** with 10+ members each
- **20+ completed and verified events**
- **100+ total labor hours exchanged** through the platform
- **>70% attendance reliability** across all claims
- **>50% of pool members** have both hosted and contributed at least once
- **Event page share rate:** >30% of events shared outside the platform (measured by unique visitors from shared links who are not pool members)

### Health Indicators (Ongoing)

- **Reciprocity ratio:** Distribution of give-to-receive ratios across pool members. Healthy pools show a bell curve centered near 1.0. Unhealthy pools show a bimodal distribution (chronic givers and chronic takers)
- **New member activation:** % of new members who attend their first event within 30 days of joining
- **Pool retention:** % of members still active after 90 days
- **No-show rate:** Target <15% of claims
- **Event fill rate:** % of available hours claimed before event date. Target >60%

---

## Open Questions (Flagged for Resolution During Development)

1. **CPP integration timeline.** Should V1 include any on-chain interaction with Sarafu Network, or should it be purely off-chain with a CPP-compatible data model? Recommendation: start off-chain, validate the UX, then bridge.

2. **Geographic scoping.** Should pools have geographic boundaries, or is that purely social? If a pool is "North Boulder Neighbors," does the system enforce proximity, or is that just a naming convention?

3. **Pool discovery.** In V1, pools are found through direct invites. Should there be a pool directory for open pools? This could accelerate adoption but could also undermine the relational nature of the system.

4. **Recurring events.** Many ROLA scenarios involve recurring commitments (e.g., "we do farm days every second Saturday"). Should events support recurrence, or is each event standalone?

5. **Dispute resolution beyond visibility.** V1 relies on social resolution for disputes. If this proves insufficient, what's the escalation path? Options include: steward mediation, pool-wide vote, or integration with a more formal dispute resolution protocol.

6. **Accessibility and low-tech access.** Traditional ROLAs work for people without smartphones. Should Barn Raise have a SMS/USSD interface for low-connectivity contexts? (This is where Sarafu Network's existing USSD infrastructure could be leveraged.)

7. **Legal structure.** Does Barn Raise need any legal wrapper? Labor exchange systems can sometimes trigger regulatory questions around labor law, tax implications of in-kind exchange, or money transmission (if tokens are involved). This needs legal review before V2.3 (token layer).

---

## Appendix A: Competitive / Adjacent Landscape

| Project | Relationship to Barn Raise |
|---|---|
| **Sarafu Network / CPP** | Backend protocol. Barn Raise is a UX layer for CPP applied to labor coordination |
| **Breadchain** | Philosophical ally. "Solidarity primitives" framing. Potential ecosystem partner for distribution |
| **hOurworld / TimeBanks.org** | Adjacent but different. Time banks do bilateral 1:1 exchanges. Barn Raise does many-to-one collective events |
| **Coordinape** | Interesting pattern for post-event distribution. Peer-based allocation instead of host verification |
| **Tool Potluck** | Composable partner. Handles material coordination alongside Barn Raise's labor coordination |
| **TrustGraph** | V2 integration for cross-pool trust and attestation-based reputation |

## Appendix B: Ancestral Pattern References

| Tradition | Region | Key Design Insight |
|---|---|---|
| **Mweria** | Kenya (Mijikenda) | Reciprocal obligation enforced by social norms and elder governance. Foundation of CPP |
| **Minga/Mink'a** | Andes (Quechua) | "Asking for help by promising something" — the commitment is the currency |
| **Tequio** | Oaxaca (Zapotec) | Participation history is prerequisite for community leadership. Protected by state law |
| **Mutirão** | Brazil (Tupi) | Non-hierarchical rotating system where everyone is both beneficiary and contributor |
| **Ayni** | Bolivia/Peru | Family reciprocity within collective land — the pool is also a governance unit |
| **Barn Raising** | North America (Amish) | Host provides food/hospitality. The event is social, not just functional |
| **Gotong Royong** | Indonesia | Deeply embedded in national identity. Mutual cooperation as civic duty |
| **Letsema** | South Africa | Connected to Ubuntu — "I am because we are." Labor sharing as expression of collective identity |
