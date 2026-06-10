import { z } from "zod";
import { eq, and, isNull, sql, desc } from "drizzle-orm";
import { router, protectedProcedure } from "@/lib/trpc/init";
import { accounts, pointTransactions, eventClaims, events, poolMemberships } from "@/lib/db/schema";
import { selfAccountColumns, memberAccountColumns } from "@/lib/db/projections";
import { earnedHoursExpr, spentHoursExpr } from "@/lib/db/ledger";
import { TRPCError } from "@trpc/server";

export const usersRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const [account] = await ctx.db
      .select(selfAccountColumns)
      .from(accounts)
      .where(eq(accounts.id, ctx.userId));
    return account ?? null;
  }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        displayName: z.string().min(1).max(100).optional(),
        bio: z.string().max(500).optional(),
        locationName: z.string().max(200).optional(),
        skills: z.array(z.string()).max(20).optional(),
        avatarUrl: z.string().max(2000).nullish(),
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

  myPoolStats: protectedProcedure.query(async ({ ctx }) => {
    // Get aggregated stats across all pools
    const poolStats = await ctx.db
      .select({
        poolId: poolMemberships.poolId,
        poolName: sql<string>`(select name from pools where id = ${poolMemberships.poolId})`,
        role: poolMemberships.role,
        joinedAt: poolMemberships.joinedAt,
        earned: earnedHoursExpr,
        spent: spentHoursExpr,
      })
      .from(poolMemberships)
      .leftJoin(
        pointTransactions,
        and(
          eq(pointTransactions.poolId, poolMemberships.poolId),
          eq(pointTransactions.accountId, poolMemberships.accountId)
        )
      )
      .where(
        and(
          eq(poolMemberships.accountId, ctx.userId),
          isNull(poolMemberships.leftAt),
          eq(poolMemberships.status, "active")
        )
      )
      .groupBy(poolMemberships.poolId, poolMemberships.role, poolMemberships.joinedAt);

    // Attendance stats
    const [attendance] = await ctx.db
      .select({
        totalClaims: sql<number>`count(*)::int`,
        attended: sql<number>`count(*) filter (where ${eventClaims.status} = 'verified_attended')::int`,
        noShows: sql<number>`count(*) filter (where ${eventClaims.status} = 'verified_noshow')::int`,
      })
      .from(eventClaims)
      .where(eq(eventClaims.accountId, ctx.userId));

    // Events hosted
    const [hosted] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(events)
      .where(
        and(
          eq(events.hostId, ctx.userId),
          sql`${events.status} != 'cancelled'`
        )
      );

    const totalEarned = poolStats.reduce((s, p) => s + Number(p.earned), 0);
    const totalSpent = poolStats.reduce((s, p) => s + Number(p.spent), 0);

    return {
      pools: poolStats.map((p) => ({
        poolId: p.poolId,
        poolName: p.poolName,
        role: p.role,
        joinedAt: p.joinedAt,
        earned: Number(p.earned),
        spent: Number(p.spent),
        balance: Number(p.earned) - Number(p.spent),
      })),
      totals: {
        earned: totalEarned,
        spent: totalSpent,
        balance: totalEarned - totalSpent,
        poolCount: poolStats.length,
        eventsHosted: hosted.count,
        eventsAttended: attendance.attended,
        noShows: attendance.noShows,
        reliability:
          attendance.attended + attendance.noShows > 0
            ? Math.round(
                (attendance.attended / (attendance.attended + attendance.noShows)) * 100
              )
            : 100,
      },
    };
  }),

  poolProfile: protectedProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        poolId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Member-only: the pool is the trust boundary. The caller must be an
      // active member of the pool to view a member's per-pool profile.
      const callerMembership = await ctx.db.query.poolMemberships.findFirst({
        where: and(
          eq(poolMemberships.poolId, input.poolId),
          eq(poolMemberships.accountId, ctx.userId),
          eq(poolMemberships.status, "active"),
          isNull(poolMemberships.leftAt)
        ),
      });
      if (!callerMembership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Must be a pool member" });
      }

      const [account] = await ctx.db
        .select(memberAccountColumns)
        .from(accounts)
        .where(eq(accounts.id, input.userId));

      // Balance
      const [bal] = await ctx.db
        .select({
          earned: earnedHoursExpr,
          spent: spentHoursExpr,
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
