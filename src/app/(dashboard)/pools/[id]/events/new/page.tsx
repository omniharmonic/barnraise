"use client";

import { use, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Users, AlertTriangle, ImagePlus, X, Plus, ArrowLeft, Layers } from "lucide-react";
import Link from "next/link";

const DEFAULT_SKILLS = [
  "Physical Labor", "Gardening", "Construction", "Cooking", "Cleaning",
  "Moving", "Painting", "Tech", "Childcare", "Event Setup", "Landscaping", "Repair",
];

export default function CreateEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: poolId } = use(params);
  const router = useRouter();
  const trpc = useTRPC();
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const nextSaturday = new Date();
  nextSaturday.setDate(nextSaturday.getDate() + ((6 - nextSaturday.getDay() + 7) % 7 || 7));
  nextSaturday.setHours(9, 0, 0, 0);
  const endTime = new Date(nextSaturday);
  endTime.setHours(15, 0, 0, 0);

  const [form, setForm] = useState({
    title: "",
    description: "",
    dateStart: nextSaturday.toISOString().slice(0, 16),
    dateEnd: endTime.toISOString().slice(0, 16),
    locationName: "",
    totalHoursNeeded: 12,
    maxParticipants: 6,
    minParticipants: 1,
    flexibleHours: true,
    skillTags: [] as string[],
    hostingType: "solo" as "solo" | "group",
    hostPledgeHours: 4,
    bannerImageUrl: "",
    workAreas: [] as { name: string; targetHours: number | null }[],
  });

  const [newSkill, setNewSkill] = useState("");
  const [newWorkArea, setNewWorkArea] = useState("");
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  const { data: capacityData } = useQuery(
    trpc.events.getHostCapacity.queryOptions({ poolId })
  );
  const { data: poolSkillTags } = useQuery(
    trpc.pools.skillTags.queryOptions({ poolId })
  );

  const createEvent = useMutation(trpc.events.create.mutationOptions());

  const capacity = capacityData?.capacity ?? 0;
  const grossCapacity = capacityData?.grossCapacity ?? 0;
  const pendingCommitments = capacityData?.pendingCommitments ?? 0;
  const balance = capacityData?.balance ?? 0;
  const maxNeg = capacityData?.maxNegativeBalance ?? 0;
  const overCapacity = form.hostingType === "solo" && form.totalHoursNeeded > capacity;

  // Merge default skills with pool-accumulated skills
  const allSkillOptions = [...new Set([...DEFAULT_SKILLS, ...(poolSkillTags || [])])];

  const handleBannerUpload = async (file: File) => {
    setUploadingBanner(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) {
        setForm((f) => ({ ...f, bannerImageUrl: data.url }));
        setBannerPreview(URL.createObjectURL(file));
      }
    } finally {
      setUploadingBanner(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const event = await createEvent.mutateAsync({
      ...form,
      poolId,
      dateStart: new Date(form.dateStart).toISOString(),
      dateEnd: new Date(form.dateEnd).toISOString(),
      hostPledgeHours: form.hostingType === "group" ? form.hostPledgeHours : undefined,
      bannerImageUrl: form.bannerImageUrl || undefined,
      workAreas: form.workAreas.length > 0 ? form.workAreas : undefined,
    });
    router.push(`/events/${event.id}`);
  };

  const toggleSkill = (skill: string) => {
    setForm((f) => ({
      ...f,
      skillTags: f.skillTags.includes(skill)
        ? f.skillTags.filter((s) => s !== skill)
        : [...f.skillTags, skill],
    }));
  };

  const addCustomSkill = () => {
    const trimmed = newSkill.trim();
    if (trimmed && !form.skillTags.includes(trimmed)) {
      setForm((f) => ({ ...f, skillTags: [...f.skillTags, trimmed] }));
      setNewSkill("");
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Link href={`/pools/${poolId}`}>
        <Button variant="ghost" size="sm" className="mb-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Pool
        </Button>
      </Link>
      <h1 className="text-3xl font-display text-walnut tracking-tight mb-2">
        Create a Barn Raise
      </h1>
      <p className="text-walnut-muted mb-8">
        Host a work event and invite pool members to help out.
      </p>

      <form onSubmit={handleSubmit}>
        {/* Banner Image */}
        <Card className="mb-6 animate-fade-in-up">
          <CardHeader>
            <CardTitle>Banner Image</CardTitle>
            <CardDescription>
              Add a photo to make your event stand out (optional)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleBannerUpload(file);
              }}
            />
            {bannerPreview || form.bannerImageUrl ? (
              <div className="relative rounded-xl overflow-hidden">
                <img
                  src={bannerPreview || form.bannerImageUrl}
                  alt="Banner preview"
                  className="w-full h-40 object-cover"
                />
                <button
                  type="button"
                  onClick={() => {
                    setForm((f) => ({ ...f, bannerImageUrl: "" }));
                    setBannerPreview(null);
                  }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-walnut/60 text-white flex items-center justify-center hover:bg-walnut/80 transition-colors cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => bannerInputRef.current?.click()}
                className="w-full h-32 rounded-xl border-2 border-dashed border-earth/60 hover:border-barn/40 transition-colors flex flex-col items-center justify-center gap-2 text-walnut-muted hover:text-walnut cursor-pointer"
              >
                {uploadingBanner ? (
                  <span className="text-sm">Uploading...</span>
                ) : (
                  <>
                    <ImagePlus className="h-6 w-6" />
                    <span className="text-sm">Click to upload a banner image</span>
                  </>
                )}
              </button>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6 animate-fade-in-up stagger-1">
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
                placeholder="e.g., Saturday Garden Build, Help Us Move!"
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
                placeholder="What will the work involve? What should people bring? What will you provide (food, drinks, tools)?"
                rows={4}
              />
              <p className="text-xs text-walnut-muted/70 mt-1.5 leading-relaxed">
                A great description helps people decide to show up. Mention what food or drinks
                you&apos;ll provide, what tools to bring, and what the vibe will be like.
                The best events feel like a party where work happens.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-walnut mb-1.5">
                Start Date &amp; Time *
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
                End Date &amp; Time *
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
                placeholder="Address or location description"
              />
            </div>
          </CardContent>
        </Card>

        {/* Hosting Type */}
        <Card className="mb-6 animate-fade-in-up stagger-2">
          <CardHeader>
            <CardTitle>Hosting Type</CardTitle>
            <CardDescription>
              Who covers the labor cost for this event?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setForm({ ...form, hostingType: "solo" })}
                className={`p-5 rounded-xl border-2 text-left transition-all duration-200 ${
                  form.hostingType === "solo"
                    ? "border-barn bg-barn-light/50 shadow-sm"
                    : "border-earth/60 hover:border-earth-dark"
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-cream-dark flex items-center justify-center mb-3">
                  <User className="h-4.5 w-4.5 text-walnut-muted" />
                </div>
                <div className="font-display text-walnut">Solo</div>
                <div className="text-xs text-walnut-muted mt-1 leading-relaxed">
                  You fund the full event from your balance
                </div>
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, hostingType: "group" })}
                className={`p-5 rounded-xl border-2 text-left transition-all duration-200 ${
                  form.hostingType === "group"
                    ? "border-barn bg-barn-light/50 shadow-sm"
                    : "border-earth/60 hover:border-earth-dark"
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-cream-dark flex items-center justify-center mb-3">
                  <Users className="h-4.5 w-4.5 text-walnut-muted" />
                </div>
                <div className="font-display text-walnut">Group</div>
                <div className="text-xs text-walnut-muted mt-1 leading-relaxed">
                  Pool members co-host by pledging hours
                </div>
              </button>
            </div>

            {form.hostingType === "solo" && capacityData && (
              <div className="mt-4">
                <div className="text-sm text-walnut-muted">
                  Available capacity:{" "}
                  <span className="font-mono font-medium text-walnut">{capacity}h</span>
                  <span className="text-walnut-muted/60 ml-1.5 text-xs">
                    (balance <span className="font-mono">{balance}h</span> + limit{" "}
                    <span className="font-mono">{Math.abs(maxNeg)}h</span>
                    {pendingCommitments > 0 && (
                      <> − <span className="font-mono">{pendingCommitments}h</span> committed</>
                    )}
                    )
                  </span>
                </div>
                {overCapacity && (
                  <div className="flex items-start gap-2.5 mt-3 p-3.5 bg-golden-light rounded-xl border border-golden/30">
                    <AlertTriangle className="h-4 w-4 text-golden-dark mt-0.5 shrink-0" />
                    <div className="text-sm text-walnut">
                      You need <span className="font-mono font-medium">{form.totalHoursNeeded}h</span> but
                      can only cover <span className="font-mono font-medium">{capacity}h</span> solo.
                      Try{" "}
                      <button
                        type="button"
                        className="underline font-medium text-barn hover:text-barn-dark"
                        onClick={() => setForm({ ...form, hostingType: "group" })}
                      >
                        group hosting
                      </button>{" "}
                      to split the cost with co-hosts.
                    </div>
                  </div>
                )}
              </div>
            )}

            {form.hostingType === "group" && capacityData && (
              <div className="mt-4 space-y-2">
                <label className="block text-sm font-medium text-walnut">
                  Hours you&apos;ll pledge as host
                </label>
                <Input
                  type="number"
                  min={1}
                  max={capacity}
                  value={form.hostPledgeHours}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      hostPledgeHours: parseInt(e.target.value) || 1,
                    })
                  }
                />
                <p className="text-xs text-walnut-muted">
                  Available capacity: <span className="font-mono">{capacity}h</span>{pendingCommitments > 0 && <> (<span className="font-mono">{pendingCommitments}h</span> committed elsewhere)</>}.
                  Other pool members can pledge the remaining hours.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6 animate-fade-in-up stagger-3">
          <CardHeader>
            <CardTitle>Labor Needs</CardTitle>
            <CardDescription>How much help do you need?</CardDescription>
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
                  Max People *
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
                  Min People
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
                <div className="w-11 h-6 bg-earth/60 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-barn/30 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-barn"></div>
              </label>
              <div>
                <div className="text-sm font-medium text-walnut">Flexible Hours</div>
                <div className="text-xs text-walnut-muted">
                  Allow contributors to commit partial shifts
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6 animate-fade-in-up stagger-4">
          <CardHeader>
            <CardTitle>Skills Needed</CardTitle>
            <CardDescription>
              Select existing skills or add custom ones. Skills persist across pool events.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {allSkillOptions.map((skill) => (
                <button key={skill} type="button" onClick={() => toggleSkill(skill)}>
                  <Badge
                    variant={form.skillTags.includes(skill) ? "default" : "outline"}
                    className="cursor-pointer transition-all duration-150 hover:scale-105"
                  >
                    {skill}
                  </Badge>
                </button>
              ))}
              {/* Show selected custom skills not in allSkillOptions */}
              {form.skillTags
                .filter((s) => !allSkillOptions.includes(s))
                .map((skill) => (
                  <button key={skill} type="button" onClick={() => toggleSkill(skill)}>
                    <Badge variant="default" className="cursor-pointer transition-all duration-150 hover:scale-105">
                      {skill}
                    </Badge>
                  </button>
                ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                placeholder="Add a custom skill..."
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomSkill();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addCustomSkill}
                disabled={!newSkill.trim()}
                className="shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Work Areas (optional) */}
        <Card className="mb-6 animate-fade-in-up stagger-5">
          <CardHeader>
            <CardTitle>
              <Layers className="h-4 w-4 inline mr-2" />
              Work Areas
            </CardTitle>
            <CardDescription>
              Optionally split the event into teams or projects (e.g., Packing, Cleaning, Cooking).
              People can choose which area to join when claiming a slot.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {form.workAreas.length > 0 && (
              <div className="space-y-2">
                {form.workAreas.map((wa, i) => {
                  const allocatedHours = form.workAreas.reduce(
                    (sum, w) => sum + (w.targetHours || 0),
                    0
                  );
                  return (
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
                  );
                })}
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

        {createEvent.error && (
          <div className="flex items-start gap-2.5 mb-6 p-4 bg-red-50 rounded-xl border border-red-200">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
            <span className="text-sm text-red-700">{createEvent.error.message}</span>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={createEvent.isPending || !form.title || (form.hostingType === "solo" && overCapacity)}
          >
            {createEvent.isPending ? "Creating..." : "Create Event"}
          </Button>
        </div>
      </form>
    </div>
  );
}
