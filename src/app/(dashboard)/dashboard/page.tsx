"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, Clock, CalendarDays, CheckCircle2, ArrowRight } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function DashboardPage() {
  const { data: session } = useSession();
  const trpc = useTRPC();
  const { data: pools, isLoading } = useQuery(trpc.pools.myPools.queryOptions());
  const { data: myEvents } = useQuery(trpc.events.myEvents.queryOptions());

  if (!session) {
    return (
      <div className="text-center py-20">
        <p className="text-walnut-muted">Please sign in to view your pools.</p>
        <Link href="/sign-in">
          <Button className="mt-4">Sign In</Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display text-walnut tracking-tight">
            My Pools
          </h1>
          <p className="text-walnut-muted mt-1 text-sm sm:text-base">
            Your labor pools and collective work communities
          </p>
        </div>
        <Link href="/pools/new" className="shrink-0">
          <Button className="w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            Create Pool
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-6 bg-earth/40 rounded-lg w-3/4 mb-4" />
                <div className="h-4 bg-earth/30 rounded-lg w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : pools && pools.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {pools.map((pool, i) => (
            <Link key={pool.id} href={`/pools/${pool.id}`}>
              <Card
                className={`hover:border-barn/40 hover:shadow-md cursor-pointer h-full group animate-fade-in-up stagger-${Math.min(i + 1, 6)}`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="group-hover:text-barn transition-colors">
                      {pool.name}
                    </CardTitle>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {pool.symbol}
                    </Badge>
                  </div>
                  {pool.description && (
                    <CardDescription className="line-clamp-2">
                      {pool.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-walnut-muted">
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      <span>{pool.memberCount}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      <span
                        className={`font-mono text-xs ${
                          pool.balance >= 0 ? "text-sage" : "text-barn"
                        }`}
                      >
                        {pool.balance >= 0 ? "+" : ""}
                        {pool.balance}h
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="text-center py-16">
          <CardContent>
            <div className="flex justify-center mb-4">
              <div className="flex items-center justify-center w-20 h-20 rounded-full bg-cream-dark">
                <Image
                  src="/barn_raise_no_bg.png"
                  alt="Barn Raise"
                  width={48}
                  height={48}
                  className="object-contain"
                />
              </div>
            </div>
            <h3 className="text-xl font-display text-walnut mb-2">
              No pools yet
            </h3>
            <p className="text-walnut-muted max-w-sm mx-auto mb-6">
              Create a labor pool to start coordinating collective work with your community,
              neighbors, or cooperative.
            </p>
            <Link href="/pools/new">
              <Button>
                <Plus className="h-4 w-4" />
                Create Your First Pool
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* My Recent Activity */}
      {myEvents && myEvents.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xl font-display text-walnut mb-4">
            Recent Activity
          </h2>
          <div className="grid gap-2.5">
            {myEvents.slice(0, 10).map((event) => (
              <Link key={`${event.id}-${event.claim.id}`} href={`/events/${event.id}`}>
                <Card className="hover:border-barn/30 cursor-pointer group">
                  <CardContent className="py-3.5 px-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            event.claim.status === "verified_attended"
                              ? "bg-sage-light text-sage"
                              : event.claim.status === "claimed"
                              ? "bg-barn-light text-barn"
                              : "bg-cream-dark text-walnut-muted"
                          }`}
                        >
                          {event.claim.status === "verified_attended" ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <CalendarDays className="h-4 w-4" />
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-walnut group-hover:text-barn transition-colors">
                            {event.title}
                          </div>
                          <div className="text-xs text-walnut-muted">
                            {event.pool.name} &middot;{" "}
                            {formatDate(new Date(event.dateStart))}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {event.claim.status === "verified_attended" && (
                          <span className="text-sm font-mono font-medium text-sage">
                            +{event.claim.hoursVerified}h
                          </span>
                        )}
                        {event.claim.status === "claimed" && (
                          <Badge variant="default" className="text-xs">
                            Upcoming
                          </Badge>
                        )}
                        {event.claim.status === "verified_noshow" && (
                          <Badge variant="destructive" className="text-xs">
                            No-show
                          </Badge>
                        )}
                        <ArrowRight className="h-4 w-4 text-earth opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
