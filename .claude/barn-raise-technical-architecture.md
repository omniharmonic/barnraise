# Barn Raise — Technical Architecture Document

## Rotational Labor Coordination Utility on the Commitment Pooling Protocol

**Version:** 1.0
**Date:** March 17, 2026
**Status:** Pre-Development
**Classification:** Technical Specification

---

## 1. Architecture Overview

Barn Raise is a web2.5 application — a traditional web application with a data model and integration layer designed for seamless upgrade to on-chain backends. V1 operates with a PostgreSQL database whose schema mirrors the Commitment Pooling Protocol (CPP) data structures used by Grassroots Economics' Sarafu Network. V2 introduces hybrid on-chain capabilities via direct integration with the Sarafu Network smart contracts deployed on the Celo blockchain.

### 1.1 Design Constraint: CPP Compatibility from Day One

The most important architectural decision is that Barn Raise's internal data model is not a bespoke schema that "might someday" map to CPP. It is a deliberate mirror of CPP primitives — Vouchers (CAVs), Pools, Deposits, Withdrawals (Swaps), and Accounts — extended with Barn Raise-specific coordination metadata (Events, Claims, Verification). This means every off-chain operation in V1 has a defined on-chain equivalent for V2 migration.

### 1.2 High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BARN RAISE V1                               │
│                    (Web2.5 Architecture)                            │
│                                                                     │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────────────┐  │
│  │   Next.js    │   │   Next.js    │   │      PostgreSQL        │  │
│  │   Frontend   │──▶│  API Routes  │──▶│    (CPP-Compatible     │  │
│  │  (React/TS)  │   │  /api/v1/*   │   │     Data Model)        │  │
│  └──────────────┘   └──────┬───────┘   └────────────┬───────────┘  │
│                            │                        │              │
│                     ┌──────┴───────┐         ┌──────┴───────┐      │
│                     │   NextAuth   │         │   Hasura /   │      │
│                     │  (Auth Layer)│         │  GraphQL API │      │
│                     └──────────────┘         │  (Optional)  │      │
│                                              └──────────────┘      │
├─────────────────────────────────────────────────────────────────────┤
│                         BARN RAISE V2                               │
│                    (Hybrid On-Chain Layer)                          │
│                                                                     │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────────────┐  │
│  │  Wallet      │   │  GE Custodial│   │   Celo Blockchain      │  │
│  │  Connect     │──▶│  API (Go)    │──▶│                        │  │
│  │  (viem/wagmi)│   │  /api/v2/*   │   │  ┌──────────────────┐  │  │
│  └──────────────┘   └──────────────┘   │  │ ERC20 Demurrage  │  │  │
│                                        │  │ Token (CAV)      │  │  │
│  ┌──────────────┐   ┌──────────────┐   │  ├──────────────────┤  │  │
│  │  TrustGraph  │   │  eth-tracker  │   │  │ ERC20 Pool       │  │  │
│  │  (EAS)       │──▶│  eth-indexer  │──▶│  │ (SwapPool)       │  │  │
│  └──────────────┘   └──────────────┘   │  ├──────────────────┤  │  │
│                                        │  │ Token Registry   │  │  │
│                                        │  │ (ACL)            │  │  │
│                                        │  ├──────────────────┤  │  │
│                                        │  │ Price Index      │  │  │
│                                        │  │ Quoter           │  │  │
│                                        │  ├──────────────────┤  │  │
│                                        │  │ Accounts Index   │  │  │
│                                        │  │ (Pools Index)    │  │  │
│                                        │  └──────────────────┘  │  │
│                                        └────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Sarafu Network Technical Reference

This section documents the actual technical infrastructure of Grassroots Economics' Sarafu Network as of March 2026, sourced directly from their published software documentation at software.grassecon.org and their GitHub repositories. Barn Raise's architecture is designed to integrate with these specific systems.

### 2.1 Blockchain Infrastructure

Sarafu Network runs on the **Celo blockchain** (now transitioning to CEL2, an OP Stack L2). Key facts:

- **Chain:** Celo (L1, migrating to CEL2 L2)
- **Consensus:** Instant finality (no block reorgs) — important for transaction reliability
- **Gas token:** CELO
- **Smart contract language:** Solidity
- **All GE smart contracts are verified on Celoscan**

### 2.2 Smart Contract Architecture

GE's on-chain infrastructure consists of several interacting smart contracts. Understanding these is critical for Barn Raise's V2 integration.

#### 2.2.1 Contract Registry

The entry point for discovering all contracts in the GE realm. A registry maps human-readable identifier names to contract addresses.

**Deployed Address (SarafuNetwork Registry):** `0xd1FB944748aca327a1ba036B082993D9dd9Bfa0C`

Resolution is done via the CIC Registry interface documented at `git.grassecon.net/cicnet/cic-contracts`.

#### 2.2.2 ERC20 Demurrage Token (Community Asset Voucher / CAV)

Each Community Asset Voucher (CAV) is an ERC20-compatible token with an added **demurrage** mechanism — a time-based decay that encourages circulation and discourages hoarding.

**Key properties:**
- Standard ERC20 interface (`transfer`, `approve`, `transferFrom`, `balanceOf`, etc.)
- Demurrage: token balances decay over time at a configurable rate, with decayed tokens flowing to a community fund
- Each CAV is deployed as a separate smart contract instance
- CAVs represent formalized commitments to provide goods/services — they are redeemable IOUs

**For Barn Raise:** In V2, each labor pool's hour-credits would be represented as a CAV — an ERC20 token where 1 token = 1 hour of labor commitment. The demurrage feature is optional but could incentivize timely use of earned hours.

**Source:** `git.grassecon.net/cicnet/erc20-demurrage-token` (Solidity + Python, security-only maintenance)

#### 2.2.3 ERC20 Pool (SwapPool) — The Commitment Pool Contract

This is the core contract that implements Commitment Pools on-chain. It is a **permissioned ERC20 swap pool** that allows deposits (liquidity donations) and withdrawals (token swaps).

**Key interface:**

```solidity
// Deposit tokens into the pool (one-way, no exchange)
function deposit(address token, uint256 value) external;

// Swap tokens: send inToken, receive outToken
function withdraw(address outToken, address inToken, uint256 value) external;

// Fee withdrawal for pool beneficiary
function withdraw(address outToken) external;
function withdraw(address outToken, uint256 value) external;
```

**Constructor parameters:**
- `name` (string) — Pool name (e.g., "North Boulder Labor Pool")
- `symbol` (string) — Pool symbol (e.g., "NBLP")
- `decimals` (uint8) — Token decimals
- `tokenRegistry` (address) — ACL contract controlling which tokens are allowed in the pool
- `tokenLimiter` (address) — Contract controlling value limits per token

**Key design features:**
- The pool itself is ERC20-compatible (has name, symbol, decimals), allowing it to be listed in a TokenRegistry alongside individual CAVs
- Token allowlisting via a **TokenRegistry** contract (CIC ACL interface)
- Per-token value limits via a **Limiter** contract (CIC TokenLimit interface)
- Configurable swap fees in parts-per-million via `setFee(uint256)` (e.g., 5000 = 0.5%)
- Configurable fee recipient via `setFeeAddress(address)`
- External **quoter** contract for price translation between tokens via `setQuoter(address)`
- Contract properties can be sealed (made immutable) via the CIC Seal interface

**Deployed Pools Index:** `0x01eD8Fe01a2Ca44Cb26D00b1309d7D777471D00C`

**Source:** `github.com/grassrootseconomics/erc20-pool` (Solidity + Python)

#### 2.2.4 Token Registry (ACL)

Controls which tokens/CAVs are permitted within a pool.

**Interface:**
```solidity
function add(address token) external;      // Allow a token
function remove(address token) external;   // Disallow a token
function addWriter(address) external;      // Grant write access
```

**Deployed Address (TokensIndex):** `0xe2CEf4000d6003958c891D251328850f84654eb9`

#### 2.2.5 Price Index Quoter

Translates value between different tokens when swapping in a pool.

**Interface:**
```solidity
function setPriceIndexValue(address token, uint256 value) external;
```

**Default unit of account:** 10 KES (Kenyan Shillings), represented as `10_000` with 4 decimal fixed-point precision. So a CAV representing 10 KES of value has price index `10_000`.

**For Barn Raise:** Since all labor hours are valued equally (1 hour = 1 hour), all labor CAVs in a Barn Raise pool would have identical price index values, making swaps effectively 1:1.

#### 2.2.6 Accounts Index (Pools Index)

Resolves allowed pools. Uses the CIC AccountsIndex interface.

**Deployed Address:** `0x01eD8Fe01a2Ca44Cb26D00b1309d7D777471D00C`

### 2.3 Custodial System Architecture

The GE Custodial Stack is the middleware that allows non-web3 clients (USSD phones, Telegram bots, websites) to interact with on-chain smart contracts. This is directly relevant because Barn Raise V1 users will likely not have wallets.

**Architecture components (all written in Go):**

| Component | Purpose | Relevance to Barn Raise |
|---|---|---|
| **eth-custodial** | Creates and manages custodial accounts, signs transactions on behalf of users | V2: Barn Raise could use this to give non-crypto users on-chain accounts |
| **eth-tracker** | Monitors on-chain events and transaction status | V2: Index labor transfers and pool swaps |
| **eth-indexer** | Indexes blockchain data into the CIC Graph database | V2: Populate Barn Raise's read layer from chain data |
| **NATS** | Message broker connecting all custodial services | V2: Event-driven architecture for real-time updates |

**Custodial API (HTTP):**

Base path: `HOST:PORT/api/v2`
Authentication: `X-GE-AUTH` header with API key

Key endpoints relevant to Barn Raise:

```
POST /account/create          — Create a custodial account for a user
GET  /account/status/:address — Check account health
POST /token/transfer          — Transfer tokens between accounts
POST /pool/swap               — Execute a pool swap
POST /pool/quote              — Get a swap quote
GET  /otx/track/:trackingId   — Track transaction status
```

**Response format:**
```json
{
    "ok": true,
    "description": "Success",
    "result": { ... }
}
```

Each mutating operation returns a `trackingId` (UUID) for async transaction tracking.

### 2.4 Data Stack: CIC Graph

CIC Graph is the central PostgreSQL store that indexes:
- Transactional data from the chain
- Custodial user data
- Voucher data (backers, certifications)
- VPAs (Virtual Payment Addresses)
- Marketplace data

**Key technical facts:**
- PostgreSQL with relationships, check constraints, and referential integrity at the DB level
- **Hasura** is the supported GraphQL proxy backend
- Also compatible with **Supabase** and **PostgREST** as alternative proxies
- Migrations managed via `tern` (Go-based SQL migration tool)
- Schema lives in `github.com/grassrootseconomics/cic-graph`

**For Barn Raise V1:** Our PostgreSQL schema should be designed to align with CIC Graph's structure where concepts overlap (accounts, token balances, transactions). For V2, Barn Raise can either:
1. Run its own CIC Graph instance and index from the same chain data, or
2. Query GE's existing CIC Graph via Hasura/GraphQL

### 2.5 Sarafu Network dApp (Frontend Reference)

The sarafu.network dApp is the primary frontend for the entire system.

**Tech stack:**
- **Next.js** (React/TypeScript) — same stack we're using for Barn Raise
- **Wallet connection** via Valora, MetaMask, or WalletConnect
- **Deployment:** Vercel-compatible (Docker also supported)
- **Database:** Connects to CIC Graph (PostgreSQL) via Hasura
- **License:** AGPL-3.0

**Existing features that Barn Raise can reference/reuse:**
- CAV creation flow (voucher creation wizard)
- Pool browsing and swap interface
- Transaction explorer
- Paper wallet creation (for non-smartphone users)
- Social account registration (alias system for USSD-to-wallet mapping)

---

## 3. Barn Raise Data Model

### 3.1 Design Principles

1. **Every entity maps to a CPP primitive.** Pools → SwapPool contracts. Members → Accounts. Points → CAV token balances. Transactions → ERC20 transfers and pool deposits.

2. **V1 uses PostgreSQL as a "local ledger" that mirrors what would exist on-chain.** Every point transaction is recorded with enough metadata to reconstruct the equivalent on-chain transaction.

3. **Bridge-ready fields.** Every entity that could exist on-chain has nullable `chain_address` and `chain_tx_hash` fields. In V1 these are null. In V2, as entities migrate on-chain, these fields get populated.

4. **CIC Graph compatibility.** Where Barn Raise's schema overlaps with CIC Graph tables (accounts, transactions, token metadata), we use compatible column names and types so V2 indexing can merge data.

### 3.2 Schema Definition

```sql
-- ============================================================
-- ACCOUNTS (Maps to CIC Graph accounts / on-chain EOA or custodial)
-- ============================================================
CREATE TABLE accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT UNIQUE,
    display_name    TEXT NOT NULL,
    avatar_url      TEXT,
    bio             TEXT,
    location_name   TEXT,
    location_coords POINT,                          -- PostGIS-ready
    skills          TEXT[],                          -- Free-form skill tags
    
    -- V2 bridge fields
    chain_address   TEXT,                            -- Celo EOA or custodial address
    custodial       BOOLEAN DEFAULT TRUE,            -- TRUE = managed by custodial system
    
    -- Auth
    password_hash   TEXT,                            -- NULL if using magic link only
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- POOLS (Maps to ERC20 SwapPool contracts)
-- ============================================================
CREATE TABLE pools (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  TEXT NOT NULL,              -- Maps to SwapPool constructor: name
    symbol                TEXT NOT NULL,              -- Maps to SwapPool constructor: symbol  
    description           TEXT,
    location_name         TEXT,
    location_coords       POINT,
    
    -- Governance settings
    join_policy           TEXT NOT NULL DEFAULT 'invite'
                          CHECK (join_policy IN ('open', 'invite', 'approval')),
    starting_balance      INTEGER NOT NULL DEFAULT 2,   -- Hours granted to new members
    max_negative_balance  INTEGER NOT NULL DEFAULT -10,  -- Max "debt" in hours
    event_frequency_limit INTEGER,                       -- Max events per member per week
    
    -- V2 bridge fields
    chain_address         TEXT,                       -- Deployed SwapPool contract address
    token_registry_addr   TEXT,                       -- TokenRegistry contract for this pool
    token_limiter_addr    TEXT,                       -- Limiter contract for this pool
    quoter_addr           TEXT,                       -- PriceIndexQuoter contract
    
    -- CPP metadata
    decimals              SMALLINT NOT NULL DEFAULT 6, -- Matches SwapPool constructor
    fee_ppm               INTEGER DEFAULT 0,           -- Fee in parts-per-million
    
    created_by            UUID NOT NULL REFERENCES accounts(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for pool discovery
CREATE INDEX idx_pools_symbol ON pools(symbol);

-- ============================================================
-- POOL MEMBERSHIPS (Maps to AccountsIndex entries)
-- ============================================================
CREATE TABLE pool_memberships (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id                 UUID NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
    account_id              UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    role                    TEXT NOT NULL DEFAULT 'member'
                            CHECK (role IN ('member', 'steward')),
    
    starting_balance_granted INTEGER NOT NULL DEFAULT 0, -- Hours initially credited
    
    -- V2 bridge: was this membership registered on-chain?
    chain_registered        BOOLEAN DEFAULT FALSE,
    
    joined_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at                 TIMESTAMPTZ,                -- NULL if still active
    
    UNIQUE(pool_id, account_id)
);

CREATE INDEX idx_pool_memberships_pool ON pool_memberships(pool_id);
CREATE INDEX idx_pool_memberships_account ON pool_memberships(account_id);

-- ============================================================
-- VOUCHERS (Maps to ERC20 Demurrage Token / CAV contracts)
-- Each pool has a labor-hour voucher
-- ============================================================
CREATE TABLE vouchers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id         UUID NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,             -- e.g., "North Boulder Labor Hours"
    symbol          TEXT NOT NULL,             -- e.g., "NBLH"
    decimals        SMALLINT NOT NULL DEFAULT 6,
    
    -- Unit of account: 1 token = 1 hour of labor
    unit_of_account TEXT NOT NULL DEFAULT 'labor_hour',
    unit_value      INTEGER NOT NULL DEFAULT 1, -- 1 token = 1 hour
    
    -- Demurrage settings (V2)
    demurrage_rate  INTEGER DEFAULT 0,          -- PPM per period
    demurrage_period TEXT DEFAULT 'monthly',     -- Period for demurrage application
    
    -- V2 bridge
    chain_address   TEXT,                       -- Deployed ERC20 demurrage token address
    
    -- Total supply tracking (off-chain mirror)
    total_minted    BIGINT NOT NULL DEFAULT 0,  -- Total ever minted (in smallest unit)
    total_burned    BIGINT NOT NULL DEFAULT 0,  -- Total ever burned
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- EVENTS (Barn Raise-specific; no direct CPP equivalent)
-- This is the UX innovation layer on top of CPP
-- ============================================================
CREATE TABLE events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id             UUID NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
    host_id             UUID NOT NULL REFERENCES accounts(id),
    
    title               TEXT NOT NULL,
    description         TEXT,
    date_start          TIMESTAMPTZ NOT NULL,
    date_end            TIMESTAMPTZ NOT NULL,
    location_name       TEXT,
    location_coords     POINT,
    
    -- Labor specification
    total_hours_needed  INTEGER NOT NULL,        -- Total person-hours requested
    max_participants    INTEGER NOT NULL,
    min_participants    INTEGER DEFAULT 1,
    flexible_hours      BOOLEAN DEFAULT TRUE,    -- Allow partial-shift claims
    
    -- Metadata
    skill_tags          TEXT[],
    potluck_url         TEXT,                    -- Link to Tool Potluck instance
    
    -- Lifecycle
    status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN (
                            'draft', 'open', 'confirmed', 
                            'in_progress', 'completed', 'verified', 'cancelled'
                        )),
    
    -- Aggregate computed fields (denormalized for performance)
    hours_claimed       INTEGER NOT NULL DEFAULT 0,
    hours_verified      INTEGER NOT NULL DEFAULT 0,
    participants_count  INTEGER NOT NULL DEFAULT 0,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_pool ON events(pool_id);
CREATE INDEX idx_events_host ON events(host_id);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_date ON events(date_start);

-- ============================================================
-- EVENT CLAIMS (Pre-event commitments; resolve to point_transactions)
-- ============================================================
CREATE TABLE event_claims (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    account_id      UUID NOT NULL REFERENCES accounts(id),
    
    hours_committed INTEGER NOT NULL,            -- Hours the claimant plans to work
    
    status          TEXT NOT NULL DEFAULT 'claimed'
                    CHECK (status IN (
                        'claimed', 'cancelled', 'verified_attended', 'verified_noshow'
                    )),
    
    hours_verified  INTEGER,                     -- Actual hours confirmed by host
    
    -- Late cancellation tracking
    cancelled_at    TIMESTAMPTZ,
    late_cancel     BOOLEAN DEFAULT FALSE,       -- TRUE if cancelled within 24h of event
    
    -- V2 bridge: the on-chain transaction that settled this claim
    chain_tx_hash   TEXT,
    
    verified_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(event_id, account_id)
);

CREATE INDEX idx_event_claims_event ON event_claims(event_id);
CREATE INDEX idx_event_claims_account ON event_claims(account_id);

-- ============================================================
-- POINT TRANSACTIONS (Maps to ERC20 transfer + pool deposit/withdraw)
-- This is the ledger — the single source of truth for balances
-- ============================================================
CREATE TABLE point_transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id         UUID NOT NULL REFERENCES pools(id),
    voucher_id      UUID NOT NULL REFERENCES vouchers(id),
    account_id      UUID NOT NULL REFERENCES accounts(id),
    
    -- Transaction type maps to on-chain operation:
    --   'earn'             → transfer(pool → contributor)
    --   'spend'            → transfer(host → pool) or mint to pool
    --   'starting_balance' → mint to new member
    tx_type         TEXT NOT NULL
                    CHECK (tx_type IN ('earn', 'spend', 'starting_balance')),
    
    -- Value in smallest unit (with decimals=6, 1_000_000 = 1 hour)
    value           BIGINT NOT NULL,
    
    -- Human-readable hours (convenience field)
    hours           NUMERIC(10,2) NOT NULL,
    
    -- Reference to originating event (NULL for starting_balance)
    event_id        UUID REFERENCES events(id),
    event_claim_id  UUID REFERENCES event_claims(id),
    
    -- V2 bridge
    chain_tx_hash   TEXT,                        -- On-chain transaction hash
    chain_block     BIGINT,                      -- Block number
    chain_confirmed BOOLEAN DEFAULT FALSE,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_point_tx_pool_account ON point_transactions(pool_id, account_id);
CREATE INDEX idx_point_tx_event ON point_transactions(event_id);
CREATE INDEX idx_point_tx_created ON point_transactions(created_at);

-- ============================================================
-- BALANCE VIEW (Materialized for performance)
-- Equivalent to on-chain balanceOf() calls
-- ============================================================
CREATE MATERIALIZED VIEW pool_balances AS
SELECT 
    pm.pool_id,
    pm.account_id,
    COALESCE(SUM(CASE WHEN pt.tx_type IN ('earn', 'starting_balance') THEN pt.hours ELSE 0 END), 0) AS hours_earned,
    COALESCE(SUM(CASE WHEN pt.tx_type = 'spend' THEN pt.hours ELSE 0 END), 0) AS hours_spent,
    COALESCE(SUM(CASE WHEN pt.tx_type IN ('earn', 'starting_balance') THEN pt.hours ELSE 0 END), 0) -
    COALESCE(SUM(CASE WHEN pt.tx_type = 'spend' THEN pt.hours ELSE 0 END), 0) AS balance,
    COUNT(DISTINCT pt.event_id) FILTER (WHERE pt.tx_type = 'earn') AS events_contributed,
    COUNT(DISTINCT pt.event_id) FILTER (WHERE pt.tx_type = 'spend') AS events_hosted
FROM pool_memberships pm
LEFT JOIN point_transactions pt ON pt.pool_id = pm.pool_id AND pt.account_id = pm.account_id
WHERE pm.left_at IS NULL
GROUP BY pm.pool_id, pm.account_id;

CREATE UNIQUE INDEX idx_pool_balances ON pool_balances(pool_id, account_id);

-- Refresh trigger (or scheduled job)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY pool_balances;

-- ============================================================
-- REPUTATION SIGNALS VIEW
-- ============================================================
CREATE VIEW reputation_signals AS
SELECT
    ec.account_id,
    ec.event_id,
    e.pool_id,
    -- Attendance reliability
    COUNT(*) FILTER (WHERE ec.status = 'verified_attended') * 100.0 / 
        NULLIF(COUNT(*) FILTER (WHERE ec.status IN ('verified_attended', 'verified_noshow')), 0)
        AS attendance_reliability_pct,
    -- No-show count (rolling 90 days)
    COUNT(*) FILTER (
        WHERE ec.status = 'verified_noshow' 
        AND ec.verified_at > NOW() - INTERVAL '90 days'
    ) AS noshow_90d,
    -- Late cancellation count
    COUNT(*) FILTER (WHERE ec.late_cancel = TRUE) AS late_cancellations
FROM event_claims ec
JOIN events e ON ec.event_id = e.id
GROUP BY ec.account_id, ec.event_id, e.pool_id;

-- ============================================================
-- AUDIT LOG (Maps to on-chain event logs)
-- ============================================================
CREATE TABLE audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id     UUID REFERENCES pools(id),
    actor_id    UUID NOT NULL REFERENCES accounts(id),
    action      TEXT NOT NULL,                  -- e.g., 'member_added', 'member_removed', 'settings_changed'
    target_type TEXT,                           -- e.g., 'pool', 'membership', 'event'
    target_id   UUID,
    details     JSONB,                         -- Arbitrary metadata
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_pool ON audit_log(pool_id, created_at);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id  UUID NOT NULL REFERENCES accounts(id),
    type        TEXT NOT NULL,
    title       TEXT NOT NULL,
    body        TEXT,
    data        JSONB,                         -- Reference data (event_id, pool_id, etc.)
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_account ON notifications(account_id, read_at, created_at);

-- ============================================================
-- CROSS-POOL COLLABORATIONS (V2)
-- ============================================================
CREATE TABLE event_pool_collaborations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id    UUID NOT NULL REFERENCES events(id),
    pool_id     UUID NOT NULL REFERENCES pools(id), -- Contributing pool
    approved_by UUID REFERENCES accounts(id),       -- Steward who approved
    approved_at TIMESTAMPTZ,
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'declined')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(event_id, pool_id)
);
```

### 3.3 CPP Mapping Table

This table documents exactly how each Barn Raise V1 operation maps to its on-chain equivalent in V2.

| Barn Raise V1 Operation | Database Table | CPP/On-Chain Equivalent (V2) |
|---|---|---|
| Create pool | `pools` INSERT | Deploy new SwapPool + TokenRegistry + Limiter + PriceIndexQuoter contracts via `ge-publish` CLI |
| Join pool | `pool_memberships` INSERT | Register account in pool's AccountsIndex via `add(address)` |
| Create CAV for pool | `vouchers` INSERT | Deploy new ERC20 Demurrage Token contract |
| Grant starting balance | `point_transactions` INSERT (type: starting_balance) | Mint CAV tokens to new member's address |
| Create event | `events` INSERT | No direct on-chain equivalent (off-chain coordination metadata) |
| Claim event slot | `event_claims` INSERT | No direct on-chain equivalent (pre-commitment, off-chain) |
| Verify attendance (earn) | `point_transactions` INSERT (type: earn) | `transfer()` CAV tokens from pool treasury to contributor |
| Verify attendance (spend) | `point_transactions` INSERT (type: spend) | `transfer()` CAV tokens from host to pool treasury (or burn) |
| Swap hours cross-pool | Not in V1 | `withdraw(outToken, inToken, value)` on SwapPool contract |
| Check balance | Query `pool_balances` materialized view | `balanceOf(address)` on CAV token contract |
| Check pool contents | Query `point_transactions` aggregate | Query SwapPool token balances via ERC20 `balanceOf()` |

---

## 4. V1 Application Architecture

### 4.1 Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Framework** | Next.js 14+ (App Router) | Matches Sarafu Network dApp stack; enables SSR for event pages |
| **Language** | TypeScript | Type safety; matches GE frontend codebase |
| **Database** | PostgreSQL 15+ | Matches CIC Graph; native JSON, array, PostGIS support |
| **ORM** | Drizzle ORM | Type-safe, SQL-first, lightweight; generates clean migrations |
| **Auth** | NextAuth.js v5 | Magic link + email/password; extensible to wallet connect |
| **API** | Next.js API Routes + tRPC | Type-safe client-server communication |
| **UI** | Tailwind CSS + shadcn/ui | Rapid development; consistent design system |
| **Email** | Resend | Transactional email for notifications |
| **Hosting** | Vercel (frontend) + Neon or Supabase (DB) | Low-ops; Sarafu Network also uses Vercel |
| **GraphQL (optional)** | Hasura | CIC Graph uses Hasura; maintains compatibility for V2 data merging |

### 4.2 Authentication Flow

**V1: Email-based (non-crypto users)**
```
User enters email → Magic link sent via Resend → 
Click link → NextAuth session created → JWT stored in httpOnly cookie
```

**V2: Wallet connection (crypto-native users)**
```
User clicks "Connect Wallet" → viem/wagmi prompt → 
Sign message → NextAuth session created with wallet address →
Account linked to on-chain identity
```

**V2 Bridge: Custodial account creation**
```
When V1 user opts into on-chain features →
Call GE Custodial API: POST /account/create →
Receive custodial Celo address →
Store in accounts.chain_address →
System signs transactions on user's behalf
```

### 4.3 API Design

All API routes follow REST conventions with tRPC for type safety.

```
/api/v1/
├── auth/
│   ├── [...nextauth]          # NextAuth handlers
│   └── register               # Account creation
├── pools/
│   ├── POST /                 # Create pool
│   ├── GET /:id               # Pool dashboard data
│   ├── POST /:id/join         # Join pool
│   ├── POST /:id/invite       # Generate invite
│   ├── PATCH /:id/settings    # Update pool settings (steward)
│   └── GET /:id/members       # Member list with stats
├── events/
│   ├── POST /                 # Create event
│   ├── GET /:id               # Event details (public)
│   ├── PATCH /:id             # Update event
│   ├── POST /:id/claim        # Claim slot
│   ├── DELETE /:id/claim      # Cancel claim
│   └── POST /:id/verify       # Host verification
├── users/
│   ├── GET /me                # Own profile
│   └── GET /:id/pool/:pid     # User pool profile
└── notifications/
    ├── GET /                  # List notifications
    └── PATCH /settings        # Notification preferences
```

### 4.4 Event Lifecycle State Machine

```
                    ┌─────────┐
                    │  DRAFT  │
                    └────┬────┘
                         │ host publishes
                         ▼
                    ┌─────────┐
         ┌─────────│  OPEN   │─────────┐
         │         └────┬────┘         │
         │              │              │ host cancels
         │   min reached│              ▼
         │              ▼         ┌──────────┐
         │        ┌───────────┐   │CANCELLED │
         │        │ CONFIRMED │   └──────────┘
         │        └─────┬─────┘
         │              │ event time arrives
         │              ▼
         │      ┌─────────────┐
         │      │ IN_PROGRESS │
         │      └──────┬──────┘
         │             │ event time ends
         │             ▼
         │      ┌───────────┐
         │      │ COMPLETED │
         │      └─────┬─────┘
         │            │ host submits verification
         │            ▼
         │      ┌──────────┐
         └─────▶│ VERIFIED │ → point_transactions created
                └──────────┘
```

### 4.5 Verification and Point Distribution Logic

When a host submits verification for a completed event:

```typescript
async function verifyEvent(eventId: string, verifications: HostVerification[]) {
  return db.transaction(async (tx) => {
    const event = await tx.query.events.findFirst({ where: eq(events.id, eventId) });
    const poolVoucher = await tx.query.vouchers.findFirst({ where: eq(vouchers.pool_id, event.pool_id) });
    
    let totalHoursDistributed = 0;
    
    for (const v of verifications) {
      // Update claim status
      await tx.update(event_claims)
        .set({
          status: v.attended ? 'verified_attended' : 'verified_noshow',
          hours_verified: v.attended ? v.actualHours : 0,
          verified_at: new Date(),
        })
        .where(eq(event_claims.id, v.claimId));
      
      if (v.attended && v.actualHours > 0) {
        // EARN: Contributor receives points
        // Maps to: ERC20 transfer(pool_treasury → contributor)
        await tx.insert(point_transactions).values({
          pool_id: event.pool_id,
          voucher_id: poolVoucher.id,
          account_id: v.accountId,
          tx_type: 'earn',
          value: v.actualHours * (10 ** poolVoucher.decimals), // Smallest unit
          hours: v.actualHours,
          event_id: eventId,
          event_claim_id: v.claimId,
        });
        
        totalHoursDistributed += v.actualHours;
      }
    }
    
    // SPEND: Host's balance decreases
    // Maps to: ERC20 transfer(host → pool_treasury) or burn
    await tx.insert(point_transactions).values({
      pool_id: event.pool_id,
      voucher_id: poolVoucher.id,
      account_id: event.host_id,
      tx_type: 'spend',
      value: totalHoursDistributed * (10 ** poolVoucher.decimals),
      hours: totalHoursDistributed,
      event_id: eventId,
    });
    
    // Update event status
    await tx.update(events).set({
      status: 'verified',
      hours_verified: totalHoursDistributed,
      updated_at: new Date(),
    }).where(eq(events.id, eventId));
    
    // Refresh materialized view
    await tx.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY pool_balances`);
  });
}
```

---

## 5. V2 On-Chain Migration Path

### 5.1 Migration Strategy: Gradual, Opt-In, Per-Pool

Migration is not a "big bang" — it happens pool by pool, when stewards choose to go on-chain.

**Phase 1: Pool goes on-chain**
1. Steward clicks "Upgrade to On-Chain" in pool settings
2. System deploys (or calls GE Custodial API to deploy):
   - ERC20 Demurrage Token contract (the pool's labor hour CAV)
   - SwapPool contract (name, symbol, decimals from pool record)
   - TokenRegistry (with pool's CAV as the only allowed token initially)
   - PriceIndexQuoter (with the CAV at default value)
3. Contract addresses stored in pool record (`chain_address`, `token_registry_addr`, etc.)
4. Existing point balances minted as CAV tokens to member custodial addresses
5. `chain_confirmed = TRUE` set on migrated `point_transactions`

**Phase 2: Members get on-chain identity**
1. Members who want wallet control are guided through either:
   - Importing their custodial account into a self-custody wallet (Valora, MetaMask)
   - Connecting an existing wallet and having the custodial balance transferred
2. Members who prefer custodial operation continue as before — the Custodial API signs on their behalf

**Phase 3: Cross-pool exchange**
1. When two on-chain pools want to enable cross-pool swaps:
   - Each pool's CAV is added to the other pool's TokenRegistry
   - PriceIndexQuoter values are set (for labor-hour pools, all at 1:1)
   - Members can now `withdraw(otherCAV, myCAV, value)` on the SwapPool

### 5.2 TrustGraph Integration (V2.1)

TrustGraph provides the social trust layer for cross-pool interactions.

**Integration points:**
- When a member's attendance is verified, an **EAS attestation** is created: "Account X contributed Y hours to Event Z in Pool W on Date D"
- These attestations feed into TrustGraph's PageRank algorithm
- A member's TrustGraph score becomes a portable reputation signal
- When joining a new pool or participating in a cross-pool event, the inviting pool can check the member's TrustGraph score
- High-trust members could receive higher starting balances or faster approval

**EAS Schema (proposed):**
```
{
  "schema": "address contributor, bytes32 poolId, bytes32 eventId, uint256 hoursVerified, uint64 eventDate, address verifier",
  "resolver": "0x...",  // Optional: custom resolver for labor attestations
  "revocable": true     // Allows correction of erroneous verifications
}
```

---

## 6. Infrastructure & Deployment

### 6.1 V1 Deployment Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   Vercel Edge    │     │   Neon / Supabase│
│   (Next.js SSR)  │────▶│   (PostgreSQL)   │
│                  │     │                  │
│   CDN + Edge     │     │   Connection     │
│   Functions      │     │   Pooling        │
└────────┬────────┘     └─────────────────┘
         │
         │ Email notifications
         ▼
┌─────────────────┐
│     Resend      │
│   (Email API)   │
└─────────────────┘
```

### 6.2 V2 Additional Infrastructure

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Barn Raise    │     │  GE Custodial   │     │  Celo Blockchain │
│   (Next.js)     │────▶│  API (Go)       │────▶│  (CEL2 L2)      │
└────────┬────────┘     └────────┬────────┘     └─────────────────┘
         │                       │
         │                       ▼
         │              ┌─────────────────┐
         │              │  eth-tracker    │
         │              │  eth-indexer    │
         │              └────────┬────────┘
         │                       │
         │                       ▼
         │              ┌─────────────────┐
         └─────────────▶│  CIC Graph      │
                        │  (PostgreSQL)   │
                        │  + Hasura       │
                        └─────────────────┘
```

For V2, Barn Raise either:
- **Self-hosts** the custodial stack (est. $40-100/mo for the backend server, recommended specs: 16GB RAM, 8 vCPU, 50GB SSD)
- **Partners with GE** to use their existing infrastructure (preferred — avoids running a separate Celo RPC node)

### 6.3 Environment Configuration

```env
# V1
DATABASE_URL=postgresql://user:pass@host:5432/barnraise
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://barnraise.xyz
RESEND_API_KEY=...

# V2 (added when on-chain features are enabled)
CELO_RPC_URL=https://forno.celo.org  
GE_CUSTODIAL_API_URL=https://custodial.grassecon.org/api/v2
GE_CUSTODIAL_API_KEY=...
SARAFU_REGISTRY_ADDRESS=0xd1FB944748aca327a1ba036B082993D9dd9Bfa0C
POOLS_INDEX_ADDRESS=0x01eD8Fe01a2Ca44Cb26D00b1309d7D777471D00C
TOKENS_INDEX_ADDRESS=0xe2CEf4000d6003958c891D251328850f84654eb9
```

---

## 7. Security Considerations

### 7.1 V1 Security

- **Authentication:** NextAuth with CSRF protection, httpOnly JWT cookies
- **Authorization:** Pool-scoped permissions checked at API layer (steward vs. member actions)
- **Point integrity:** All balance mutations go through `point_transactions` table — no direct balance column updates. Materialized view is read-only
- **Rate limiting:** API routes rate-limited per user (especially event creation and claim submission)
- **Input validation:** Zod schemas on all API inputs; SQL parameterized via Drizzle ORM

### 7.2 V2 Security (Additional)

- **Custodial key management:** Handled by GE's eth-custodial system (HSM-backed key storage)
- **Smart contract interactions:** All transactions go through the Custodial API (signed server-side), never exposed to frontend
- **Wallet signatures:** For self-custody users, all state-changing actions require wallet signature
- **Event log verification:** On-chain transactions can be audited against off-chain event records via `chain_tx_hash` references

---

## 8. Testing Strategy

### 8.1 Unit Tests

- Point transaction logic (earn/spend/starting balance)
- Balance calculation correctness
- Event state machine transitions
- No-show detection and reputation scoring

### 8.2 Integration Tests

- Full event lifecycle (create → claim → verify → distribute)
- Pool membership flows (join, leave, remove)
- Cross-pool collaboration approval flow

### 8.3 V2 Contract Tests

- Deploy test SwapPool on Celo Alfajores testnet
- Verify CAV minting matches off-chain point totals
- Test swap operations between two labor pool CAVs
- Validate PriceIndexQuoter returns correct 1:1 ratios

### 8.4 Reth Devnet

GE maintains a **Reth devnet** for development testing. Barn Raise V2 development should use this devnet before deploying to Alfajores testnet or Celo mainnet.

---

## 9. Open Technical Decisions

| Decision | Options | Recommendation | Status |
|---|---|---|---|
| **Database hosting** | Neon, Supabase, Railway, self-hosted | Neon (serverless Postgres, generous free tier, branching for dev) | Proposed |
| **GraphQL layer** | Hasura, Supabase auto-API, none | Start without; add Hasura in V2 for CIC Graph compatibility | Proposed |
| **Wallet library** | viem/wagmi, ethers.js, web3.js | viem/wagmi (modern, tree-shakeable, used by newer dApps) | Proposed |
| **Celo interaction** | Direct RPC, GE Custodial API, both | GE Custodial API (avoids running our own RPC node) | Proposed |
| **Token decimals** | 6 (Sarafu default), 18 (ERC20 convention), 0 (simplest) | 6 (matches GE SwapPool defaults, sufficient precision for hours) | Proposed |
| **Demurrage for labor hours** | Enabled (encourages timely use), Disabled (simpler) | Disabled for V1; configurable per-pool in V2 | Proposed |

---

## Appendix A: GE Software Component Reference

| Component | Language | Status | Our Usage |
|---|---|---|---|
| sarafu.network | React/TS | Active | Reference implementation; potential code reuse |
| erc20-pool (SwapPool) | Solidity/Python | Security-only | V2: deploy instances for on-chain pools |
| erc20-demurrage-token | Solidity/Python | Security-only | V2: deploy instances for labor-hour CAVs |
| eth-token-index | Solidity/Python | Security-only | V2: manage allowed tokens per pool |
| price-index-quoter | Solidity/Rust | Security-only | V2: set 1:1 labor-hour pricing |
| eth-custodial | Go | Active | V2: custodial account management |
| eth-tracker | Go | Active | V2: monitor on-chain events |
| eth-indexer | Go | Active | V2: index chain data into CIC Graph |
| cic-graph | SQL | Active | V2: shared data layer |
| ge-publish | Go | Active | V2: CLI for deploying contracts |
| storage-server | Go | Active | V2: off-chain metadata storage |

## Appendix B: Key Contract Addresses (Celo Mainnet)

| Description | Address |
|---|---|
| SarafuNetwork Registry | `0xd1FB944748aca327a1ba036B082993D9dd9Bfa0C` |
| Custodial Registry | `0x0cc9f4fff962def35bb34a53691180b13e653030` |
| Pools Index | `0x01eD8Fe01a2Ca44Cb26D00b1309d7D777471D00C` |
| Tokens Index | `0xe2CEf4000d6003958c891D251328850f84654eb9` |
| Contracts Owner | `0x5523058cdFfe5F3c1EaDADD5015E55C6E00fb439` |
| GE MultiSig | `0x0208aEFb1db3cD4550d2020E9e53616C44B9b306` |
