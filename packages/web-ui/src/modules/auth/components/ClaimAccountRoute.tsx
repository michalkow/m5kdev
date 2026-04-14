import { Alert, Button, Card, Description, Input, Label } from "@heroui/react";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { GoogleIcon } from "../../../icons/GoogleIcon";
import { LinkedInIcon } from "../../../icons/LinkedInIcon";
import { MicrosoftIcon } from "../../../icons/MicrosoftIcon";
import type { UseBackendTRPC } from "../../../types";

export function ClaimAccountRoute({ useTRPC }: { useTRPC?: UseBackendTRPC }) {
  const { data: session, registerSession } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState<"none" | "email" | "password" | "link">("none");

  const trpc = useTRPC?.();

  const linkedProvider = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("linked");
  }, [location.search]);

  const claimStatusQuery = useQuery({
    queryKey: ["auth", "claim-status", session?.user?.id ?? null],
    enabled: !!trpc && !!session?.user,
    queryFn: async () => {
      if (!trpc) return null;
      return queryClient.fetchQuery(trpc.auth.getMyAccountClaimStatus.queryOptions());
    },
  });

  const setEmailMutation = useMutation(
    trpc
      ? trpc.auth.setMyAccountClaimEmail.mutationOptions()
      : {
          mutationFn: async () => ({ status: false }),
        }
  );

  const acceptClaimMutation = useMutation(
    trpc
      ? trpc.auth.acceptMyAccountClaim.mutationOptions()
      : {
          mutationFn: async () => ({ status: false }),
        }
  );

  useEffect(() => {
    if (session?.user?.email) {
      setEmail(session.user.email);
    }
  }, [session?.user?.email]);

  useEffect(() => {
    if (!linkedProvider || !trpc) return;
    acceptClaimMutation
      .mutateAsync(undefined)
      .then(() => {
        toast.success("Account provider linked");
        queryClient.invalidateQueries({ queryKey: trpc.auth.getMyAccountClaimStatus.queryKey() });
      })
      .catch((error) => {
        toast.error(error.message);
      })
      .finally(() => {
        navigate("/claim-account", { replace: true });
      });
  }, [acceptClaimMutation, linkedProvider, navigate, queryClient, trpc]);

  if (!trpc) {
    return (
      <Alert status="warning">
        <Alert.Title>Claim flow is unavailable because backend TRPC is not configured.</Alert.Title>
      </Alert>
    );
  }

  if (!session?.user) {
    return (
      <Alert status="warning">
        <Alert.Title>You need to sign in with your magic link before claiming this account.</Alert.Title>
      </Alert>
    );
  }

  const claim = claimStatusQuery.data;
  const hasClaimEmail = Boolean(claim?.claimedEmail);

  const onSetEmail = async () => {
    setBusy("email");
    try {
      await setEmailMutation.mutateAsync({ email });
      registerSession(() => undefined);
      await queryClient.invalidateQueries({
        queryKey: trpc.auth.getMyAccountClaimStatus.queryKey(),
      });
      toast.success("Email updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to set email");
    } finally {
      setBusy("none");
    }
  };

  const onSetPassword = async () => {
    setBusy("password");
    try {
      const response = await fetch(`${import.meta.env.VITE_SERVER_URL}/api/auth/set-password`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          newPassword,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to set password");
      }
      await acceptClaimMutation.mutateAsync(undefined);
      await queryClient.invalidateQueries({
        queryKey: trpc.auth.getMyAccountClaimStatus.queryKey(),
      });
      toast.success("Password set. Account claimed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to set password");
    } finally {
      setBusy("none");
    }
  };

  const onLinkProvider = async (provider: "google" | "linkedin" | "microsoft") => {
    setBusy("link");
    try {
      const response = await fetch(`${import.meta.env.VITE_SERVER_URL}/api/auth/link-social`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          callbackURL: `${window.location.origin}/claim-account?linked=${provider}`,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.message ?? "Unable to start provider linking");
      }
      window.location.href = payload.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to link provider");
      setBusy("none");
    }
  };

  return (
    <Card>
      <Card.Header className="flex flex-col gap-1">
        <p className="text-xl font-semibold">Claim your account</p>
        <p className="text-sm text-default-600">
          You are signed in and can now set your permanent login methods.
        </p>
      </Card.Header>
      <Card.Content className="grid gap-6">
        {claimStatusQuery.isLoading ? (
          <Alert status="default">
            <Alert.Title>Loading claim status...</Alert.Title>
          </Alert>
        ) : !claim ? (
          <Alert status="warning">
            <Alert.Title>No pending account claim was found for your user.</Alert.Title>
          </Alert>
        ) : null}

        <div className="grid gap-2">
          <Label className="text-sm font-medium">Email</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            variant="secondary"
          />
          <Description className="text-sm text-default-500">
            Set your real email before linking providers and password.
          </Description>
          <Button onPress={onSetEmail} isDisabled={!email || busy !== "none" || !claim}>
            {busy === "email" ? "Saving..." : "Save Email"}
          </Button>
        </div>

        <div className="grid gap-2">
          <p className="text-sm font-medium">Link a provider</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Button
              variant="outline"
              onPress={() => onLinkProvider("google")}
              isDisabled={busy !== "none" || !hasClaimEmail || !claim}
            >
              <GoogleIcon className="h-4 w-4" /> Google
            </Button>
            <Button
              variant="outline"
              onPress={() => onLinkProvider("linkedin")}
              isDisabled={busy !== "none" || !hasClaimEmail || !claim}
            >
              <LinkedInIcon className="h-4 w-4" /> LinkedIn
            </Button>
            <Button
              variant="outline"
              onPress={() => onLinkProvider("microsoft")}
              isDisabled={busy !== "none" || !hasClaimEmail || !claim}
            >
              <MicrosoftIcon className="h-4 w-4" /> Microsoft
            </Button>
          </div>
        </div>

        <div className="grid gap-2">
          <Label className="text-sm font-medium">Set password</Label>
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            variant="secondary"
          />
          <Button
            onPress={onSetPassword}
            isDisabled={!newPassword || busy !== "none" || !hasClaimEmail || !claim}
          >
            {busy === "password" ? "Saving..." : "Set Password and Claim"}
          </Button>
        </div>
      </Card.Content>
    </Card>
  );
}
