import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, lte, sql, isNull, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { events, eventClaims } from "@/lib/db/schema";
import { sendNotification, sendNotificationToMany } from "@/server/services/notifications";

/**
 * Time-based notifications that aren't triggered by a user action:
 *  - event_reminder: ~24h before an event, to everyone with an active claim
 *  - verify_request: to hosts of events that have completed but aren't verified
 *
 * Intended to run hourly via a scheduler (e.g. Vercel Cron). Protected by a
 * shared secret so it can't be triggered by the public.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in23h = new Date(now.getTime() + 23 * 60 * 60 * 1000);

  // --- Event reminders: events starting in the next 23–24h window ---
  const upcoming = await db
    .select()
    .from(events)
    .where(
      and(
        inArray(events.status, ["open", "confirmed"]),
        gte(events.dateStart, in23h),
        lte(events.dateStart, in24h),
        isNull(events.reminderSentAt)
      )
    );

  let remindersSent = 0;
  for (const ev of upcoming) {
    const claimers = await db
      .select({ accountId: eventClaims.accountId })
      .from(eventClaims)
      .where(and(eq(eventClaims.eventId, ev.id), eq(eventClaims.status, "claimed")));
    if (claimers.length > 0) {
      await sendNotificationToMany(
        claimers.map((c) => c.accountId),
        {
          type: "event_reminder",
          title: `Reminder: "${ev.title}" is tomorrow`,
          body: "You've committed hours for this event. See you there!",
          data: { eventId: ev.id, poolId: ev.poolId },
        }
      );
      remindersSent += claimers.length;
    }
    await db.update(events).set({ reminderSentAt: now }).where(eq(events.id, ev.id));
  }

  // --- Verify requests: completed but not yet verified ---
  const toVerify = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.status, "completed"),
        isNull(events.verifyRequestSentAt),
        sql`${events.dateEnd} < now()`
      )
    );

  let verifyRequests = 0;
  for (const ev of toVerify) {
    await sendNotification({
      accountId: ev.hostId,
      type: "verify_request",
      title: `Verify attendance for "${ev.title}"`,
      body: "Confirm who showed up so contributors get their hours.",
      data: { eventId: ev.id, poolId: ev.poolId },
    });
    await db.update(events).set({ verifyRequestSentAt: now }).where(eq(events.id, ev.id));
    verifyRequests += 1;
  }

  return NextResponse.json({ ok: true, remindersSent, verifyRequests });
}
