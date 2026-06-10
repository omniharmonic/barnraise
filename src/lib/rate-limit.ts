import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { DbConn } from "@/lib/db";

/**
 * Atomically consume one unit against a fixed-window rate limit. Returns the
 * current count within the window. Implemented as a single upsert so it is
 * correct across concurrent / serverless invocations.
 */
export async function consumeRateLimit(
  db: DbConn,
  key: string,
  limit: number,
  windowSec: number
): Promise<{ allowed: boolean; count: number }> {
  const rows = await db.execute<{ count: number }>(sql`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limits.window_start < now() - (${windowSec} || ' seconds')::interval
        THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE
        WHEN rate_limits.window_start < now() - (${windowSec} || ' seconds')::interval
        THEN now() ELSE rate_limits.window_start END
    RETURNING count;
  `);
  const count = Number(rows[0]?.count ?? 0);
  return { allowed: count <= limit, count };
}

/** Consume and throw TOO_MANY_REQUESTS when the limit is exceeded. */
export async function assertRateLimit(
  db: DbConn,
  key: string,
  limit: number,
  windowSec: number
) {
  const { allowed } = await consumeRateLimit(db, key, limit, windowSec);
  if (!allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests — please slow down and try again shortly.",
    });
  }
}
