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
import { formatDate } from "@/lib/utils";

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
        <div className="h-8 bg-stone-200 rounded w-1/3" />
        <div className="h-64 bg-stone-200 rounded-xl" />
      </div>
    );
  }

  if (!profile?.account) return <div>Member not found</div>;

  const reliabilityColor =
    profile.attendanceReliability >= 80
      ? "text-green-700"
      : profile.attendanceReliability >= 50
      ? "text-amber-600"
      : "text-red-600";

  const balanceColor =
    profile.balance >= 0 ? "text-green-700" : "text-amber-700";

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
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-2xl font-bold">
          {profile.account.displayName[0]?.toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-stone-900">
            {profile.account.displayName}
          </h1>
          {profile.membership && (
            <div className="flex items-center gap-2 mt-1">
              {profile.membership.role === "steward" && (
                <Badge variant="outline">Steward</Badge>
              )}
              <span className="text-sm text-stone-500">
                Member since{" "}
                {new Date(profile.membership.joinedAt).toLocaleDateString()}
              </span>
            </div>
          )}
          {profile.account.bio && (
            <p className="text-sm text-stone-600 mt-2">
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className={`text-2xl font-bold ${balanceColor}`}>
              {profile.balance >= 0 ? "+" : ""}
              {profile.balance}h
            </div>
            <div className="text-xs text-stone-500 mt-1">Balance</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className={`text-2xl font-bold ${reliabilityColor}`}>
              {Math.round(profile.attendanceReliability)}%
            </div>
            <div className="text-xs text-stone-500 mt-1">Reliability</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-stone-900">
              {profile.attended}
            </div>
            <div className="text-xs text-stone-500 mt-1">Events Attended</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-stone-900">
              {profile.eventsHosted.length}
            </div>
            <div className="text-xs text-stone-500 mt-1">Events Hosted</div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reputation Signals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-stone-400" />
                <span>Contribution Ratio</span>
              </div>
              <span className="text-sm font-medium">
                {profile.contributionRatio === Infinity
                  ? "Net giver"
                  : profile.contributionRatio.toFixed(1)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-stone-400" />
                <span>Hours Earned</span>
              </div>
              <span className="text-sm font-medium">{profile.hoursEarned}h</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-stone-400" />
                <span>Hours Spent (as host)</span>
              </div>
              <span className="text-sm font-medium">{profile.hoursSpent}h</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <XCircle className="h-4 w-4 text-stone-400" />
                <span>No-shows (90 days)</span>
              </div>
              <span
                className={`text-sm font-medium ${
                  profile.noShows90d >= 3 ? "text-red-600" : ""
                }`}
              >
                {profile.noShows90d}
                {profile.noShows90d >= 3 && (
                  <AlertTriangle className="h-3 w-3 inline ml-1 text-red-500" />
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-stone-400" />
                <span>Late Cancellations</span>
              </div>
              <span className="text-sm font-medium">
                {profile.lateCancels}
              </span>
            </div>
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
            <div className="space-y-2">
              {profile.eventHistory.map((item) => (
                <Link
                  key={item.id}
                  href={`/events/${item.id}`}
                  className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0 hover:bg-stone-50 -mx-2 px-2 rounded"
                >
                  <div>
                    <div className="text-sm font-medium">{item.title}</div>
                    <div className="text-xs text-stone-500">
                      <CalendarDays className="h-3 w-3 inline mr-1" />
                      {formatDate(new Date(item.dateStart))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.claim.status === "verified_attended" && (
                      <>
                        <span className="text-sm text-green-700">
                          +{item.claim.hoursVerified}h
                        </span>
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      </>
                    )}
                    {item.claim.status === "verified_noshow" && (
                      <>
                        <span className="text-sm text-red-600">No-show</span>
                        <XCircle className="h-4 w-4 text-red-500" />
                      </>
                    )}
                    {item.claim.status === "claimed" && (
                      <Badge variant="default">Upcoming</Badge>
                    )}
                    {item.claim.status === "cancelled" && (
                      <Badge variant="secondary">Cancelled</Badge>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-500">No event history yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
