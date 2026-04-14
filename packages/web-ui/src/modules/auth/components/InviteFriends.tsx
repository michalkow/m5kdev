import { Button, Card, Chip, Input, Label } from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Link2Icon, Mail, Send, Ticket, Users, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { CopyButton } from "../../../components/CopyButton";
import type { UseBackendTRPC } from "../../../types";

export interface InviteFriendsProps {
  useTRPC: UseBackendTRPC;
}

export function InviteFriends({ useTRPC }: InviteFriendsProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: waitlist = [] } = useQuery(trpc.auth.listWaitlist.queryOptions());
  const { data: count = 0 } = useQuery(trpc.auth.getUserWaitlistCount.queryOptions());

  const invitesAvailable = Math.max(0, 3 - count);

  const inviteMutation = useMutation(
    trpc.auth.inviteToWaitlist.mutationOptions({
      onSuccess: (result) => {
        queryClient.setQueryData(
          trpc.auth.getUserWaitlistCount.queryKey(),
          (old) => (old ?? 0) + 1
        );
        queryClient.setQueryData(trpc.auth.listWaitlist.queryKey(), (old) => [
          ...(old ?? []),
          result,
        ]);
        toast.success("Invitation sent successfully!");
      },
      onError: (error) => {
        toast.error(error.message);
      },
    })
  );

  const createInvitationCodeMutation = useMutation(
    trpc.auth.createInvitationCode.mutationOptions({
      onSuccess: (result) => {
        queryClient.setQueryData(
          trpc.auth.getUserWaitlistCount.queryKey(),
          (old) => (old ?? 0) + 1
        );
        queryClient.setQueryData(trpc.auth.listWaitlist.queryKey(), (old) => [
          ...(old ?? []),
          result,
        ]);
        toast.success("Code created successfully!");
      },
      onError: (error) => {
        toast.error(error.message);
      },
    })
  );

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const isLoading = inviteMutation.isPending || createInvitationCodeMutation.isPending;

  const isEmailValid = useMemo(() => {
    return z.email().safeParse(email).success;
  }, [email]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    inviteMutation.mutate({ email, name: name.length > 0 ? name : undefined });
    setEmail("");
    setName("");
  };

  const handleCreateCode = async () => {
    createInvitationCodeMutation.mutate({ name: name.length > 0 ? name : undefined });
    setEmail("");
    setName("");
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "accepted":
      case "completed":
        return "success";
      case "invited":
        return "warning";
      case "waitlist":
        return "default";
      default:
        return "default";
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center p-4 bg-primary/10 rounded-full mb-2 ring-1 ring-primary/20">
          <Ticket className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          Invite Friends & Skip the Waitlist
        </h1>
        <p className="text-lg text-default-600 max-w-lg mx-auto leading-relaxed">
          Encourage your friends to join! Friends invited by you get{" "}
          <span className="text-foreground font-medium">immediate access</span> and skip the
          waitlist completely.
        </p>
        <div className="flex justify-center mt-4">
          <Chip
            color={invitesAvailable > 0 ? "warning" : "default"}
            variant="soft"
            size="lg"
            className="font-medium inline-flex items-center gap-1.5"
          >
            <Zap size={16} className={invitesAvailable > 0 ? "text-warning-600" : ""} />
            {invitesAvailable} {invitesAvailable === 1 ? "Invite" : "Invites"} Remaining
          </Chip>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Invite Form */}
        <Card className="shadow-sm border border-default-200">
          <Card.Header className="flex flex-col items-start gap-1 px-6 pt-6 pb-2">
            <h3 className="text-xl font-semibold">Send an Invitation via Email</h3>
            <p className="text-small text-default-600">
              They'll receive a unique code to join instantly.
            </p>
          </Card.Header>
          <Card.Content className="px-6 pb-6">
            <form onSubmit={handleInvite} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label className="text-sm font-medium">Friend&apos;s Name (Optional)</Label>
                  <Input
                    placeholder="e.g. Alex"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    variant="secondary"
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-sm font-medium">Email Address (Required for sending)</Label>
                  <div className="relative">
                    <Mail
                      className="text-default-400 pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 flex-shrink-0"
                      size={16}
                    />
                    <Input
                      type="email"
                      className="pl-9"
                      placeholder="friend@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      variant="secondary"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end pt-2 gap-2">
                <Button
                  variant="outline"
                  type="button"
                  isPending={isLoading}
                  isDisabled={invitesAvailable <= 0}
                  onPress={handleCreateCode}
                  className="font-medium"
                >
                  <span className="inline-flex items-center gap-2">
                    Create Invitation Link
                    {!isLoading ? <Link2Icon size={16} /> : null}
                  </span>
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  isPending={isLoading}
                  isDisabled={invitesAvailable <= 0 || !isEmailValid}
                  className="font-medium"
                >
                  <span className="inline-flex items-center gap-2">
                    Send Invitation
                    {!isLoading ? <Send size={16} /> : null}
                  </span>
                </Button>
              </div>
            </form>
          </Card.Content>
        </Card>

        {/* Created Invitations Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">Created Invitations</h3>
          </div>

          {waitlist.length > 0 ? (
            <div className="flex flex-col gap-3">
              {waitlist.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-4 border border-default-200 rounded-lg bg-content1"
                >
                  <div className="flex flex-row gap-3">
                    <div>
                      <span className="text-sm font-medium">
                        {item.email || item.name || "Open Invitation Link"}
                      </span>
                    </div>
                    <Chip
                      size="sm"
                      color={getStatusColor(item.status)}
                      variant="soft"
                      className="capitalize"
                    >
                      {item.status.toLowerCase()}
                    </Chip>
                  </div>

                  <div className="flex items-center gap-3">
                    {item.code && (
                      <CopyButton
                        variant="ghost"
                        size="sm"
                        className="text-success-600"
                        text={`${import.meta.env.VITE_APP_URL}/signup?code=${item.code}`}
                        isIconOnly
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-default-600 border border-dashed border-default-200 rounded-lg">
              No invitations created yet.
            </div>
          )}
        </div>
      </div>

      {/* Benefits Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4">
        <div className="flex flex-col items-center text-center p-6 rounded-2xl bg-content1 border border-default-100 shadow-sm">
          <div className="p-3 bg-warning/10 text-warning rounded-full mb-4">
            <Zap className="w-6 h-6" />
          </div>
          <h3 className="font-semibold mb-2">Instant Access</h3>
          <p className="text-sm text-default-600">
            Friends you invite skip the waitlist completely and get in right away.
          </p>
        </div>
        <div className="flex flex-col items-center text-center p-6 rounded-2xl bg-content1 border border-default-100 shadow-sm">
          <div className="p-3 bg-primary/10 text-primary rounded-full mb-4">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="font-semibold mb-2">Grow Your Network</h3>
          <p className="text-sm text-default-600">Build your circle within the app from day one.</p>
        </div>
        <div className="flex flex-col items-center text-center p-6 rounded-2xl bg-content1 border border-default-100 shadow-sm">
          <div className="p-3 bg-success/10 text-success rounded-full mb-4">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="font-semibold mb-2">Verified Status</h3>
          <p className="text-sm text-default-600">
            Invited members get a verified badge on their profile.
          </p>
        </div>
      </div>
    </div>
  );
}
