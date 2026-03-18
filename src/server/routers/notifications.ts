import { z } from "zod";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { router, protectedProcedure } from "@/lib/trpc/init";
import { notifications } from "@/lib/db/schema";

export const notificationsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(50).default(20),
        cursor: z.string().uuid().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await ctx.db
        .select()
        .from(notifications)
        .where(eq(notifications.accountId, ctx.userId))
        .orderBy(desc(notifications.createdAt))
        .limit(input.limit + 1);

      const hasMore = items.length > input.limit;
      if (hasMore) items.pop();

      return { items, hasMore };
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const [result] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.accountId, ctx.userId),
          isNull(notifications.readAt)
        )
      );
    return result.count;
  }),

  markRead: protectedProcedure
    .input(z.object({ notificationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notifications.id, input.notificationId),
            eq(notifications.accountId, ctx.userId)
          )
        );
      return { success: true };
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.accountId, ctx.userId),
          isNull(notifications.readAt)
        )
      );
    return { success: true };
  }),
});
