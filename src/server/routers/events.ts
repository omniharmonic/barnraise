import { z } from "zod";
import { eq, and, isNull, sql, desc, inArray } from "drizzle-orm";
import { router, protectedProcedure, publicProcedure } from "@/lib/trpc/init";
import {
  createEventSchema,
  updateEventSchema,
  claimEventSchema,
  verifyEventSchema,
  pledgeEventSchema,
  withdrawPledgeSchema,
} from "@/lib/validators/events";
import {
  events,
  eventClaims,
  eventPledges,
  pools,
  poolMemberships,
  pointTransactions,
  vouchers,
  accounts,
  auditLog,
} from "@/lib/db/schema";
import { TRPCError } from "@trpc/server";
import { sendNotification, sendNotificationToMany } from "@/server/services/notifications";

/** Compute an account's balance in a pool from point_transactions */
async function getAccountBalance(db: any, poolId: string, accountId: string): Promise<number> {
  const [result] = await db
    .select({
      balance: sql<number>`coalesce(
        sum(case when tx_type in ('earn', 'starting_balance') then hours::numeric else 0 end) -
        sum(case when tx_type = 'spend' then hours::numeric else 0 end)
      , 0)::numeric`,
    })
    .from(pointTransactions)
    .where(
      and(
        eq(pointTransactions.poolId, poolId),
        eq(pointTransactions.accountId, accountId)
      )
    );
  return Number(result.balance);
}

/** Largest-remainder method for splitting integer hours proportionally */
function splitProportional(total: number, pledges: { accountId: string; hours: number }[]): Map<string, number> {
  const totalPledged = pledges.reduce((s, p) => s + p.hours, 0);
  const result = new Map<string, number>();

  // Compute exact shares and floor values
  const shares = pledges.map((p) => {
    const exact = (p.hours / totalPledged) * total;
    const floored = Math.floor(exact);
    return { accountId: p.accountId, floored, remainder: exact - floored };
  });

  let distributed = shares.reduce((s, sh) => s + sh.floored, 0);
  let remaining = total - distributed;

  // Sort by largest remainder descending
  shares.sort((a, b) => b.remainder - a.remainder);

  for (const share of shares) {
    if (remaining > 0) {
      result.set(share.accountId, share.floored + 1);
      remaining--;
    } else {
      result.set(share.accountId, share.floored);
    }
  }

  return result;
}

