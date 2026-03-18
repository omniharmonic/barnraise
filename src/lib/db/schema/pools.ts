import {
  pgTable,
  uuid,
  text,
  integer,
  smallint,
  timestamp,
  uniqueIndex,
  index,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";

export const pools = pgTable(
  "pools",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    symbol: text("symbol").notNull(),
    description: text("description"),
    locationName: text("location_name"),

    // Links
    websiteUrl: text("website_url"),
    groupChatUrl: text("group_chat_url"),
    customLinks: jsonb("custom_links").$type<{ label: string; url: string }[]>(),

    // Pool-level custom skill tags (accumulate across events)
    skillTags: text("skill_tags").array(),

    // Governance settings
    joinPolicy: text("join_policy").notNull().default("invite"),
    startingBalance: integer("starting_balance").notNull().default(2),
    maxNegativeBalance: integer("max_negative_balance").notNull().default(-10),
    eventFrequencyLimit: integer("event_frequency_limit"),

    // V2 bridge fields
    chainAddress: text("chain_address"),
    tokenRegistryAddr: text("token_registry_addr"),
    tokenLimiterAddr: text("token_limiter_addr"),
    quoterAddr: text("quoter_addr"),

    // CPP metadata
    decimals: smallint("decimals").notNull().default(6),
    feePpm: integer("fee_ppm").default(0),

    createdBy: uuid("created_by")
      .notNull()
      .references(() => accounts.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_pools_symbol").on(table.symbol)]
);

export const poolMemberships = pgTable(
  "pool_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    poolId: uuid("pool_id")
      .notNull()
      .references(() => pools.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),

    startingBalanceGranted: integer("starting_balance_granted")
      .notNull()
      .default(0),

    // V2 bridge
    chainRegistered: boolean("chain_registered").default(false),

    // Status: pending (for approval pools), active, left
    status: text("status").notNull().default("active"),

    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("idx_pool_memberships_unique").on(
      table.poolId,
      table.accountId
    ),
    index("idx_pool_memberships_pool").on(table.poolId),
    index("idx_pool_memberships_account").on(table.accountId),
  ]
);
