# Barn Raise — Evaluation & Improvement Strategy

**Author:** Engineering review (Claude)
**Date:** 2026-06-09
**Scope:** Full codebase audit against the PRD and Technical Architecture, real backend/HTTP testing, and a first-principles improvement plan toward a production-ready, security-hardened V1.

---

## 0. How this evaluation was performed

- **Static review** of every router, schema, validator, page, and component (`src/**`, `e2e/**`).
- **Build & types:** `pnpm build` (Next 16 / Turbopack) succeeds; `tsc --noEmit` is clean. `eslint` reports **6 errors / 26 warnings** (details in §4).
- **Real backend testing:** I stood up PostgreSQL 16, pushed the Drizzle schema, and drove the **tRPC routers directly against the live database** through a `createCaller` harness exercising the full lifecycle (pool creation → membership → solo & group events → claims → verification → no-show → ledger balances → negative-balance guards). **21/21 invariant checks passed** — the core point-ledger math is correct and the conservation invariant (Σ balances = Σ starting grants) holds.
- **Real HTTP testing:** ran `pnpm start` and exercised SSR routes and the tRPC HTTP endpoint with `curl`. This is how the **critical PII/credential-exposure bug** (§2.1) was confirmed against a running server, not just inferred from code.
- **Browser E2E (Playwright):** could **not** be executed in this environment — the Chromium binary download is blocked by the sandbox network allowlist (`cdn.playwright.dev` → 403 "Host not in allowlist"). The existing `e2e/full-lifecycle.spec.ts` was reviewed statically; coverage gaps are in §6. This is the one dimension of "real front-end testing" I could not complete here and should be run in CI.

---

## 1. Verdict

Barn Raise is a **genuinely impressive V1 implementation** that goes *beyond* the PRD in places (group/co-host "pledging" funding flow, work areas, proportional largest-remainder cost splitting, a polished public event page and dynamic OG image). The data model faithfully mirrors the CPP primitives described in the architecture doc, and the **ledger is event-sourced** (balances are always derived from `point_transactions`, never stored) which is exactly right.

It is **not yet production-ready.** There is one **critical security vulnerability** (unauthenticated exposure of email + `passwordHash`), a class of **authorization/PII over-exposure** issues, a **transactional-integrity gap** in the most important write path (verification), **no rate limiting**, **no server-side route protection**, and a set of **PRD feature gaps** (notification email/digest, disputes, draft events, onboarding, leaderboard, frequency-limit enforcement). The frontend has accessibility and shared-logic-duplication debt.

**Readiness scorecard (1–5):**

| Dimension | Score | Notes |
|---|---|---|
| Data model / ledger correctness | 5 | Event-sourced, conserved, verified by live tests |
| Core lifecycle functionality | 4 | Works end-to-end; some PRD flows missing |
| Security | 2 | Critical leak + systemic over-exposure, no rate limiting |
| Transactional integrity | 2 | No DB transactions on multi-write paths |
| Authorization | 3 | tRPC-gated, but no route protection, leaky projections |
| Accessibility | 2 | `confirm()`, missing ARIA, focus, labels |
| Test coverage | 2 | Happy-path E2E only; no unit tests; no error cases |
| PRD completeness | 3 | Strong core, several modules absent |
| Code hygiene | 3 | Lint errors, duplication, dead imports |

---

## 2. Security findings (ranked)

### 2.1 — CRITICAL: unauthenticated endpoint leaks `email` and `passwordHash`

`events.getById` is a **`publicProcedure`** (`src/server/routers/events.ts:345`) and selects the **entire `accounts` row** for the host and every claimant/pledger:

```ts
// events.ts:375  host — whole row
const host = await ctx.db.query.accounts.findFirst({ where: eq(accounts.id, event.hostId) });
// events.ts:385-392  claimants — whole accounts row
.select({ claim: eventClaims, account: accounts })
.innerJoin(accounts, eq(accounts.id, eventClaims.accountId))
// events.ts:399-404  pledgers — whole accounts row
```

