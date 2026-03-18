"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Users, Activity, BarChart3, AlertTriangle } from "lucide-react";

export default function PoolHealthPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: poolId } = use(params);
  const trpc = useTRPC();

  const { data: health, isLoading } = useQuery(
    trpc.pools.health.queryOptions({ poolId })
  );
  const { data: poolData } = useQuery(
    trpc.pools.getById.queryOptions({ poolId })
  );

  if (isLoading || !health) {
    return (
      <div className="max-w-3xl mx-auto animate-pulse space-y-6">
        <div className="h-8 bg-earth/30 rounded-xl w-1/3" />
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-40 bg-earth/20 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const bands = health.reciprocityBands;
  const maxBand = Math.max(...Object.values(bands), 1);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/pools/${poolId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Back to Pool
            </Button>
          </Link>
          <h1 className="text-3xl font-display text-walnut tracking-tight mt-2">
            Pool Health
          </h1>
          {poolData?.pool && (
            <p className="text-walnut-muted">{poolData.pool.name}</p>
          )}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-walnut-muted text-xs uppercase tracking-wider mb-2">
              <Users className="h-3.5 w-3.5" />
              Active Members
            </div>
            <div className="text-2xl font-display text-walnut">
              {health.activeMembers}{" "}
              <span className="text-sm font-normal text-walnut-muted">
                / {health.totalMembers}
              </span>
            </div>
            <p className="text-xs text-walnut-muted mt-1">
              Active in last 30 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-walnut-muted text-xs uppercase tracking-wider mb-2">
              <BarChart3 className="h-3.5 w-3.5" />
              Avg Fill Rate
            </div>
            <div className="text-2xl font-display text-walnut">
              {health.avgFillRate}%
            </div>
            <div className="mt-2">
              <Progress value={health.avgFillRate} max={100} className="h-1.5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-walnut-muted text-xs uppercase tracking-wider mb-2">
              <AlertTriangle className="h-3.5 w-3.5" />
              No-Show Rate
            </div>
            <div
              className={`text-2xl font-mono font-medium ${
                health.noshowRate > 15 ? "text-barn" : "text-sage"
              }`}
            >
              {health.noshowRate}%
            </div>
            <p className="text-xs text-walnut-muted mt-1">
              Target: under 15%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-walnut-muted text-xs uppercase tracking-wider mb-2">
              <Activity className="h-3.5 w-3.5" />
              Events (6mo)
            </div>
            <div className="text-2xl font-display text-walnut">
              {health.monthlyEvents.reduce((sum, m) => sum + m.count, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reciprocity Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reciprocity Distribution</CardTitle>
          <CardDescription>
            How balanced are members between giving and receiving? A healthy pool
            clusters near 1.0 (equal give and receive).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(bands).map(([band, count]) => (
              <div key={band} className="flex items-center gap-3">
                <div className="w-16 text-sm text-walnut-muted text-right font-mono">
                  {band}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-6 rounded-lg transition-all ${
                        band === "1.0-1.5"
                          ? "bg-sage"
                          : band === "0.5-1.0" || band === "1.5-2.0"
                          ? "bg-golden"
                          : "bg-earth/60"
                      }`}
                      style={{
                        width: `${(count / maxBand) * 100}%`,
                        minWidth: count > 0 ? "16px" : "0",
                      }}
                    />
                    <span className="text-sm text-walnut-muted font-mono">{count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-walnut-muted/60">
            Ratio = hours earned / hours spent. Below 1.0 = net receiver. Above
            1.0 = net giver.
          </div>
        </CardContent>
      </Card>

      {/* Events Per Month */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Events per Month</CardTitle>
        </CardHeader>
        <CardContent>
          {health.monthlyEvents.length > 0 ? (
            <div className="flex items-end gap-2 h-32">
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
                        minHeight: m.count > 0 ? "8px" : "2px",
                      }}
                    />
                    <span className="text-xs text-walnut-muted">
                      {m.month.slice(5)}
                    </span>
                    <span className="text-xs font-mono font-medium text-walnut">{m.count}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-walnut-muted text-center py-4">
              No events in the last 6 months.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
