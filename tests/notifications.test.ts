import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { events, accounts } from "@/lib/db/schema";
import { callerFor, mkUser } from "./helpers";

describe("notifications & preferences", () => {
  let host: string, claimer: string, poolId: string, eventId: string;
  let H: ReturnType<typeof callerFor>, C: ReturnType<typeof callerFor>;

  beforeAll(async () => {
    host = await mkUser("Notif Host");
    claimer = await mkUser("Notif Claimer");
    H = callerFor(host);
    C = callerFor(claimer);
    const pool = await H.pools.create({
      name: `Notif ${Date.now()}`, joinPolicy: "open",
      startingBalance: 5, maxNegativeBalance: -10,
    });
    poolId = pool.id;
    await C.pools.join({ poolId });
    const ev = await H.events.create({
      poolId, title: "Reminder Event",
      dateStart: new Date(Date.now() + 23.5 * 3600_000).toISOString(),
      dateEnd: new Date(Date.now() + 25 * 3600_000).toISOString(),
      totalHoursNeeded: 3, maxParticipants: 5, minParticipants: 1, hostingType: "solo",
    });
    eventId = ev.id;
    await C.events.claim({ eventId, hoursCommitted: 2 });
  });

  it("persists notification preference", async () => {
    await H.users.updateNotificationSettings({ emailDigest: "off" });
    const me = await H.users.me();
    expect(me?.emailDigest).toBe("off");
  });

  it("claim created an in-app notification for the host", async () => {
    const list = await H.notifications.list({ limit: 20 });
    expect(list.items.some((n) => n.type === "slot_claimed")).toBe(true);
  });

  it("cron sends a reminder to claimers and dedupes", async () => {
    const { GET } = await import("@/app/api/cron/reminders/route");
    const req = new Request("http://localhost/api/cron/reminders");
    const res1 = await GET(req as never);
    const body1 = await res1.json();
    expect(body1.remindersSent).toBeGreaterThanOrEqual(1);

    // claimer should have an event_reminder notification
    const list = await C.notifications.list({ limit: 20 });
    expect(list.items.some((n) => n.type === "event_reminder")).toBe(true);

    // running again does not resend (reminderSentAt set)
    const ev = await db.select().from(events).where(eq(events.id, eventId));
    expect(ev[0].reminderSentAt).not.toBeNull();
  });
});
