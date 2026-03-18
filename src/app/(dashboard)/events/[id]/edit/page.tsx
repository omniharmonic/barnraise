"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
  });
  const [initialized, setInitialized] = useState(false);

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
        <div className="h-8 bg-stone-200 rounded w-1/2" />
        <div className="h-64 bg-stone-200 rounded-xl" />
      </div>
    );
  }

  const canEdit = ["draft", "open", "confirmed"].includes(event.status);

  if (!canEdit) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <h2 className="text-xl font-bold text-stone-900 mb-2">
          Cannot Edit
        </h2>
        <p className="text-stone-500 mb-6">
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
    });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-stone-900 mb-2">Edit Event</h1>
      <p className="text-stone-500 mb-6">
        Editing &ldquo;{event.title}&rdquo;
      </p>

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Event Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Title *
              </label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Description
              </label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={4}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Start *
                </label>
                <Input
                  type="datetime-local"
                  value={form.dateStart}
                  onChange={(e) => setForm({ ...form, dateStart: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  End *
                </label>
                <Input
                  type="datetime-local"
                  value={form.dateEnd}
                  onChange={(e) => setForm({ ...form, dateEnd: e.target.value })}
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
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
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
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
                <label className="block text-sm font-medium text-stone-700 mb-1">
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
                <label className="block text-sm font-medium text-stone-700 mb-1">
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
                <div className="w-11 h-6 bg-stone-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-amber-500 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600" />
              </label>
              <span className="text-sm text-stone-700">Flexible Hours</span>
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
                    className="cursor-pointer"
                  >
                    {skill}
                  </Badge>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {updateEvent.error && (
          <p className="text-sm text-red-600 mb-4">{updateEvent.error.message}</p>
        )}

        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={updateEvent.isPending || !form.title}>
            {updateEvent.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
