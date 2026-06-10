import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { callerFor, mkUser } from "./helpers";

describe("full lifecycle + ledger invariants", () => {
  let steward: string, alice: string, bob: string, carol: string;
  let S: ReturnType<typeof callerFor>, A: ReturnType<typeof callerFor>,
      B: ReturnType<typeof callerFor>, C: ReturnType<typeof callerFor>;
  let poolId: string;

  beforeAll(async () => {
    steward = await mkUser("Steward Sam");
    alice = await mkUser("Alice");
    bob = await mkUser("Bob");
    carol = await mkUser("Carol");
    S = callerFor(steward); A = callerFor(alice); B = callerFor(bob); C = callerFor(carol);
    const pool = await S.pools.create({
      name: `Lifecycle ${Date.now()}`, description: "t", joinPolicy: "open",
      startingBalance: 2, maxNegativeBalance: -10,
    });
    poolId = pool.id;
    await A.pools.join({ poolId }); await B.pools.join({ poolId }); await C.pools.join({ poolId });
  });

  it("grants starting balance and counts members", async () => {
    const dash = await S.pools.getById({ poolId });
    expect(dash.memberCount).toBe(4);
    expect(dash.userBalance.balance).toBe(2);
  });

  it("rejects an over-capacity solo event", async () => {
    await expect(A.events.create({
      poolId, title: "Too big",
      dateStart: new Date(Date.now() + 86400000).toISOString(),
      dateEnd: new Date(Date.now() + 90000000).toISOString(),
      totalHoursNeeded: 999, maxParticipants: 5, minParticipants: 1, hostingType: "solo",
    })).rejects.toThrow();
  });

  let evId: string;
  it("creates a solo event open for claims", async () => {
    const ev = await A.events.create({
      poolId, title: "Garden Build", description: "bring gloves",
      dateStart: new Date(Date.now() + 3600_000).toISOString(),
      dateEnd: new Date(Date.now() + 7200_000).toISOString(),
      totalHoursNeeded: 6, maxParticipants: 5, minParticipants: 2, hostingType: "solo",
    });
    evId = ev.id;
    expect(ev.status).toBe("open");
  });

  it("reserves pending solo liability against capacity", async () => {
    const cap = await A.events.getHostCapacity({ poolId });
    expect(cap.capacity).toBe(6); // 12 gross - 6 reserved
  });

  it("claims fill hours and confirm at min participants", async () => {
    await B.events.claim({ eventId: evId, hoursCommitted: 3 });
    await C.events.claim({ eventId: evId, hoursCommitted: 3 });
    const ev = await B.events.getById({ eventId: evId });
    expect(ev.hoursClaimed).toBe(6);
    expect(ev.status).toBe("confirmed");
    expect(ev.participantsCount).toBe(2);
  });

  it("rejects duplicate claim", async () => {
    await expect(B.events.claim({ eventId: evId, hoursCommitted: 1 })).rejects.toThrow();
  });

  it("verifies attendance and updates the ledger correctly", async () => {
    await db.update(events).set({
      dateStart: new Date(Date.now() - 7200_000),
      dateEnd: new Date(Date.now() - 3600_000),
      status: "completed",
    }).where(eq(events.id, evId));
    const full = await A.events.getById({ eventId: evId });
    const bClaim = full.claims.find((c) => c.accountId === bob)!;
    const cClaim = full.claims.find((c) => c.accountId === carol)!;
    const res = await A.events.verify({
      eventId: evId,
      verifications: [
        { claimId: bClaim.id, accountId: bob, attended: true, actualHours: 3 },
        { claimId: cClaim.id, accountId: carol, attended: false, actualHours: 0 },
      ],
    });
    expect(res.totalHoursDistributed).toBe(3);

    const bobP = await A.users.poolProfile({ userId: bob, poolId });
    expect(bobP.balance).toBe(5);
    const carolP = await A.users.poolProfile({ userId: carol, poolId });
    expect(carolP.balance).toBe(2);
    expect(carolP.attendanceReliability).toBe(0);
    const aliceP = await A.users.poolProfile({ userId: alice, poolId });
    expect(aliceP.balance).toBe(-1);
  });

  it("conserves total balance = total starting grants", async () => {
    const members = await S.pools.members({ poolId });
    const total = members.reduce((s, m) => s + m.balance, 0);
    expect(total).toBe(8);
  });

  it("rejects re-verification and non-host verification", async () => {
    const full = await A.events.getById({ eventId: evId });
    const bClaim = full.claims.find((c) => c.accountId === bob)!;
    await expect(A.events.verify({ eventId: evId, verifications: [
      { claimId: bClaim.id, accountId: bob, attended: true, actualHours: 3 }] })).rejects.toThrow();
    await expect(B.events.verify({ eventId: evId, verifications: [] })).rejects.toThrow();
  });

  it("runs the group funding flow", async () => {
    const gev = await S.events.create({
      poolId, title: "Big Barn",
      dateStart: new Date(Date.now() + 3 * 86400000).toISOString(),
      dateEnd: new Date(Date.now() + 3 * 86400000 + 7200_000).toISOString(),
      totalHoursNeeded: 4, maxParticipants: 5, minParticipants: 1,
      hostingType: "group", hostPledgeHours: 2,
    });
    expect(gev.status).toBe("pledging");
    await B.events.pledge({ eventId: gev.id, hoursPledged: 2 });
    const after = await S.events.getById({ eventId: gev.id });
    expect(after.status).toBe("open");
  });
});
