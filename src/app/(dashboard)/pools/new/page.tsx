"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Globe, MessageCircle, Plus, X, ArrowLeft } from "lucide-react";

export default function CreatePoolPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: "",
    description: "",
    locationName: "",
    websiteUrl: "",
    groupChatUrl: "",
    customLinks: [] as { label: string; url: string }[],
    joinPolicy: "invite" as "open" | "invite" | "approval",
    startingBalance: 2,
    maxNegativeBalance: -10,
  });
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");

  const createPool = useMutation(trpc.pools.create.mutationOptions());

  const handleCreate = async () => {
    const pool = await createPool.mutateAsync({
      ...form,
      websiteUrl: form.websiteUrl || undefined,
      groupChatUrl: form.groupChatUrl || undefined,
      customLinks: form.customLinks.length > 0 ? form.customLinks : undefined,
    });
    router.push(`/pools/${pool.id}`);
  };

  const addCustomLink = () => {
    if (newLinkLabel.trim() && newLinkUrl.trim()) {
      setForm((f) => ({
        ...f,
        customLinks: [...f.customLinks, { label: newLinkLabel.trim(), url: newLinkUrl.trim() }],
      }));
      setNewLinkLabel("");
      setNewLinkUrl("");
    }
  };

  const removeCustomLink = (index: number) => {
    setForm((f) => ({
      ...f,
      customLinks: f.customLinks.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Link href="/dashboard">
        <Button variant="ghost" size="sm" className="mb-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>
      </Link>
      <h1 className="text-3xl font-display text-walnut tracking-tight mb-2">
        Create a Labor Pool
      </h1>
      <p className="text-walnut-muted mb-8">
        A pool is a group of people who help each other with work. Set up your pool to get started.
      </p>

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                s === step
                  ? "bg-barn text-white"
                  : s < step
                  ? "bg-barn-light text-barn"
                  : "bg-earth/40 text-walnut-muted"
              }`}
            >
              {s}
            </div>
            {s < 3 && <div className="w-8 h-px bg-earth" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <Card className="animate-fade-in-up">
          <CardHeader>
            <CardTitle>Pool Details</CardTitle>
            <CardDescription>What is this pool about?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-walnut mb-1.5">
                Pool Name *
              </label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., North Boulder Neighbors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-walnut mb-1.5">
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
              <label className="block text-sm font-medium text-walnut mb-1.5">
                Location (optional)
              </label>
              <Input
                value={form.locationName}
                onChange={(e) => setForm({ ...form, locationName: e.target.value })}
                placeholder="e.g., North Boulder, CO"
              />
            </div>

            {/* Links section */}
            <div className="border-t border-earth/30 pt-4 mt-4">
              <label className="block text-sm font-medium text-walnut mb-3">
                Links (optional)
              </label>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-cream-dark flex items-center justify-center shrink-0">
                    <Globe className="h-4 w-4 text-walnut-muted" />
                  </div>
                  <Input
                    value={form.websiteUrl}
                    onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
                    placeholder="Website URL"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-cream-dark flex items-center justify-center shrink-0">
                    <MessageCircle className="h-4 w-4 text-walnut-muted" />
                  </div>
                  <Input
                    value={form.groupChatUrl}
                    onChange={(e) => setForm({ ...form, groupChatUrl: e.target.value })}
                    placeholder="Group chat link (Signal, WhatsApp, Discord, etc.)"
                  />
                </div>
                {form.customLinks.map((link, i) => (
                  <div key={i} className="flex items-center gap-2 pl-10">
                    <span className="text-sm text-walnut truncate">{link.label}:</span>
                    <span className="text-sm text-walnut-muted truncate flex-1">{link.url}</span>
                    <button
                      type="button"
                      onClick={() => removeCustomLink(i)}
                      className="text-walnut-muted hover:text-barn cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {form.customLinks.length < 5 && (
                  <div className="flex items-center gap-2 pl-10">
                    <Input
                      value={newLinkLabel}
                      onChange={(e) => setNewLinkLabel(e.target.value)}
                      placeholder="Label"
                      className="w-28"
                    />
                    <Input
                      value={newLinkUrl}
                      onChange={(e) => setNewLinkUrl(e.target.value)}
                      placeholder="URL"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addCustomLink}
                      disabled={!newLinkLabel.trim() || !newLinkUrl.trim()}
                      className="shrink-0"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setStep(2)} disabled={!form.name}>
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card className="animate-fade-in-up">
          <CardHeader>
            <CardTitle>Pool Settings</CardTitle>
            <CardDescription>
              Configure how your pool works. You can change these later.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-walnut mb-2">
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
                    className={`p-3.5 rounded-xl border-2 text-left cursor-pointer transition-all ${
                      form.joinPolicy === option.value
                        ? "border-barn bg-barn-light/50 shadow-sm"
                        : "border-earth/60 hover:border-earth-dark"
                    }`}
                    onClick={() =>
                      setForm({ ...form, joinPolicy: option.value as typeof form.joinPolicy })
                    }
                  >
                    <div className="text-sm font-medium text-walnut">{option.label}</div>
                    <div className="text-xs text-walnut-muted mt-0.5">{option.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-walnut mb-1.5">
                Starting Balance for New Members:{" "}
                <span className="font-mono text-barn">{form.startingBalance}h</span>
              </label>
              <p className="text-xs text-walnut-muted mb-3">
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
                className="w-full accent-barn"
              />
              <div className="flex justify-between text-xs text-walnut-muted/70">
                <span>0h</span>
                <span>5h</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-walnut mb-1.5">
                Maximum Negative Balance:{" "}
                <span className="font-mono text-barn">{form.maxNegativeBalance}h</span>
              </label>
              <p className="text-xs text-walnut-muted mb-3">
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
                className="w-full accent-barn"
              />
              <div className="flex justify-between text-xs text-walnut-muted/70">
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
        <Card className="animate-fade-in-up">
          <CardHeader>
            <CardTitle>Review &amp; Create</CardTitle>
            <CardDescription>Everything look good?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl bg-cream-dark/50 p-5 space-y-3">
              <div>
                <div className="text-xs text-walnut-muted uppercase tracking-wider">Name</div>
                <div className="font-display text-walnut">{form.name}</div>
              </div>
              {form.description && (
                <div>
                  <div className="text-xs text-walnut-muted uppercase tracking-wider">Description</div>
                  <div className="text-sm text-walnut">{form.description}</div>
                </div>
              )}
              {form.locationName && (
                <div>
                  <div className="text-xs text-walnut-muted uppercase tracking-wider">Location</div>
                  <div className="text-sm text-walnut">{form.locationName}</div>
                </div>
              )}
              {(form.websiteUrl || form.groupChatUrl || form.customLinks.length > 0) && (
                <div>
                  <div className="text-xs text-walnut-muted uppercase tracking-wider">Links</div>
                  <div className="text-sm text-walnut space-y-0.5">
                    {form.websiteUrl && <div>Website: {form.websiteUrl}</div>}
                    {form.groupChatUrl && <div>Group Chat: {form.groupChatUrl}</div>}
                    {form.customLinks.map((l, i) => (
                      <div key={i}>{l.label}: {l.url}</div>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-4 pt-2">
                <div>
                  <div className="text-xs text-walnut-muted uppercase tracking-wider">Join Policy</div>
                  <div className="text-sm text-walnut capitalize">{form.joinPolicy}</div>
                </div>
                <div>
                  <div className="text-xs text-walnut-muted uppercase tracking-wider">Starting Balance</div>
                  <div className="text-sm font-mono text-walnut">{form.startingBalance}h</div>
                </div>
                <div>
                  <div className="text-xs text-walnut-muted uppercase tracking-wider">Max Negative</div>
                  <div className="text-sm font-mono text-walnut">{form.maxNegativeBalance}h</div>
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
