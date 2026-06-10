"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Shield, UserMinus, Check, X, Clock, Globe, MessageCircle, Plus, ArrowLeft } from "lucide-react";
import { AvatarCircle } from "@/components/ui/avatar-circle";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { copyToClipboard } from "@/lib/ui/clipboard";
import { balanceColor } from "@/lib/ui/colors";

export default function PoolSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: poolId } = use(params);
  const router = useRouter();
  const { data: session } = useSession();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: poolData } = useQuery(
    trpc.pools.getById.queryOptions({ poolId })
  );
  const { data: members } = useQuery(
    trpc.pools.members.queryOptions({ poolId })
  );
  const { data: pendingMembers } = useQuery(
    trpc.pools.pendingMembers.queryOptions({ poolId })
  );

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
  const [initializedId, setInitializedId] = useState<string | null>(null);

  // Populate the form once the pool loads — adjust state during render
  // rather than in an effect to avoid a cascading-render cycle.
  if (poolData?.pool && initializedId !== poolData.pool.id) {
    const p = poolData.pool;
    setInitializedId(p.id);
    setForm({
      name: p.name,
      description: p.description || "",
      locationName: p.locationName || "",
      websiteUrl: p.websiteUrl || "",
      groupChatUrl: p.groupChatUrl || "",
      customLinks: (p.customLinks as { label: string; url: string }[] | null) || [],
      joinPolicy: p.joinPolicy as typeof form.joinPolicy,
      startingBalance: p.startingBalance,
      maxNegativeBalance: p.maxNegativeBalance,
    });
  }

  const updateSettings = useMutation({
    ...trpc.pools.updateSettings.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries();
      router.push(`/pools/${poolId}`);
    },
  });

  const removeMember = useMutation({
    ...trpc.pools.removeMember.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const updateRole = useMutation({
    ...trpc.pools.updateMemberRole.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const approveJoin = useMutation({
    ...trpc.pools.approveJoin.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const rejectJoin = useMutation({
    ...trpc.pools.rejectJoin.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const [copied, setCopied] = useState(false);

  if (!poolData) return null;

  const inviteUrl = typeof window !== "undefined"
    ? `${window.location.origin}/join/${poolId}`
    : `/join/${poolId}`;

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
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href={`/pools/${poolId}`}>
        <Button variant="ghost" size="sm" className="mb-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Pool
        </Button>
      </Link>
      <h1 className="text-3xl font-display text-walnut tracking-tight">Pool Settings</h1>

      {/* Invite Link */}
      <Card className="border-barn/20 bg-barn-light/20">
        <CardHeader>
          <CardTitle>Invite Members</CardTitle>
          <CardDescription>
            Share this link to invite people to join {poolData.pool.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input value={inviteUrl} readOnly className="bg-cream-light" />
            <Button
              variant="outline"
              onClick={async () => {
                if (await copyToClipboard(inviteUrl)) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }
              }}
            >
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
          <p className="text-xs text-walnut-muted mt-2">
            Anyone with this link can{" "}
            {poolData.pool.joinPolicy === "open"
              ? "join directly"
              : poolData.pool.joinPolicy === "approval"
              ? "request to join (requires your approval)"
              : "join your pool"}
            .
          </p>
        </CardContent>
      </Card>

      {/* Pending Join Requests */}
      {pendingMembers && pendingMembers.length > 0 && (
        <Card className="border-golden/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-golden-dark" />
              Pending Requests ({pendingMembers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between py-2.5 border-b border-earth/30 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <AvatarCircle
                      src={member.account.avatarUrl}
                      name={member.account.displayName}
                    />
                    <div>
                      <div className="text-sm font-medium text-walnut">
                        {member.account.displayName}
                      </div>
                      <div className="text-xs text-walnut-muted">
                        {member.account.email}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        approveJoin.mutate({ poolId, accountId: member.accountId })
                      }
                      disabled={approveJoin.isPending}
                    >
                      <Check className="h-3 w-3" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        rejectJoin.mutate({ poolId, accountId: member.accountId })
                      }
                      disabled={rejectJoin.isPending}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-walnut mb-1.5">Pool Name</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-walnut mb-1.5">Description</label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
          </div>
          <div>
            <label className="block text-sm font-medium text-walnut mb-1.5">Location</label>
            <Input value={form.locationName} onChange={(e) => setForm({ ...form, locationName: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      {/* Links */}
      <Card>
        <CardHeader>
          <CardTitle>Links</CardTitle>
          <CardDescription>Help members find your group&apos;s resources</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
        </CardContent>
      </Card>

      {/* Governance */}
      <Card>
        <CardHeader>
          <CardTitle>Governance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-walnut mb-2">Join Policy</label>
            <div className="grid grid-cols-3 gap-3">
              {(["open", "invite", "approval"] as const).map((policy) => (
                <button
                  key={policy}
                  type="button"
                  className={`p-3.5 rounded-xl border-2 text-left text-sm capitalize cursor-pointer transition-all ${
                    form.joinPolicy === policy
                      ? "border-barn bg-barn-light/50 shadow-sm"
                      : "border-earth/60 hover:border-earth-dark"
                  }`}
                  onClick={() => setForm({ ...form, joinPolicy: policy })}
                >
                  <div className="font-medium text-walnut">{policy}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-walnut mb-1.5">
              Starting Balance:{" "}
              <span className="font-mono text-barn">{form.startingBalance}h</span>
            </label>
            <input type="range" min={0} max={5} value={form.startingBalance}
              onChange={(e) => setForm({ ...form, startingBalance: parseInt(e.target.value) })}
              className="w-full accent-barn" />
          </div>
          <div>
            <label className="block text-sm font-medium text-walnut mb-1.5">
              Max Negative Balance:{" "}
              <span className="font-mono text-barn">{form.maxNegativeBalance}h</span>
            </label>
            <input type="range" min={-20} max={-1} value={form.maxNegativeBalance}
              onChange={(e) => setForm({ ...form, maxNegativeBalance: parseInt(e.target.value) })}
              className="w-full accent-barn" />
          </div>
        </CardContent>
      </Card>

      {/* Save settings button */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button
          onClick={() => {
            updateSettings.mutate({
              poolId,
              name: form.name,
              description: form.description,
              locationName: form.locationName,
              joinPolicy: form.joinPolicy,
              startingBalance: form.startingBalance,
              maxNegativeBalance: form.maxNegativeBalance,
              websiteUrl: form.websiteUrl || undefined,
              groupChatUrl: form.groupChatUrl || undefined,
              customLinks: form.customLinks.length > 0 ? form.customLinks : undefined,
            });
          }}
          disabled={updateSettings.isPending}
        >
          {updateSettings.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </div>

      {/* Member Management */}
      <Card>
        <CardHeader>
          <CardTitle>Manage Members</CardTitle>
          <CardDescription>Promote stewards, or remove members from the pool.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {members?.map((member) => {
              const isMe = member.accountId === session?.user?.id;
              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between py-2.5 border-b border-earth/30 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <AvatarCircle
                      src={member.account.avatarUrl}
                      name={member.account.displayName}
                    />
                    <div>
                      <div className="text-sm font-medium text-walnut">
                        {member.account.displayName}
                        {isMe && <span className="text-xs text-walnut-muted ml-1">(you)</span>}
                      </div>
                      <div className="text-xs text-walnut-muted">
                        {member.role === "steward" ? (
                          <Badge variant="outline" className="text-[10px]">Steward</Badge>
                        ) : (
                          "Member"
                        )}
                        {" · "}
                        <span className={`font-mono ${balanceColor(member.balance)}`}>
                          {member.balance >= 0 ? "+" : ""}{member.balance}h
                        </span>
                      </div>
                    </div>
                  </div>
                  {!isMe && (
                    <div className="flex items-center gap-2">
                      {member.role === "member" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            updateRole.mutate({ poolId, accountId: member.accountId, role: "steward" })
                          }
                          disabled={updateRole.isPending}
                        >
                          <Shield className="h-3 w-3" />
                          Make Steward
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            updateRole.mutate({ poolId, accountId: member.accountId, role: "member" })
                          }
                          disabled={updateRole.isPending}
                        >
                          Demote
                        </Button>
                      )}
                      <ConfirmDialog
                        title={`Remove ${member.account.displayName}?`}
                        description="They will lose access to this pool. Their historical record stays visible to the pool."
                        confirmLabel="Remove Member"
                        destructive
                        onConfirm={() =>
                          removeMember.mutate({ poolId, accountId: member.accountId })
                        }
                      >
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={removeMember.isPending}
                          aria-label={`Remove ${member.account.displayName}`}
                        >
                          <UserMinus className="h-3 w-3" />
                        </Button>
                      </ConfirmDialog>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
