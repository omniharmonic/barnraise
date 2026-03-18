"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CalendarDays,
  MapPin,
  Clock,
  Users,
  User,
  CheckCircle2,
  XCircle,
  Share2,
  AlertTriangle,
  ArrowRight,
  Settings,
  Pencil,
  Trash2,
  Calendar,
  Navigation,
} from "lucide-react";
import { formatDate, formatHours } from "@/lib/utils";
import { eventBannerGradient } from "@/lib/utils/event-banners";
import { AvatarCircle } from "@/components/ui/avatar-circle";

export default function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = use(params);
  const { data: session } = useSession();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: event, isLoading } = useQuery(
    trpc.events.getById.queryOptions({ eventId })
  );

  const [claimHours, setClaimHours] = useState(0);
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingClaim, setEditingClaim] = useState(false);
  const [showCalPicker, setShowCalPicker] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [editClaimHours, setEditClaimHours] = useState(0);
  const [pledgeHours, setPledgeHours] = useState(1);
  const [showPledgeForm, setShowPledgeForm] = useState(false);

  const claimMutation = useMutation({
    ...trpc.events.claim.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setShowClaimForm(false);
    },
  });

  const cancelClaimMutation = useMutation({
    ...trpc.events.cancelClaim.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const updateClaimMutation = useMutation({
    ...trpc.events.updateClaim.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setEditingClaim(false);
    },
  });

  const cancelEventMutation = useMutation({
    ...trpc.events.cancelEvent.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const pledgeMutation = useMutation({
    ...trpc.events.pledge.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setShowPledgeForm(false);
    },
  });

  const withdrawPledgeMutation = useMutation({
    ...trpc.events.withdrawPledge.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto animate-pulse space-y-6">
        <div className="h-48 bg-earth/20 rounded-2xl" />
        <div className="h-8 bg-earth/30 rounded-xl w-2/3" />
        <div className="h-40 bg-earth/20 rounded-2xl" />
      </div>
    );
  }

  if (!event) return <div className="text-walnut-muted text-center py-16">Event not found</div>;

  const isHost = session?.user?.id === event.hostId;
  const myClaim = event.claims.find(
    (c) => c.accountId === session?.user?.id && c.status === "claimed"
  );
  const myPledge = event.pledges?.find(
    (p) => p.accountId === session?.user?.id && p.status === "active"
  );
  const activeClaims = event.claims.filter(
    (c) => c.status === "claimed" || c.status === "verified_attended"
  );
  const activePledges = event.pledges?.filter((p) => p.status === "active") ?? [];
  const fillPercentage =
    event.totalHoursNeeded > 0
      ? (event.hoursClaimed / event.totalHoursNeeded) * 100
      : 0;
  const pledgePercentage =
    event.totalHoursNeeded > 0
      ? (event.hoursPledged / event.totalHoursNeeded) * 100
      : 0;

  const statusColor: Record<string, "default" | "success" | "warning" | "destructive" | "secondary"> = {
    draft: "secondary",
    pledging: "warning",
    open: "default",
    confirmed: "success",
    in_progress: "warning",
    completed: "warning",
    verified: "success",
    cancelled: "destructive",
  };

  const defaultClaimHours =
    event.totalHoursNeeded > 0 && event.maxParticipants > 0
      ? Math.ceil(event.totalHoursNeeded / event.maxParticipants)
      : 1;

  const gradient = eventBannerGradient(event.title);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Banner */}
      <div
        className={`relative rounded-2xl overflow-hidden ${
          event.bannerImageUrl ? "" : `bg-gradient-to-br ${gradient} pattern-weave`
        }`}
      >
        {event.bannerImageUrl && (
          <img
            src={event.bannerImageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {event.bannerImageUrl && (
          <div className="absolute inset-0 bg-gradient-to-t from-walnut/70 via-walnut/30 to-transparent" />
        )}
        <div className="relative px-6 sm:px-8 py-10 sm:py-14">
          <div className="flex items-start justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <Badge
                  variant={statusColor[event.status] || "secondary"}
                  className="text-[11px]"
                >
                  {event.status.replace("_", " ")}
                </Badge>
                {event.hostingType === "group" && (
                  <Badge variant="outline" className="text-[11px] bg-white/40 border-white/50 text-walnut">
                    <Users className="h-3 w-3 mr-1" />
                    Group Hosted
                  </Badge>
                )}
              </div>
              <h1 className={`text-3xl sm:text-4xl font-display tracking-tight leading-tight ${event.bannerImageUrl ? "text-white" : "text-walnut"}`}>
                {event.title}
              </h1>
              {event.pool && (
                <Link
                  href={`/pools/${event.poolId}`}
                  className={`inline-block text-sm transition-colors ${event.bannerImageUrl ? "text-white/70 hover:text-white" : "text-walnut-muted hover:text-barn"}`}
                >
                  {event.pool.name} &rarr;
                </Link>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="bg-white/60 border-white/50 backdrop-blur-sm shrink-0"
              onClick={() => {
                const url = `${window.location.origin}/events/${eventId}`;
                navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? (
                <><CheckCircle2 className="h-3.5 w-3.5" /> Copied</>
              ) : (
                <><Share2 className="h-3.5 w-3.5" /> Share</>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Pledging banner for group events */}
      {event.hostingType === "group" && event.status === "pledging" && (
        <div className="flex items-start gap-3 p-4 bg-golden-light rounded-2xl border border-golden/30 animate-breathe">
          <AlertTriangle className="h-5 w-5 text-golden-dark mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-walnut">
              This event needs{" "}
              <span className="font-mono">{event.totalHoursNeeded - event.hoursPledged}</span>{" "}
              more hours before it can accept labor claims
            </p>
            <p className="text-xs text-walnut-muted mt-1">
              Become a co-host by pledging hours from your balance.
            </p>
          </div>
        </div>
      )}

      {/* Key details */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            <div className="flex items-start gap-2.5 relative">
              <div className="w-8 h-8 rounded-xl bg-cream-dark flex items-center justify-center shrink-0">
                <CalendarDays className="h-4 w-4 text-walnut-muted" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-walnut-muted mb-0.5">Date</div>
                <button
                  type="button"
                  onClick={() => setShowCalPicker(!showCalPicker)}
                  className="text-sm font-medium text-barn hover:text-barn-dark transition-colors text-left cursor-pointer"
                >
                  {formatDate(new Date(event.dateStart))}
                </button>
                <div className="text-xs text-walnut-muted/70">
                  to {formatDate(new Date(event.dateEnd))}
                </div>
                {showCalPicker && (() => {
                  const start = new Date(event.dateStart);
                  const end = new Date(event.dateEnd);
                  const title = encodeURIComponent(event.title);
                  const location = encodeURIComponent(event.locationName || "");
                  const details = encodeURIComponent(event.description || "");
                  const gcalStart = start.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
                  const gcalEnd = end.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
                  const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${gcalStart}/${gcalEnd}&location=${location}&details=${details}`;
                  return (
                    <div className="absolute top-full left-0 mt-1 z-10 bg-cream-light border border-earth/60 rounded-xl shadow-md p-2 space-y-1 min-w-[160px]">
                      <a
                        href={googleCalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setShowCalPicker(false)}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-walnut hover:bg-cream-dark rounded-lg transition-colors"
                      >
                        <Calendar className="h-3.5 w-3.5" />
                        Google Calendar
                      </a>
                      <a
                        href={`data:text/calendar;charset=utf-8,BEGIN:VCALENDAR%0AVERSION:2.0%0ABEGIN:VEVENT%0ADTSTART:${gcalStart}%0ADTEND:${gcalEnd}%0ASUMMARY:${title}%0ALOCATION:${location}%0ADESCRIPTION:${details}%0AEND:VEVENT%0AEND:VCALENDAR`}
                        download={`${event.title.replace(/\s+/g, "_")}.ics`}
                        onClick={() => setShowCalPicker(false)}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-walnut hover:bg-cream-dark rounded-lg transition-colors"
                      >
                        <Calendar className="h-3.5 w-3.5" />
                        Apple Calendar
                      </a>
                    </div>
                  );
                })()}
              </div>
            </div>
            {event.locationName && (
              <div className="flex items-start gap-2.5 relative">
                <div className="w-8 h-8 rounded-xl bg-cream-dark flex items-center justify-center shrink-0">
                  <MapPin className="h-4 w-4 text-walnut-muted" />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-walnut-muted mb-0.5">Location</div>
                  <button
                    type="button"
                    onClick={() => setShowMapPicker(!showMapPicker)}
                    className="text-sm font-medium text-barn hover:text-barn-dark transition-colors text-left cursor-pointer"
                  >
                    {event.locationName}
                  </button>
                  {showMapPicker && (() => {
                    const loc = encodeURIComponent(event.locationName || "");
                    return (
                      <div className="absolute top-full left-0 mt-1 z-10 bg-cream-light border border-earth/60 rounded-xl shadow-md p-2 space-y-1 min-w-[160px]">
                        <a
                          href={`https://maps.google.com/?q=${loc}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setShowMapPicker(false)}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-walnut hover:bg-cream-dark rounded-lg transition-colors"
                        >
                          <Navigation className="h-3.5 w-3.5" />
                          Google Maps
                        </a>
                        <a
                          href={`https://maps.apple.com/?q=${loc}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setShowMapPicker(false)}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-walnut hover:bg-cream-dark rounded-lg transition-colors"
                        >
                          <Navigation className="h-3.5 w-3.5" />
                          Apple Maps
                        </a>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-cream-dark flex items-center justify-center shrink-0">
                <Clock className="h-4 w-4 text-walnut-muted" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-walnut-muted mb-0.5">Labor</div>
                <div className="text-sm font-medium text-walnut font-mono">
                  {formatHours(event.totalHoursNeeded)}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-cream-dark flex items-center justify-center shrink-0">
                <User className="h-4 w-4 text-walnut-muted" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-walnut-muted mb-0.5">Host</div>
                <div className="text-sm font-medium text-walnut">
                  {event.host?.displayName}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Description */}
      {event.description && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-walnut/80 whitespace-pre-wrap leading-relaxed">
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

      {/* Co-Host Funding section (group events) */}
      {event.hostingType === "group" && (
        <Card>
          <CardHeader>
            <CardTitle>
              <Users className="h-4 w-4 inline mr-2" />
              Co-Host Funding
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Progress
                  value={event.hoursPledged}
                  max={event.totalHoursNeeded}
                  variant="golden"
                  className="h-3"
                />
                <div className="flex justify-between text-xs mt-2">
                  <span className="text-walnut-muted">
                    <span className="font-mono font-medium text-walnut">{event.hoursPledged}</span> of{" "}
                    <span className="font-mono">{event.totalHoursNeeded}</span> hours pledged
                  </span>
                  <span className="font-mono font-medium text-golden-dark">
                    {Math.round(pledgePercentage)}% funded
                  </span>
                </div>
              </div>

              {/* List of co-hosts */}
              {activePledges.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  {activePledges.map((pledge) => (
                    <div
                      key={pledge.id}
                      className="flex items-center justify-between py-2 px-3 rounded-xl bg-cream-dark/50"
                    >
                      <div className="flex items-center gap-2.5">
                        <AvatarCircle
                          src={pledge.account.avatarUrl}
                          name={pledge.account.displayName}
                          size="sm"
                        />
                        <span className="text-sm text-walnut">
                          {pledge.account.displayName}
                          {pledge.accountId === event.hostId && (
                            <span className="text-xs text-walnut-muted ml-1.5">(host)</span>
                          )}
                        </span>
                      </div>
                      <span className="text-sm font-mono text-golden-dark">
                        {pledge.hoursPledged}h
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Pledge actions */}
              {session?.user &&
                event.status === "pledging" &&
                !myPledge &&
                !isHost && (
                  <>
                    {!showPledgeForm ? (
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => setShowPledgeForm(true)}
                      >
                        <Users className="h-4 w-4" />
                        Become a Co-Host
                      </Button>
                    ) : (
                      <div className="space-y-3 p-4 bg-cream-dark/50 rounded-xl">
                        <label className="block text-sm font-medium text-walnut">
                          Hours to pledge
                        </label>
                        <Input
                          type="number"
                          min={1}
                          value={pledgeHours}
                          onChange={(e) =>
                            setPledgeHours(parseInt(e.target.value) || 1)
                          }
                        />
                        {pledgeMutation.error && (
                          <p className="text-xs text-red-600">
                            {pledgeMutation.error.message}
                          </p>
                        )}
                        <div className="flex gap-2">
                          <Button
                            className="flex-1"
                            onClick={() =>
                              pledgeMutation.mutate({
                                eventId,
                                hoursPledged: pledgeHours,
                              })
                            }
                            disabled={pledgeMutation.isPending}
                          >
                            {pledgeMutation.isPending
                              ? "Pledging..."
                              : `Pledge ${pledgeHours}h`}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setShowPledgeForm(false)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}

              {/* Withdraw pledge */}
              {myPledge && event.status === "pledging" && !isHost && (
                <div className="flex items-center justify-between p-3.5 bg-golden-light/50 rounded-xl border border-golden/30">
                  <span className="text-sm text-walnut">
                    You pledged <span className="font-mono font-medium">{myPledge.hoursPledged}h</span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      withdrawPledgeMutation.mutate({ eventId })
                    }
                    disabled={withdrawPledgeMutation.isPending}
                  >
                    Withdraw
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Labor Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Labor Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Progress
              value={event.hoursClaimed}
              max={event.totalHoursNeeded}
              variant="sage"
              className="h-3"
            />
            <div className="flex justify-between text-xs">
              <span className="text-walnut-muted">
                <span className="font-mono font-medium text-walnut">{event.hoursClaimed}</span> of{" "}
                <span className="font-mono">{event.totalHoursNeeded}</span> hours claimed
              </span>
              <span className="font-mono font-medium text-sage">
                {Math.round(fillPercentage)}%
              </span>
            </div>
            <div className="text-xs text-walnut-muted">
              <Users className="h-3.5 w-3.5 inline mr-1" />
              <span className="font-mono">{event.participantsCount}</span> of{" "}
              <span className="font-mono">{event.maxParticipants}</span> participants
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Participants */}
      <Card>
        <CardHeader>
          <CardTitle>Participants</CardTitle>
        </CardHeader>
        <CardContent>
          {activeClaims.length > 0 ? (
            <div className="space-y-1">
              {activeClaims.map((claim) => (
                <div
                  key={claim.id}
                  className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-cream-dark/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <AvatarCircle
                      src={claim.account.avatarUrl}
                      name={claim.account.displayName}
                    />
                    <span className="text-sm font-medium text-walnut">
                      {claim.account.displayName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm text-walnut-muted font-mono">
                      {claim.hoursCommitted}h
                    </span>
                    {claim.status === "verified_attended" && (
                      <CheckCircle2 className="h-4 w-4 text-sage" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-walnut-muted py-4 text-center">
              {event.status === "pledging"
                ? "Labor claims open once the event is fully funded."
                : "No one has claimed a slot yet. Be the first!"}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="space-y-3">
        {/* Claim slot */}
        {session?.user &&
          !myClaim &&
          ["open", "confirmed"].includes(event.status) &&
          event.participantsCount < event.maxParticipants && (
            <>
              {!showClaimForm ? (
                <Button
                  className="w-full"
                  size="lg"
                  variant="sage"
                  onClick={() => {
                    setClaimHours(defaultClaimHours);
                    setShowClaimForm(true);
                  }}
                >
                  Claim a Slot
                </Button>
              ) : (
                <Card>
                  <CardContent className="pt-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-walnut mb-1.5">
                        Hours you can commit
                      </label>
                      <Input
                        type="number"
                        min={1}
                        max={
                          event.totalHoursNeeded - event.hoursClaimed ||
                          undefined
                        }
                        value={claimHours}
                        onChange={(e) =>
                          setClaimHours(parseInt(e.target.value) || 1)
                        }
                      />
                      {event.flexibleHours && (
                        <p className="text-xs text-walnut-muted/70 mt-1.5">
                          Flexible hours — you can commit a partial shift
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        variant="sage"
                        onClick={() =>
                          claimMutation.mutate({
                            eventId,
                            hoursCommitted: claimHours,
                          })
                        }
                        disabled={claimMutation.isPending}
                      >
                        {claimMutation.isPending
                          ? "Claiming..."
                          : `Commit ${claimHours} hours`}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowClaimForm(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

        {/* My claim */}
        {myClaim && !editingClaim && (
          <div className="flex items-center justify-between p-4 bg-sage-light rounded-2xl border border-sage/20">
            <div>
              <p className="text-sm font-medium text-sage-dark">
                You&apos;re committed for{" "}
                <span className="font-mono">{myClaim.hoursCommitted}</span> hours
              </p>
              <p className="text-xs text-sage-dark/70">
                Show up and earn labor hours!
              </p>
            </div>
            <div className="flex items-center gap-2">
              {["open", "confirmed"].includes(event.status) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditClaimHours(myClaim.hoursCommitted);
                    setEditingClaim(true);
                  }}
                >
                  Edit
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => cancelClaimMutation.mutate({ eventId })}
                disabled={cancelClaimMutation.isPending}
              >
                Cancel Claim
              </Button>
            </div>
          </div>
        )}
        {myClaim && editingClaim && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-walnut mb-1.5">
                  Update your committed hours
                </label>
                <Input
                  type="number"
                  min={1}
                  value={editClaimHours}
                  onChange={(e) => setEditClaimHours(parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() =>
                    updateClaimMutation.mutate({ eventId, hoursCommitted: editClaimHours })
                  }
                  disabled={updateClaimMutation.isPending}
                >
                  {updateClaimMutation.isPending ? "Saving..." : "Update Claim"}
                </Button>
                <Button variant="outline" onClick={() => setEditingClaim(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Host controls */}
        {isHost &&
          ["draft", "open", "confirmed", "pledging"].includes(event.status) && (
            <Link href={`/events/${eventId}/edit`}>
              <Button variant="outline" className="w-full">
                <Settings className="h-4 w-4" />
                Manage Event
              </Button>
            </Link>
          )}

        {/* Verify button */}
        {isHost &&
          ["completed", "in_progress"].includes(event.status) && (
            <Link href={`/events/${eventId}/verify`}>
              <Button className="w-full" size="lg">
                <CheckCircle2 className="h-5 w-5" />
                Verify Attendance
              </Button>
            </Link>
          )}

        {/* Verified summary */}
        {event.status === "verified" && (
          <div className="p-5 bg-sage-light rounded-2xl border border-sage/20">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-5 w-5 text-sage" />
              <span className="font-display font-medium text-sage-dark">
                Event Verified
              </span>
            </div>
            <p className="text-sm text-sage-dark/80">
              <span className="font-mono font-medium">{event.hoursVerified}</span> hours
              were distributed to contributors.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