I confirmed against a running server that the HTTP response body includes, for the host and **every participant**: `email`, `passwordHash`, `bio`, `chainAddress`, `custodial`, plus the full internal `pool` config. Because the procedure is public, **anyone with an event link (the deliberately viral surface) can scrape participant emails and password hashes** with a single unauthenticated request:

```
GET /api/trpc/events.getById?batch=1&input={"0":{"json":{"eventId":"<uuid>"}}}
→ ... "host":{ "email":"alice@…", "passwordHash":"$2b$…", … },
      "claims":[ { "account":{ "email":"bob@…", "passwordHash":… } } ] ...
```

**Fix (do this first).** Never select `*` from `accounts` for any client-facing query. Define a single safe projection and reuse it everywhere:

```ts
// src/lib/db/projections.ts
import { accounts } from "@/lib/db/schema";
/** The ONLY account fields any client may receive. */
export const publicAccountColumns = {
  id: accounts.id,
  displayName: accounts.displayName,
  avatarUrl: accounts.avatarUrl,
} as const;
// A slightly richer set for member/profile views (still no email/hash):
export const memberAccountColumns = {
  ...publicAccountColumns,
  bio: accounts.bio,
  locationName: accounts.locationName,
  skills: accounts.skills,
};
```

Then in `events.getById`:

```ts
const claims = await ctx.db
  .select({ claim: eventClaims, account: publicAccountColumns })
  .from(eventClaims)
  .innerJoin(accounts, eq(accounts.id, eventClaims.accountId))
  .where(eq(eventClaims.eventId, input.eventId));

const host = await ctx.db
  .select(publicAccountColumns)
  .from(accounts).where(eq(accounts.id, event.hostId)).then(r => r[0]);
```

