"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Users,
  MapPin,
  CalendarDays,
  Clock,
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

  const [joinedPending, setJoinedPending] = useState(false);

  const joinMutation = useMutation({
    ...trpc.pools.join.mutationOptions(),
    onSuccess: (membership) => {
      queryClient.invalidateQueries();
      if (membership.status === "pending") {
        setJoinedPending(true);
      } else {
        router.push(`/pools/${pool.id}`);
      }
    },
  });

  if (joinedPending) {
    return (
      <div className="max-w-xl mx-auto text-center py-16 space-y-4">
        <div className="w-16 h-16 rounded-full bg-golden-light flex items-center justify-center mx-auto">
          <Clock className="h-8 w-8 text-golden-dark" />
        </div>
        <h1 className="text-2xl font-display text-walnut">Request Submitted</h1>
        <p className="text-walnut-muted max-w-sm mx-auto">
          Your request to join <span className="font-medium text-walnut">{pool.name}</span> has
          been sent to the pool stewards. You&apos;ll be notified when you&apos;re approved.
        </p>
        <Link href="/dashboard">
          <Button variant="outline" className="mt-4">Go to Dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6 py-4">
      {/* Header */}
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <Image
            src="/barn_raise_no_bg.png"
            alt="Barn Raise"
            width={64}
            height={64}
            className="object-contain"
          />
        </div>
        <p className="text-sm text-barn font-medium mb-2">
          You&apos;re invited to join
        </p>
        <h1 className="text-3xl font-display text-walnut tracking-tight mb-2">
          {pool.name}
        </h1>
        {pool.description && (
          <p className="text-walnut-muted max-w-md mx-auto">
            {pool.description}
          </p>
        )}
        <div className="flex items-center justify-center gap-4 mt-3 text-sm text-walnut-muted">
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
        <Card className="border-sage/30 bg-sage-light/30">
          <CardContent className="pt-6 text-center">
            <Gift className="h-6 w-6 text-sage mx-auto mb-2" />
            <p className="text-sm text-sage-dark">
              New members receive{" "}
              <strong className="font-mono">{pool.startingBalance}h</strong> starting hours — a
              community investment to help you get started.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Upcoming events */}
      {upcomingEvents.length > 0 && (
        <div>
          <h2 className="text-sm font-display text-walnut mb-3">
            Upcoming Events
          </h2>
          <div className="space-y-2">
            {upcomingEvents.map((event) => (
              <Card key={event.id}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-walnut">{event.title}</div>
                      <div className="text-xs text-walnut-muted">
                        <CalendarDays className="h-3 w-3 inline mr-1" />
                        {formatDate(new Date(event.dateStart))}
                      </div>
                    </div>
                    <div className="text-right text-xs text-walnut-muted font-mono">
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
          <h3 className="text-sm font-display text-walnut mb-3">
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
                <div className="w-6 h-6 rounded-full bg-barn-light flex items-center justify-center flex-shrink-0 mt-0.5">
                  <item.icon className="h-3.5 w-3.5 text-barn" />
                </div>
                <p className="text-sm text-walnut-muted">{item.text}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* CTA */}
      <div className="sticky bottom-0 bg-cream/95 backdrop-blur-sm pb-6 pt-4">
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
            <p className="text-center text-xs text-walnut-muted/60">
              Create a free account to join this labor pool
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
