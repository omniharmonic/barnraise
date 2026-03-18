"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Plus,
  Users,
  Clock,
  CalendarDays,
  Settings,
  MapPin,
  ArrowRight,
  Activity,
  Heart,
} from "lucide-react";
import { formatDate, formatHours } from "@/lib/utils";
import { eventBannerGradient } from "@/lib/utils/event-banners";

export default function PoolDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: poolId } = use(params);
  const trpc = useTRPC();
  const [eventSort, setEventSort] = useState<"date" | "needs_help" | "fill_rate">("date");

  const { data: poolData, isLoading: poolLoading } = useQuery(
    trpc.pools.getById.queryOptions({ poolId })
  );
  const { data: members } = useQuery(
    trpc.pools.members.queryOptions({ poolId })
  );
  const { data: upcomingEvents } = useQuery(
    trpc.events.listByPool.queryOptions({ poolId, status: "upcoming", sort: eventSort })
  );
  const { data: pastEvents } = useQuery(
    trpc.events.listByPool.queryOptions({ poolId, status: "past" })
  );
  const { data: activity } = useQuery(
    trpc.pools.activity.queryOptions({ poolId, limit: 10 })
  );

  if (poolLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-10 bg-earth/30 rounded-xl w-1/3" />
        <div className="h-4 bg-earth/20 rounded-lg w-1/2" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-earth/20 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!poolData) return <div>Pool not found</div>;

  const { pool, membership, memberCount, totalHoursExchanged, userBalance } =
    poolData;

  const statusBadge = (status: string) => {
    const map: Record<string, "default" | "success" | "warning" | "secondary"> = {
      pledging: "warning",
      open: "default",
      confirmed: "success",
      in_progress: "warning",
    };
    return map[status] || "secondary";
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-display text-walnut tracking-tight">
              {pool.name}
            </h1>
            <Badge variant="outline" className="font-mono text-[10px]">
              {pool.symbol}
            </Badge>
          </div>
          {pool.description && (
            <p className="text-walnut-muted max-w-xl">{pool.description}</p>
          )}
          {pool.locationName && (
            <div className="flex items-center gap-1 mt-1.5 text-sm text-walnut-muted/70">
              <MapPin className="h-3 w-3" />
              <span>{pool.locationName}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/pools/${poolId}/events/new`}>
            <Button>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Event</span>
            </Button>
          </Link>
          <Link href={`/pools/${poolId}/health`}>
            <Button variant="outline" size="icon">
              <Heart className="h-4 w-4" />
            </Button>
          </Link>
          {membership?.role === "steward" && (
            <Link href={`/pools/${poolId}/settings`}>
              <Button variant="outline" size="icon">
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="animate-fade-in-up stagger-1">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-walnut-muted text-xs uppercase tracking-wider mb-2">
              <Users className="h-3.5 w-3.5" />
              Members
            </div>
            <div className="text-3xl font-display text-walnut">{memberCount}</div>
          </CardContent>
        </Card>
        <Card className="animate-fade-in-up stagger-2">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-walnut-muted text-xs uppercase tracking-wider mb-2">
              <Clock className="h-3.5 w-3.5" />
              Hours Exchanged
            </div>
            <div className="text-3xl font-display text-walnut">
              <span className="font-mono">{totalHoursExchanged}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="animate-fade-in-up stagger-3">
          <CardContent className="pt-6">
            <div className="text-walnut-muted text-xs uppercase tracking-wider mb-2">
              Your Balance
            </div>
            <div
              className={`text-3xl font-mono font-medium ${
                userBalance.balance >= 0 ? "text-sage" : "text-barn"
              }`}
            >
              {userBalance.balance >= 0 ? "+" : ""}
              {userBalance.balance}h
            </div>
            <div className="text-xs text-walnut-muted mt-1 font-mono">
              {userBalance.earned}h earned &middot; {userBalance.spent}h spent
            </div>
          </CardContent>
        </Card>
        <Card className="animate-fade-in-up stagger-4">
          <CardContent className="pt-6">
            <div className="text-walnut-muted text-xs uppercase tracking-wider mb-2">
              Your Role
            </div>
            <div className="text-3xl font-display text-walnut capitalize">
              {membership?.role || "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Events */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-display text-walnut">
            Upcoming Events
          </h2>
          <div className="flex items-center gap-2">
            <select
              value={eventSort}
              onChange={(e) => setEventSort(e.target.value as typeof eventSort)}
              className="text-xs border border-earth rounded-lg px-2.5 py-1.5 bg-cream-light text-walnut-muted focus:outline-none focus:ring-2 focus:ring-barn/20"
            >
              <option value="date">Soonest</option>
              <option value="needs_help">Needs Help</option>
              <option value="fill_rate">Least Full</option>
            </select>
            <Link href={`/pools/${poolId}/events/new`}>
              <Button variant="ghost" size="sm">
                <Plus className="h-4 w-4" />
                Create
              </Button>
            </Link>
          </div>
        </div>
        {upcomingEvents && upcomingEvents.length > 0 ? (
          <div className="grid gap-3">
            {upcomingEvents.map((event, i) => (
              <Link key={event.id} href={`/events/${event.id}`}>
                <Card
                  className={`hover:border-barn/40 hover:shadow-md cursor-pointer group animate-fade-in-up stagger-${Math.min(i + 1, 6)}`}
                >
                  <CardContent className="py-0 px-0">
                    <div className="flex">
                      {/* Mini banner stripe */}
                      <div
                        className={`w-1.5 rounded-l-2xl bg-gradient-to-b ${eventBannerGradient(event.title)} shrink-0`}
                      />
                      <div className="flex-1 py-4 px-5">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium text-walnut group-hover:text-barn transition-colors">
                                {event.title}
                              </h3>
                              <Badge variant={statusBadge(event.status)}>
                                {event.status.replace("_", " ")}
                              </Badge>
                              {event.hostingType === "group" && (
                                <Badge variant="outline" className="text-[10px]">
                                  <Users className="h-2.5 w-2.5 mr-0.5" />
                                  Group
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-xs text-walnut-muted">
                              <span className="flex items-center gap-1">
                                <CalendarDays className="h-3 w-3" />
                                {formatDate(new Date(event.dateStart))}
                              </span>
                              {event.locationName && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {event.locationName}
                                </span>
                              )}
                              <span>
                                by {event.host.displayName}
                              </span>
                            </div>
                            <div className="mt-2.5 flex items-center gap-2">
                              <Progress
                                value={event.hoursClaimed}
                                max={event.totalHoursNeeded}
                                className="flex-1 h-1.5"
                              />
                              <span className="text-xs text-walnut-muted font-mono whitespace-nowrap">
                                {event.hoursClaimed}/{event.totalHoursNeeded}h
                              </span>
                            </div>
                          </div>
                          <ArrowRight className="h-4 w-4 text-earth ml-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-walnut-muted">
              No upcoming events. Create one to get started!
            </CardContent>
          </Card>
        )}
      </div>

      {/* Past Events */}
      {pastEvents && pastEvents.length > 0 && (
        <div>
          <h2 className="text-xl font-display text-walnut mb-4">
            Past Events
          </h2>
          <div className="grid gap-2.5">
            {pastEvents.map((event) => (
              <Link key={event.id} href={`/events/${event.id}`}>
                <Card className="hover:border-earth-dark transition-colors cursor-pointer opacity-70 hover:opacity-100">
                  <CardContent className="py-3.5 px-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="font-medium text-walnut">{event.title}</h3>
                          <Badge
                            variant={
                              event.status === "verified" ? "success" : "warning"
                            }
                          >
                            {event.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-walnut-muted">
                          {formatDate(new Date(event.dateStart))} &middot;{" "}
                          <span className="font-mono">{event.hoursVerified}h</span> verified
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-earth" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Members */}
      <div>
        <h2 className="text-xl font-display text-walnut mb-4">Members</h2>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-1">
              {members?.map((member) => (
                <Link
                  key={member.id}
                  href={`/pools/${poolId}/members/${member.accountId}`}
                  className="flex items-center justify-between py-2.5 border-b border-earth/30 last:border-0 hover:bg-cream-dark -mx-3 px-3 rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-barn-light flex items-center justify-center text-barn text-sm font-semibold">
                      {member.account.displayName[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-sm text-walnut">
                        {member.account.displayName}
                        {member.role === "steward" && (
                          <Badge variant="outline" className="ml-2 text-[10px]">
                            Steward
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-walnut-muted/70">
                        Joined{" "}
                        {new Date(member.joinedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`text-sm font-mono font-medium ${
                        member.balance >= 0 ? "text-sage" : "text-barn"
                      }`}
                    >
                      {member.balance >= 0 ? "+" : ""}
                      {member.balance}h
                    </div>
                    <div className="text-xs text-walnut-muted/70 font-mono">
                      {member.hoursEarned}e &middot; {member.hoursSpent}s
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity Feed */}
      {activity && activity.length > 0 && (
        <div>
          <h2 className="text-xl font-display text-walnut mb-4">
            <Activity className="h-5 w-5 inline mr-2 text-walnut-muted" />
            Recent Activity
          </h2>
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-1">
                {activity.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 py-2.5 border-b border-earth/20 last:border-0"
                  >
                    <div className="w-6 h-6 rounded-full bg-cream-dark flex items-center justify-center text-walnut-muted text-xs font-medium mt-0.5">
                      {log.actor.displayName[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium text-walnut">
                          {log.actor.displayName}
                        </span>{" "}
                        <span className="text-walnut-muted">
                          {log.action.replace(/_/g, " ")}
                        </span>
                      </p>
                      <p className="text-xs text-walnut-muted/60 font-mono">
                        {new Date(log.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