Also strip secret fields from the `pool` object returned by a public procedure (don't return governance internals / chain addresses to anonymous callers). Apply the same projection to **every** `innerJoin(accounts …)` listed by grep: `events.ts:388,400,529,1418`, `pools.ts:173,403,709`, `users.ts` profile queries, and the `users.me` / `users.poolProfile` returns (which currently return the full row via `ctx.db.query.accounts.findFirst`).

**Better still:** drop `passwordHash` out of the band entirely by moving credentials to a separate `account_credentials` table (`account_id`, `password_hash`), so the `accounts` table cannot leak a hash even if a future query regresses.

### 2.2 — HIGH: verification is not atomic (ledger corruption risk)

`events.verify` (`events.ts:847-1137`) performs **many sequential writes** — claim status updates, `earn` inserts, `spend` inserts, pledge status updates, the event status update, and the audit log — **with no surrounding `db.transaction()`**. (Grep confirms there is **no** `db.transaction(` anywhere in the routers, even though the architecture doc's reference `verifyEvent` is wrapped in one — `barn-raise-technical-architecture.md:730`.) A crash, timeout, or thrown validation error **midway** leaves the ledger half-applied: e.g. contributors credited but the host never debited, or some claims marked verified while the event stays `completed`. Because balances are derived from these rows, a partial write is a permanent, silently-wrong balance.

`claim`, `cancelEvent`, `pledge`, and `pools.create`/`join` have the same multi-write-without-transaction shape.

**Fix.** Wrap each multi-write mutation in a transaction. `postgres-js` + Drizzle support it directly:

```ts
return await ctx.db.transaction(async (tx) => {
  // …all reads used for guards + all writes go through `tx`…
  // throw inside → automatic ROLLBACK
});
```

The balance/capacity guards (`getAccountBalance`, `getPendingCommitments`) must run **inside** the same transaction so the check and the write are consistent.

### 2.3 — HIGH: claim/pledge over-sell race (TOCTOU)

`claim` (`events.ts:550-676`) checks `participantsCount >= maxParticipants`, then **separately** updates the denormalized counters with `hoursClaimed = hoursClaimed + n`. Two concurrent claims both pass the check and both increment — the event over-fills past `maxParticipants`, and `hoursClaimed` can exceed `totalHoursNeeded`. Same pattern for `pledge` vs. the funding threshold, and for the host **capacity** guard in `create`/`pledge` (two events created in parallel can each pass the balance check and jointly blow past `maxNegativeBalance`).

**Fix.** Inside the transaction, take a row lock on the event before re-reading counts:

```ts
const [ev] = await tx.select().from(events)
  .where(eq(events.id, input.eventId)).for("update");
if (ev.participantsCount >= ev.maxParticipants) throw new TRPCError({ code:"BAD_REQUEST", message:"Event is full" });
// …then insert claim + update counts in the same tx
```

For capacity, lock the member's transactions or use a `pool_memberships` row lock as the serialization point.

### 2.4 — HIGH: no rate limiting anywhere

Grep finds **no** rate limiting. Both the architecture doc (§7.1) and PRD call for it. Unauthenticated `events.getById` (combined with 2.1) is trivially scrapeable; `auth` sign-in/sign-up (`src/lib/auth/index.ts`) is brute-forceable; event/claim creation can be spammed (each `create` fans out a notification to every pool member — an amplification vector).

**Fix.** Add an edge-friendly limiter (e.g. `@upstash/ratelimit` with Vercel KV, or a Postgres token-bucket for self-host). Gate: auth POSTs (per IP+email), all mutations (per `userId`), and the public `events.getById` (per IP). A minimal reusable wrapper:

```ts
// src/lib/rate-limit.ts → call inside protectedProcedure middleware / route handlers
export async function assertWithinLimit(key: string, limit: number, windowSec: number) { … }
```

### 2.5 — MEDIUM: no server-side route protection

There is **no `middleware.ts`** and the dashboard layout (`src/app/(dashboard)/layout.tsx`) renders without checking the session. I confirmed `GET /dashboard` and `/profile` return **200** while unauthenticated (the page shell renders; data is empty because tRPC is gated). Data isn't leaked, but it's a broken UX (infinite skeletons instead of a redirect) and a defense-in-depth gap.

**Fix.** Add `src/middleware.ts`:

```ts
export { auth as middleware } from "@/lib/auth";
export const config = { matcher: ["/dashboard/:path*", "/pools/:path*", "/events/:path*", "/profile/:path*"] };
```

and have it redirect unauthenticated users to `/sign-in?callbackUrl=…`. Keep `/e/:id` and `/join/:id` public.

### 2.6 — MEDIUM: authorization gaps in pool data exposure

`pools.getById` and `pools.members` return data to **any authenticated user**, member or not (membership is fetched but non-membership isn't rejected for the dashboard view; only `pending` is gated — `pools.ts:104`). A non-member can read a pool's full member list, balances, and reciprocity data by guessing/holding a pool id. The PRD's trust model is "the pool is the trust boundary" — member rosters and balances should be **member-only**.

**Fix.** In `pools.getById`/`members`/`activity`/`health`, throw `FORBIDDEN` when the caller has no `active` membership (except for the deliberately public `join` preview, which already has its own minimal SSR projection).

### 2.7 — MEDIUM: `rejectJoin` writes an inconsistent state

`pools.ts:487-490` rejects a pending member by setting `leftAt = now()` **and** `status = 'active'`. A rejected user is now `active`+`left`, which is semantically wrong and pollutes any future query that filters on `status='active'` without also checking `leftAt`. Use a real terminal state, e.g. `status='rejected'`, and notify the user.

### 2.8 — LOW/MEDIUM: misc

- **Env var mismatch.** `.env.local.example:5` sets `NEXTAUTH_SECRET`, but NextAuth v5 reads `AUTH_SECRET` (README is correct). The example file will produce an insecure/dev-fallback secret. Fix the example.
- **Legacy "auto-set password" path** (`auth/index.ts:60-72`): if an account has a null `passwordHash`, the first sign-in attempt **sets whatever password was typed** as the account password. Combined with magic-link accounts (planned), this is an account-takeover footgun. Remove it; require an explicit set-password/reset flow.
- **Upload route** (`src/app/api/upload/route.ts`) validates type by client-supplied `file.type` (spoofable) and writes to `public/uploads` in dev with a server-generated name (good), but there's no content sniffing and no auth-scoped rate limit. Validate magic bytes and cap per-user uploads.
- **`maximumScale:1, userScalable:false`** in `layout.tsx` viewport disables pinch-zoom — an accessibility/WCAG problem on a "fully responsive" product. Remove it.

---

## 3. Functional correctness — what the live tests proved, and the gaps

**Verified correct (21/21):** pool creation + starting-balance grant; capacity = balance + |maxNegative| − pending; over-capacity rejection; claim counts and `confirmed` transition at `minParticipants`; duplicate-claim rejection; verification distributing `earn`/`spend`; no-show yielding 0 points + 0% reliability; host debit; **conservation invariant**; double-verify rejection; non-host verify rejection; group `pledging → open` funding transition; negative-balance guard at verification.

**Functional gaps found in code review:**

1. **`flexibleHours=false` is not enforced.** `claimEventSchema` (`validators/events.ts:44`) and the `claim` handler accept any `hoursCommitted ≥ 1` regardless of the event's `flexibleHours` flag or remaining hours. PRD 2.3 says non-flexible events require committing the full shift, and claims shouldn't exceed remaining need. Add server validation: if `!flexibleHours`, require `hoursCommitted == perPersonShare`/full duration; always reject `hoursClaimed + n > totalHoursNeeded` unless intentionally allowed.
2. **`eventFrequencyLimit` is stored but never enforced.** PRD 1.3 / 2.1. Column exists (`pools.ts` schema) and the create form collects it, but `events.create` never checks how many events the host created in the trailing week. Implement the guard.
3. **No-show "3-in-90-days" steward flag** is implemented in notifications (`events.ts:1096-1131`) ✓, but there is **no persisted flag** on the profile and no UI surface (PRD 3.3). Add a derived signal to `users.poolProfile` (already computes `noShows90d`) and render a steward-visible badge.
4. **Disputes (PRD 2.4) are entirely absent** — no schema, no endpoint, no UI. Either implement a minimal `event_disputes` table + visibility, or explicitly descope for V1 in the PRD.
5. **Draft events (PRD 2.2):** schema allows `status='draft'` and `update` permits editing drafts, but `create` always publishes (`status:'open'`/`'pledging'`) — there is no "save as draft", no draft list, and no preview. Either wire up drafts or remove `draft` from the documented state machine to avoid dead states.
6. **Email / digest notifications (PRD 4.2):** `RESEND_API_KEY` is in the env example and the architecture names Resend, but the notification service (`src/server/services/notifications.ts`) only writes in-app rows — **no email is ever sent**, and there is no `notification_settings` table or preferences UI. This is a whole PRD module (4.2) missing.
7. **`event_reminder` / `verify_request` notifications** are declared types but never emitted (no scheduled job). PRD 4.1. Needs a cron (Vercel Cron) to send 24h reminders and post-event verify prompts.
8. **Leaderboard, onboarding, notification-settings, invite-code (vs. link), transparency-log page** — declared in PRD §1.4/§5/UX but not present as screens.

---

## 4. Code hygiene / lint (must fix before "production ready")

`pnpm lint` → **6 errors, 26 warnings.** Concretely:

- `events.ts:28` and `:56` — `db: any` parameters (`@typescript-eslint/no-explicit-any`). Type these as `Database` (exported from `src/lib/db/index.ts`) or the tx type. Losing the type here is how the §2.1 projection bug stayed invisible.
- `events.ts:113` — `let distributed` never reassigned → `const`.
- `events.ts:1197` and `:1359` — `hoursDiff` computed and unused (dead code in the re-pledge/update paths — verify the pledge accounting is actually correct without it).
- `pools.ts:342` — `removed` assigned, unused.
- ~20 unused-import warnings across pages (`Clock`, `Users`, `CheckCircle2`, `User`, `Button`, etc.) and two `<img>`-instead-of-`next/image` warnings (`pools/[id]/page.tsx:133`, `avatar-circle.tsx:20`).

These are individually trivial but collectively signal the absence of a CI gate. **Add `lint` + `tsc --noEmit` + the integration test to CI and make them blocking.**

### Duplication to extract (DRY)

- **Balance/derivation SQL is copy-pasted** as raw `sql\`coalesce(sum(case when tx_type …\`` in at least 6 places (`events.ts:31`, `pools.ts:130,140,174,536,642`, `users.ts:41,128`). Extract one helper, e.g. `balanceExpr(poolIdCol, accountIdCol)` returning the Drizzle `sql` fragment, or a SQL view `pool_balances` (the architecture doc already specifies a materialized view — `barn-raise-technical-architecture.md:508`). A single source removes the risk of these drifting.
- **Front-end:** skill-tag picker is duplicated in event-create / event-edit / profile; work-area add/remove logic duplicated in create/edit; balance-color and reliability-color ternaries repeated 4+ times each. Extract `<SkillPicker/>`, `<WorkAreaEditor/>`, and `lib/ui/colors.ts` (`balanceColor`, `reliabilityColor`).
- **Date formatting** is inconsistent (`formatDate` util vs. inline `toLocaleDateString` in several pages, including the OG route). Standardize on one tz-aware formatter.

---

## 5. Frontend / UX (detailed)

**Strengths:** cohesive warm design system matching the PRD's "community bulletin board" intent; good loading/empty states on most pages; the public event page and OG image route are strong viral surfaces; group-hosting and work-areas UIs are genuinely good.

**Issues to fix:**

- **`window.confirm()` for destructive actions** (event cancel — `events/[id]/edit/page.tsx`; member removal — `pools/[id]/settings/page.tsx`). Not accessible, not testable, and the edit-cancel path fires the mutation regardless of the confirm result in at least one spot. Replace with a Radix `AlertDialog` (already a dependency).
- **Unhandled async failures:** `navigator.clipboard.writeText(...)` (event detail share) and avatar/banner uploads (`profile`, `events/new`) swallow rejections with no user feedback. Add `.catch` + toast.
- **Accessibility:** attendance toggles (verify page) and work-area selectors lack `role`/`aria-selected`/`aria-pressed`; calendar/map popovers aren't keyboard-operable or `aria-expanded`; several icon-only buttons lack `aria-label`; viewport disables zoom (see 2.8). Run `@axe-core/playwright` in CI.
- **`join/[poolId]/client.tsx` uses `formatDate` without importing it** — a likely runtime ReferenceError on that path (flagged by the frontend review; verify and fix).
- **Timezone:** the edit page's local⇄ISO datetime conversion is naive around DST; the OG/metadata date uses server locale. Use a single tz-aware utility and render event times in the **event's** locale where possible.
- **Memory leak:** avatar preview `URL.createObjectURL` is never `revokeObjectURL`'d.
- **OG/metadata:** `description` changes every request (live hours remaining) which defeats social-scraper caching; add `schema.org/Event` JSON-LD to `/e/[id]` for richer unfurls and SEO.

---

## 6. Testing strategy (this is the biggest process gap)

Current state: **one** Playwright happy-path spec; **zero** unit/integration tests; no CI. The architecture doc's whole §8 testing plan is unimplemented.

**Recommended, in priority order:**

1. **Server integration tests (highest ROL).** The `createCaller` harness I used for this audit is the template: spin up a disposable Postgres (Testcontainers or a CI service), `drizzle-kit push`, then call routers with synthetic sessions and assert ledger invariants. Port my 21 checks into `vitest` and **add the missing cases**: no-show reliability math, group proportional split (largest-remainder) with awkward ratios, capacity with multiple concurrent pending commitments, `maxNegativeBalance` rejection at verify, frequency-limit (once implemented), and the §2.3 race (run N parallel claims, assert no over-sell — this will *fail* until the row-lock fix lands, which is exactly what you want).
2. **Unit tests** for pure functions: `splitProportional` (`events.ts:101`), `generatePoolSymbol`, `eventBannerGradient`, capacity arithmetic.
3. **E2E** (`@playwright/test`): keep the lifecycle spec; add cancel-claim/late-cancel, no-show, group pledging+withdraw, approval-pool join+approve, member removal, and **a11y assertions**. Note: in this sandbox the browser download is blocked, so E2E must run in CI/an environment that allows `cdn.playwright.dev`.
4. **CI gate:** `tsc --noEmit` + `eslint` (zero errors) + integration tests on every PR; E2E nightly.

---

## 7. CPP / architecture alignment

The schema is a faithful CPP mirror (bridge fields `chainAddress`/`chainTxHash`, `vouchers` as CAVs, `decimals=6`, `value` in smallest units alongside human `hours`). Two notes:

- The `value` smallest-unit field is written as `actualHours * 1_000_000` (`events.ts:924` etc.) — correct for `decimals=6`, but it **hard-codes** the multiplier instead of deriving from `voucher.decimals`. If a pool ever uses different decimals, the ledger desyncs. Use `10 ** voucher.decimals` as the architecture sample does.
- The architecture specifies a **materialized view `pool_balances`** refreshed in the verify transaction. The app instead recomputes balances ad hoc on every read (fine at current scale, and arguably simpler/safer than a stale matview), but the inconsistency between doc and code should be reconciled — I'd **keep the derived-query approach** and update the doc, or introduce the view only if read latency becomes a problem.

---

## 8. Prioritized roadmap

**P0 — security & integrity (before any real users):**
1. Safe `accounts` projection everywhere; move `passwordHash` to a separate table (§2.1).
2. Wrap `verify`, `claim`, `cancelEvent`, `pledge`, `pools.create/join` in `db.transaction()` (§2.2).
3. Row-lock the over-sell / capacity paths (§2.3).
4. Add rate limiting on auth + mutations + public `getById` (§2.4).
5. `middleware.ts` route protection + member-only pool reads (§2.5–2.6).
6. Remove the auto-set-password path and fix the env-example secret (§2.8).

**P1 — correctness & CI:**
7. Enforce `flexibleHours` and remaining-hours on claim; enforce `eventFrequencyLimit` (§3).
8. Fix the 6 lint errors; type away `db: any`; extract the balance SQL helper/view (§4, §7).
9. Stand up CI with the integration-test harness + the concurrency regression test (§6).
10. Fix `rejectJoin` state, `join` page missing import, datetime/DST, confirm()→AlertDialog, upload validation (§2.7, §5).

**P2 — PRD completeness:**
11. Email/digest notifications + preferences (Resend) and the reminder/verify-request cron (§3.6–3.7).
12. Drafts + preview, leaderboard, onboarding, transparency-log page, invite codes, disputes (or descope in PRD) (§3).
13. Accessibility pass + a11y tests; shared `<SkillPicker>`/`<WorkAreaEditor>`/color utils (§4–5).

**P3 — polish & scale:**
14. `schema.org` JSON-LD, OG caching, image optimization, observability/error reporting, and the §7 decimals/matview reconciliation.

---

## 9. One-paragraph summary

Barn Raise has an excellent foundation: a correct, event-sourced, CPP-aligned ledger (proven by live tests) and a thoughtful, warm UI that already exceeds the PRD in several flows. To be production-ready it needs, in order: to stop leaking emails/password-hashes from the public event endpoint, to make its multi-write paths transactional and race-safe, to add rate limiting and route protection, to close the `flexibleHours`/frequency-limit/email-notification PRD gaps, and to put a real test suite behind a CI gate. None of these are deep redesigns — the architecture is sound; the work is hardening it.

---

## 10. Implementation Status (execution log)

This section records what was actually implemented against the plan above, with
verification. All changes are covered by a vitest integration suite (25 tests)
driving the real tRPC routers against Postgres; the production build, `tsc
--noEmit`, and `eslint` are all green (lint: 0 errors; 4 remaining warnings are
`<img>` on user-uploaded content).

### Done — P0 (security & integrity)
- **PII/credential leak (2.1):** added `src/lib/db/projections.ts` and applied
  safe account/pool projections across every client-facing query; moved the
  password hash into a separate `account_credentials` table so it cannot leak
  even via `select *`. Removed the insecure auto-set-password path.
  Regression test asserts no `passwordHash`/`email` ever serializes from the
  public `events.getById` and that non-members are rejected.
- **Transactional integrity (2.2):** wrapped `events.verify/create/claim/
  cancelEvent/pledge` and `pools.create/join/approveJoin` in
  `db.transaction()`; verify re-checks status under lock (idempotent).
- **Over-sell / capacity races (2.3):** `SELECT … FOR UPDATE` row locks on the
  event row (claim/pledge) and the membership row (create). A concurrency test
  fires 8 parallel claims and asserts exactly 3 succeed.
- **Rate limiting (2.4):** Postgres-backed fixed-window limiter
  (`rate_limits` + `consumeRateLimit`); per-user mutation, per-IP public, and
  per-email sign-in throttles; upload throttle.
- **Route protection (2.5):** server-side auth guard on the `(dashboard)`
  layout (verified `/dashboard` is now dynamic + redirects).
- **Member-only pool reads (2.6):** `members/health/activity` and
  `users.poolProfile` now require active membership.
- **rejectJoin terminal state (2.7); env-secret + zoom + auto-password (2.8).**
- **Bonus:** fixed a leave+rejoin double starting-balance grant (grant is now
  keyed on whether a `starting_balance` tx already exists); test included.

### Done — P1 (correctness & CI)
- Enforced `flexibleHours` (full-shift) and remaining-hours on claim; enforced
  `eventFrequencyLimit`; reject `end <= start`. Tests included.
- Fixed all lint errors; typed away `db: any`; replaced prop→state effects with
  the adjust-state-during-render pattern; removed dead code.
- Extracted the duplicated balance SQL into `src/lib/db/ledger.ts`.
- Stood up GitHub Actions CI (Postgres service → schema push → typecheck +
  lint + tests) and a `scripts/dev-setup.sh` + SessionStart hook for web
  sessions.
- Decoupled the tRPC context from the auth runtime (`src/lib/trpc/context.ts`)
  so routers are unit-testable.

### Done — P2/P3 (selected)
- **Email notifications (PRD 4.2):** Resend helper (`src/lib/email.ts`),
  instant emails on notification, an `email_digest` preference + profile UI,
  and an hourly secret-protected cron (`/api/cron/reminders`) that emits the
  previously-missing 24h reminders and verify requests (deduped). Tests cover
  preference persistence and cron send+dedupe.
- **Accessibility/UX:** accessible `ConfirmDialog` replacing `window.confirm()`
  for destructive actions; safe `copyToClipboard`; shared color utilities;
  re-enabled pinch-zoom.
- **Upload hardening:** magic-byte content sniffing, server-derived extension.
- **schema.org Event JSON-LD** on the public event page (script-escaped).
- Derived ledger smallest-unit value from `voucher.decimals` (§7).

### Not yet done (larger net-new product work — recommended next)
These are feature builds rather than hardening, intentionally deferred:
- Draft events + a pre-publish preview screen.
- Disputes (PRD 2.4) — schema, endpoint, and visibility UI.
- Onboarding flow; member leaderboard view; a dedicated transparency-log page
  (the activity feed already surfaces audit entries); invite *codes* in
  addition to the existing invite link.
- Daily/weekly email digest batching (the preference and the `instant` path
  exist; the digest aggregator/cron is stubbed via the preference but not yet
  implemented).
- Browser E2E (Playwright) could not run here (sandbox blocks the Chromium
  download); the CI workflow is the place to run it.

### Environment note (build resilience)
`next/font/google` fetches fonts at **build time**; in a network-restricted
build (this sandbox, airgapped CI) that fails the build. Recommend
self-hosting the three fonts via `next/font/local` with the woff2 files
committed, to make builds hermetic. (Not changed here to avoid committing
binaries blindly; flagged for follow-up.)
