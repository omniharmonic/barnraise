"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CalendarDays,
  MapPin,
  Clock,
  Users,
  Wheat,
  ExternalLink,
} from "lucide-react";

interface PublicEventProps {
  event: {
    id: string;
    title: string;
    description: string | null;
    dateStart: string;
    dateEnd: string;
    locationName: string | null;
    totalHoursNeeded: number;
    hoursClaimed: number;
    maxParticipants: number;
    participantsCount: number;
    skillTags: string[] | null;
    status: string;
    poolId: string;
    flexibleHours: boolean;
  };
  host: { displayName: string };
  pool: {
    id: string;
    name: string;
    description: string | null;
    joinPolicy: string;
  };
  claims: { firstName: string; hours: number }[];
}

export function PublicEventClient({ event, host, pool, claims }: PublicEventProps) {
  const { data: session } = useSession();
  const hoursRemaining = event.totalHoursNeeded - event.hoursClaimed;
  const fillPercentage =
    event.totalHoursNeeded > 0
      ? (event.hoursClaimed / event.totalHoursNeeded) * 100
      : 0;

  const dateStart = new Date(event.dateStart);
  const dateEnd = new Date(event.dateEnd);

  const dateStr = dateStart.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = `${dateStart.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })} – ${dateEnd.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })}`;

  // Google Calendar link
  const gcalUrl = `https://calendar.google.com/calendar/event?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${dateStart.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}/${dateEnd.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}&details=${encodeURIComponent(event.description || "")}&location=${encodeURIComponent(event.locationName || "")}`;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Hero */}
      <div className="text-center pt-4 pb-2">
        <div className="flex justify-center mb-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-100">
            <Wheat className="h-6 w-6 text-amber-700" />
          </div>
        </div>
        <p className="text-sm text-amber-700 font-medium mb-2">
          Barn Raise in {pool.name}
        </p>
        <h1 className="text-3xl font-bold text-stone-900 mb-3">
          {event.title}
        </h1>
        <div className="flex flex-wrap items-center justify-center gap-4 text-stone-600">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" />
            {dateStr}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            {timeStr}
          </span>
        </div>
        {event.locationName && (
          <p className="flex items-center justify-center gap-1.5 text-stone-600 mt-2">
            <MapPin className="h-4 w-4" />
            {event.locationName}
          </p>
        )}
      </div>

      {/* Add to Calendar */}
      <div className="text-center">
        <a
          href={gcalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-amber-700 hover:underline inline-flex items-center gap-1"
        >
          Add to Google Calendar
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Labor Progress — the key visual */}
      <Card className="border-amber-200 bg-amber-50/30">
        <CardContent className="pt-6">
          <div className="text-center mb-4">
            <div className="text-3xl font-bold text-stone-900">
              {hoursRemaining > 0 ? (
                <>
                  {hoursRemaining}h{" "}
                  <span className="text-lg font-normal text-stone-500">
                    still needed
                  </span>
                </>
              ) : (
                <span className="text-green-700">Fully claimed!</span>
              )}
            </div>
          </div>
          <Progress
            value={event.hoursClaimed}
            max={event.totalHoursNeeded}
            className="h-4 mb-2"
          />
          <div className="flex justify-between text-sm text-stone-500">
            <span>
              {event.hoursClaimed} of {event.totalHoursNeeded} hours claimed
            </span>
            <span>{Math.round(fillPercentage)}%</span>
          </div>
          <div className="mt-3 text-sm text-stone-500 text-center">
            <Users className="h-4 w-4 inline mr-1" />
            {event.participantsCount} of {event.maxParticipants} participants
          </div>
        </CardContent>
      </Card>

      {/* Host */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold">
              {host.displayName[0]?.toUpperCase()}
            </div>
            <div>
              <div className="text-sm text-stone-500">Hosted by</div>
              <div className="font-medium">{host.displayName}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Description */}
      {event.description && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-stone-700 whitespace-pre-wrap">
              {event.description}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Skills */}
      {event.skillTags && event.skillTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {event.skillTags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Participants */}
      {claims.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold text-stone-900 mb-3">
              Who&apos;s Helping
            </h3>
            <div className="flex flex-wrap gap-2">
              {claims.map((claim, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 bg-stone-50 rounded-full px-3 py-1.5"
                >
                  <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-xs font-medium">
                    {claim.firstName[0]?.toUpperCase()}
                  </div>
                  <span className="text-sm">{claim.firstName}</span>
                  <span className="text-xs text-stone-400">
                    {claim.hours}h
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pool Info */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-sm font-semibold text-stone-900 mb-2">
            About {pool.name}
          </h3>
          {pool.description && (
            <p className="text-sm text-stone-600 mb-3">{pool.description}</p>
          )}
          <p className="text-xs text-stone-400">
            Barn Raise is a platform for coordinating collective work events
            within communities. Members earn labor hours by helping others and
            can host events when they need help.
          </p>
        </CardContent>
      </Card>

      {/* CTA */}
      <div className="sticky bottom-0 bg-stone-50/95 backdrop-blur-sm pb-6 pt-4 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {session?.user ? (
          <Link href={`/events/${event.id}`}>
            <Button size="lg" className="w-full text-base">
              {["open", "confirmed"].includes(event.status)
                ? "Claim a Slot"
                : "View Event Details"}
            </Button>
          </Link>
        ) : (
          <div className="space-y-3">
            <Link
              href={`/sign-in?callbackUrl=${encodeURIComponent(`/events/${event.id}`)}`}
            >
              <Button size="lg" className="w-full text-base">
                Join {pool.name} to Help Out
              </Button>
            </Link>
            <p className="text-center text-xs text-stone-400">
              Sign up or sign in to claim a slot at this event
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
