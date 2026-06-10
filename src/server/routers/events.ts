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
  eventWorkAreas,
  pools,
  poolMemberships,
  pointTransactions,
  vouchers,
  accounts,
  auditLog,
} from "@/lib/db/schema";
import { TRPCError } from "@trpc/server";
import { sendNotification, sendNotificationToMany } from "@/server/services/notifications";
import {
  memberAccountColumns,
  publicPoolView,
  type PublicAccount,
} from "@/lib/db/projections";
import type { DbConn } from "@/lib/db";
import { assertRateLimit } from "@/lib/rate-limit";
import { balanceHoursExpr } from "@/lib/db/ledger";

/** Compute an account's balance in a pool from point_transactions */
async function getAccountBalance(db: DbConn, poolId: string, accountId: string): Promise<number> {
  const [result] = await db
    .select({ balance: balanceHoursExpr })
    .from(pointTransactions)
    .where(
      and(
        eq(pointTransactions.poolId, poolId),
        eq(pointTransactions.accountId, accountId)
      )
    );
  return Number(result.balance);
}

/**
 * Compute hours a user has committed but not yet been debited for in a pool.
 * This includes:
 * 1. Active pledges on group events not yet verified/cancelled
 * 2. Solo events they're hosting that haven't been verified yet
 *
 * These are "reserved" hours — they'll be spent at verification time,
 * so they must reduce available capacity to prevent overselling.
 */
