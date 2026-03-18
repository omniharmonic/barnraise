import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { pools } from "./pools";
import { accounts } from "./accounts";

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    poolId: uuid("pool_id")
      .notNull()
      .references(() => pools.id, { onDelete: "cascade" }),
    hostId: uuid("host_id")
      .notNull()
      .references(() => accounts.id),

    title: text("title").notNull(),
    description: text("description"),
    dateStart: timestamp("date_start", { withTimezone: true }).notNull(),
    dateEnd: timestamp("date_end", { withTimezone: true }).notNull(),
    locationName: text("location_name"),

    // Labor specification
    totalHoursNeeded: integer("total_hours_needed").notNull(),
    maxParticipants: integer("max_participants").notNull(),
    minParticipants: integer("min_participants").default(1),
    flexibleHours: boolean("flexible_hours").default(true),

    // Metadata
    skillTags: text("skill_tags").array(),
    potluckUrl: text("potluck_url"),

    // Hosting type
    hostingType: text("hosting_type").notNull().default("solo"),

    // Lifecycle
    status: text("status").notNull().default("draft"),

    // Aggregate computed fields (denormalized)
    hoursClaimed: integer("hours_claimed").notNull().default(0),
    hoursVerified: integer("hours_verified").notNull().default(0),
    participantsCount: integer("participants_count").notNull().default(0),

    // Group hosting denormalized fields
    hoursPledged: integer("hours_pledged").notNull().default(0),
    coHostCount: integer("co_host_count").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_events_pool").on(table.poolId),
    index("idx_events_host").on(table.hostId),
    index("idx_events_status").on(table.status),
    index("idx_events_date").on(table.dateStart),
  ]
);
