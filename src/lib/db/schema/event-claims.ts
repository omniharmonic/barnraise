import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { events } from "./events";
import { accounts } from "./accounts";
import { eventWorkAreas } from "./event-work-areas";

export const eventClaims = pgTable(
  "event_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),

    hoursCommitted: integer("hours_committed").notNull(),

    // Optional: which work area this person is joining
    workAreaId: uuid("work_area_id").references(() => eventWorkAreas.id, {
      onDelete: "set null",
    }),

    status: text("status").notNull().default("claimed"),

    hoursVerified: integer("hours_verified"),

    // Late cancellation tracking
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    lateCancel: boolean("late_cancel").default(false),

    // V2 bridge
    chainTxHash: text("chain_tx_hash"),

    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_event_claims_unique").on(table.eventId, table.accountId),
    index("idx_event_claims_event").on(table.eventId),
    index("idx_event_claims_account").on(table.accountId),
  ]
);
