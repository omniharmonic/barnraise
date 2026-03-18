import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { pools } from "./pools";
import { accounts } from "./accounts";

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    poolId: uuid("pool_id").references(() => pools.id),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => accounts.id),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: uuid("target_id"),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_audit_pool").on(table.poolId, table.createdAt)]
);
