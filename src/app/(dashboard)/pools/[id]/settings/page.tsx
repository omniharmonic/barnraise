"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Shield, UserMinus, UserPlus, Check, X, Clock } from "lucide-react";

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
    joinPolicy: "invite" as "open" | "invite" | "approval",
    startingBalance: 2,
    maxNegativeBalance: -10,
  });

  useEffect(() => {
    if (poolData?.pool) {
      setForm({
        name: poolData.pool.name,
        description: poolData.pool.description || "",
        locationName: poolData.pool.locationName || "",
        joinPolicy: poolData.pool.joinPolicy as typeof form.joinPolicy,
        startingBalance: poolData.pool.startingBalance,
        maxNegativeBalance: poolData.pool.maxNegativeBalance,
      });
    }
  }, [poolData]);

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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-stone-900">Pool Settings</h1>

      {/* Invite Link */}
      <Card className="border-amber-200 bg-amber-50/30">
        <CardHeader>
          <CardTitle>Invite Members</CardTitle>
          <CardDescription>
            Share this link to invite people to join {poolData.pool.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input value={inviteUrl} readOnly className="bg-white" />
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(inviteUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
          <p className="text-xs text-stone-500 mt-2">
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
        <Card className="border-amber-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600" />
              Pending Requests ({pendingMembers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-sm font-medium">
                      {member.account.displayName[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-medium">
                        {member.account.displayName}
                      </div>
                      <div className="text-xs text-stone-400">
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
            <label className="block text-sm font-medium text-stone-700 mb-1">Pool Name</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Description</label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Location</label>
            <Input value={form.locationName} onChange={(e) => setForm({ ...form, locationName: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      {/* Governance */}
      <Card>
        <CardHeader>
          <CardTitle>Governance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">Join Policy</label>
            <div className="grid grid-cols-3 gap-3">
              {(["open", "invite", "approval"] as const).map((policy) => (
                <button
                  key={policy}
                  type="button"
                  className={`p-3 rounded-lg border text-left text-sm capitalize cursor-pointer ${
                    form.joinPolicy === policy ? "border-amber-500 bg-amber-50" : "border-stone-200"
                  }`}
                  onClick={() => setForm({ ...form, joinPolicy: policy })}
                >
                  {policy}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Starting Balance: {form.startingBalance}h
            </label>
            <input type="range" min={0} max={5} value={form.startingBalance}
              onChange={(e) => setForm({ ...form, startingBalance: parseInt(e.target.value) })}
              className="w-full accent-amber-700" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Max Negative Balance: {form.maxNegativeBalance}h
            </label>
            <input type="range" min={-20} max={-1} value={form.maxNegativeBalance}
              onChange={(e) => setForm({ ...form, maxNegativeBalance: parseInt(e.target.value) })}
              className="w-full accent-amber-700" />
          </div>
        </CardContent>
      </Card>

      {/* Save settings button */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button
          onClick={() => updateSettings.mutate({ poolId, ...form })}
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
                  className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-sm font-medium">
                      {member.account.displayName[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-medium">
                        {member.account.displayName}
                        {isMe && <span className="text-xs text-stone-400 ml-1">(you)</span>}
                      </div>
                      <div className="text-xs text-stone-500">
                        {member.role === "steward" ? (
                          <Badge variant="outline" className="text-xs">Steward</Badge>
                        ) : (
                          "Member"
                        )}
                        {" · "}{member.balance >= 0 ? "+" : ""}{member.balance}h
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
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          if (confirm(`Remove ${member.account.displayName} from this pool?`)) {
                            removeMember.mutate({ poolId, accountId: member.accountId });
                          }
                        }}
                        disabled={removeMember.isPending}
                      >
                        <UserMinus className="h-3 w-3" />
                      </Button>
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
