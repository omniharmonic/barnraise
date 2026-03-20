import {
  pgTable,
  uuid,
  text,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { events } from "./events";

export const eventWorkAreas = pgTable(
  "event_work_areas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    targetHours: integer("target_hours"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("idx_event_work_areas_event").on(table.eventId),
  ]
);
