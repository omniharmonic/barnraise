"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, MapPin, Save } from "lucide-react";

const SKILL_OPTIONS = [
  "Physical Labor", "Gardening", "Construction", "Cooking", "Cleaning",
  "Moving", "Painting", "Tech", "Childcare", "Event Setup", "Landscaping", "Repair",
];

export default function ProfilePage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: me, isLoading } = useQuery(trpc.users.me.queryOptions());
  const { data: pools } = useQuery(trpc.pools.myPools.queryOptions());

  const [form, setForm] = useState({
    displayName: "",
    bio: "",
    locationName: "",
    skills: [] as string[],
  });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (me) {
      setForm({
        displayName: me.displayName || "",
        bio: me.bio || "",
        locationName: me.locationName || "",
        skills: me.skills || [],
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

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto animate-pulse space-y-6">
        <div className="h-8 bg-stone-200 rounded w-1/3" />
        <div className="h-64 bg-stone-200 rounded-xl" />
      </div>
    );
  }

  if (!me) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-stone-900">My Profile</h1>

      {/* Avatar + name header */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-2xl font-bold">
          {me.displayName?.[0]?.toUpperCase() || <User className="h-8 w-8" />}
        </div>
        <div>
          <div className="text-lg font-semibold">{me.displayName}</div>
          <div className="text-sm text-stone-500">{me.email}</div>
          <div className="text-xs text-stone-400">
            Member since {new Date(me.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>

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
            <label className="block text-sm font-medium text-stone-700 mb-1">
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
            <label className="block text-sm font-medium text-stone-700 mb-1">
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
            <label className="block text-sm font-medium text-stone-700 mb-1">
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
            <label className="block text-sm font-medium text-stone-700 mb-2">
              Skills &amp; Offerings
            </label>
            <div className="flex flex-wrap gap-2">
              {SKILL_OPTIONS.map((skill) => (
                <button key={skill} type="button" onClick={() => toggleSkill(skill)}>
                  <Badge
                    variant={form.skills.includes(skill) ? "default" : "outline"}
                    className="cursor-pointer"
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

      {/* Pool memberships summary */}
      {pools && pools.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>My Pools</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pools.map((pool) => (
                <div
                  key={pool.id}
                  className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0"
                >
                  <div>
                    <div className="text-sm font-medium">{pool.name}</div>
                    <div className="text-xs text-stone-500">
                      {pool.memberCount} members
                      {pool.locationName && (
                        <>
                          {" "}&middot;{" "}
                          <MapPin className="h-3 w-3 inline" /> {pool.locationName}
                        </>
                      )}
                    </div>
                  </div>
                  <div
                    className={`text-sm font-medium ${
                      pool.balance >= 0 ? "text-green-700" : "text-amber-700"
                    }`}
                  >
                    {pool.balance >= 0 ? "+" : ""}
                    {pool.balance}h
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