async function getPendingCommitments(
  db: DbConn,
  poolId: string,
  accountId: string,
  excludeEventId?: string
): Promise<number> {
  // 1. Active pledges on group events
  const [pledgeResult] = await db
    .select({
      total: sql<number>`coalesce(sum(${eventPledges.hoursPledged}), 0)::numeric`,
    })
    .from(eventPledges)
    .innerJoin(events, eq(events.id, eventPledges.eventId))
    .where(
      and(
        eq(eventPledges.accountId, accountId),
        eq(eventPledges.status, "active"),
        eq(events.poolId, poolId),
        sql`${events.status} not in ('verified', 'cancelled')`,
        excludeEventId
          ? sql`${events.id} != ${excludeEventId}`
          : undefined
      )
    );

  // 2. Solo events hosted but not verified (full totalHoursNeeded is their liability)
  const [soloResult] = await db
    .select({
      total: sql<number>`coalesce(sum(${events.totalHoursNeeded}), 0)::numeric`,
    })
    .from(events)
    .where(
      and(
        eq(events.hostId, accountId),
        eq(events.poolId, poolId),
        eq(events.hostingType, "solo"),
        sql`${events.status} in ('open', 'confirmed', 'in_progress', 'completed')`,
        excludeEventId
          ? sql`${events.id} != ${excludeEventId}`
          : undefined
      )
    );

  return Number(pledgeResult.total) + Number(soloResult.total);
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

  const distributed = shares.reduce((s, sh) => s + sh.floored, 0);
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
      // Cross-field date validation (defence in depth alongside the schema).
      const dateStart = new Date(input.dateStart);
      const dateEnd = new Date(input.dateEnd);
      if (dateEnd <= dateStart) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Event end time must be after the start time",
        });
      }

      const isGroup = input.hostingType === "group";
      const hostPledgeHours = input.hostPledgeHours ?? 1;

      const { event, otherMemberIds, creatorName } = await ctx.db.transaction(
        async (tx) => {
          // Lock the host's membership row: this serializes concurrent event
          // creation by the same member so parallel creates can't each pass
          // the capacity check and jointly exceed maxNegativeBalance.
          const [membership] = await tx
            .select()
            .from(poolMemberships)
            .where(
              and(
                eq(poolMemberships.poolId, input.poolId),
                eq(poolMemberships.accountId, ctx.userId),
                isNull(poolMemberships.leftAt)
              )
            )
            .for("update");
          if (!membership || membership.status !== "active") {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Must be a pool member to create events",
            });
          }

          const pool = await tx.query.pools.findFirst({
            where: eq(pools.id, input.poolId),
          });
          if (!pool) throw new TRPCError({ code: "NOT_FOUND", message: "Pool not found" });

          // Event frequency limit (events created in the trailing 7 days)
          if (pool.eventFrequencyLimit != null) {
            const [recent] = await tx
              .select({ count: sql<number>`count(*)::int` })
              .from(events)
              .where(
                and(
                  eq(events.hostId, ctx.userId),
                  eq(events.poolId, input.poolId),
                  sql`${events.status} != 'cancelled'`,
                  sql`${events.createdAt} > now() - interval '7 days'`
                )
              );
            if (recent.count >= pool.eventFrequencyLimit) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `This pool limits hosting to ${pool.eventFrequencyLimit} event(s) per week`,
              });
            }
          }

          const hostBalance = await getAccountBalance(tx, input.poolId, ctx.userId);
          const pending = await getPendingCommitments(tx, input.poolId, ctx.userId);
          const capacity = Math.max(
            0,
            hostBalance + Math.abs(pool.maxNegativeBalance) - pending
          );
          const cost = isGroup ? hostPledgeHours : input.totalHoursNeeded;
          if (cost > capacity) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: isGroup
                ? `You can pledge up to ${capacity}h (balance ${hostBalance}h + limit ${Math.abs(pool.maxNegativeBalance)}h${pending > 0 ? ` − ${pending}h committed` : ""}).`
                : `Your available capacity is ${capacity}h (balance ${hostBalance}h + limit ${Math.abs(pool.maxNegativeBalance)}h${pending > 0 ? ` − ${pending}h already committed` : ""}). Try group hosting to split the cost.`,
            });
          }

          const status = isGroup
            ? hostPledgeHours >= input.totalHoursNeeded
              ? "open"
              : "pledging"
            : "open";

          const [created] = await tx
            .insert(events)
            .values({
              poolId: input.poolId,
              hostId: ctx.userId,
              title: input.title,
              description: input.description,
              dateStart,
              dateEnd,
              locationName: input.locationName,
              totalHoursNeeded: input.totalHoursNeeded,
              maxParticipants: input.maxParticipants,
              minParticipants: input.minParticipants,
              flexibleHours: input.flexibleHours,
              skillTags: input.skillTags,
              potluckUrl: input.potluckUrl,
              bannerImageUrl: input.bannerImageUrl,
              hostingType: input.hostingType,
              status,
              hoursPledged: isGroup ? hostPledgeHours : 0,
              coHostCount: isGroup ? 1 : 0,
            })
            .returning();

          if (isGroup) {
            await tx.insert(eventPledges).values({
              eventId: created.id,
              accountId: ctx.userId,
              hoursPledged: hostPledgeHours,
            });
          }

          if (input.workAreas && input.workAreas.length > 0) {
            await tx.insert(eventWorkAreas).values(
              input.workAreas.map((wa, i) => ({
                eventId: created.id,
                name: wa.name,
                targetHours: wa.targetHours ?? null,
                sortOrder: i,
              }))
            );
          }

          // Merge new skill tags into the pool's accumulated tags
          if (input.skillTags && input.skillTags.length > 0) {
            const existingTags = pool.skillTags || [];
            const merged = [...new Set([...existingTags, ...input.skillTags])];
            if (merged.length > existingTags.length) {
              await tx.update(pools).set({ skillTags: merged }).where(eq(pools.id, input.poolId));
            }
          }

          await tx.insert(auditLog).values({
            poolId: input.poolId,
            actorId: ctx.userId,
            action: "event_created",
            targetType: "event",
            targetId: created.id,
            details: { title: input.title, hostingType: input.hostingType, ...(isGroup ? { hostPledgeHours } : {}) },
          });

          const poolMembers = await tx.query.poolMemberships.findMany({
            where: and(
              eq(poolMemberships.poolId, input.poolId),
              eq(poolMemberships.status, "active"),
              isNull(poolMemberships.leftAt)
            ),
          });
          const otherIds = poolMembers
            .filter((m) => m.accountId !== ctx.userId)
            .map((m) => m.accountId);

          const creator = await tx.query.accounts.findFirst({
            where: eq(accounts.id, ctx.userId),
          });

          return {
            event: created,
            otherMemberIds: otherIds,
            creatorName: creator?.displayName ?? "A member",
          };
        }
      );

      // Notifications after commit
      const notifBody =
        event.status === "pledging"
          ? `${creatorName} is looking for co-hosts for "${input.title}". Pledge hours to help fund it!`
          : `${creatorName} is hosting "${input.title}". Check it out and claim a slot!`;
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
      // Throttle anonymous reads per IP to deter enumeration/scraping.
      if (ctx.ip) {
        await assertRateLimit(ctx.db, `event-view:${ctx.ip}`, 120, 60);
      }
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

      // Get host info (safe projection — this is a public endpoint)
      const [host] = await ctx.db
        .select(memberAccountColumns)
        .from(accounts)
        .where(eq(accounts.id, event.hostId));

      // Get pool info (public-safe projection — no governance/chain internals)
      const poolRow = await ctx.db.query.pools.findFirst({
        where: eq(pools.id, event.poolId),
      });
      const pool = poolRow ? publicPoolView(poolRow) : null;

      // Get claims with account info
      const claims = await ctx.db
        .select({
          claim: eventClaims,
          account: memberAccountColumns,
        })
        .from(eventClaims)
        .innerJoin(accounts, eq(accounts.id, eventClaims.accountId))
        .where(eq(eventClaims.eventId, input.eventId));

      // Get pledges with account info for group events
      type PledgeAccount = { pledge: typeof eventPledges.$inferSelect; account: PublicAccount };
      let pledges: PledgeAccount[] = [];
      if (event.hostingType === "group") {
        const pledgeRows = await ctx.db
          .select({
            pledge: eventPledges,
            account: memberAccountColumns,
          })
          .from(eventPledges)
          .innerJoin(accounts, eq(accounts.id, eventPledges.accountId))
          .where(eq(eventPledges.eventId, input.eventId));
        pledges = pledgeRows;
      }

      // Get work areas
      const workAreas = await ctx.db.query.eventWorkAreas.findMany({
        where: eq(eventWorkAreas.eventId, input.eventId),
        orderBy: eventWorkAreas.sortOrder,
      });

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
        workAreas,
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

      // Replace work areas if provided
      if (updates.workAreas !== undefined) {
        await ctx.db
          .delete(eventWorkAreas)
          .where(eq(eventWorkAreas.eventId, eventId));
        if (updates.workAreas.length > 0) {
          await ctx.db.insert(eventWorkAreas).values(
            updates.workAreas.map((wa, i) => ({
              eventId,
              name: wa.name,
              targetHours: wa.targetHours ?? null,
              sortOrder: i,
            }))
          );
        }
      }

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
          host: memberAccountColumns,
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
      // All read-then-write logic runs inside a transaction with the event
      // row locked (FOR UPDATE) so concurrent claims cannot over-fill the
      // event past maxParticipants or totalHoursNeeded.
      const { claim, justConfirmed, hostId, title } = await ctx.db.transaction(
        async (tx) => {
          const [event] = await tx
            .select()
            .from(events)
            .where(eq(events.id, input.eventId))
            .for("update");
          if (!event) throw new TRPCError({ code: "NOT_FOUND" });

          if (!["open", "confirmed"].includes(event.status)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Event is not accepting claims",
            });
          }

          // Verify pool membership
          const membership = await tx.query.poolMemberships.findFirst({
            where: and(
              eq(poolMemberships.poolId, event.poolId),
              eq(poolMemberships.accountId, ctx.userId),
              eq(poolMemberships.status, "active"),
              isNull(poolMemberships.leftAt)
            ),
          });
          if (!membership) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Must be a pool member",
            });
          }

          // Capacity by participants
          if (event.participantsCount >= event.maxParticipants) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Event is full" });
          }

          // Capacity by hours — a claim cannot push past total hours needed
          const remaining = event.totalHoursNeeded - event.hoursClaimed;
          if (remaining <= 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "All hours for this event are already claimed",
            });
          }
          if (input.hoursCommitted > remaining) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Only ${remaining}h remain to be claimed`,
            });
          }

          // Non-flexible events require committing the full shift
          if (!event.flexibleHours) {
            const durationHours = Math.max(
              1,
              Math.round((event.dateEnd.getTime() - event.dateStart.getTime()) / 3_600_000)
            );
            if (input.hoursCommitted !== durationHours) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `This event isn't flexible — commit the full ${durationHours}h shift`,
              });
            }
          }

          // Existing claim?
          const existing = await tx.query.eventClaims.findFirst({
            where: and(
              eq(eventClaims.eventId, input.eventId),
              eq(eventClaims.accountId, ctx.userId)
            ),
          });
          if (existing && existing.status === "claimed") {
            throw new TRPCError({ code: "CONFLICT", message: "Already claimed" });
          }

          let claimRow;
          if (existing) {
            [claimRow] = await tx
              .update(eventClaims)
              .set({
                status: "claimed",
                hoursCommitted: input.hoursCommitted,
                workAreaId: input.workAreaId ?? null,
                hoursVerified: null,
                cancelledAt: null,
                lateCancel: false,
                verifiedAt: null,
                createdAt: new Date(),
              })
              .where(eq(eventClaims.id, existing.id))
              .returning();
          } else {
            [claimRow] = await tx
              .insert(eventClaims)
              .values({
                eventId: input.eventId,
                accountId: ctx.userId,
                hoursCommitted: input.hoursCommitted,
                workAreaId: input.workAreaId ?? null,
              })
              .returning();
          }

          const newParticipants = event.participantsCount + 1;
          const willConfirm =
            event.status === "open" &&
            newParticipants >= (event.minParticipants ?? 1);

          await tx
            .update(events)
            .set({
              hoursClaimed: sql`${events.hoursClaimed} + ${input.hoursCommitted}`,
              participantsCount: sql`${events.participantsCount} + 1`,
              status: willConfirm ? "confirmed" : event.status,
              updatedAt: new Date(),
            })
            .where(eq(events.id, input.eventId));

          return {
            claim: claimRow,
            justConfirmed: willConfirm,
            hostId: event.hostId,
            title: event.title,
          };
        }
      );

      // Side-effects after commit (don't hold the row lock during fan-out)
      const claimer = await ctx.db.query.accounts.findFirst({
        where: eq(accounts.id, ctx.userId),
      });
      await sendNotification({
        accountId: hostId,
        type: "slot_claimed",
        title: `${claimer?.displayName} claimed ${input.hoursCommitted}h on "${title}"`,
        data: { eventId: input.eventId },
      });
      if (justConfirmed) {
        await sendNotification({
          accountId: hostId,
          type: "event_confirmed",
          title: `"${title}" is confirmed!`,
          body: "Minimum participants reached.",
          data: { eventId: input.eventId },
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
    .input(z.object({
      eventId: z.string().uuid(),
      hoursCommitted: z.number().int().min(1),
      workAreaId: z.string().uuid().nullish(),
    }))
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
        .set({
          hoursCommitted: input.hoursCommitted,
          workAreaId: input.workAreaId ?? null,
        })
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

      const claimerIds = await ctx.db.transaction(async (tx) => {
        await tx
          .update(eventClaims)
          .set({ status: "cancelled", cancelledAt: new Date() })
          .where(
            and(
              eq(eventClaims.eventId, input.eventId),
              eq(eventClaims.status, "claimed")
            )
          );

        if (event.hostingType === "group") {
          await tx
            .update(eventPledges)
            .set({ status: "withdrawn" })
            .where(
              and(
                eq(eventPledges.eventId, input.eventId),
                eq(eventPledges.status, "active")
              )
            );
        }

        await tx
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

        await tx.insert(auditLog).values({
          poolId: event.poolId,
          actorId: ctx.userId,
          action: "event_cancelled",
          targetType: "event",
          targetId: event.id,
        });

        const claimedUsers = await tx.query.eventClaims.findMany({
          where: eq(eventClaims.eventId, input.eventId),
        });
        return claimedUsers
          .filter((c) => c.accountId !== ctx.userId)
          .map((c) => c.accountId);
      });

      if (claimerIds.length > 0) {
        await sendNotificationToMany(claimerIds, {
          type: "new_event",
          title: `"${event.title}" has been cancelled`,
          body: "The host cancelled this event. Your claimed hours have been released.",
          data: { eventId: event.id, poolId: event.poolId },
        });
      }

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
      const voucherDecimalFactor = 10 ** voucher.decimals;

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

      // All balance guards and ledger writes happen atomically. Either every
      // earn/spend row and the event status update commit together, or none
      // do — the ledger can never be left half-applied.
      await ctx.db.transaction(async (tx) => {
        // Lock the event row and re-validate status to make verification
        // idempotent against concurrent submissions.
        const [locked] = await tx
          .select()
          .from(events)
          .where(eq(events.id, input.eventId))
          .for("update");
        if (!locked) throw new TRPCError({ code: "NOT_FOUND" });
        if (locked.status === "verified") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Already verified" });
        }

        if (event.hostingType === "solo") {
          // Solo: single spend from host
          const hostBalance = await getAccountBalance(tx, event.poolId, ctx.userId);
          const newBalance = hostBalance - totalHoursDistributed;
          if (newBalance < pool.maxNegativeBalance) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Verification would push your balance (${newBalance}) below the pool limit (${pool.maxNegativeBalance})`,
            });
          }

          for (const v of input.verifications) {
            if (v.attended) {
              await tx
                .update(eventClaims)
                .set({
                  status: "verified_attended",
                  hoursVerified: v.actualHours,
                  verifiedAt: new Date(),
                })
                .where(eq(eventClaims.id, v.claimId));

              if (v.actualHours > 0) {
                await tx.insert(pointTransactions).values({
                  poolId: event.poolId,
                  voucherId: voucher.id,
                  accountId: v.accountId,
                  txType: "earn",
                  value: v.actualHours * voucherDecimalFactor,
                  hours: String(v.actualHours),
                  eventId: event.id,
                  eventClaimId: v.claimId,
                });
              }
            } else {
              await tx
                .update(eventClaims)
                .set({
                  status: "verified_noshow",
                  hoursVerified: 0,
                  verifiedAt: new Date(),
                })
                .where(eq(eventClaims.id, v.claimId));
            }
          }

          if (totalHoursDistributed > 0) {
            await tx.insert(pointTransactions).values({
              poolId: event.poolId,
              voucherId: voucher.id,
              accountId: event.hostId,
              txType: "spend",
              value: totalHoursDistributed * voucherDecimalFactor,
              hours: String(totalHoursDistributed),
              eventId: event.id,
            });
          }
        } else {
          // Group: proportional split among co-hosts
          const activePledges = await tx
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

          const shares = splitProportional(
            totalHoursDistributed,
            activePledges.map((p) => ({ accountId: p.accountId, hours: p.hoursPledged }))
          );

          for (const [accountId, shareHours] of shares) {
            if (shareHours === 0) continue;
            const balance = await getAccountBalance(tx, event.poolId, accountId);
            const newBalance = balance - shareHours;
            if (newBalance < pool.maxNegativeBalance) {
              const account = await tx.query.accounts.findFirst({
                where: eq(accounts.id, accountId),
              });
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Co-host ${account?.displayName || accountId} can't cover their share (${shareHours}h). Their balance is ${balance}h, limit is ${pool.maxNegativeBalance}h.`,
              });
            }
          }

          for (const v of input.verifications) {
            if (v.attended) {
              await tx
                .update(eventClaims)
                .set({
                  status: "verified_attended",
                  hoursVerified: v.actualHours,
                  verifiedAt: new Date(),
                })
                .where(eq(eventClaims.id, v.claimId));

              if (v.actualHours > 0) {
                await tx.insert(pointTransactions).values({
                  poolId: event.poolId,
                  voucherId: voucher.id,
                  accountId: v.accountId,
                  txType: "earn",
                  value: v.actualHours * voucherDecimalFactor,
                  hours: String(v.actualHours),
                  eventId: event.id,
                  eventClaimId: v.claimId,
                });
              }
            } else {
              await tx
                .update(eventClaims)
                .set({
                  status: "verified_noshow",
                  hoursVerified: 0,
                  verifiedAt: new Date(),
                })
                .where(eq(eventClaims.id, v.claimId));
            }
          }

          for (const [accountId, shareHours] of shares) {
            if (shareHours === 0) continue;
            await tx.insert(pointTransactions).values({
              poolId: event.poolId,
              voucherId: voucher.id,
              accountId,
              txType: "spend",
              value: shareHours * voucherDecimalFactor,
              hours: String(shareHours),
              eventId: event.id,
            });
          }

          await tx
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
        await tx
          .update(events)
          .set({
            status: "verified",
            hoursVerified: totalHoursDistributed,
            updatedAt: new Date(),
          })
          .where(eq(events.id, input.eventId));

        await tx.insert(auditLog).values({
          poolId: event.poolId,
          actorId: ctx.userId,
          action: "event_verified",
          targetType: "event",
          targetId: event.id,
          details: { totalHoursDistributed, hostingType: event.hostingType },
        });
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
      const { hostId, title, poolId, becameFunded, fundedMemberIds } =
        await ctx.db.transaction(async (tx) => {
          // Lock the event row so concurrent pledges see a consistent
          // hoursPledged and the funding transition fires exactly once.
          const [event] = await tx
            .select()
            .from(events)
            .where(eq(events.id, input.eventId))
            .for("update");
          if (!event) throw new TRPCError({ code: "NOT_FOUND" });

          if (event.hostingType !== "group") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Only group events accept pledges" });
          }
          if (event.status !== "pledging") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Event is no longer accepting pledges" });
          }

          const membership = await tx.query.poolMemberships.findFirst({
            where: and(
              eq(poolMemberships.poolId, event.poolId),
              eq(poolMemberships.accountId, ctx.userId),
              eq(poolMemberships.status, "active"),
              isNull(poolMemberships.leftAt)
            ),
          });
          if (!membership) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Must be a pool member" });
          }

          const pool = await tx.query.pools.findFirst({ where: eq(pools.id, event.poolId) });
          if (!pool) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

          const balance = await getAccountBalance(tx, event.poolId, ctx.userId);
          const pending = await getPendingCommitments(tx, event.poolId, ctx.userId, input.eventId);
          const capacity = Math.max(0, balance + Math.abs(pool.maxNegativeBalance) - pending);
          if (input.hoursPledged > capacity) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `You can pledge up to ${capacity}h (balance ${balance}h + limit ${Math.abs(pool.maxNegativeBalance)}h${pending > 0 ? ` − ${pending}h committed` : ""}).`,
            });
          }

          const existing = await tx.query.eventPledges.findFirst({
            where: and(
              eq(eventPledges.eventId, input.eventId),
              eq(eventPledges.accountId, ctx.userId)
            ),
          });
          if (existing && existing.status === "active") {
            throw new TRPCError({ code: "CONFLICT", message: "You already have an active pledge" });
          }

          if (existing) {
            await tx
              .update(eventPledges)
              .set({ status: "active", hoursPledged: input.hoursPledged })
              .where(eq(eventPledges.id, existing.id));
          } else {
            await tx.insert(eventPledges).values({
              eventId: input.eventId,
              accountId: ctx.userId,
              hoursPledged: input.hoursPledged,
            });
          }

          const newHoursPledged = event.hoursPledged + input.hoursPledged;
          const funded = newHoursPledged >= event.totalHoursNeeded;
          await tx
            .update(events)
            .set({
              hoursPledged: newHoursPledged,
              coHostCount: sql`${events.coHostCount} + 1`,
              status: funded ? "open" : event.status,
              updatedAt: new Date(),
            })
            .where(eq(events.id, input.eventId));

          let memberIds: string[] = [];
          if (funded) {
            const poolMembers = await tx.query.poolMemberships.findMany({
              where: and(
                eq(poolMemberships.poolId, event.poolId),
                eq(poolMemberships.status, "active"),
                isNull(poolMemberships.leftAt)
              ),
            });
            memberIds = poolMembers.map((m) => m.accountId);
          }

          return {
            hostId: event.hostId,
            title: event.title,
            poolId: event.poolId,
            becameFunded: funded,
            fundedMemberIds: memberIds,
          };
        });

      // Notifications after commit
      if (becameFunded) {
        await sendNotificationToMany(fundedMemberIds, {
          type: "new_event",
          title: `"${title}" is fully funded!`,
          body: "The event is now open for labor claims.",
          data: { eventId: input.eventId, poolId },
        });
      }
      const pledger = await ctx.db.query.accounts.findFirst({
        where: eq(accounts.id, ctx.userId),
      });
      await sendNotification({
        accountId: hostId,
        type: "new_event",
        title: `${pledger?.displayName} pledged ${input.hoursPledged}h for "${title}"`,
        data: { eventId: input.eventId },
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

  updatePledge: protectedProcedure
    .input(pledgeEventSchema)
    .mutation(async ({ ctx, input }) => {
      const event = await ctx.db.query.events.findFirst({
        where: eq(events.id, input.eventId),
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });

      if (event.hostingType !== "group" || event.status !== "pledging") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot update pledge for this event" });
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

      // Validate capacity
      const pool = await ctx.db.query.pools.findFirst({
        where: eq(pools.id, event.poolId),
      });
      if (!pool) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const balance = await getAccountBalance(ctx.db, event.poolId, ctx.userId);
      // Exclude this event's pledge from pending since we're replacing it
      const pending = await getPendingCommitments(ctx.db, event.poolId, ctx.userId, input.eventId);
      const capacity = Math.max(0, balance + Math.abs(pool.maxNegativeBalance) - pending);
      if (input.hoursPledged > capacity) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `You can pledge up to ${capacity}h${pending > 0 ? ` (${pending}h committed elsewhere)` : ""}.`,
        });
      }

      const hoursDiff = input.hoursPledged - pledge.hoursPledged;

      await ctx.db
        .update(eventPledges)
        .set({ hoursPledged: input.hoursPledged })
        .where(eq(eventPledges.id, pledge.id));

      await ctx.db
        .update(events)
        .set({
          hoursPledged: sql`${events.hoursPledged} + ${hoursDiff}`,
          updatedAt: new Date(),
        })
        .where(eq(events.id, input.eventId));

      // Check if fully funded after update
      const updatedEvent = await ctx.db.query.events.findFirst({
        where: eq(events.id, input.eventId),
      });
      if (updatedEvent && updatedEvent.hoursPledged >= updatedEvent.totalHoursNeeded && updatedEvent.status === "pledging") {
        await ctx.db
          .update(events)
          .set({ status: "open", updatedAt: new Date() })
          .where(eq(events.id, input.eventId));
      }

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
      const pending = await getPendingCommitments(ctx.db, input.poolId, ctx.userId);
      const grossCapacity = balance + Math.abs(pool.maxNegativeBalance);
      const capacity = Math.max(0, grossCapacity - pending);

      return {
        balance,
        capacity,
        grossCapacity,
        pendingCommitments: pending,
        maxNegativeBalance: pool.maxNegativeBalance,
      };
    }),

  // Cross-pool: events the user has claimed
  myEvents: protectedProcedure.query(async ({ ctx }) => {
    const myClaims = await ctx.db
      .select({
        claim: eventClaims,
        event: events,
        pool: pools,
        host: memberAccountColumns,
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
