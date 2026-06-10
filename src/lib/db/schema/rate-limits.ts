import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Fixed-window rate-limit counters. One row per (key) where key encodes the
 * action and subject, e.g. "mutation:<userId>" or "auth:<email>". Works across
 * serverless instances because the window state lives in Postgres.
 */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
  count: integer("count").notNull().default(0),
});
