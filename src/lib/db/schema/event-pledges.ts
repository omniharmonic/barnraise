import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { events } from "./events";
import { accounts } from "./accounts";

export const eventPledges = pgTable(
  "event_pledges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),

    hoursPledged: integer("hours_pledged").notNull(),

    // "active" | "withdrawn" | "spent"
    status: text("status").notNull().default("active"),

    spentAt: timestamp("spent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_event_pledges_unique").on(table.eventId, table.accountId),
    index("idx_event_pledges_event").on(table.eventId),
    index("idx_event_pledges_account").on(table.accountId),
  ]
);
