import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Session } from "next-auth";
import type { Database } from "@/lib/db";
import { assertRateLimit } from "@/lib/rate-limit";

/**
 * tRPC context shape. Defined here (with type-only imports) so the tRPC
 * primitives below do not pull the auth implementation — and therefore
 * next-auth's runtime — into the router import graph. Only the context
 * factory (./context) imports auth.
 */
export interface TRPCContext {
  db: Database;
  session: Session | null;
  /** Client IP (from x-forwarded-for), when available. Used for rate limiting. */
  ip?: string | null;
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

/**
 * Per-IP rate limit for unauthenticated/public procedures. Skipped when no IP
 * is present (e.g. server-side createCaller in tests).
 */
export const publicProcedure = t.procedure.use(async ({ ctx, next, type }) => {
  if (type === "mutation" && ctx.ip) {
    await assertRateLimit(ctx.db, `pub:${ctx.ip}`, 60, 60);
  }
  return next();
});

export const protectedProcedure = t.procedure.use(async ({ ctx, next, type }) => {
  if (!ctx.session?.user?.id) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  // Broad per-user write throttle (in addition to any per-route limits).
  if (type === "mutation") {
    await assertRateLimit(ctx.db, `mut:${ctx.session.user.id}`, 120, 60);
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      userId: ctx.session.user.id,
    },
  });
});
