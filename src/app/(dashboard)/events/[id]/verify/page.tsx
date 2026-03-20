"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertTriangle, Users } from "lucide-react";

interface VerificationEntry {
  claimId: string;
  accountId: string;
  name: string;
  hoursCommitted: number;
  attended: boolean;
  actualHours: number;
  workAreaName?: string;
}

/** Largest-remainder proportional split (mirrors backend logic) */
function splitProportional(total: number, pledges: { name: string; hours: number }[]) {
  const totalPledged = pledges.reduce((s, p) => s + p.hours, 0);
  if (totalPledged === 0) return pledges.map((p) => ({ name: p.name, share: 0 }));

  const shares = pledges.map((p) => {
    const exact = (p.hours / totalPledged) * total;
    const floored = Math.floor(exact);
    return { name: p.name, hours: p.hours, floored, remainder: exact - floored };
  });

  let remaining = total - shares.reduce((s, sh) => s + sh.floored, 0);
  shares.sort((a, b) => b.remainder - a.remainder);

  return shares.map((s) => {
    if (remaining > 0) {
      remaining--;
      return { name: s.name, share: s.floored + 1 };
    }
    return { name: s.name, share: s.floored };
  });
}

export default function VerifyEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = use(params);
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: event, isLoading } = useQuery(
    trpc.events.getById.queryOptions({ eventId })
  );

  const [verifications, setVerifications] = useState<VerificationEntry[]>([]);
  const [initialized, setInitialized] = useState(false);

  if (event && !initialized) {
    const activeClaims = event.claims.filter(
      (c) => c.status === "claimed"
    );
    setVerifications(
      activeClaims.map((c) => ({
        claimId: c.id,
        accountId: c.accountId,
        name: c.account.displayName,
        hoursCommitted: c.hoursCommitted,
        attended: true,
        actualHours: c.hoursCommitted,
        workAreaName: event.workAreas?.find((wa) => wa.id === c.workAreaId)?.name,
      }))
    );
    setInitialized(true);
  }

  const verifyMutation = useMutation({
    ...trpc.events.verify.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries();
      router.push(`/events/${eventId}`);
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto animate-pulse space-y-6">
        <div className="h-8 bg-earth/30 rounded-xl w-1/2" />
        <div className="h-64 bg-earth/20 rounded-2xl" />
      </div>
    );
  }

  if (!event) return <div className="text-walnut-muted text-center py-16">Event not found</div>;

  if (event.status === "verified") {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <CheckCircle2 className="h-16 w-16 text-sage mx-auto mb-4" />
        <h2 className="text-2xl font-display text-walnut mb-2">
          Already Verified
        </h2>
        <p className="text-walnut-muted mb-6">
          This event has already been verified.
        </p>
        <Button onClick={() => router.push(`/events/${eventId}`)}>
          View Event
        </Button>
      </div>
    );
  }

  const totalToDistribute = verifications
    .filter((v) => v.attended)
    .reduce((sum, v) => sum + v.actualHours, 0);

  const isGroup = event.hostingType === "group";
  const activePledges = event.pledges?.filter((p) => p.status === "active") ?? [];

  const coHostSplit = isGroup
    ? splitProportional(
        totalToDistribute,
        activePledges.map((p) => ({
          name: p.account.displayName,
          hours: p.hoursPledged,
        }))
      )
    : [];

  const toggleAttendance = (index: number) => {
    setVerifications((prev) =>
      prev.map((v, i) =>
        i === index
          ? {
              ...v,
              attended: !v.attended,
              actualHours: !v.attended ? v.hoursCommitted : 0,
            }
          : v
      )
    );
  };

  const updateHours = (index: number, hours: number) => {
    setVerifications((prev) =>
      prev.map((v, i) => (i === index ? { ...v, actualHours: hours } : v))
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-display text-walnut tracking-tight mb-1">
          Verify Attendance
        </h1>
        <p className="text-walnut-muted">
          Confirm who showed up and how many hours they worked at{" "}
          <span className="font-medium text-walnut">{event.title}</span>.
        </p>
      </div>

      {verifications.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-walnut-muted">
            No one claimed a slot for this event.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {verifications.map((v, index) => (
            <Card
              key={v.claimId}
              className={`transition-all duration-200 ${
                v.attended
                  ? "border-sage/30 bg-sage-light/30"
                  : "border-red-200/60 bg-red-50/30"
              }`}
            >
              <CardContent className="py-4 px-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleAttendance(index)}
                      className="cursor-pointer transition-transform hover:scale-110"
                    >
                      {v.attended ? (
                        <CheckCircle2 className="h-6 w-6 text-sage" />
                      ) : (
                        <XCircle className="h-6 w-6 text-red-400" />
                      )}
                    </button>
                    <div>
                      <div className="font-medium text-walnut">
                        {v.name}
                        {v.workAreaName && (
                          <span className="text-xs font-normal text-walnut-muted ml-2">
                            {v.workAreaName}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-walnut-muted">
                        Committed <span className="font-mono">{v.hoursCommitted}h</span>
                      </div>
                    </div>
                  </div>
                  {v.attended ? (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-walnut-muted">
                        Hours:
                      </label>
                      <Input
                        type="number"
                        min={0}
                        max={24}
                        value={v.actualHours}
                        onChange={(e) =>
                          updateHours(
                            index,
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-20 text-center"
                      />
                    </div>
                  ) : (
                    <Badge variant="destructive">No-show</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-walnut-muted">Total hours to distribute</span>
              <span className="text-2xl font-display text-walnut">
                <span className="font-mono">{totalToDistribute}</span>h
              </span>
            </div>

            <div className="border-t border-earth/30 pt-3">
              {isGroup ? (
                <>
                  <div className="flex items-center gap-2 text-xs text-walnut-muted uppercase tracking-wider mb-3">
                    <Users className="h-3.5 w-3.5" />
                    Cost split among co-hosts
                  </div>
                  <div className="space-y-2">
                    {coHostSplit.map((s) => (
                      <div key={s.name} className="flex justify-between text-sm">
                        <span className="text-walnut">{s.name}</span>
                        <span className="font-mono font-medium text-barn">
                          -{s.share}h
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-sm">
                  <span className="text-walnut-muted">
                    Your balance change (as host)
                  </span>
                  <span className="font-mono font-medium text-barn">
                    -{totalToDistribute}h
                  </span>
                </div>
              )}
            </div>

            <div className="border-t border-earth/30 pt-3 flex gap-6">
              <div className="text-sm">
                <span className="text-walnut-muted">Attended: </span>
                <span className="font-mono font-medium text-sage">
                  {verifications.filter((v) => v.attended).length}
                </span>
              </div>
              <div className="text-sm">
                <span className="text-walnut-muted">No-shows: </span>
                <span className="font-mono font-medium text-red-500">
                  {verifications.filter((v) => !v.attended).length}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {verifyMutation.error && (
        <div className="flex items-center gap-2.5 p-4 bg-red-50 rounded-xl border border-red-200">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <span className="text-sm text-red-700">
            {verifyMutation.error.message}
          </span>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button
          className="flex-1"
          size="lg"
          onClick={() =>
            verifyMutation.mutate({
              eventId,
              verifications: verifications.map((v) => ({
                claimId: v.claimId,
                accountId: v.accountId,
                attended: v.attended,
                actualHours: v.actualHours,
              })),
            })
          }
          disabled={verifyMutation.isPending}
        >
          {verifyMutation.isPending
            ? "Verifying..."
            : "Submit Verification"}
        </Button>
      </div>
    </div>
  );
}
