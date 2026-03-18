"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export default function CreatePoolPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: "",
    description: "",
    locationName: "",
    joinPolicy: "invite" as "open" | "invite" | "approval",
    startingBalance: 2,
    maxNegativeBalance: -10,
  });

  const createPool = useMutation(trpc.pools.create.mutationOptions());

  const handleCreate = async () => {
    const pool = await createPool.mutateAsync(form);
    router.push(`/pools/${pool.id}`);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-stone-900 mb-2">Create a Labor Pool</h1>
      <p className="text-stone-500 mb-8">
        A pool is a group of people who help each other with work. Set up your pool to get started.
      </p>

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                s === step
                  ? "bg-amber-700 text-white"
                  : s < step
                  ? "bg-amber-100 text-amber-700"
                  : "bg-stone-200 text-stone-500"
              }`}
            >
              {s}
            </div>
            {s < 3 && <div className="w-8 h-px bg-stone-300" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Pool Details</CardTitle>
            <CardDescription>What is this pool about?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Pool Name *
              </label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., North Boulder Neighbors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Description
              </label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What kinds of work does this pool cover? Who is it for?"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Location (optional)
              </label>
              <Input
                value={form.locationName}
                onChange={(e) => setForm({ ...form, locationName: e.target.value })}
                placeholder="e.g., North Boulder, CO"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setStep(2)} disabled={!form.name}>
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Pool Settings</CardTitle>
            <CardDescription>
              Configure how your pool works. You can change these later.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">
                Join Policy
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: "open", label: "Open", desc: "Anyone can join" },
                  { value: "invite", label: "Invite Only", desc: "Members share links" },
                  { value: "approval", label: "Approval", desc: "Steward approves" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`p-3 rounded-lg border text-left cursor-pointer ${
                      form.joinPolicy === option.value
                        ? "border-amber-500 bg-amber-50"
                        : "border-stone-200 hover:border-stone-300"
                    }`}
                    onClick={() =>
                      setForm({ ...form, joinPolicy: option.value as typeof form.joinPolicy })
                    }
                  >
                    <div className="text-sm font-medium">{option.label}</div>
                    <div className="text-xs text-stone-500">{option.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Starting Balance for New Members: {form.startingBalance} hours
              </label>
              <p className="text-xs text-stone-500 mb-2">
                New members get this many hours to start — a community investment that
                creates positive obligation.
              </p>
              <input
                type="range"
                min={0}
                max={5}
                value={form.startingBalance}
                onChange={(e) =>
                  setForm({ ...form, startingBalance: parseInt(e.target.value) })
                }
                className="w-full accent-amber-700"
              />
              <div className="flex justify-between text-xs text-stone-400">
                <span>0h</span>
                <span>5h</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Maximum Negative Balance: {form.maxNegativeBalance} hours
              </label>
              <p className="text-xs text-stone-500 mb-2">
                How far into &ldquo;debt&rdquo; a member can go by hosting without contributing.
              </p>
              <input
                type="range"
                min={-20}
                max={-1}
                value={form.maxNegativeBalance}
                onChange={(e) =>
                  setForm({ ...form, maxNegativeBalance: parseInt(e.target.value) })
                }
                className="w-full accent-amber-700"
              />
              <div className="flex justify-between text-xs text-stone-400">
                <span>-20h</span>
                <span>-1h</span>
              </div>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={() => setStep(3)}>Review</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Review &amp; Create</CardTitle>
            <CardDescription>Everything look good?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-stone-50 p-4 space-y-3">
              <div>
                <div className="text-xs text-stone-500">Name</div>
                <div className="font-medium">{form.name}</div>
              </div>
              {form.description && (
                <div>
                  <div className="text-xs text-stone-500">Description</div>
                  <div className="text-sm">{form.description}</div>
                </div>
              )}
              {form.locationName && (
                <div>
                  <div className="text-xs text-stone-500">Location</div>
                  <div className="text-sm">{form.locationName}</div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-stone-500">Join Policy</div>
                  <div className="text-sm capitalize">{form.joinPolicy}</div>
                </div>
                <div>
                  <div className="text-xs text-stone-500">Starting Balance</div>
                  <div className="text-sm">{form.startingBalance}h</div>
                </div>
                <div>
                  <div className="text-xs text-stone-500">Max Negative</div>
                  <div className="text-sm">{form.maxNegativeBalance}h</div>
                </div>
              </div>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createPool.isPending}
              >
                {createPool.isPending ? "Creating..." : "Create Pool"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