export const eventsRouter = router({
  create: protectedProcedure
    .input(createEventSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify pool membership
      const membership = await ctx.db.query.poolMemberships.findFirst({
        where: and(
          eq(poolMemberships.poolId, input.poolId),
          eq(poolMemberships.accountId, ctx.userId),
          isNull(poolMemberships.leftAt)
        ),
      });
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Must be a pool member to create events",
        });
      }

      const pool = await ctx.db.query.pools.findFirst({
        where: eq(pools.id, input.poolId),
      });
      if (!pool) throw new TRPCError({ code: "NOT_FOUND", message: "Pool not found" });

      const hostBalance = await getAccountBalance(ctx.db, input.poolId, ctx.userId);
      const capacity = hostBalance + Math.abs(pool.maxNegativeBalance);

      if (input.hostingType === "solo") {
        // Solo: balance check at creation
        if (input.totalHoursNeeded > capacity) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Your capacity is ${capacity}h (balance ${hostBalance}h + pool limit ${Math.abs(pool.maxNegativeBalance)}h). Try group hosting to pool balances with co-hosts.`,
          });
        }

        const [event] = await ctx.db
          .insert(events)
          .values({
            poolId: input.poolId,
            hostId: ctx.userId,
            title: input.title,
            description: input.description,
            dateStart: new Date(input.dateStart),
            dateEnd: new Date(input.dateEnd),
            locationName: input.locationName,
            totalHoursNeeded: input.totalHoursNeeded,
            maxParticipants: input.maxParticipants,
            minParticipants: input.minParticipants,
            flexibleHours: input.flexibleHours,
            skillTags: input.skillTags,
            potluckUrl: input.potluckUrl,
            bannerImageUrl: input.bannerImageUrl,
            hostingType: "solo",
            status: "open",
          })
          .returning();

        // Merge new skill tags into pool's accumulated tags
        if (input.skillTags && input.skillTags.length > 0) {
          const existingTags = pool.skillTags || [];
          const merged = [...new Set([...existingTags, ...input.skillTags])];
          if (merged.length > existingTags.length) {
            await ctx.db.update(pools).set({ skillTags: merged }).where(eq(pools.id, input.poolId));
          }
        }

        await ctx.db.insert(auditLog).values({
          poolId: input.poolId,
          actorId: ctx.userId,
          action: "event_created",
          targetType: "event",
          targetId: event.id,
          details: { title: input.title, hostingType: "solo" },
        });

        // Notify pool members
        const poolMembers = await ctx.db.query.poolMemberships.findMany({
          where: and(
            eq(poolMemberships.poolId, input.poolId),
            isNull(poolMemberships.leftAt)
          ),
        });
        const otherMemberIds = poolMembers
          .filter((m) => m.accountId !== ctx.userId)
          .map((m) => m.accountId);

        const creator = await ctx.db.query.accounts.findFirst({
          where: eq(accounts.id, ctx.userId),
        });

        await sendNotificationToMany(otherMemberIds, {
          type: "new_event",
          title: `New event: ${input.title}`,
          body: `${creator?.displayName} is hosting "${input.title}". Check it out and claim a slot!`,
          data: { eventId: event.id, poolId: input.poolId },
        });

        return event;
      }

      // Group: create in "pledging" status with host's initial pledge
      const hostPledgeHours = input.hostPledgeHours ?? 1;
      if (hostPledgeHours > capacity) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `You can pledge up to ${capacity}h (balance ${hostBalance}h + pool limit ${Math.abs(pool.maxNegativeBalance)}h).`,
        });
      }

      const [event] = await ctx.db
        .insert(events)
        .values({
          poolId: input.poolId,
          hostId: ctx.userId,
          title: input.title,
          description: input.description,
          dateStart: new Date(input.dateStart),
          dateEnd: new Date(input.dateEnd),
          locationName: input.locationName,
          totalHoursNeeded: input.totalHoursNeeded,
          maxParticipants: input.maxParticipants,
          minParticipants: input.minParticipants,
          flexibleHours: input.flexibleHours,
          skillTags: input.skillTags,
          potluckUrl: input.potluckUrl,
          bannerImageUrl: input.bannerImageUrl,
          hostingType: "group",
          status: hostPledgeHours >= input.totalHoursNeeded ? "open" : "pledging",
          hoursPledged: hostPledgeHours,
          coHostCount: 1,
        })
        .returning();

      // Create host's pledge
      await ctx.db.insert(eventPledges).values({
        eventId: event.id,
        accountId: ctx.userId,
        hoursPledged: hostPledgeHours,
      });

      // Merge new skill tags into pool's accumulated tags
      if (input.skillTags && input.skillTags.length > 0) {
        const existingTags = pool.skillTags || [];
        const merged = [...new Set([...existingTags, ...input.skillTags])];
        if (merged.length > existingTags.length) {
          await ctx.db.update(pools).set({ skillTags: merged }).where(eq(pools.id, input.poolId));
        }
      }

      await ctx.db.insert(auditLog).values({
        poolId: input.poolId,
        actorId: ctx.userId,
        action: "event_created",
        targetType: "event",
        targetId: event.id,
        details: { title: input.title, hostingType: "group", hostPledgeHours },
      });

      // Notify pool members
      const poolMembers = await ctx.db.query.poolMemberships.findMany({
        where: and(
          eq(poolMemberships.poolId, input.poolId),
          isNull(poolMemberships.leftAt)
        ),
      });
      const otherMemberIds = poolMembers
        .filter((m) => m.accountId !== ctx.userId)
        .map((m) => m.accountId);

      const creator = await ctx.db.query.accounts.findFirst({
        where: eq(accounts.id, ctx.userId),
      });

      const notifBody = event.status === "pledging"
        ? `${creator?.displayName} is looking for co-hosts for "${input.title}". Pledge hours to help fund it!`
        : `${creator?.displayName} is hosting "${input.title}". Check it out and claim a slot!`;

      await sendNotificationToMany(otherMemberIds, {
        type: "new_event",
        title: `New event: ${input.title}`,
        body: notifBody,
        data: { eventId: event.id, poolId: input.poolId },
      });

      return event;
    }),

  getById: publicProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const event = await ctx.db.query.events.findFirst({
        where: eq(events.id, input.eventId),
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });

      // Lazy status transition
      const now = new Date();
      let currentStatus = event.status;
      if (
        (currentStatus === "open" || currentStatus === "confirmed") &&
        now >= event.dateStart
      ) {
        currentStatus = "in_progress";
        await ctx.db
          .update(events)
          .set({ status: "in_progress", updatedAt: now })
          .where(eq(events.id, input.eventId));
      }
      if (currentStatus === "in_progress" && now >= event.dateEnd) {
        currentStatus = "completed";
        await ctx.db
          .update(events)
          .set({ status: "completed", updatedAt: now })
          .where(eq(events.id, input.eventId));
      }

      // Get host info
      const host = await ctx.db.query.accounts.findFirst({
        where: eq(accounts.id, event.hostId),
      });

      // Get pool info
      const pool = await ctx.db.query.pools.findFirst({
        where: eq(pools.id, event.poolId),
      });

      // Get claims with account info
      const claims = await ctx.db
        .select({
          claim: eventClaims,
          account: accounts,
        })
        .from(eventClaims)
        .innerJoin(accounts, eq(accounts.id, eventClaims.accountId))
        .where(eq(eventClaims.eventId, input.eventId));

      // Get pledges with account info for group events
      let pledges: { pledge: typeof eventPledges.$inferSelect; account: typeof accounts.$inferSelect }[] = [];
      if (event.hostingType === "group") {
        const pledgeRows = await ctx.db
          .select({
            pledge: eventPledges,
            account: accounts,
          })
          .from(eventPledges)
          .innerJoin(accounts, eq(accounts.id, eventPledges.accountId))
          .where(eq(eventPledges.eventId, input.eventId));
        pledges = pledgeRows;
      }

      return {
        ...event,
        status: currentStatus,
        host,
        pool,
        claims: claims.map((c) => ({
          ...c.claim,
          account: c.account,
        })),
        pledges: pledges.map((p) => ({
          ...p.pledge,
          account: p.account,
        })),
      };
    }),

  update: protectedProcedure
    .input(updateEventSchema)
    .mutation(async ({ ctx, input }) => {
      const event = await ctx.db.query.events.findFirst({
        where: eq(events.id, input.eventId),
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });

      if (event.hostId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the host can edit this event",
        });
      }

      if (!["draft", "open", "confirmed", "pledging"].includes(event.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot edit an event that is in progress or completed",
        });
      }

      const { eventId, ...updates } = input;
      const setValues: Record<string, unknown> = { updatedAt: new Date() };
      if (updates.title !== undefined) setValues.title = updates.title;
      if (updates.description !== undefined) setValues.description = updates.description;
      if (updates.dateStart !== undefined) setValues.dateStart = new Date(updates.dateStart);
      if (updates.dateEnd !== undefined) setValues.dateEnd = new Date(updates.dateEnd);
      if (updates.locationName !== undefined) setValues.locationName = updates.locationName;
      if (updates.totalHoursNeeded !== undefined) setValues.totalHoursNeeded = updates.totalHoursNeeded;
      if (updates.maxParticipants !== undefined) setValues.maxParticipants = updates.maxParticipants;
      if (updates.minParticipants !== undefined) setValues.minParticipants = updates.minParticipants;
      if (updates.flexibleHours !== undefined) setValues.flexibleHours = updates.flexibleHours;
      if (updates.skillTags !== undefined) setValues.skillTags = updates.skillTags;
      if (updates.potluckUrl !== undefined) setValues.potluckUrl = updates.potluckUrl;

      // Handle group event auto-transitions when totalHoursNeeded changes
      if (
        event.hostingType === "group" &&
        updates.totalHoursNeeded !== undefined &&
        event.status === "pledging"
      ) {
        if (updates.totalHoursNeeded <= event.hoursPledged) {
          setValues.status = "open";
        }
      }

      const [updated] = await ctx.db
        .update(events)
        .set(setValues)
        .where(eq(events.id, eventId))
        .returning();

      return updated;
    }),

  listByPool: protectedProcedure
    .input(
      z.object({
        poolId: z.string().uuid(),
        status: z.enum(["upcoming", "past", "all"]).default("upcoming"),
        sort: z.enum(["date", "needs_help", "fill_rate"]).default("date"),
      })
    )
    .query(async ({ ctx, input }) => {
      let statusFilter;

      if (input.status === "upcoming") {
        statusFilter = inArray(events.status, [
          "pledging",
          "open",
          "confirmed",
          "in_progress",
        ]);
      } else if (input.status === "past") {
        statusFilter = inArray(events.status, ["completed", "verified"]);
      }

      const eventsList = await ctx.db
        .select({
          event: events,
          host: accounts,
        })
        .from(events)
        .innerJoin(accounts, eq(accounts.id, events.hostId))
        .where(
          and(eq(events.poolId, input.poolId), statusFilter || undefined)
        )
        .orderBy(
          input.sort === "needs_help"
            ? sql`${events.totalHoursNeeded} - ${events.hoursClaimed} desc`
            : input.sort === "fill_rate"
            ? sql`case when ${events.totalHoursNeeded} > 0 then ${events.hoursClaimed}::numeric / ${events.totalHoursNeeded} else 0 end asc`
            : desc(events.dateStart)
        );

      return eventsList.map((e) => ({
        ...e.event,
        host: e.host,
      }));
    }),

  claim: protectedProcedure
    .input(claimEventSchema)
    .mutation(async ({ ctx, input }) => {
      const event = await ctx.db.query.events.findFirst({
        where: eq(events.id, input.eventId),
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });

      if (!["open", "confirmed"].includes(event.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Event is not accepting claims",
        });
      }

      // Verify pool membership
      const membership = await ctx.db.query.poolMemberships.findFirst({
        where: and(
          eq(poolMemberships.poolId, event.poolId),
          eq(poolMemberships.accountId, ctx.userId),
          isNull(poolMemberships.leftAt)
        ),
      });
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Must be a pool member",
        });
      }

      // Check max participants
      if (event.participantsCount >= event.maxParticipants) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Event is full",
        });
      }

      // Check for existing claim
      const existing = await ctx.db.query.eventClaims.findFirst({
        where: and(
          eq(eventClaims.eventId, input.eventId),
          eq(eventClaims.accountId, ctx.userId)
        ),
      });
      if (existing && existing.status === "claimed") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Already claimed",
        });
      }

      let claim;
      if (existing) {
        // Re-claim: update cancelled/no-show claim back to active
        [claim] = await ctx.db
          .update(eventClaims)
          .set({
            status: "claimed",
            hoursCommitted: input.hoursCommitted,
            hoursVerified: null,
            cancelledAt: null,
            lateCancel: false,
            verifiedAt: null,
            createdAt: new Date(),
          })
          .where(eq(eventClaims.id, existing.id))
          .returning();
      } else {
        [claim] = await ctx.db
          .insert(eventClaims)
          .values({
            eventId: input.eventId,
            accountId: ctx.userId,
            hoursCommitted: input.hoursCommitted,
          })
          .returning();
      }

      // Update denormalized counts
      await ctx.db
        .update(events)
        .set({
          hoursClaimed: sql`${events.hoursClaimed} + ${input.hoursCommitted}`,
          participantsCount: sql`${events.participantsCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(events.id, input.eventId));

      // Notify host about the claim
      const claimer = await ctx.db.query.accounts.findFirst({
        where: eq(accounts.id, ctx.userId),
      });
      await sendNotification({
        accountId: event.hostId,
        type: "slot_claimed",
        title: `${claimer?.displayName} claimed ${input.hoursCommitted}h on "${event.title}"`,
        data: { eventId: event.id },
      });

      // Check if min participants reached → confirmed
      const updatedEvent = await ctx.db.query.events.findFirst({
        where: eq(events.id, input.eventId),
      });
      if (
        updatedEvent &&
        updatedEvent.status === "open" &&
        updatedEvent.participantsCount >= (updatedEvent.minParticipants ?? 1)
      ) {
        await ctx.db
          .update(events)
          .set({ status: "confirmed", updatedAt: new Date() })
          .where(eq(events.id, input.eventId));

        await sendNotification({
          accountId: event.hostId,
          type: "event_confirmed",
          title: `"${event.title}" is confirmed!`,
          body: "Minimum participants reached.",
          data: { eventId: event.id },
        });
      }

      return claim;
    }),

  cancelClaim: protectedProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const claim = await ctx.db.query.eventClaims.findFirst({
        where: and(
          eq(eventClaims.eventId, input.eventId),
          eq(eventClaims.accountId, ctx.userId),
          eq(eventClaims.status, "claimed")
        ),
      });
      if (!claim) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const event = await ctx.db.query.events.findFirst({
        where: eq(events.id, input.eventId),
      });

      // Check if late cancel (within 24h)
      const isLate =
        event &&
        event.dateStart.getTime() - Date.now() < 24 * 60 * 60 * 1000;

      await ctx.db
        .update(eventClaims)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          lateCancel: isLate ?? false,
        })
        .where(eq(eventClaims.id, claim.id));

      // Update denormalized counts
      await ctx.db
        .update(events)
        .set({
          hoursClaimed: sql`${events.hoursClaimed} - ${claim.hoursCommitted}`,
          participantsCount: sql`${events.participantsCount} - 1`,
          updatedAt: new Date(),
        })
        .where(eq(events.id, input.eventId));

      return { success: true };
    }),

  updateClaim: protectedProcedure
    .input(z.object({ eventId: z.string().uuid(), hoursCommitted: z.number().int().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const claim = await ctx.db.query.eventClaims.findFirst({
        where: and(
          eq(eventClaims.eventId, input.eventId),
          eq(eventClaims.accountId, ctx.userId),
          eq(eventClaims.status, "claimed")
        ),
      });
      if (!claim) throw new TRPCError({ code: "NOT_FOUND" });

      const event = await ctx.db.query.events.findFirst({
        where: eq(events.id, input.eventId),
      });
      if (!event || !["open", "confirmed"].includes(event.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot update claim for this event" });
      }

      const hoursDiff = input.hoursCommitted - claim.hoursCommitted;

      await ctx.db
        .update(eventClaims)
        .set({ hoursCommitted: input.hoursCommitted })
        .where(eq(eventClaims.id, claim.id));

      await ctx.db
        .update(events)
        .set({
          hoursClaimed: sql`${events.hoursClaimed} + ${hoursDiff}`,
          updatedAt: new Date(),
        })
        .where(eq(events.id, input.eventId));

      return { success: true };
    }),

  cancelEvent: protectedProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const event = await ctx.db.query.events.findFirst({
        where: eq(events.id, input.eventId),
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });

      if (event.hostId !== ctx.userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the host can cancel" });
      }

      if (["verified", "cancelled"].includes(event.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot cancel this event" });
      }

      // Cancel all active claims
      await ctx.db
        .update(eventClaims)
        .set({ status: "cancelled", cancelledAt: new Date() })
        .where(
          and(
            eq(eventClaims.eventId, input.eventId),
            eq(eventClaims.status, "claimed")
          )
        );

      // Cancel all active pledges (for group events)
      if (event.hostingType === "group") {
        await ctx.db
          .update(eventPledges)
          .set({ status: "withdrawn" })
          .where(
            and(
              eq(eventPledges.eventId, input.eventId),
              eq(eventPledges.status, "active")
            )
          );
      }

      await ctx.db
        .update(events)
        .set({
          status: "cancelled",
          hoursClaimed: 0,
          participantsCount: 0,
          hoursPledged: 0,
          coHostCount: 0,
          updatedAt: new Date(),
        })
        .where(eq(events.id, input.eventId));

      // Notify claimed contributors
      const claimedUsers = await ctx.db.query.eventClaims.findMany({
        where: eq(eventClaims.eventId, input.eventId),
      });
      const claimerIds = claimedUsers
        .filter((c) => c.accountId !== ctx.userId)
        .map((c) => c.accountId);

      if (claimerIds.length > 0) {
        await sendNotificationToMany(claimerIds, {
          type: "new_event",
          title: `"${event.title}" has been cancelled`,
          body: "The host cancelled this event. Your claimed hours have been released.",
          data: { eventId: event.id, poolId: event.poolId },
        });
      }

      await ctx.db.insert(auditLog).values({
        poolId: event.poolId,
        actorId: ctx.userId,
        action: "event_cancelled",
        targetType: "event",
        targetId: event.id,
      });

      return { success: true };
    }),

  verify: protectedProcedure
    .input(verifyEventSchema)
    .mutation(async ({ ctx, input }) => {
      const event = await ctx.db.query.events.findFirst({
        where: eq(events.id, input.eventId),
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });

      if (event.hostId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the host can verify",
        });
      }

      if (event.status === "verified") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Already verified",
        });
      }

      // Allow verification when completed or in_progress (for flexibility)
      if (!["completed", "in_progress"].includes(event.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Event must be completed before verification",
        });
      }

      const voucher = await ctx.db.query.vouchers.findFirst({
        where: eq(vouchers.poolId, event.poolId),
      });
      if (!voucher) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Calculate total hours to distribute
      let totalHoursDistributed = 0;
      for (const v of input.verifications) {
        if (v.attended && v.actualHours > 0) {
          totalHoursDistributed += v.actualHours;
        }
      }

      const pool = await ctx.db.query.pools.findFirst({
        where: eq(pools.id, event.poolId),
      });
      if (!pool) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      if (event.hostingType === "solo") {
        // Solo: single spend from host
        const hostBalance = await getAccountBalance(ctx.db, event.poolId, ctx.userId);
        const newBalance = hostBalance - totalHoursDistributed;
        if (newBalance < pool.maxNegativeBalance) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Verification would push your balance (${newBalance}) below the pool limit (${pool.maxNegativeBalance})`,
          });
        }

        // Process verifications
        for (const v of input.verifications) {
          if (v.attended) {
            await ctx.db
              .update(eventClaims)
              .set({
                status: "verified_attended",
                hoursVerified: v.actualHours,
                verifiedAt: new Date(),
              })
              .where(eq(eventClaims.id, v.claimId));

            if (v.actualHours > 0) {
              await ctx.db.insert(pointTransactions).values({
                poolId: event.poolId,
                voucherId: voucher.id,
                accountId: v.accountId,
                txType: "earn",
                value: v.actualHours * 1_000_000,
                hours: String(v.actualHours),
                eventId: event.id,
                eventClaimId: v.claimId,
              });
            }
          } else {
            await ctx.db
              .update(eventClaims)
              .set({
                status: "verified_noshow",
                hoursVerified: 0,
                verifiedAt: new Date(),
              })
              .where(eq(eventClaims.id, v.claimId));
          }
        }

        // Host spend transaction
        if (totalHoursDistributed > 0) {
          await ctx.db.insert(pointTransactions).values({
            poolId: event.poolId,
            voucherId: voucher.id,
            accountId: event.hostId,
            txType: "spend",
            value: totalHoursDistributed * 1_000_000,
            hours: String(totalHoursDistributed),
            eventId: event.id,
          });
        }
      } else {
        // Group: proportional split among co-hosts
        const activePledges = await ctx.db
          .select()
          .from(eventPledges)
          .where(
            and(
              eq(eventPledges.eventId, input.eventId),
              eq(eventPledges.status, "active")
            )
          );

        if (activePledges.length === 0) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "No active pledges found for group event",
          });
        }

        // Compute proportional shares
        const shares = splitProportional(
          totalHoursDistributed,
          activePledges.map((p) => ({ accountId: p.accountId, hours: p.hoursPledged }))
        );

        // Validate each co-host can cover their share
        for (const [accountId, shareHours] of shares) {
          if (shareHours === 0) continue;
          const balance = await getAccountBalance(ctx.db, event.poolId, accountId);
          const newBalance = balance - shareHours;
          if (newBalance < pool.maxNegativeBalance) {
            const account = await ctx.db.query.accounts.findFirst({
              where: eq(accounts.id, accountId),
            });
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Co-host ${account?.displayName || accountId} can't cover their share (${shareHours}h). Their balance is ${balance}h, limit is ${pool.maxNegativeBalance}h.`,
            });
          }
        }

        // Process verifications (earn transactions for contributors)
        for (const v of input.verifications) {
          if (v.attended) {
            await ctx.db
              .update(eventClaims)
              .set({
                status: "verified_attended",
                hoursVerified: v.actualHours,
                verifiedAt: new Date(),
              })
              .where(eq(eventClaims.id, v.claimId));

            if (v.actualHours > 0) {
              await ctx.db.insert(pointTransactions).values({
                poolId: event.poolId,
                voucherId: voucher.id,
                accountId: v.accountId,
                txType: "earn",
                value: v.actualHours * 1_000_000,
                hours: String(v.actualHours),
                eventId: event.id,
                eventClaimId: v.claimId,
              });
            }
          } else {
            await ctx.db
              .update(eventClaims)
              .set({
                status: "verified_noshow",
                hoursVerified: 0,
                verifiedAt: new Date(),
              })
              .where(eq(eventClaims.id, v.claimId));
          }
        }

        // Create spend transactions for each co-host
        for (const [accountId, shareHours] of shares) {
          if (shareHours === 0) continue;
          await ctx.db.insert(pointTransactions).values({
            poolId: event.poolId,
            voucherId: voucher.id,
            accountId,
            txType: "spend",
            value: shareHours * 1_000_000,
            hours: String(shareHours),
            eventId: event.id,
          });
        }

        // Update pledge statuses to "spent"
        await ctx.db
          .update(eventPledges)
          .set({ status: "spent", spentAt: new Date() })
          .where(
            and(
              eq(eventPledges.eventId, input.eventId),
              eq(eventPledges.status, "active")
            )
          );
      }

      // Update event status
      await ctx.db
        .update(events)
        .set({
          status: "verified",
          hoursVerified: totalHoursDistributed,
          updatedAt: new Date(),
        })
        .where(eq(events.id, input.eventId));

      await ctx.db.insert(auditLog).values({
        poolId: event.poolId,
        actorId: ctx.userId,
        action: "event_verified",
        targetType: "event",
        targetId: event.id,
        details: { totalHoursDistributed, hostingType: event.hostingType },
      });

      // Send notifications to contributors
      for (const v of input.verifications) {
        if (v.attended && v.actualHours > 0) {
          await sendNotification({
            accountId: v.accountId,
            type: "points_earned",
            title: `You earned ${v.actualHours}h for "${event.title}"`,
            body: "Thanks for showing up! Your balance has been updated.",
            data: { eventId: event.id, hours: v.actualHours },
          });
        } else if (!v.attended) {
          await sendNotification({
            accountId: v.accountId,
            type: "noshow_marked",
            title: `You were marked as a no-show for "${event.title}"`,
            body: "This affects your attendance reliability score.",
            data: { eventId: event.id },
          });

          // Check 3-in-90-days no-show threshold
          const [noshowCount] = await ctx.db
            .select({
              count: sql<number>`count(*)::int`,
            })
            .from(eventClaims)
            .innerJoin(events, eq(events.id, eventClaims.eventId))
            .where(
              and(
                eq(eventClaims.accountId, v.accountId),
                eq(events.poolId, event.poolId),
                eq(eventClaims.status, "verified_noshow"),
                sql`${eventClaims.verifiedAt} > now() - interval '90 days'`
              )
            );

          if (noshowCount.count >= 3) {
            // Notify stewards
            const stewards = await ctx.db.query.poolMemberships.findMany({
              where: and(
                eq(poolMemberships.poolId, event.poolId),
                eq(poolMemberships.role, "steward"),
                isNull(poolMemberships.leftAt)
              ),
            });
            const flaggedAccount = await ctx.db.query.accounts.findFirst({
              where: eq(accounts.id, v.accountId),
            });
            await sendNotificationToMany(
              stewards.map((s) => s.accountId),
              {
                type: "noshow_flag",
                title: `${flaggedAccount?.displayName} has ${noshowCount.count} no-shows in 90 days`,
                body: "Consider reaching out to discuss their participation.",
                data: { accountId: v.accountId, poolId: event.poolId },
              }
            );
          }
        }
      }

      return { success: true, totalHoursDistributed };
    }),

  // Pledge hours as a co-host for a group event
  pledge: protectedProcedure
    .input(pledgeEventSchema)
    .mutation(async ({ ctx, input }) => {
      const event = await ctx.db.query.events.findFirst({
        where: eq(events.id, input.eventId),
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });

      if (event.hostingType !== "group") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only group events accept pledges" });
      }

      if (event.status !== "pledging") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Event is no longer accepting pledges" });
      }

      // Verify pool membership
      const membership = await ctx.db.query.poolMemberships.findFirst({
        where: and(
          eq(poolMemberships.poolId, event.poolId),
          eq(poolMemberships.accountId, ctx.userId),
          isNull(poolMemberships.leftAt)
        ),
      });
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Must be a pool member" });
      }

      // Validate pledger's balance can support the pledge
      const pool = await ctx.db.query.pools.findFirst({
        where: eq(pools.id, event.poolId),
      });
      if (!pool) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const balance = await getAccountBalance(ctx.db, event.poolId, ctx.userId);
      const capacity = balance + Math.abs(pool.maxNegativeBalance);
      if (input.hoursPledged > capacity) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `You can pledge up to ${capacity}h (balance ${balance}h + pool limit ${Math.abs(pool.maxNegativeBalance)}h).`,
        });
      }

      // Check for existing pledge (upsert for re-pledge after withdraw)
      const existing = await ctx.db.query.eventPledges.findFirst({
        where: and(
          eq(eventPledges.eventId, input.eventId),
          eq(eventPledges.accountId, ctx.userId)
        ),
      });

      if (existing) {
        if (existing.status === "active") {
          throw new TRPCError({ code: "CONFLICT", message: "You already have an active pledge" });
        }
        // Re-pledge after withdrawal
        const hoursDiff = input.hoursPledged - (existing.status === "withdrawn" ? 0 : existing.hoursPledged);
        await ctx.db
          .update(eventPledges)
          .set({ status: "active", hoursPledged: input.hoursPledged })
          .where(eq(eventPledges.id, existing.id));

        await ctx.db
          .update(events)
          .set({
            hoursPledged: sql`${events.hoursPledged} + ${input.hoursPledged}`,
            coHostCount: sql`${events.coHostCount} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(events.id, input.eventId));
      } else {
        await ctx.db.insert(eventPledges).values({
          eventId: input.eventId,
          accountId: ctx.userId,
          hoursPledged: input.hoursPledged,
        });

        await ctx.db
          .update(events)
          .set({
            hoursPledged: sql`${events.hoursPledged} + ${input.hoursPledged}`,
            coHostCount: sql`${events.coHostCount} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(events.id, input.eventId));
      }

      // Check if funding threshold reached → transition to open
      const updatedEvent = await ctx.db.query.events.findFirst({
        where: eq(events.id, input.eventId),
      });
      if (updatedEvent && updatedEvent.hoursPledged >= updatedEvent.totalHoursNeeded) {
        await ctx.db
          .update(events)
          .set({ status: "open", updatedAt: new Date() })
          .where(eq(events.id, input.eventId));

        // Notify all co-hosts and pool members
        const poolMembers = await ctx.db.query.poolMemberships.findMany({
          where: and(
            eq(poolMemberships.poolId, event.poolId),
            isNull(poolMemberships.leftAt)
          ),
        });
        await sendNotificationToMany(
          poolMembers.map((m) => m.accountId),
          {
            type: "new_event",
            title: `"${event.title}" is fully funded!`,
            body: "The event is now open for labor claims.",
            data: { eventId: event.id, poolId: event.poolId },
          }
        );
      }

      const pledger = await ctx.db.query.accounts.findFirst({
        where: eq(accounts.id, ctx.userId),
      });
      await sendNotification({
        accountId: event.hostId,
        type: "new_event",
        title: `${pledger?.displayName} pledged ${input.hoursPledged}h for "${event.title}"`,
        data: { eventId: event.id },
      });

      return { success: true };
    }),

  // Withdraw a pledge from a group event
  withdrawPledge: protectedProcedure
    .input(withdrawPledgeSchema)
    .mutation(async ({ ctx, input }) => {
      const event = await ctx.db.query.events.findFirst({
        where: eq(events.id, input.eventId),
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });

      if (event.hostingType !== "group") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not a group event" });
      }

      if (event.status !== "pledging") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Pledges are locked once the event is open" });
      }

      // Host cannot withdraw
      if (ctx.userId === event.hostId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The host cannot withdraw their pledge" });
      }

      const pledge = await ctx.db.query.eventPledges.findFirst({
        where: and(
          eq(eventPledges.eventId, input.eventId),
          eq(eventPledges.accountId, ctx.userId),
          eq(eventPledges.status, "active")
        ),
      });
      if (!pledge) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No active pledge found" });
      }

      await ctx.db
        .update(eventPledges)
        .set({ status: "withdrawn" })
        .where(eq(eventPledges.id, pledge.id));

      await ctx.db
        .update(events)
        .set({
          hoursPledged: sql`${events.hoursPledged} - ${pledge.hoursPledged}`,
          coHostCount: sql`${events.coHostCount} - 1`,
          updatedAt: new Date(),
        })
        .where(eq(events.id, input.eventId));

      return { success: true };
    }),

  // Get host capacity for a pool (used by creation UI)
  getHostCapacity: protectedProcedure
    .input(z.object({ poolId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const pool = await ctx.db.query.pools.findFirst({
        where: eq(pools.id, input.poolId),
      });
      if (!pool) throw new TRPCError({ code: "NOT_FOUND" });

      const balance = await getAccountBalance(ctx.db, input.poolId, ctx.userId);
      const capacity = balance + Math.abs(pool.maxNegativeBalance);

      return { balance, capacity, maxNegativeBalance: pool.maxNegativeBalance };
    }),

  // Cross-pool: events the user has claimed
  myEvents: protectedProcedure.query(async ({ ctx }) => {
    const myClaims = await ctx.db
      .select({
        claim: eventClaims,
        event: events,
        pool: pools,
        host: accounts,
      })
      .from(eventClaims)
      .innerJoin(events, eq(events.id, eventClaims.eventId))
      .innerJoin(pools, eq(pools.id, events.poolId))
      .innerJoin(accounts, eq(accounts.id, events.hostId))
      .where(eq(eventClaims.accountId, ctx.userId))
      .orderBy(desc(events.dateStart))
      .limit(50);

    return myClaims.map((c) => ({
      ...c.event,
      claim: c.claim,
      pool: c.pool,
      host: c.host,
    }));
  }),
});
