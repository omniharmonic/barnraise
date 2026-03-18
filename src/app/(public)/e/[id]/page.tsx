import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { events, eventClaims, accounts, pools } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { PublicEventClient } from "./client";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const event = await db.query.events.findFirst({
    where: eq(events.id, id),
  });

  if (!event) return { title: "Event Not Found" };

  const pool = await db.query.pools.findFirst({
    where: eq(pools.id, event.poolId),
  });

  const host = await db.query.accounts.findFirst({
    where: eq(accounts.id, event.hostId),
  });

  const hoursRemaining = event.totalHoursNeeded - event.hoursClaimed;
  const dateStr = new Date(event.dateStart).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return {
    title: `${event.title} — Barn Raise`,
    description: `${host?.displayName} is hosting "${event.title}" on ${dateStr}. ${hoursRemaining > 0 ? `${hoursRemaining} hours still needed!` : "Fully claimed!"} Join ${pool?.name} to participate.`,
    openGraph: {
      title: event.title,
      description: `${dateStr} — ${hoursRemaining > 0 ? `${hoursRemaining}h still needed` : "Fully claimed"}`,
      type: "website",
      images: [`/api/og?eventId=${id}`],
    },
  };
}

export default async function PublicEventPage({ params }: Props) {
  const { id } = await params;

  const event = await db.query.events.findFirst({
    where: eq(events.id, id),
  });
  if (!event) notFound();

  const host = await db.query.accounts.findFirst({
    where: eq(accounts.id, event.hostId),
  });

  const pool = await db.query.pools.findFirst({
    where: eq(pools.id, event.poolId),
  });

  const claims = await db
    .select({ claim: eventClaims, account: accounts })
    .from(eventClaims)
    .innerJoin(accounts, eq(accounts.id, eventClaims.accountId))
    .where(eq(eventClaims.eventId, id));

  const activeClaims = claims
    .filter(
      (c) =>
        c.claim.status === "claimed" || c.claim.status === "verified_attended"
    )
    .map((c) => ({
      firstName: c.account.displayName.split(" ")[0],
      hours: c.claim.hoursCommitted,
    }));

  return (
    <PublicEventClient
      event={{
        id: event.id,
        title: event.title,
        description: event.description,
        dateStart: event.dateStart.toISOString(),
        dateEnd: event.dateEnd.toISOString(),
        locationName: event.locationName,
        totalHoursNeeded: event.totalHoursNeeded,
        hoursClaimed: event.hoursClaimed,
        maxParticipants: event.maxParticipants,
        participantsCount: event.participantsCount,
        skillTags: event.skillTags,
        status: event.status,
        poolId: event.poolId,
        flexibleHours: event.flexibleHours ?? true,
      }}
      host={{
        displayName: host?.displayName ?? "Unknown",
      }}
      pool={{
        id: pool?.id ?? "",
        name: pool?.name ?? "Unknown Pool",
        description: pool?.description ?? null,
        joinPolicy: pool?.joinPolicy ?? "invite",
      }}
      claims={activeClaims}
    />
  );
}
