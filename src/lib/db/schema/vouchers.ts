import {
  pgTable,
  uuid,
  text,
  smallint,
  integer,
  bigint,
  timestamp,
} from "drizzle-orm/pg-core";
import { pools } from "./pools";

export const vouchers = pgTable("vouchers", {
  id: uuid("id").primaryKey().defaultRandom(),
  poolId: uuid("pool_id")
    .notNull()
    .references(() => pools.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  decimals: smallint("decimals").notNull().default(6),

  unitOfAccount: text("unit_of_account").notNull().default("labor_hour"),
  unitValue: integer("unit_value").notNull().default(1),

  // Demurrage settings (V2)
  demurrageRate: integer("demurrage_rate").default(0),
  demurragePeriod: text("demurrage_period").default("monthly"),

  // V2 bridge
  chainAddress: text("chain_address"),

  totalMinted: bigint("total_minted", { mode: "number" }).notNull().default(0),
  totalBurned: bigint("total_burned", { mode: "number" }).notNull().default(0),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
