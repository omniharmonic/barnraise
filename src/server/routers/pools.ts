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
import { memberAccountColumns } from "@/lib/db/projections";
import type { Database, DbConn } from "@/lib/db";

/** True if the account has ever received a starting-balance grant in this pool. */
async function hasStartingBalanceGrant(db: DbConn, poolId: string, accountId: string) {
  const existing = await db
    .select({ id: pointTransactions.id })
    .from(pointTransactions)
    .where(
      and(
        eq(pointTransactions.poolId, poolId),
        eq(pointTransactions.accountId, accountId),
        eq(pointTransactions.txType, "starting_balance")
      )
    )
    .limit(1);
  return existing.length > 0;
}

/** Throw FORBIDDEN unless the caller is an active member of the pool. */
async function assertActiveMember(db: Database, poolId: string, accountId: string) {
  const membership = await db.query.poolMemberships.findFirst({
    where: and(
      eq(poolMemberships.poolId, poolId),
      eq(poolMemberships.accountId, accountId),
      eq(poolMemberships.status, "active"),
      isNull(poolMemberships.leftAt)
    ),
  });
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Must be a pool member" });
  }
  return membership;
}

export const poolsRouter = router({
  create: protectedProcedure
    .input(createPoolSchema)
    .mutation(async ({ ctx, input }) => {
      const symbol = generatePoolSymbol(input.name);

      // Pool, steward membership, voucher, and the starting-balance grant must
      // all commit together — a pool without its voucher would break event
      // verification later.
      return await ctx.db.transaction(async (tx) => {
        const [pool] = await tx
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

        await tx.insert(poolMemberships).values({
          poolId: pool.id,
          accountId: ctx.userId,
          role: "steward",
          startingBalanceGranted: input.startingBalance,
        });

        const [voucher] = await tx
          .insert(vouchers)
          .values({
            poolId: pool.id,
            name: `${input.name} Labor Hours`,
            symbol: `${symbol}H`,
          })
          .returning();

        if (input.startingBalance > 0) {
          await tx.insert(pointTransactions).values({
            poolId: pool.id,
            voucherId: voucher.id,
            accountId: ctx.userId,
            txType: "starting_balance",
            value: input.startingBalance * 10 ** voucher.decimals,
            hours: String(input.startingBalance),
          });
        }

        await tx.insert(auditLog).values({
          poolId: pool.id,
          actorId: ctx.userId,
          action: "pool_created",
          targetType: "pool",
          targetId: pool.id,
          details: { name: input.name },
        });

        return pool;
      });
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
      await assertActiveMember(ctx.db, input.poolId, ctx.userId);
      const members = await ctx.db
        .select({
          membership: poolMemberships,
          account: memberAccountColumns,
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

      return await ctx.db.transaction(async (tx) => {
        // A member who left and rejoins must NOT be granted the starting
        // balance again (else leave+rejoin farms free hours).
        const alreadyGranted = await hasStartingBalanceGrant(tx, input.poolId, ctx.userId);

        const [membership] = await tx
          .insert(poolMemberships)
          .values({
            poolId: input.poolId,
            accountId: ctx.userId,
            role: "member",
            startingBalanceGranted: alreadyGranted ? 0 : pool.startingBalance,
            status,
          })
          .onConflictDoUpdate({
            target: [poolMemberships.poolId, poolMemberships.accountId],
            set: { leftAt: null, status, joinedAt: new Date() },
          })
          .returning();

        if (!alreadyGranted && status === "active" && pool.startingBalance > 0) {
          const voucher = await tx.query.vouchers.findFirst({
            where: eq(vouchers.poolId, input.poolId),
          });
          if (voucher) {
            await tx.insert(pointTransactions).values({
              poolId: input.poolId,
              voucherId: voucher.id,
              accountId: ctx.userId,
              txType: "starting_balance",
              value: pool.startingBalance * 10 ** voucher.decimals,
              hours: String(pool.startingBalance),
            });
          }
        }

        await tx.insert(auditLog).values({
          poolId: input.poolId,
          actorId: ctx.userId,
          action: "member_joined",
          targetType: "membership",
          targetId: membership.id,
        });

        return membership;
      });
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

      const removedFromPool = await ctx.db.query.pools.findFirst({
        where: eq(pools.id, input.poolId),
      });
      await sendNotificationToMany([input.accountId], {
        type: "member_removed",
        title: `You were removed from ${removedFromPool?.name}`,
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

      // Stewards may see the requester's email to recognize who is asking
      // to join — this endpoint is steward-gated above.
      const pending = await ctx.db
        .select({
          membership: poolMemberships,
          account: { ...memberAccountColumns, email: accounts.email },
        })
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

      const pool = await ctx.db.query.pools.findFirst({ where: eq(pools.id, input.poolId) });
      if (!pool) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db.transaction(async (tx) => {
        const updated = await tx
          .update(poolMemberships)
          .set({ status: "active", joinedAt: new Date() })
          .where(
            and(
              eq(poolMemberships.poolId, input.poolId),
              eq(poolMemberships.accountId, input.accountId),
              eq(poolMemberships.status, "pending")
            )
          )
          .returning();
        if (updated.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "No pending request" });
        }

        // Grant starting balance only if never granted before in this pool
        const alreadyGranted = await hasStartingBalanceGrant(tx, input.poolId, input.accountId);
        if (!alreadyGranted && pool.startingBalance > 0) {
          const voucher = await tx.query.vouchers.findFirst({
            where: eq(vouchers.poolId, input.poolId),
          });
          if (voucher) {
            await tx.insert(pointTransactions).values({
              poolId: input.poolId,
              voucherId: voucher.id,
              accountId: input.accountId,
              txType: "starting_balance",
              value: pool.startingBalance * 10 ** voucher.decimals,
              hours: String(pool.startingBalance),
            });
          }
        }

        await tx.insert(auditLog).values({
          poolId: input.poolId,
          actorId: ctx.userId,
          action: "member_approved",
          targetType: "membership",
          targetId: input.accountId,
        });
      });

      await sendNotificationToMany([input.accountId], {
        type: "member_joined",
        title: `You've been approved to join ${pool.name}!`,
        body: pool.startingBalance ? `You received ${pool.startingBalance} starting hours.` : undefined,
        data: { poolId: input.poolId },
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

      // Terminal 'rejected' state — do NOT mark active (that previously left
      // rejected users as active+left, polluting status='active' queries).
      await ctx.db
        .update(poolMemberships)
        .set({ leftAt: new Date(), status: "rejected" })
        .where(
          and(
            eq(poolMemberships.poolId, input.poolId),
            eq(poolMemberships.accountId, input.accountId),
            eq(poolMemberships.status, "pending")
          )
        );

      await ctx.db.insert(auditLog).values({
        poolId: input.poolId,
        actorId: ctx.userId,
        action: "member_rejected",
        targetType: "membership",
        targetId: input.accountId,
      });

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
      await assertActiveMember(ctx.db, input.poolId, ctx.userId);
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
      await assertActiveMember(ctx.db, input.poolId, ctx.userId);
      const logs = await ctx.db
        .select({
          log: auditLog,
          actor: memberAccountColumns,
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
