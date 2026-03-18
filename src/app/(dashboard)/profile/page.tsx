"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  User,
  MapPin,
  Save,
  Camera,
  Clock,
  Users,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
} from "lucide-react";

const SKILL_OPTIONS = [
  "Physical Labor", "Gardening", "Construction", "Cooking", "Cleaning",
  "Moving", "Painting", "Tech", "Childcare", "Event Setup", "Landscaping", "Repair",
];

export default function ProfilePage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const { data: me, isLoading } = useQuery(trpc.users.me.queryOptions());
  const { data: poolStats } = useQuery(trpc.users.myPoolStats.queryOptions());

  const [form, setForm] = useState({
    displayName: "",
    bio: "",
    locationName: "",
    skills: [] as string[],
    avatarUrl: null as string | null,
  });
  const [dirty, setDirty] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    if (me) {
      setForm({
        displayName: me.displayName || "",
        bio: me.bio || "",
        locationName: me.locationName || "",
        skills: me.skills || [],
        avatarUrl: me.avatarUrl || null,
      });
    }
  }, [me]);

  const updateProfile = useMutation({
    ...trpc.users.updateProfile.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setDirty(false);
    },
  });

  const toggleSkill = (skill: string) => {
    setDirty(true);
    setForm((f) => ({
      ...f,
      skills: f.skills.includes(skill)
        ? f.skills.filter((s) => s !== skill)
        : [...f.skills, skill],
    }));
  };

  const handleAvatarUpload = async (file: File) => {
    setUploadingAvatar(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) {
        setForm((f) => ({ ...f, avatarUrl: data.url }));
        setDirty(true);
      }
    } finally {
      setUploadingAvatar(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto animate-pulse space-y-6">
        <div className="h-8 bg-earth/30 rounded-xl w-1/3" />
        <div className="h-64 bg-earth/20 rounded-2xl" />
      </div>
    );
  }

  if (!me) return null;

  const totals = poolStats?.totals;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <h1 className="text-3xl font-display text-walnut tracking-tight">
        My Profile
      </h1>

      {/* Avatar + name header */}
      <div className="flex items-center gap-5">
        <div className="relative group">
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleAvatarUpload(file);
            }}
          />
          <div
            className="w-20 h-20 rounded-full overflow-hidden bg-barn-light flex items-center justify-center text-barn text-3xl font-display cursor-pointer"
            onClick={() => avatarInputRef.current?.click()}
          >
            {form.avatarUrl ? (
              <img src={form.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              me.displayName?.[0]?.toUpperCase() || <User className="h-10 w-10" />
            )}
          </div>
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-barn text-white flex items-center justify-center shadow-sm hover:bg-barn-dark transition-colors cursor-pointer"
          >
            {uploadingAvatar ? (
              <span className="text-[10px]">...</span>
            ) : (
              <Camera className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        <div>
          <div className="text-xl font-display text-walnut">{me.displayName}</div>
          <div className="text-sm text-walnut-muted">{me.email}</div>
          <div className="text-xs text-walnut-muted/70 mt-0.5">
            Member since {new Date(me.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* Cumulative Stats */}
      {totals && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          <Card className="animate-fade-in-up stagger-1">
            <CardContent className="pt-5">
              <div className="text-walnut-muted text-xs uppercase tracking-wider mb-1.5">
                Total Balance
              </div>
              <div className={`text-2xl font-mono font-medium ${totals.balance >= 0 ? "text-sage" : "text-barn"}`}>
                {totals.balance >= 0 ? "+" : ""}{totals.balance}h
              </div>
              <div className="text-xs text-walnut-muted mt-1 font-mono">
                {totals.earned}h earned &middot; {totals.spent}h spent
              </div>
            </CardContent>
          </Card>
          <Card className="animate-fade-in-up stagger-2">
            <CardContent className="pt-5">
              <div className="text-walnut-muted text-xs uppercase tracking-wider mb-1.5">
                Events
              </div>
              <div className="text-2xl font-display text-walnut">
                {totals.eventsAttended}
              </div>
              <div className="text-xs text-walnut-muted mt-1">
                attended &middot; {totals.eventsHosted} hosted
              </div>
            </CardContent>
          </Card>
          <Card className="animate-fade-in-up stagger-3">
            <CardContent className="pt-5">
              <div className="text-walnut-muted text-xs uppercase tracking-wider mb-1.5">
                Reliability
              </div>
              <div className={`text-2xl font-mono font-medium ${totals.reliability >= 85 ? "text-sage" : "text-golden-dark"}`}>
                {totals.reliability}%
              </div>
              <div className="text-xs text-walnut-muted mt-1">
                {totals.noShows > 0 ? `${totals.noShows} no-show${totals.noShows > 1 ? "s" : ""}` : "Perfect record"}
              </div>
            </CardContent>
          </Card>
          <Card className="animate-fade-in-up stagger-4">
            <CardContent className="pt-5">
              <div className="text-walnut-muted text-xs uppercase tracking-wider mb-1.5">
                Pools
              </div>
              <div className="text-2xl font-display text-walnut">
                {totals.poolCount}
              </div>
              <div className="text-xs text-walnut-muted mt-1">
                active memberships
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Per-pool breakdown */}
      {poolStats && poolStats.pools.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pool Memberships</CardTitle>
            <CardDescription>Your stats in each pool</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {poolStats.pools.map((p) => (
                <Link
                  key={p.poolId}
                  href={`/pools/${p.poolId}/members/${me.id}`}
                  className="flex items-center justify-between py-3 px-3 -mx-3 border-b border-earth/30 last:border-0 hover:bg-cream-dark rounded-xl transition-colors"
                >
                  <div>
                    <div className="font-medium text-sm text-walnut">
                      {p.poolName}
                      {p.role === "steward" && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          Steward
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-walnut-muted mt-0.5">
                      Joined {new Date(p.joinedAt).toLocaleDateString()} &middot;{" "}
                      <span className="font-mono">{p.earned}h</span> earned &middot;{" "}
                      <span className="font-mono">{p.spent}h</span> spent
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className={`text-sm font-mono font-medium ${
                        p.balance >= 0 ? "text-sage" : "text-barn"
                      }`}
                    >
                      {p.balance >= 0 ? "+" : ""}
                      {p.balance}h
                    </div>
                    <ArrowRight className="h-4 w-4 text-earth" />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit form */}
      <Card>
        <CardHeader>
          <CardTitle>Edit Profile</CardTitle>
          <CardDescription>
            This info is visible to members of your pools.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-walnut mb-1.5">
              Display Name
            </label>
            <Input
              value={form.displayName}
              onChange={(e) => {
                setForm({ ...form, displayName: e.target.value });
                setDirty(true);
              }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-walnut mb-1.5">
              Bio
            </label>
            <Textarea
              value={form.bio}
              onChange={(e) => {
                setForm({ ...form, bio: e.target.value });
                setDirty(true);
              }}
              placeholder="Tell people a bit about yourself..."
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-walnut mb-1.5">
              Location
            </label>
            <Input
              value={form.locationName}
              onChange={(e) => {
                setForm({ ...form, locationName: e.target.value });
                setDirty(true);
              }}
              placeholder="e.g., North Boulder, CO"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-walnut mb-2">
              Skills &amp; Offerings
            </label>
            <div className="flex flex-wrap gap-2">
              {SKILL_OPTIONS.map((skill) => (
                <button key={skill} type="button" onClick={() => toggleSkill(skill)}>
                  <Badge
                    variant={form.skills.includes(skill) ? "default" : "outline"}
                    className="cursor-pointer transition-all duration-150 hover:scale-105"
                  >
                    {skill}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
          <Button
            onClick={() => updateProfile.mutate(form)}
            disabled={!dirty || updateProfile.isPending}
          >
            <Save className="h-4 w-4" />
            {updateProfile.isPending ? "Saving..." : "Save Profile"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
