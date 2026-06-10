import { describe, it, expect, beforeAll } from "vitest";
import { callerFor, mkUser } from "./helpers";

/** Recursively assert an object graph contains no secret/PII keys. */
function assertNoSecrets(value: unknown, path = "root") {
  const FORBIDDEN = ["passwordHash", "password_hash"];
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoSecrets(v, `${path}[${i}]`));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN.includes(k)) {
        throw new Error(`Secret field "${k}" leaked at ${path}`);
      }
      assertNoSecrets(v, `${path}.${k}`);
    }
  }
}

describe("security: projections & authorization", () => {
  let host: string, claimer: string, outsider: string;
  let H: ReturnType<typeof callerFor>, O: ReturnType<typeof callerFor>;
  let poolId: string, eventId: string;

  beforeAll(async () => {
    host = await mkUser("Host Hank");
    claimer = await mkUser("Claimer Cleo");
    outsider = await mkUser("Outsider Ozzy");
    H = callerFor(host);
    const Cl = callerFor(claimer);
    O = callerFor(outsider);
    const pool = await H.pools.create({
      name: `Sec ${Date.now()}`, joinPolicy: "open",
      startingBalance: 5, maxNegativeBalance: -10,
    });
    poolId = pool.id;
    await Cl.pools.join({ poolId });
    const ev = await H.events.create({
      poolId, title: "Sec Event",
      dateStart: new Date(Date.now() + 3600_000).toISOString(),
      dateEnd: new Date(Date.now() + 7200_000).toISOString(),
      totalHoursNeeded: 3, maxParticipants: 5, minParticipants: 1, hostingType: "solo",
    });
    eventId = ev.id;
    await Cl.events.claim({ eventId, hoursCommitted: 2 });
  });

  it("public events.getById exposes no passwordHash, no email, no chainAddress", async () => {
    // Unauthenticated caller (no session)
    const pub = callerFor(undefined as never);
    const ev = await pub.events.getById({ eventId });
    assertNoSecrets(ev);
    // host + claim accounts must not carry email/chainAddress
    const accountsInPayload = [ev.host, ...ev.claims.map((c) => c.account)];
    for (const a of accountsInPayload) {
      expect(a).not.toHaveProperty("email");
      expect(a).not.toHaveProperty("chainAddress");
      expect(a).not.toHaveProperty("custodial");
    }
    // pool view must not carry chain bridge addresses
    expect(ev.pool).not.toHaveProperty("chainAddress");
    expect(ev.pool).not.toHaveProperty("tokenRegistryAddr");
  });

  it("users.me returns no passwordHash", async () => {
    const me = await H.users.me();
    assertNoSecrets(me);
    expect(me).not.toHaveProperty("passwordHash");
  });

  it("pools.members exposes balances but no email/passwordHash", async () => {
    const members = await H.pools.members({ poolId });
    assertNoSecrets(members);
    for (const m of members) {
      expect(m.account).not.toHaveProperty("email");
      expect(m.account).not.toHaveProperty("passwordHash");
    }
  });

  it("non-members cannot read roster, health, activity, or profiles", async () => {
    await expect(O.pools.members({ poolId })).rejects.toThrow();
    await expect(O.pools.health({ poolId })).rejects.toThrow();
    await expect(O.pools.activity({ poolId })).rejects.toThrow();
    await expect(O.users.poolProfile({ userId: host, poolId })).rejects.toThrow();
  });
});
