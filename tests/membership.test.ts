import { describe, it, expect, beforeAll } from "vitest";
import { callerFor, mkUser } from "./helpers";

describe("membership: starting balance is granted exactly once", () => {
  let host: string, member: string, poolId: string;
  let M: ReturnType<typeof callerFor>, H: ReturnType<typeof callerFor>;

  beforeAll(async () => {
    host = await mkUser("Pool Host");
    member = await mkUser("Joiner");
    H = callerFor(host);
    M = callerFor(member);
    const pool = await H.pools.create({
      name: `Grant ${Date.now()}`, joinPolicy: "open",
      startingBalance: 3, maxNegativeBalance: -10,
    });
    poolId = pool.id;
  });

  it("does not re-grant starting balance on leave + rejoin", async () => {
    await M.pools.join({ poolId });
    let prof = await H.users.poolProfile({ userId: member, poolId });
    expect(prof.balance).toBe(3);

    await M.pools.leavePool({ poolId });
    await M.pools.join({ poolId });
    prof = await H.users.poolProfile({ userId: member, poolId });
    // Still 3 — not 6
    expect(prof.balance).toBe(3);
  });
});
