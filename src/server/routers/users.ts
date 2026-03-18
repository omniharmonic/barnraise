import { z } from "zod";
import { eq, and, sql, desc } from "drizzle-orm";
import { router, protectedProcedure } from "@/lib/trpc/init";
import { accounts, pointTransactions, eventClaims, events, poolMemberships } from "@/lib/db/schema";

export const usersRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const account = await ctx.db.query.accounts.findFirst({
      where: eq(accounts.id, ctx.userId),
    });
    return account;
  }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        displayName: z.string().min(1).max(100).optional(),
        bio: z.string().max(500).optional(),
        locationName: z.string().max(200).optional(),
        skills: z.array(z.string()).max(20).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(accounts)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(accounts.id, ctx.userId))
        .returning();
      return updated;
    }),

  poolProfile: protectedProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        poolId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const account = await ctx.db.query.accounts.findFirst({
        where: eq(accounts.id, input.userId),
      });

      // Balance
      const [bal] = await ctx.db
        .select({
          earned: sql<number>`coalesce(sum(case when tx_type in ('earn', 'starting_balance') then hours::numeric else 0 end), 0)::numeric`,
          spent: sql<number>`coalesce(sum(case when tx_type = 'spend' then hours::numeric else 0 end), 0)::numeric`,
        })
        .from(pointTransactions)
        .where(
          and(
            eq(pointTransactions.poolId, input.poolId),
            eq(pointTransactions.accountId, input.userId)
          )
        );

      // Attendance reliability
      const [reliability] = await ctx.db
        .select({
          totalClaims: sql<number>`count(*)::int`,
          attended: sql<number>`count(*) filter (where ${eventClaims.status} = 'verified_attended')::int`,
          noShows: sql<number>`count(*) filter (where ${eventClaims.status} = 'verified_noshow')::int`,
          noShows90d: sql<number>`count(*) filter (where ${eventClaims.status} = 'verified_noshow' and ${eventClaims.verifiedAt} > now() - interval '90 days')::int`,
          lateCancels: sql<number>`count(*) filter (where ${eventClaims.lateCancel} = true)::int`,
        })
        .from(eventClaims)
        .innerJoin(events, eq(events.id, eventClaims.eventId))
        .where(
          and(
            eq(eventClaims.accountId, input.userId),
            eq(events.poolId, input.poolId)
          )
        );

      // Event history for this user in this pool
      const eventHistory = await ctx.db
        .select({
          claim: eventClaims,
          event: events,
        })
        .from(eventClaims)
        .innerJoin(events, eq(events.id, eventClaims.eventId))
        .where(
          and(
            eq(eventClaims.accountId, input.userId),
            eq(events.poolId, input.poolId)
          )
        )
        .orderBy(desc(events.dateStart))
        .limit(20);

      // Events hosted
      const eventsHosted = await ctx.db
        .select()
        .from(events)
        .where(
          and(
            eq(events.hostId, input.userId),
            eq(events.poolId, input.poolId),
            sql`${events.status} != 'cancelled'`
          )
        )
        .orderBy(desc(events.dateStart))
        .limit(20);

      // Membership info
      const membership = await ctx.db.query.poolMemberships.findFirst({
        where: and(
          eq(poolMemberships.poolId, input.poolId),
          eq(poolMemberships.accountId, input.userId)
        ),
      });

      return {
        account,
        membership,
        hoursEarned: Number(bal.earned),
        hoursSpent: Number(bal.spent),
        balance: Number(bal.earned) - Number(bal.spent),
        contributionRatio:
          Number(bal.spent) > 0
            ? Number(bal.earned) / Number(bal.spent)
            : Number(bal.earned) > 0
            ? Infinity
            : 1.0,
        attendanceReliability:
          reliability.attended + reliability.noShows > 0
            ? (reliability.attended /
                (reliability.attended + reliability.noShows)) *
              100
            : 100,
        totalClaims: reliability.totalClaims,
        attended: reliability.attended,
        noShows: reliability.noShows,
        noShows90d: reliability.noShows90d,
        lateCancels: reliability.lateCancels,
        eventHistory: eventHistory.map((e) => ({
          ...e.event,
          claim: e.claim,
        })),
        eventsHosted,
      };
    }),
});
