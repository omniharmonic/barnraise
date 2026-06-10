import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rate-limit";

describe("rate limiter", () => {
  it("allows up to the limit then blocks within the window", async () => {
    const key = `test:${Date.now()}:${Math.random()}`;
    const results: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      const { allowed } = await consumeRateLimit(db, key, 3, 60);
      results.push(allowed);
    }
    // first 3 allowed, then blocked
    expect(results).toEqual([true, true, true, false, false]);
  });

  it("resets after the window elapses", async () => {
    const key = `test-reset:${Date.now()}:${Math.random()}`;
    // window of 1 second
    expect((await consumeRateLimit(db, key, 1, 1)).allowed).toBe(true);
    expect((await consumeRateLimit(db, key, 1, 1)).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 1100));
    expect((await consumeRateLimit(db, key, 1, 1)).allowed).toBe(true);
  });
});
