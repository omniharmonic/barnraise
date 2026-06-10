import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { TRPCContext } from "./init";

/**
 * Build the tRPC context for an incoming fetch request. Captures the client IP
 * (from x-forwarded-for / x-real-ip) so public and auth-adjacent procedures can
 * be rate-limited per IP.
 */
export async function createTRPCContext(
  opts?: { req?: Request }
): Promise<TRPCContext> {
  const session = await auth();
  const headers = opts?.req?.headers;
  const ip =
    headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers?.get("x-real-ip") ||
    null;
  return { db, session, ip };
}
