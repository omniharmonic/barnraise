"use client";

import { useSession } from "next-auth/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Users,
  MapPin,
  CalendarDays,
  Clock,
  Wheat,
  Gift,
  CheckCircle2,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

interface JoinPoolProps {
  pool: {
    id: string;
    name: string;
    description: string | null;
    locationName: string | null;
    joinPolicy: string;
    startingBalance: number;
    memberCount: number;
  };
  upcomingEvents: {
    id: string;
    title: string;
    dateStart: string;
    hoursClaimed: number;
    totalHoursNeeded: number;
  }[];
}

export function JoinPoolClient({ pool, upcomingEvents }: JoinPoolProps) {
  const { data: session } = useSession();
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();

  const joinMutation = useMutation({
    ...trpc.pools.join.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries();
      router.push(`/pools/${pool.id}`);
    },
  });

  return (
    <div className="max-w-xl mx-auto space-y-6 py-4">
      {/* Header */}
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-amber-100">
            <Wheat className="h-8 w-8 text-amber-700" />
          </div>
        </div>
        <p className="text-sm text-amber-700 font-medium mb-2">
          You&apos;re invited to join
        </p>
        <h1 className="text-3xl font-bold text-stone-900 mb-2">
          {pool.name}
        </h1>
        {pool.description && (
          <p className="text-stone-600 max-w-md mx-auto">
            {pool.description}
          </p>
        )}
        <div className="flex items-center justify-center gap-4 mt-3 text-sm text-stone-500">
          <span className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            {pool.memberCount} members
          </span>
          {pool.locationName && (
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {pool.locationName}
            </span>
          )}
        </div>
      </div>

      {/* Starting balance */}
      {pool.startingBalance > 0 && (
        <Card className="border-green-200 bg-green-50/30">
          <CardContent className="pt-6 text-center">
            <Gift className="h-6 w-6 text-green-700 mx-auto mb-2" />
            <p className="text-sm text-green-800">
              New members receive{" "}
              <strong>{pool.startingBalance} starting hours</strong> — a
              community investment to help you get started.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Upcoming events */}
      {upcomingEvents.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-stone-900 mb-3">
            Upcoming Events
          </h2>
          <div className="space-y-2">
            {upcomingEvents.map((event) => (
              <Card key={event.id}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{event.title}</div>
                      <div className="text-xs text-stone-500">
                        <CalendarDays className="h-3 w-3 inline mr-1" />
                        {formatDate(new Date(event.dateStart))}
                      </div>
                    </div>
                    <div className="text-right text-xs text-stone-500">
                      {event.hoursClaimed}/{event.totalHoursNeeded}h
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* How it works */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-sm font-semibold text-stone-900 mb-3">
            How Barn Raise Works
          </h3>
          <div className="space-y-3">
            {[
              {
                icon: Users,
                text: "Join a pool of people who help each other with work projects",
              },
              {
                icon: CalendarDays,
                text: "Claim slots at events hosted by pool members",
              },
              {
                icon: Clock,
                text: "Earn labor hours by showing up and contributing",
              },
              {
                icon: CheckCircle2,
                text: "Host your own events when you need help — use the hours you've earned",
              },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <item.icon className="h-3.5 w-3.5 text-amber-700" />
                </div>
                <p className="text-sm text-stone-600">{item.text}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* CTA */}
      <div className="sticky bottom-0 bg-stone-50/95 backdrop-blur-sm pb-6 pt-4">
        {session?.user ? (
          <div className="space-y-3">
            <Button
              size="lg"
              className="w-full text-base"
              onClick={() => joinMutation.mutate({ poolId: pool.id })}
              disabled={joinMutation.isPending}
            >
              {joinMutation.isPending
                ? "Joining..."
                : pool.joinPolicy === "approval"
                ? "Request to Join"
                : `Join ${pool.name}`}
            </Button>
            {joinMutation.error && (
              <p className="text-sm text-red-600 text-center">
                {joinMutation.error.message}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <Link
              href={`/sign-in?callbackUrl=${encodeURIComponent(`/join/${pool.id}`)}`}
            >
              <Button size="lg" className="w-full text-base">
                Sign Up to Join {pool.name}
              </Button>
            </Link>
            <p className="text-center text-xs text-stone-400">
              Create a free account to join this labor pool
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
