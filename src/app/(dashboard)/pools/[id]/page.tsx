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
  Globe,
  MessageCircle,
  ExternalLink,
  BarChart3,
  AlertTriangle,
} from "lucide-react";
import { formatDate, formatHours } from "@/lib/utils";
import { eventBannerGradient } from "@/lib/utils/event-banners";
import { AvatarCircle } from "@/components/ui/avatar-circle";

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
  const { data: health } = useQuery(
    trpc.pools.health.queryOptions({ poolId })
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

  // Pending approval state
  if (poolData.pending) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 space-y-4">
        <div className="w-16 h-16 rounded-full bg-golden-light flex items-center justify-center mx-auto">
          <Clock className="h-8 w-8 text-golden-dark" />
        </div>
        <h1 className="text-2xl font-display text-walnut">Request Pending</h1>
        <p className="text-walnut-muted">
          Your request to join <span className="font-medium text-walnut">{pool.name}</span> is
          waiting for steward approval. You&apos;ll be notified when you&apos;re accepted.
        </p>
      </div>
    );
  }

  const poolLinks = [
    ...(pool.websiteUrl ? [{ label: "Website", url: pool.websiteUrl, icon: Globe }] : []),
    ...(pool.groupChatUrl ? [{ label: "Group Chat", url: pool.groupChatUrl, icon: MessageCircle }] : []),
    ...((pool.customLinks as { label: string; url: string }[] | null) || []).map((l) => ({
      ...l,
      icon: ExternalLink,
    })),
  ];

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
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl sm:text-3xl font-display text-walnut tracking-tight">
              {pool.name}
            </h1>
            <Badge variant="outline" className="font-mono text-[10px]">
              {pool.symbol}
            </Badge>
          </div>
          {pool.description && (
            <p className="text-walnut-muted max-w-xl">{pool.description}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5">
            {pool.locationName && (
              <span className="flex items-center gap-1 text-sm text-walnut-muted/70">
                <MapPin className="h-3 w-3" />
                {pool.locationName}
              </span>
            )}
            {poolLinks.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-barn hover:text-barn-dark transition-colors"
              >
                <link.icon className="h-3 w-3" />
                {link.label}
              </a>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/pools/${poolId}/events/new`}>
            <Button>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Event</span>
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
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <Card className="animate-fade-in-up stagger-1">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-walnut-muted text-xs uppercase tracking-wider mb-2">
              <Users className="h-3.5 w-3.5" />
              Members
            </div>
            <div className="text-3xl font-display text-walnut">{memberCount}</div>
            {health && (
              <div className="text-xs text-walnut-muted mt-1">
                <span className="font-mono">{health.activeMembers}</span> active (30d)
              </div>
            )}
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
            {health && (
              <div className="text-xs text-walnut-muted mt-1">
                <span className="font-mono">{health.avgFillRate}%</span> avg fill rate
              </div>
            )}
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
            <div className="flex items-center gap-2 text-walnut-muted text-xs uppercase tracking-wider mb-2">
              <BarChart3 className="h-3.5 w-3.5" />
              Pool Health
            </div>
            {health ? (
              <>
                <div className={`text-3xl font-mono font-medium ${health.noshowRate > 15 ? "text-barn" : "text-sage"}`}>
                  {health.noshowRate}%
                </div>
                <div className="text-xs text-walnut-muted mt-1">
                  no-show rate{" "}
                  {health.noshowRate > 15 && (
                    <AlertTriangle className="h-3 w-3 inline text-golden-dark" />
                  )}
                </div>
              </>
            ) : (
              <div className="text-3xl font-display text-walnut capitalize">
                {membership?.role || "—"}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pool Health Details */}
      {health && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Reciprocity Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reciprocity Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2.5">
                {Object.entries(health.reciprocityBands).map(([band, count]) => {
                  const maxBand = Math.max(...Object.values(health.reciprocityBands), 1);
                  return (
                    <div key={band} className="flex items-center gap-2.5">
                      <div className="w-14 text-xs text-walnut-muted text-right font-mono">
                        {band}
                      </div>
                      <div className="flex-1 flex items-center gap-2">
                        <div
                          className={`h-5 rounded-lg transition-all ${
                            band === "1.0-1.5"
                              ? "bg-sage"
                              : band === "0.5-1.0" || band === "1.5-2.0"
                              ? "bg-golden"
                              : "bg-earth/60"
                          }`}
                          style={{
                            width: `${(count / maxBand) * 100}%`,
                            minWidth: count > 0 ? "14px" : "0",
                          }}
                        />
                        <span className="text-xs text-walnut-muted font-mono">{count}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-walnut-muted/60 mt-3">
                Ratio = earned / spent. Near 1.0 is balanced.
              </p>
            </CardContent>
          </Card>

          {/* Events Per Month */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Events per Month</CardTitle>
            </CardHeader>
            <CardContent>
              {health.monthlyEvents.length > 0 ? (
                <div className="flex items-end gap-2 h-28">
                  {health.monthlyEvents.map((m) => {
                    const maxCount = Math.max(
                      ...health.monthlyEvents.map((mm) => mm.count),
                      1
                    );
                    return (
                      <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="w-full bg-barn rounded-t-lg"
                          style={{
                            height: `${(m.count / maxCount) * 100}%`,
                            minHeight: m.count > 0 ? "6px" : "2px",
                          }}
                        />
                        <span className="text-[10px] text-walnut-muted">
                          {m.month.slice(5)}
                        </span>
                        <span className="text-xs font-mono font-medium text-walnut">{m.count}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-walnut-muted py-4 text-center">
                  No events in the last 6 months.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

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
              className="text-base sm:text-xs border border-earth rounded-lg px-2.5 py-1.5 bg-cream-light text-walnut-muted focus:outline-none focus:ring-2 focus:ring-barn/20"
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
                  className={`overflow-hidden hover:border-barn/40 hover:shadow-md cursor-pointer group animate-fade-in-up stagger-${Math.min(i + 1, 6)}`}
                >
                  <CardContent className="py-0 px-0">
                    <div className="flex">
                      <div
                        className={`w-1.5 shrink-0 bg-gradient-to-b ${eventBannerGradient(event.title)}`}
                      />
                      <div className="flex-1 py-3 sm:py-4 px-3.5 sm:px-5 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                              <h3 className="font-medium text-walnut group-hover:text-barn transition-colors text-sm sm:text-base">
                                {event.title}
                              </h3>
                              <Badge variant={statusBadge(event.status)} className="text-[10px] shrink-0">
                                {event.status.replace("_", " ")}
                              </Badge>
                              {event.hostingType === "group" && (
                                <Badge variant="outline" className="text-[10px] shrink-0">
                                  <Users className="h-2.5 w-2.5 mr-0.5" />
                                  Group
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-walnut-muted">
                              <span className="flex items-center gap-1">
                                <CalendarDays className="h-3 w-3 shrink-0" />
                                {formatDate(new Date(event.dateStart))}
                              </span>
                              {event.locationName && (
                                <span className="flex items-center gap-1 truncate max-w-[140px]">
                                  <MapPin className="h-3 w-3 shrink-0" />
                                  {event.locationName}
                                </span>
                              )}
                              <span className="truncate">
                                by {event.host.displayName}
                              </span>
                            </div>
                            <div className="mt-2 sm:mt-2.5 flex items-center gap-2">
                              {event.status === "pledging" ? (
                                <>
                                  <Progress
                                    value={event.hoursPledged}
                                    max={event.totalHoursNeeded}
                                    variant="golden"
                                    className="flex-1 h-1.5"
                                  />
                                  <span className="text-xs text-walnut-muted font-mono whitespace-nowrap">
                                    {event.hoursPledged}/{event.totalHoursNeeded}h pledged
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Progress
                                    value={event.hoursClaimed}
                                    max={event.totalHoursNeeded}
                                    className="flex-1 h-1.5"
                                  />
                                  <span className="text-xs text-walnut-muted font-mono whitespace-nowrap">
                                    {event.hoursClaimed}/{event.totalHoursNeeded}h
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <ArrowRight className="h-4 w-4 text-earth ml-2 shrink-0 hidden sm:block opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
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
                            variant={event.status === "verified" ? "success" : "warning"}
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
                    <AvatarCircle
                      src={member.account.avatarUrl}
                      name={member.account.displayName}
                    />
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
