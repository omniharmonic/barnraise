import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Session } from "next-auth";
import type { Database } from "@/lib/db";

/**
 * tRPC context shape. Defined here (with type-only imports) so the tRPC
 * primitives below do not pull the auth implementation — and therefore
 * next-auth's runtime — into the router import graph. Only the context
 * factory (./context) imports auth.
 */
export interface TRPCContext {
  db: Database;
  session: Session | null;
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user?.id) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      userId: ctx.session.user.id,
    },
  });
});
