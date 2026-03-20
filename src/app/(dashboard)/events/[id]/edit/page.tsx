"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, AlertTriangle, ArrowLeft, Plus, X, Layers } from "lucide-react";
import Link from "next/link";

const SKILL_OPTIONS = [
  "Physical Labor", "Gardening", "Construction", "Cooking", "Cleaning",
  "Moving", "Painting", "Tech", "Childcare", "Event Setup", "Landscaping", "Repair",
];

function toLocalDatetime(iso: string) {
  const d = new Date(iso);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

export default function EditEventPage({
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

  const [form, setForm] = useState({
    title: "",
    description: "",
    dateStart: "",
    dateEnd: "",
    locationName: "",
    totalHoursNeeded: 1,
    maxParticipants: 1,
    minParticipants: 1,
    flexibleHours: true,
    skillTags: [] as string[],
    workAreas: [] as { name: string; targetHours: number | null }[],
  });
  const [initialized, setInitialized] = useState(false);
  const [newWorkArea, setNewWorkArea] = useState("");

  useEffect(() => {
    if (event && !initialized) {
      setForm({
        title: event.title,
        description: event.description || "",
        dateStart: toLocalDatetime(event.dateStart as unknown as string),
        dateEnd: toLocalDatetime(event.dateEnd as unknown as string),
        locationName: event.locationName || "",
        totalHoursNeeded: event.totalHoursNeeded,
        maxParticipants: event.maxParticipants,
        minParticipants: event.minParticipants ?? 1,
        flexibleHours: event.flexibleHours ?? true,
        skillTags: event.skillTags || [],
        workAreas: (event.workAreas || []).map((wa: { name: string; targetHours: number | null }) => ({
          name: wa.name,
          targetHours: wa.targetHours,
        })),
      });
      setInitialized(true);
    }
  }, [event, initialized]);

  const updateEvent = useMutation({
    ...trpc.events.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries();
      router.push(`/events/${eventId}`);
    },
  });

  const cancelEventMutation = useMutation({
    ...trpc.events.cancelEvent.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries();
      router.push(`/events/${eventId}`);
    },
  });

  const toggleSkill = (skill: string) => {
    setForm((f) => ({
      ...f,
      skillTags: f.skillTags.includes(skill)
        ? f.skillTags.filter((s) => s !== skill)
        : [...f.skillTags, skill],
    }));
  };

  if (isLoading || !event) {
    return (
      <div className="max-w-2xl mx-auto animate-pulse space-y-6">
        <div className="h-8 bg-earth/30 rounded-xl w-1/2" />
        <div className="h-64 bg-earth/20 rounded-2xl" />
      </div>
    );
  }

  const canEdit = ["draft", "open", "confirmed", "pledging"].includes(event.status);

  if (!canEdit) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <h2 className="text-xl font-display text-walnut mb-2">
          Cannot Edit
        </h2>
        <p className="text-walnut-muted mb-6">
          This event is {event.status} and can no longer be edited.
        </p>
        <Button onClick={() => router.push(`/events/${eventId}`)}>
          Back to Event
        </Button>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateEvent.mutate({
      eventId,
      title: form.title,
      description: form.description || undefined,
      dateStart: new Date(form.dateStart).toISOString(),
      dateEnd: new Date(form.dateEnd).toISOString(),
      locationName: form.locationName || undefined,
      totalHoursNeeded: form.totalHoursNeeded,
      maxParticipants: form.maxParticipants,
      minParticipants: form.minParticipants,
      flexibleHours: form.flexibleHours,
      skillTags: form.skillTags.length > 0 ? form.skillTags : undefined,
      workAreas: form.workAreas,
    });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Link href={`/events/${eventId}`}>
        <Button variant="ghost" size="sm" className="mb-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Event
        </Button>
      </Link>
      <h1 className="text-3xl font-display text-walnut tracking-tight mb-2">
        Manage Event
      </h1>
      <p className="text-walnut-muted mb-6">
        Editing &ldquo;{event.title}&rdquo;
      </p>

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Event Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-walnut mb-1.5">
                Title *
              </label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-walnut mb-1.5">
                Description
              </label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={4}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-walnut mb-1.5">
                Start *
              </label>
              <div className="relative w-full" style={{ overflow: "hidden" }}>
                <input
                  type="datetime-local"
                  value={form.dateStart}
                  onChange={(e) => setForm({ ...form, dateStart: e.target.value })}
                  required
                  className="flex h-10 w-full rounded-xl border border-earth bg-cream-light px-3 py-2 text-base sm:text-sm text-walnut transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-barn/30 focus-visible:border-barn/50"
                  style={{ maxWidth: "100%", WebkitAppearance: "none" }}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-walnut mb-1.5">
                End *
              </label>
              <div className="relative w-full" style={{ overflow: "hidden" }}>
                <input
                  type="datetime-local"
                  value={form.dateEnd}
                  onChange={(e) => setForm({ ...form, dateEnd: e.target.value })}
                  required
                  className="flex h-10 w-full rounded-xl border border-earth bg-cream-light px-3 py-2 text-base sm:text-sm text-walnut transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-barn/30 focus-visible:border-barn/50"
                  style={{ maxWidth: "100%", WebkitAppearance: "none" }}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-walnut mb-1.5">
                Location
              </label>
              <Input
                value={form.locationName}
                onChange={(e) => setForm({ ...form, locationName: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Labor Needs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
              <div>
                <label className="block text-sm font-medium text-walnut mb-1.5">
                  Total Hours *
                </label>
                <Input
                  type="number"
                  min={1}
                  value={form.totalHoursNeeded}
                  onChange={(e) =>
                    setForm({ ...form, totalHoursNeeded: parseInt(e.target.value) || 1 })
                  }
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-walnut mb-1.5">
                  Max Participants *
                </label>
                <Input
                  type="number"
                  min={1}
                  value={form.maxParticipants}
                  onChange={(e) =>
                    setForm({ ...form, maxParticipants: parseInt(e.target.value) || 1 })
                  }
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-walnut mb-1.5">
                  Min Participants
                </label>
                <Input
                  type="number"
                  min={1}
                  value={form.minParticipants}
                  onChange={(e) =>
                    setForm({ ...form, minParticipants: parseInt(e.target.value) || 1 })
                  }
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={form.flexibleHours}
                  onChange={(e) => setForm({ ...form, flexibleHours: e.target.checked })}
                />
                <div className="w-11 h-6 bg-earth/60 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-barn/30 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-barn" />
              </label>
              <span className="text-sm text-walnut">Flexible Hours</span>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Skills</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {SKILL_OPTIONS.map((skill) => (
                <button key={skill} type="button" onClick={() => toggleSkill(skill)}>
                  <Badge
                    variant={form.skillTags.includes(skill) ? "default" : "outline"}
                    className="cursor-pointer transition-all duration-150 hover:scale-105"
                  >
                    {skill}
                  </Badge>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Work Areas */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>
              <Layers className="h-4 w-4 inline mr-2" />
              Work Areas
            </CardTitle>
            <CardDescription>
              Split the event into teams or projects. People choose which area to join.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {form.workAreas.length > 0 && (
              <div className="space-y-2">
                {form.workAreas.map((wa, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 p-3 rounded-xl bg-cream-dark/50"
                  >
                    <span className="text-sm font-medium text-walnut flex-1">
                      {wa.name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={0}
                        max={form.totalHoursNeeded}
                        placeholder="hrs"
                        value={wa.targetHours ?? ""}
                        onChange={(e) => {
                          const val = e.target.value
                            ? parseInt(e.target.value) || null
                            : null;
                          setForm((f) => ({
                            ...f,
                            workAreas: f.workAreas.map((w, j) =>
                              j === i ? { ...w, targetHours: val } : w
                            ),
                          }));
                        }}
                        className="w-16 text-center text-sm"
                      />
                      <span className="text-xs text-walnut-muted">hrs</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          workAreas: f.workAreas.filter((_, j) => j !== i),
                        }))
                      }
                      className="w-7 h-7 rounded-full flex items-center justify-center text-walnut-muted hover:text-barn hover:bg-barn-light/50 transition-colors cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {(() => {
                  const allocatedHours = form.workAreas.reduce(
                    (sum, w) => sum + (w.targetHours || 0),
                    0
                  );
                  const remaining = form.totalHoursNeeded - allocatedHours;
                  if (allocatedHours > 0 && remaining !== form.totalHoursNeeded) {
                    return (
                      <div className="flex justify-between text-xs text-walnut-muted px-3 pt-1">
                        <span>
                          Allocated: <span className="font-mono font-medium text-walnut">{allocatedHours}h</span> of{" "}
                          <span className="font-mono">{form.totalHoursNeeded}h</span>
                        </span>
                        {remaining > 0 && (
                          <span>
                            <span className="font-mono">{remaining}h</span> unallocated (General)
                          </span>
                        )}
                        {remaining < 0 && (
                          <span className="text-barn">
                            <span className="font-mono">{Math.abs(remaining)}h</span> over-allocated
                          </span>
                        )}
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={newWorkArea}
                onChange={(e) => setNewWorkArea(e.target.value)}
                placeholder="Add a work area..."
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const trimmed = newWorkArea.trim();
                    if (trimmed && !form.workAreas.some((wa) => wa.name === trimmed)) {
                      setForm((f) => ({
                        ...f,
                        workAreas: [...f.workAreas, { name: trimmed, targetHours: null }],
                      }));
                      setNewWorkArea("");
                    }
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const trimmed = newWorkArea.trim();
                  if (trimmed && !form.workAreas.some((wa) => wa.name === trimmed)) {
                    setForm((f) => ({
                      ...f,
                      workAreas: [...f.workAreas, { name: trimmed, targetHours: null }],
                    }));
                    setNewWorkArea("");
                  }
                }}
                disabled={!newWorkArea.trim()}
                className="shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>
          </CardContent>
        </Card>

        {updateEvent.error && (
          <div className="flex items-start gap-2.5 mb-6 p-4 bg-red-50 rounded-xl border border-red-200">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
            <span className="text-sm text-red-700">{updateEvent.error.message}</span>
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-3 mb-10">
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" className="w-full sm:flex-1" disabled={updateEvent.isPending || !form.title}>
            {updateEvent.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>

      {/* Danger zone */}
      <Card className="border-red-200/60 mb-8">
        <CardContent className="pt-6">
          <div className="space-y-3">
            <div>
              <div className="text-sm font-medium text-walnut">Cancel Event</div>
              <p className="text-xs text-walnut-muted mt-0.5">
                All claimed slots and co-host pledges will be released. This cannot be undone.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => {
                if (confirm("Cancel this event? All claimed slots and pledges will be released.")) {
                  cancelEventMutation.mutate({ eventId });
                }
              }}
              disabled={cancelEventMutation.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {cancelEventMutation.isPending ? "Cancelling..." : "Cancel Event"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
