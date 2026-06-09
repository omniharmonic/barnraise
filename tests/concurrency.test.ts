import { describe, it, expect, beforeAll } from "vitest";
import { callerFor, mkUser } from "./helpers";

describe("concurrency: claims cannot over-sell an event", () => {
  let host: string, poolId: string, eventId: string;
  const claimers: string[] = [];

  beforeAll(async () => {
    host = await mkUser("Race Host");
    const H = callerFor(host);
    const pool = await H.pools.create({
      name: `Race ${Date.now()}`, joinPolicy: "open",
      startingBalance: 5, maxNegativeBalance: -20,
    });
    poolId = pool.id;
    // 8 members compete for an event with maxParticipants=3, 3 hours total
    for (let i = 0; i < 8; i++) {
      const id = await mkUser(`Racer ${i}`);
      claimers.push(id);
      await callerFor(id).pools.join({ poolId });
    }
    const ev = await H.events.create({
      poolId, title: "Hot Event",
      dateStart: new Date(Date.now() + 3600_000).toISOString(),
      dateEnd: new Date(Date.now() + 7200_000).toISOString(),
      totalHoursNeeded: 3, maxParticipants: 3, minParticipants: 1, hostingType: "solo",
    });
    eventId = ev.id;
  });

  it("never exceeds maxParticipants or totalHoursNeeded under parallel claims", async () => {
    const results = await Promise.allSettled(
      claimers.map((id) =>
        callerFor(id).events.claim({ eventId, hoursCommitted: 1 })
      )
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    // Exactly 3 should succeed (3 hours / 1h each, max 3 participants)
    expect(ok).toBe(3);

    const ev = await callerFor(host).events.getById({ eventId });
    expect(ev.participantsCount).toBeLessThanOrEqual(3);
    expect(ev.hoursClaimed).toBeLessThanOrEqual(3);
    expect(ev.hoursClaimed).toBe(3);
  });
});
