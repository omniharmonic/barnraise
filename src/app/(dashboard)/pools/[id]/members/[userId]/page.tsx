"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  AlertTriangle,
  CalendarDays,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AvatarCircle } from "@/components/ui/avatar-circle";
import { formatDate } from "@/lib/utils";
import { balanceColor, reliabilityColor } from "@/lib/ui/colors";

export default function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string; userId: string }>;
}) {
  const { id: poolId, userId } = use(params);
  const trpc = useTRPC();

  const { data: profile, isLoading } = useQuery(
    trpc.users.poolProfile.queryOptions({ userId, poolId })
  );

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto animate-pulse space-y-6">
        <div className="h-8 bg-earth/30 rounded-xl w-1/3" />
        <div className="h-64 bg-earth/20 rounded-2xl" />
      </div>
    );
  }

  if (!profile?.account) return <div className="text-walnut-muted text-center py-16">Member not found</div>;

  const reliabilityCls = reliabilityColor(profile.attendanceReliability);
  const balanceCls = balanceColor(profile.balance);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href={`/pools/${poolId}`}>
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4" />
          Back to Pool
        </Button>
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4">
        <AvatarCircle
          src={profile.account.avatarUrl}
          name={profile.account.displayName}
          size="lg"
          className="!w-16 !h-16 !text-2xl"
        />
        <div>
          <h1 className="text-2xl font-display text-walnut">
            {profile.account.displayName}
          </h1>
          {profile.membership && (
            <div className="flex items-center gap-2 mt-1">
              {profile.membership.role === "steward" && (
                <Badge variant="outline" className="text-[10px]">Steward</Badge>
              )}
              <span className="text-sm text-walnut-muted">
                Member since{" "}
                {new Date(profile.membership.joinedAt).toLocaleDateString()}
              </span>
            </div>
          )}
          {profile.account.bio && (
            <p className="text-sm text-walnut-muted mt-2">
              {profile.account.bio}
            </p>
          )}
        </div>
      </div>

      {/* Skills */}
      {profile.account.skills && profile.account.skills.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {profile.account.skills.map((skill) => (
            <Badge key={skill} variant="secondary">
              {skill}
            </Badge>
          ))}
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <Card className="animate-fade-in-up stagger-1">
          <CardContent className="pt-6 text-center">
            <div className={`text-2xl font-mono font-medium ${balanceCls}`}>
              {profile.balance >= 0 ? "+" : ""}
              {profile.balance}h
            </div>
            <div className="text-xs text-walnut-muted mt-1">Balance</div>
          </CardContent>
        </Card>
        <Card className="animate-fade-in-up stagger-2">
          <CardContent className="pt-6 text-center">
            <div className={`text-2xl font-mono font-medium ${reliabilityCls}`}>
              {Math.round(profile.attendanceReliability)}%
            </div>
            <div className="text-xs text-walnut-muted mt-1">Reliability</div>
          </CardContent>
        </Card>
        <Card className="animate-fade-in-up stagger-3">
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-display text-walnut">
              {profile.attended}
            </div>
            <div className="text-xs text-walnut-muted mt-1">Attended</div>
          </CardContent>
        </Card>
        <Card className="animate-fade-in-up stagger-4">
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-display text-walnut">
              {profile.eventsHosted.length}
            </div>
            <div className="text-xs text-walnut-muted mt-1">Hosted</div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reputation Signals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3.5">
            {[
              { icon: TrendingUp, label: "Contribution Ratio", value: profile.contributionRatio === Infinity ? "Net giver" : profile.contributionRatio.toFixed(1) },
              { icon: Clock, label: "Hours Earned", value: `${profile.hoursEarned}h` },
              { icon: Clock, label: "Hours Spent (as host)", value: `${profile.hoursSpent}h` },
              { icon: XCircle, label: "No-shows (90 days)", value: profile.noShows90d, warn: profile.noShows90d >= 3 },
              { icon: AlertTriangle, label: "Late Cancellations", value: profile.lateCancels },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <item.icon className="h-4 w-4 text-walnut-muted" />
                  <span className="text-walnut">{item.label}</span>
                </div>
                <span className={`text-sm font-mono font-medium ${item.warn ? "text-barn" : "text-walnut"}`}>
                  {item.value}
                  {item.warn && <AlertTriangle className="h-3 w-3 inline ml-1 text-barn" />}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Event History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Event History</CardTitle>
        </CardHeader>
        <CardContent>
          {profile.eventHistory.length > 0 ? (
            <div className="space-y-1">
              {profile.eventHistory.map((item) => (
                <Link
                  key={item.id}
                  href={`/events/${item.id}`}
                  className="flex items-center justify-between py-2.5 border-b border-earth/30 last:border-0 hover:bg-cream-dark -mx-3 px-3 rounded-xl transition-colors"
                >
                  <div>
                    <div className="text-sm font-medium text-walnut">{item.title}</div>
                    <div className="text-xs text-walnut-muted">
                      <CalendarDays className="h-3 w-3 inline mr-1" />
                      {formatDate(new Date(item.dateStart))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.claim.status === "verified_attended" && (
                      <>
                        <span className="text-sm font-mono text-sage">
                          +{item.claim.hoursVerified}h
                        </span>
                        <CheckCircle2 className="h-4 w-4 text-sage" />
                      </>
                    )}
                    {item.claim.status === "verified_noshow" && (
                      <>
                        <span className="text-sm text-barn">No-show</span>
                        <XCircle className="h-4 w-4 text-barn" />
                      </>
                    )}
                    {item.claim.status === "claimed" && (
                      <Badge variant="default" className="text-xs">Upcoming</Badge>
                    )}
                    {item.claim.status === "cancelled" && (
                      <Badge variant="secondary" className="text-xs">Cancelled</Badge>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-walnut-muted text-center py-4">No event history yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
