import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { pools, poolMemberships, events } from "@/lib/db/schema";
import { eq, and, isNull, sql, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import { JoinPoolClient } from "./client";

interface Props {
  params: Promise<{ poolId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { poolId } = await params;
  const pool = await db.query.pools.findFirst({
    where: eq(pools.id, poolId),
  });

  if (!pool) return { title: "Pool Not Found" };

  return {
    title: `Join ${pool.name} — Barn Raise`,
    description: pool.description || `Join ${pool.name} on Barn Raise to participate in collective work events.`,
  };
}

export default async function JoinPoolPage({ params }: Props) {
  const { poolId } = await params;

  const pool = await db.query.pools.findFirst({
    where: eq(pools.id, poolId),
  });
  if (!pool) notFound();

  const [memberCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(poolMemberships)
    .where(
      and(eq(poolMemberships.poolId, poolId), isNull(poolMemberships.leftAt))
    );

  const upcomingEvents = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.poolId, poolId),
        inArray(events.status, ["open", "confirmed"])
      )
    )
    .limit(5);

  return (
    <JoinPoolClient
      pool={{
        id: pool.id,
        name: pool.name,
        description: pool.description,
        locationName: pool.locationName,
        joinPolicy: pool.joinPolicy,
        startingBalance: pool.startingBalance,
        memberCount: memberCount.count,
      }}
      upcomingEvents={upcomingEvents.map((e) => ({
        id: e.id,
        title: e.title,
        dateStart: e.dateStart.toISOString(),
        hoursClaimed: e.hoursClaimed,
        totalHoursNeeded: e.totalHoursNeeded,
      }))}
    />
  );
}
