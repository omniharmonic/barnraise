import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { events, pools, accounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId");

  if (!eventId) {
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            backgroundColor: "#faf5f0",
            fontSize: 48,
            fontWeight: "bold",
            color: "#44403c",
          }}
        >
          🌾 Barn Raise
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }

  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });

  if (!event) {
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            backgroundColor: "#faf5f0",
            fontSize: 36,
            color: "#78716c",
          }}
        >
          Event not found
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }

  const pool = await db.query.pools.findFirst({
    where: eq(pools.id, event.poolId),
  });
  const host = await db.query.accounts.findFirst({
    where: eq(accounts.id, event.hostId),
  });

  const hoursRemaining = event.totalHoursNeeded - event.hoursClaimed;
  const fillPct = Math.round(
    (event.hoursClaimed / event.totalHoursNeeded) * 100
  );
  const dateStr = new Date(event.dateStart).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          backgroundColor: "#faf5f0",
          padding: "60px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "24px",
          }}
        >
          <div style={{ display: "flex", fontSize: 20, color: "#92400e", fontWeight: "bold" }}>
            Barn Raise
          </div>
          <div style={{ display: "flex", fontSize: 20, color: "#a8a29e" }}>
            in {pool?.name}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 56,
            fontWeight: "bold",
            color: "#1c1917",
            lineHeight: 1.2,
            marginBottom: "20px",
          }}
        >
          {event.title}
        </div>

        <div
          style={{
            display: "flex",
            gap: "32px",
            fontSize: 24,
            color: "#57534e",
            marginBottom: "40px",
          }}
        >
          <div style={{ display: "flex" }}>{dateStr}</div>
          <div style={{ display: "flex" }}>Hosted by {host?.displayName}</div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            marginTop: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 24,
              color: "#44403c",
            }}
          >
            <div style={{ display: "flex" }}>
              {hoursRemaining > 0
                ? `${hoursRemaining} hours still needed!`
                : "Fully claimed!"}
            </div>
            <div style={{ display: "flex" }}>{fillPct}% filled</div>
          </div>
          <div
            style={{
              display: "flex",
              width: "100%",
              height: "24px",
              backgroundColor: "#e7e5e4",
              borderRadius: "12px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                width: `${Math.max(fillPct, 1)}%`,
                height: "100%",
                backgroundColor: "#b45309",
                borderRadius: "12px",
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 18,
              color: "#a8a29e",
            }}
          >
            {event.hoursClaimed} of {event.totalHoursNeeded} hours claimed
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
