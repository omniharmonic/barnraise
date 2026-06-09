import { describe, it, expect, beforeAll } from "vitest";
import { callerFor, mkUser } from "./helpers";

const future = (ms: number) => new Date(Date.now() + ms).toISOString();

describe("event rules: frequency, flexible hours, remaining capacity", () => {
  let host: string, H: ReturnType<typeof callerFor>;
  let claimer: string, C: ReturnType<typeof callerFor>;
  let poolId: string;

  beforeAll(async () => {
    host = await mkUser("Rules Host");
    claimer = await mkUser("Rules Claimer");
    H = callerFor(host);
    C = callerFor(claimer);
    const pool = await H.pools.create({
      name: `Rules ${Date.now()}`, joinPolicy: "open",
      startingBalance: 5, maxNegativeBalance: -20, eventFrequencyLimit: 1,
    });
    poolId = pool.id;
    await C.pools.join({ poolId });
  });

  it("rejects end <= start", async () => {
    await expect(H.events.create({
      poolId, title: "Bad dates",
      dateStart: future(7200_000), dateEnd: future(3600_000),
      totalHoursNeeded: 1, maxParticipants: 2, minParticipants: 1, hostingType: "solo",
    })).rejects.toThrow();
  });

  it("enforces the event frequency limit", async () => {
    await H.events.create({
      poolId, title: "First",
      dateStart: future(3600_000), dateEnd: future(7200_000),
      totalHoursNeeded: 1, maxParticipants: 2, minParticipants: 1, hostingType: "solo",
    });
    await expect(H.events.create({
      poolId, title: "Second same week",
      dateStart: future(3600_000), dateEnd: future(7200_000),
      totalHoursNeeded: 1, maxParticipants: 2, minParticipants: 1, hostingType: "solo",
    })).rejects.toThrow(/per week/);
  });

  it("non-flexible events require the full shift; over-claims are rejected", async () => {
    // fresh pool without frequency limit
    const host2 = await mkUser("Flex Host");
    const H2 = callerFor(host2);
    const c2 = await mkUser("Flex Claimer");
    const C2 = callerFor(c2);
    const pool2 = await H2.pools.create({
      name: `Flex ${Date.now()}`, joinPolicy: "open",
      startingBalance: 5, maxNegativeBalance: -20,
    });
    await C2.pools.join({ poolId: pool2.id });
    // 2-hour event (start→end), non-flexible
    const ev = await H2.events.create({
      poolId: pool2.id, title: "Full shift only",
      dateStart: future(3600_000), dateEnd: future(3600_000 + 2 * 3600_000),
      totalHoursNeeded: 4, maxParticipants: 4, minParticipants: 1,
      flexibleHours: false, hostingType: "solo",
    });
    // committing 1h (not the full 2h shift) is rejected
    await expect(C2.events.claim({ eventId: ev.id, hoursCommitted: 1 }))
      .rejects.toThrow(/full/);
    // committing the full 2h shift works
    await expect(C2.events.claim({ eventId: ev.id, hoursCommitted: 2 })).resolves.toBeTruthy();
  });

  it("rejects a claim that exceeds remaining hours", async () => {
    const host3 = await mkUser("Cap Host");
    const H3 = callerFor(host3);
    const c3 = await mkUser("Cap Claimer");
    const C3 = callerFor(c3);
    const pool3 = await H3.pools.create({
      name: `Cap ${Date.now()}`, joinPolicy: "open",
      startingBalance: 5, maxNegativeBalance: -20,
    });
    await C3.pools.join({ poolId: pool3.id });
    const ev = await H3.events.create({
      poolId: pool3.id, title: "Three hours",
      dateStart: future(3600_000), dateEnd: future(7200_000),
      totalHoursNeeded: 3, maxParticipants: 5, minParticipants: 1, hostingType: "solo",
    });
    await expect(C3.events.claim({ eventId: ev.id, hoursCommitted: 5 }))
      .rejects.toThrow(/remain/);
  });
});
