import {
  pgTable,
  uuid,
  text,
  bigint,
  numeric,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { pools } from "./pools";
import { vouchers } from "./vouchers";
import { accounts } from "./accounts";
import { events } from "./events";
import { eventClaims } from "./event-claims";

export const pointTransactions = pgTable(
  "point_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    poolId: uuid("pool_id")
      .notNull()
      .references(() => pools.id),
    voucherId: uuid("voucher_id")
      .notNull()
      .references(() => vouchers.id),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),

    txType: text("tx_type").notNull(), // 'earn' | 'spend' | 'starting_balance'

    value: bigint("value", { mode: "number" }).notNull(),
    hours: numeric("hours", { precision: 10, scale: 2 }).notNull(),

    eventId: uuid("event_id").references(() => events.id),
    eventClaimId: uuid("event_claim_id").references(() => eventClaims.id),

    // V2 bridge
    chainTxHash: text("chain_tx_hash"),
    chainBlock: bigint("chain_block", { mode: "number" }),
    chainConfirmed: boolean("chain_confirmed").default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_point_tx_pool_account").on(table.poolId, table.accountId),
    index("idx_point_tx_event").on(table.eventId),
    index("idx_point_tx_created").on(table.createdAt),
  ]
);
