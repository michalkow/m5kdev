import {
  Alert,
  Button,
  Card,
  Description,
  FieldError,
  Form,
  Input,
  Label,
  TextField,
  toast,
} from "@heroui/react";
import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";
import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseAsString, useQueryStates } from "nuqs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { GoogleIcon } from "../../../icons/GoogleIcon";
import { LinkedInIcon } from "../../../icons/LinkedInIcon";
import { MicrosoftIcon } from "../../../icons/MicrosoftIcon";

// TODO: review Form / Input usage

export function AuthPublicClaimAccountRoute() {
  const { serverUrl, appUrl } = useAppConfig();
  const { t } = useTranslation();
  const [{ claim: claimId, claimFlow, linked: linkedProvider }] = useQueryStates({
    claim: parseAsString,
    claimFlow: parseAsString,
    linked: parseAsString,
  });
  const continuation = useMemo(
    () => ({ claimId: claimId ?? undefined, experienceFlow: claimFlow ?? undefined }),
    [claimId, claimFlow]
  );
  const { data: session, registerSession } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const linkingAccepted = useRef(false);
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState<"none" | "email" | "password" | "link">("none");

  const trpc = useAppTRPC<BackendTRPCRouter>();

  const claimStatusQuery = useQuery({
    queryKey: ["auth", "claim-status", session?.user?.id ?? null, continuation],
    enabled: !!session?.user,
    queryFn: async () => {
      return queryClient.fetchQuery(trpc.auth.getMyAccountClaimStatus.queryOptions(continuation));
    },
  });

  const setEmailMutation = useMutation(trpc.auth.setMyAccountClaimEmail.mutationOptions());

  const { mutateAsync: acceptClaim } = useMutation(
    trpc.auth.acceptMyAccountClaim.mutationOptions()
  );

  useEffect(() => {
    if (session?.user?.email) {
      setEmail(session.user.email);
    }
  }, [session?.user?.email]);

  useEffect(() => {
    if (!linkedProvider || !session?.user || !claimStatusQuery.data || linkingAccepted.current)
      return;
    linkingAccepted.current = true;
    acceptClaim(continuation)
      .then(() => {
        toast.success(t("web-ui:auth.claim.providerLinked"));
        queryClient.invalidateQueries({ queryKey: trpc.auth.getMyAccountClaimStatus.queryKey() });
        navigate("/", { replace: true });
      })
      .catch((error) => {
        toast.danger(
          error instanceof Error ? error.message : t("web-ui:auth.claim.providerFailed")
        );
      });
  }, [
    acceptClaim,
    linkedProvider,
    continuation,
    navigate,
    queryClient,
    trpc,
    session?.user,
    claimStatusQuery.data,
    t,
  ]);

  if (!session?.user) {
    return (
      <Alert status="warning">
        <Alert.Title>{t("web-ui:auth.claim.signInFirst")}</Alert.Title>
      </Alert>
    );
  }

  if (claimStatusQuery.isError)
    return (
      <Alert status="danger">
        <Alert.Content>
          <Alert.Title>{t("web-ui:auth.continuation.invalid")}</Alert.Title>
        </Alert.Content>
      </Alert>
    );
  const claim = claimStatusQuery.data;
  const hasClaimEmail = Boolean(claim?.claimedEmail);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    onSetEmail(email);
  };

  const onSetEmail = async (email: string) => {
    setBusy("email");
    try {
      await setEmailMutation.mutateAsync({ ...continuation, email });
      registerSession(() => undefined);
      await queryClient.invalidateQueries({
        queryKey: trpc.auth.getMyAccountClaimStatus.queryKey(),
      });
      toast.success(t("web-ui:auth.claim.emailUpdated"));
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : t("web-ui:auth.claim.emailFailed"));
    } finally {
      setBusy("none");
    }
  };

  const onSetPassword = async () => {
    setBusy("password");
    try {
      const response = await fetch(`${serverUrl}/api/auth/set-password`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          newPassword,
          ...continuation,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message ?? t("web-ui:auth.claim.passwordFailed"));
      }
      await acceptClaim(continuation);
      await queryClient.invalidateQueries({
        queryKey: trpc.auth.getMyAccountClaimStatus.queryKey(),
      });
      toast.success(t("web-ui:auth.claim.passwordSet"));
      navigate("/", { replace: true });
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : t("web-ui:auth.claim.passwordFailed"));
    } finally {
      setBusy("none");
    }
  };

  const onLinkProvider = async (provider: "google" | "linkedin" | "microsoft") => {
    setBusy("link");
    try {
      const callback = new URL("/claim-account", appUrl);
      if (claimId) callback.searchParams.set("claim", claimId);
      if (claimFlow) callback.searchParams.set("claimFlow", claimFlow);
      callback.searchParams.set("linked", provider);
      const response = await fetch(`${serverUrl}/api/auth/link-social`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          callbackURL: callback.href,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.message ?? t("web-ui:auth.claim.providerStartFailed"));
      }
      window.location.href = payload.url;
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : t("web-ui:auth.claim.providerFailed"));
      setBusy("none");
    }
  };

  return (
    <Card>
      <Card.Header className="flex flex-col gap-1">
        <p className="text-xl font-semibold">{t("web-ui:auth.claim.title")}</p>
        <p className="text-sm text-default-600">{t("web-ui:auth.claim.description")}</p>
      </Card.Header>
      <Card.Content className="grid gap-6">
        {claimStatusQuery.isLoading ? (
          <Alert status="default">
            <Alert.Title>{t("web-ui:auth.claim.loading")}</Alert.Title>
          </Alert>
        ) : !claim ? (
          <Alert status="warning">
            <Alert.Title>{t("web-ui:auth.claim.empty")}</Alert.Title>
          </Alert>
        ) : null}

        <Form onSubmit={handleSubmit} className="grid gap-2">
          <TextField name="email" type="email" variant="secondary">
            <Label className="text-sm font-medium">{t("web-ui:auth.claim.email")}</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              variant="secondary"
            />
            <Description className="text-sm text-default-500">
              {t("web-ui:auth.claim.emailHelp")}
            </Description>
            <FieldError />
          </TextField>
          <Button type="submit" isDisabled={!email || busy !== "none" || !claim}>
            {busy === "email" ? t("web-ui:auth.claim.saving") : t("web-ui:auth.claim.saveEmail")}
          </Button>
        </Form>

        <div className="grid gap-2">
          <p className="text-sm font-medium">{t("web-ui:auth.claim.linkProvider")}</p>
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
          <TextField name="password" type="password" variant="secondary" minLength={8}>
            <Label className="text-sm font-medium">{t("web-ui:auth.claim.setPassword")}</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              variant="secondary"
            />
            <FieldError />
          </TextField>
          <Button
            onPress={onSetPassword}
            isDisabled={!newPassword || busy !== "none" || !hasClaimEmail || !claim}
          >
            {busy === "password"
              ? t("web-ui:auth.claim.saving")
              : t("web-ui:auth.claim.setPasswordAndClaim")}
          </Button>
        </div>
      </Card.Content>
    </Card>
  );
}
