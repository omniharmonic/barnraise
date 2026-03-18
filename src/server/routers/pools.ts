import { z } from "zod";
import { eq, and, isNull, sql, desc } from "drizzle-orm";
import { router, protectedProcedure } from "@/lib/trpc/init";
import { createPoolSchema, updatePoolSettingsSchema } from "@/lib/validators/pools";
import {
  pools,
  poolMemberships,
  vouchers,
  pointTransactions,
  auditLog,
  accounts,
  events,
  eventClaims,
} from "@/lib/db/schema";
import { generatePoolSymbol } from "@/lib/utils";
import { TRPCError } from "@trpc/server";
import { sendNotificationToMany } from "@/server/services/notifications";

export const poolsRouter = router({
  create: protectedProcedure
    .input(createPoolSchema)
    .mutation(async ({ ctx, input }) => {
      const symbol = generatePoolSymbol(input.name);

      const [pool] = await ctx.db
        .insert(pools)
        .values({
          name: input.name,
          symbol,
          description: input.description,
          locationName: input.locationName,
          websiteUrl: input.websiteUrl || null,
          groupChatUrl: input.groupChatUrl || null,
          customLinks: input.customLinks || null,
          joinPolicy: input.joinPolicy,
          startingBalance: input.startingBalance,
          maxNegativeBalance: input.maxNegativeBalance,
          eventFrequencyLimit: input.eventFrequencyLimit,
          createdBy: ctx.userId,
        })
        .returning();

      // Create membership for creator as steward
      await ctx.db.insert(poolMemberships).values({
        poolId: pool.id,
        accountId: ctx.userId,
        role: "steward",
        startingBalanceGranted: input.startingBalance,
      });

      // Create the pool's labor hour voucher
      const [voucher] = await ctx.db
        .insert(vouchers)
        .values({
          poolId: pool.id,
          name: `${input.name} Labor Hours`,
          symbol: `${symbol}H`,
        })
        .returning();

      // Grant starting balance if > 0
      if (input.startingBalance > 0) {
        await ctx.db.insert(pointTransactions).values({
          poolId: pool.id,
          voucherId: voucher.id,
          accountId: ctx.userId,
          txType: "starting_balance",
          value: input.startingBalance * 1_000_000,
          hours: String(input.startingBalance),
        });
      }

      // Audit log
      await ctx.db.insert(auditLog).values({
        poolId: pool.id,
        actorId: ctx.userId,
        action: "pool_created",
        targetType: "pool",
        targetId: pool.id,
        details: { name: input.name },
      });

      return pool;
    }),

  getById: protectedProcedure
    .input(z.object({ poolId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const pool = await ctx.db.query.pools.findFirst({
        where: eq(pools.id, input.poolId),
      });
      if (!pool) throw new TRPCError({ code: "NOT_FOUND" });

      // Check membership (any status — we return status to the client)
      const membership = await ctx.db.query.poolMemberships.findFirst({
        where: and(
          eq(poolMemberships.poolId, input.poolId),
          eq(poolMemberships.accountId, ctx.userId),
          isNull(poolMemberships.leftAt)
        ),
      });

      // Gate: pending members can't see full pool data
      if (membership && membership.status === "pending") {
        return {
          pool,
          membership,
          memberCount: 0,
          totalHoursExchanged: 0,
          userBalance: { earned: 0, spent: 0, balance: 0 },
          pending: true,
        };
      }

      // Get member count (active only)
      const [memberCount] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(poolMemberships)
        .where(
          and(
            eq(poolMemberships.poolId, input.poolId),
            eq(poolMemberships.status, "active"),
            isNull(poolMemberships.leftAt)
          )
        );

      // Get total hours exchanged
      const [hoursStats] = await ctx.db
        .select({
          totalEarned: sql<number>`coalesce(sum(case when tx_type = 'earn' then hours::numeric else 0 end), 0)::numeric`,
        })
        .from(pointTransactions)
        .where(eq(pointTransactions.poolId, input.poolId));

      // Get user balance
      let userBalance = { earned: 0, spent: 0, balance: 0 };
      if (membership) {
        const [bal] = await ctx.db
          .select({
            earned: sql<number>`coalesce(sum(case when tx_type in ('earn', 'starting_balance') then hours::numeric else 0 end), 0)::numeric`,
            spent: sql<number>`coalesce(sum(case when tx_type = 'spend' then hours::numeric else 0 end), 0)::numeric`,
          })
          .from(pointTransactions)
          .where(
            and(
              eq(pointTransactions.poolId, input.poolId),
              eq(pointTransactions.accountId, ctx.userId)
            )
          );
        userBalance = {
          earned: Number(bal.earned),
          spent: Number(bal.spent),
          balance: Number(bal.earned) - Number(bal.spent),
        };
      }

      return {
        pool,
        membership,
        memberCount: memberCount.count,
        totalHoursExchanged: Number(hoursStats.totalEarned),
        userBalance,
        pending: false,
      };
    }),

  members: protectedProcedure
    .input(z.object({ poolId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const members = await ctx.db
        .select({
          membership: poolMemberships,
          account: accounts,
          earned: sql<number>`coalesce(sum(case when ${pointTransactions.txType} in ('earn', 'starting_balance') then ${pointTransactions.hours}::numeric else 0 end), 0)::numeric`,
          spent: sql<number>`coalesce(sum(case when ${pointTransactions.txType} = 'spend' then ${pointTransactions.hours}::numeric else 0 end), 0)::numeric`,
        })
        .from(poolMemberships)
        .innerJoin(accounts, eq(accounts.id, poolMemberships.accountId))
        .leftJoin(
          pointTransactions,
          and(
            eq(pointTransactions.poolId, poolMemberships.poolId),
            eq(pointTransactions.accountId, poolMemberships.accountId)
          )
        )
        .where(
          and(
            eq(poolMemberships.poolId, input.poolId),
            eq(poolMemberships.status, "active"),
            isNull(poolMemberships.leftAt)
          )
        )
        .groupBy(poolMemberships.id, accounts.id);

      return members.map((m) => ({
        ...m.membership,
        account: m.account,
        hoursEarned: Number(m.earned),
        hoursSpent: Number(m.spent),
        balance: Number(m.earned) - Number(m.spent),
      }));
    }),

  join: protectedProcedure
    .input(z.object({ poolId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const pool = await ctx.db.query.pools.findFirst({
        where: eq(pools.id, input.poolId),
      });
      if (!pool) throw new TRPCError({ code: "NOT_FOUND" });

      // Check if already a member
      const existing = await ctx.db.query.poolMemberships.findFirst({
        where: and(
          eq(poolMemberships.poolId, input.poolId),
          eq(poolMemberships.accountId, ctx.userId)
        ),
      });
      if (existing && !existing.leftAt) {
        throw new TRPCError({ code: "CONFLICT", message: "Already a member" });
      }

      const status = pool.joinPolicy === "approval" ? "pending" : "active";

      const [membership] = await ctx.db
        .insert(poolMemberships)
        .values({
          poolId: input.poolId,
          accountId: ctx.userId,
          role: "member",
          startingBalanceGranted: pool.startingBalance,
          status,
        })
        .onConflictDoUpdate({
          target: [poolMemberships.poolId, poolMemberships.accountId],
          set: {
            leftAt: null,
            status,
            joinedAt: new Date(),
          },
        })
        .returning();

      // Grant starting balance if active and > 0
      if (status === "active" && pool.startingBalance > 0) {
        const voucher = await ctx.db.query.vouchers.findFirst({
          where: eq(vouchers.poolId, input.poolId),
        });
        if (voucher) {
          await ctx.db.insert(pointTransactions).values({
            poolId: input.poolId,
            voucherId: voucher.id,
            accountId: ctx.userId,
            txType: "starting_balance",
            value: pool.startingBalance * 1_000_000,
            hours: String(pool.startingBalance),
          });
        }
      }

      await ctx.db.insert(auditLog).values({
        poolId: input.poolId,
        actorId: ctx.userId,
        action: "member_joined",
        targetType: "membership",
        targetId: membership.id,
      });

      return membership;
    }),

  updateSettings: protectedProcedure
    .input(updatePoolSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      // Check steward role
      const membership = await ctx.db.query.poolMemberships.findFirst({
        where: and(
          eq(poolMemberships.poolId, input.poolId),
          eq(poolMemberships.accountId, ctx.userId),
          isNull(poolMemberships.leftAt)
        ),
      });
      if (!membership || membership.role !== "steward") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const { poolId, ...updates } = input;
      const [updated] = await ctx.db
        .update(pools)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(pools.id, poolId))
        .returning();

      await ctx.db.insert(auditLog).values({
        poolId,
        actorId: ctx.userId,
        action: "settings_changed",
        targetType: "pool",
        targetId: poolId,
        details: updates,
      });

      return updated;
    }),

  removeMember: protectedProcedure
    .input(z.object({ poolId: z.string().uuid(), accountId: z.string().uuid(), reason: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const steward = await ctx.db.query.poolMemberships.findFirst({
        where: and(
          eq(poolMemberships.poolId, input.poolId),
          eq(poolMemberships.accountId, ctx.userId),
          eq(poolMemberships.role, "steward"),
          isNull(poolMemberships.leftAt)
        ),
      });
      if (!steward) throw new TRPCError({ code: "FORBIDDEN" });
      if (input.accountId === ctx.userId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot remove yourself" });
      }

      await ctx.db
        .update(poolMemberships)
        .set({ leftAt: new Date() })
        .where(
          and(
            eq(poolMemberships.poolId, input.poolId),
            eq(poolMemberships.accountId, input.accountId),
            isNull(poolMemberships.leftAt)
          )
        );

      await ctx.db.insert(auditLog).values({
        poolId: input.poolId,
        actorId: ctx.userId,
        action: "member_removed",
        targetType: "membership",
        targetId: input.accountId,
        details: { reason: input.reason },
      });

      const removed = await ctx.db.query.accounts.findFirst({ where: eq(accounts.id, input.accountId) });
      await sendNotificationToMany([input.accountId], {
        type: "member_joined",
        title: `You were removed from ${(await ctx.db.query.pools.findFirst({ where: eq(pools.id, input.poolId) }))?.name}`,
        body: input.reason || undefined,
        data: { poolId: input.poolId },
      });

      return { success: true };
    }),

  updateMemberRole: protectedProcedure
    .input(z.object({ poolId: z.string().uuid(), accountId: z.string().uuid(), role: z.enum(["member", "steward"]) }))
    .mutation(async ({ ctx, input }) => {
      const steward = await ctx.db.query.poolMemberships.findFirst({
        where: and(
          eq(poolMemberships.poolId, input.poolId),
          eq(poolMemberships.accountId, ctx.userId),
          eq(poolMemberships.role, "steward"),
          isNull(poolMemberships.leftAt)
        ),
      });
      if (!steward) throw new TRPCError({ code: "FORBIDDEN" });

      const [updated] = await ctx.db
        .update(poolMemberships)
        .set({ role: input.role })
        .where(
          and(
            eq(poolMemberships.poolId, input.poolId),
            eq(poolMemberships.accountId, input.accountId),
            isNull(poolMemberships.leftAt)
          )
        )
        .returning();

      await ctx.db.insert(auditLog).values({
        poolId: input.poolId,
        actorId: ctx.userId,
        action: input.role === "steward" ? "member_promoted" : "member_demoted",
        targetType: "membership",
        targetId: input.accountId,
      });

      return updated;
    }),

  pendingMembers: protectedProcedure
    .input(z.object({ poolId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const steward = await ctx.db.query.poolMemberships.findFirst({
        where: and(
          eq(poolMemberships.poolId, input.poolId),
          eq(poolMemberships.accountId, ctx.userId),
          eq(poolMemberships.role, "steward"),
          isNull(poolMemberships.leftAt)
        ),
      });
      if (!steward) throw new TRPCError({ code: "FORBIDDEN" });

      const pending = await ctx.db
        .select({ membership: poolMemberships, account: accounts })
        .from(poolMemberships)
        .innerJoin(accounts, eq(accounts.id, poolMemberships.accountId))
        .where(
          and(
            eq(poolMemberships.poolId, input.poolId),
            eq(poolMemberships.status, "pending")
          )
        );

      return pending.map((p) => ({ ...p.membership, account: p.account }));
    }),

  approveJoin: protectedProcedure
    .input(z.object({ poolId: z.string().uuid(), accountId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const steward = await ctx.db.query.poolMemberships.findFirst({
        where: and(
          eq(poolMemberships.poolId, input.poolId),
          eq(poolMemberships.accountId, ctx.userId),
          eq(poolMemberships.role, "steward"),
          isNull(poolMemberships.leftAt)
        ),
      });
      if (!steward) throw new TRPCError({ code: "FORBIDDEN" });

      await ctx.db
        .update(poolMemberships)
        .set({ status: "active", joinedAt: new Date() })
        .where(
          and(
            eq(poolMemberships.poolId, input.poolId),
            eq(poolMemberships.accountId, input.accountId),
            eq(poolMemberships.status, "pending")
          )
        );

      // Grant starting balance
      const pool = await ctx.db.query.pools.findFirst({ where: eq(pools.id, input.poolId) });
      if (pool && pool.startingBalance > 0) {
        const voucher = await ctx.db.query.vouchers.findFirst({ where: eq(vouchers.poolId, input.poolId) });
        if (voucher) {
          await ctx.db.insert(pointTransactions).values({
            poolId: input.poolId,
            voucherId: voucher.id,
            accountId: input.accountId,
            txType: "starting_balance",
            value: pool.startingBalance * 1_000_000,
            hours: String(pool.startingBalance),
          });
        }
      }

      await sendNotificationToMany([input.accountId], {
        type: "member_joined",
        title: `You've been approved to join ${pool?.name}!`,
        body: pool?.startingBalance ? `You received ${pool.startingBalance} starting hours.` : undefined,
        data: { poolId: input.poolId },
      });

      await ctx.db.insert(auditLog).values({
        poolId: input.poolId,
        actorId: ctx.userId,
        action: "member_approved",
        targetType: "membership",
        targetId: input.accountId,
      });

      return { success: true };
    }),

  rejectJoin: protectedProcedure
    .input(z.object({ poolId: z.string().uuid(), accountId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const steward = await ctx.db.query.poolMemberships.findFirst({
        where: and(
          eq(poolMemberships.poolId, input.poolId),
          eq(poolMemberships.accountId, ctx.userId),
          eq(poolMemberships.role, "steward"),
          isNull(poolMemberships.leftAt)
        ),
      });
      if (!steward) throw new TRPCError({ code: "FORBIDDEN" });

      await ctx.db
        .update(poolMemberships)
        .set({ leftAt: new Date(), status: "active" })
        .where(
          and(
            eq(poolMemberships.poolId, input.poolId),
            eq(poolMemberships.accountId, input.accountId),
            eq(poolMemberships.status, "pending")
          )
        );

      return { success: true };
    }),

  leavePool: protectedProcedure
    .input(z.object({ poolId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(poolMemberships)
        .set({ leftAt: new Date() })
        .where(
          and(
            eq(poolMemberships.poolId, input.poolId),
            eq(poolMemberships.accountId, ctx.userId),
            isNull(poolMemberships.leftAt)
          )
        );

      await ctx.db.insert(auditLog).values({
        poolId: input.poolId,
        actorId: ctx.userId,
        action: "member_left",
        targetType: "membership",
        targetId: ctx.userId,
      });

      return { success: true };
    }),

  myPools: protectedProcedure.query(async ({ ctx }) => {
    const myMemberships = await ctx.db
      .select({
        pool: pools,
        membership: poolMemberships,
        memberCount: sql<number>`(
          select count(*)::int from pool_memberships pm2
          where pm2.pool_id = ${pools.id} and pm2.left_at is null
        )`,
        balance: sql<number>`coalesce(
          (select sum(case when pt.tx_type in ('earn', 'starting_balance') then pt.hours::numeric else 0 end) -
                 sum(case when pt.tx_type = 'spend' then pt.hours::numeric else 0 end)
           from point_transactions pt
           where pt.pool_id = ${pools.id} and pt.account_id = ${ctx.userId}
          ), 0)::numeric`,
      })
      .from(poolMemberships)
      .innerJoin(pools, eq(pools.id, poolMemberships.poolId))
      .where(
        and(
          eq(poolMemberships.accountId, ctx.userId),
          isNull(poolMemberships.leftAt),
          eq(poolMemberships.status, "active")
        )
      );

    return myMemberships.map((m) => ({
      ...m.pool,
      membership: m.membership,
      memberCount: m.memberCount,
      balance: Number(m.balance),
    }));
  }),

  health: protectedProcedure
    .input(z.object({ poolId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Active members (attended or hosted in last 30 days)
      const [activeMembers] = await ctx.db
        .select({
          count: sql<number>`count(distinct ${eventClaims.accountId})::int`,
        })
        .from(eventClaims)
        .innerJoin(events, eq(events.id, eventClaims.eventId))
        .where(
          and(
            eq(events.poolId, input.poolId),
            sql`${eventClaims.verifiedAt} > now() - interval '30 days'`,
            eq(eventClaims.status, "verified_attended")
          )
        );

      // Total members
      const [totalMembers] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(poolMemberships)
        .where(
          and(
            eq(poolMemberships.poolId, input.poolId),
            isNull(poolMemberships.leftAt)
          )
        );

      // No-show rate
      const [noshowStats] = await ctx.db
        .select({
          total: sql<number>`count(*)::int`,
          noshows: sql<number>`count(*) filter (where ${eventClaims.status} = 'verified_noshow')::int`,
        })
        .from(eventClaims)
        .innerJoin(events, eq(events.id, eventClaims.eventId))
        .where(
          and(
            eq(events.poolId, input.poolId),
            sql`${eventClaims.status} in ('verified_attended', 'verified_noshow')`
          )
        );

      // Fill rate (avg hours_claimed / total_hours_needed for recent events)
      const [fillRate] = await ctx.db
        .select({
          avgFill: sql<number>`coalesce(avg(
            case when ${events.totalHoursNeeded} > 0
              then ${events.hoursClaimed}::numeric / ${events.totalHoursNeeded} * 100
              else 0 end
          ), 0)::numeric`,
        })
        .from(events)
        .where(
          and(
            eq(events.poolId, input.poolId),
            sql`${events.status} in ('verified', 'completed', 'confirmed', 'in_progress')`
          )
        );

      // Events per month (last 6 months)
      const monthlyEvents = await ctx.db
        .select({
          month: sql<string>`to_char(${events.dateStart}, 'YYYY-MM')`,
          count: sql<number>`count(*)::int`,
        })
        .from(events)
        .where(
          and(
            eq(events.poolId, input.poolId),
            sql`${events.dateStart} > now() - interval '6 months'`,
            sql`${events.status} != 'cancelled'`
          )
        )
        .groupBy(sql`to_char(${events.dateStart}, 'YYYY-MM')`)
        .orderBy(sql`to_char(${events.dateStart}, 'YYYY-MM')`);

      // Reciprocity distribution — balance bands for members
      const memberBalances = await ctx.db
        .select({
          accountId: poolMemberships.accountId,
          earned: sql<number>`coalesce(sum(case when ${pointTransactions.txType} in ('earn', 'starting_balance') then ${pointTransactions.hours}::numeric else 0 end), 0)::numeric`,
          spent: sql<number>`coalesce(sum(case when ${pointTransactions.txType} = 'spend' then ${pointTransactions.hours}::numeric else 0 end), 0)::numeric`,
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
            eq(poolMemberships.poolId, input.poolId),
            isNull(poolMemberships.leftAt)
          )
        )
        .groupBy(poolMemberships.accountId);

      const ratios = memberBalances.map((m) => {
        const earned = Number(m.earned);
        const spent = Number(m.spent);
        if (spent === 0) return earned > 0 ? 2.0 : 1.0;
        return earned / spent;
      });

      // Bucket into bands
      const bands = { "0-0.5": 0, "0.5-1.0": 0, "1.0-1.5": 0, "1.5-2.0": 0, "2.0+": 0 };
      for (const r of ratios) {
        if (r < 0.5) bands["0-0.5"]++;
        else if (r < 1.0) bands["0.5-1.0"]++;
        else if (r < 1.5) bands["1.0-1.5"]++;
        else if (r < 2.0) bands["1.5-2.0"]++;
        else bands["2.0+"]++;
      }

      return {
        activeMembers: activeMembers.count,
        totalMembers: totalMembers.count,
        noshowRate:
          noshowStats.total > 0
            ? Math.round((noshowStats.noshows / noshowStats.total) * 100)
            : 0,
        avgFillRate: Math.round(Number(fillRate.avgFill)),
        monthlyEvents,
        reciprocityBands: bands,
      };
    }),

  skillTags: protectedProcedure
    .input(z.object({ poolId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const pool = await ctx.db.query.pools.findFirst({
        where: eq(pools.id, input.poolId),
      });
      return pool?.skillTags || [];
    }),

  activity: protectedProcedure
    .input(z.object({ poolId: z.string().uuid(), limit: z.number().default(20) }))
    .query(async ({ ctx, input }) => {
      const logs = await ctx.db
        .select({
          log: auditLog,
          actor: accounts,
        })
        .from(auditLog)
        .innerJoin(accounts, eq(accounts.id, auditLog.actorId))
        .where(eq(auditLog.poolId, input.poolId))
        .orderBy(desc(auditLog.createdAt))
        .limit(input.limit);

      return logs.map((l) => ({
        ...l.log,
        actor: l.actor,
      }));
    }),
});
