import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useLocalSearchParams } from "expo-router";
import { Button } from "heroui-native";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { AuthScaffold } from "../components/AuthScaffold";
import { FormTextField } from "../components/FormTextField";
import { StatusText } from "../components/StatusText";
import { useTRPCClient } from "../lib/trpc";

export default function ClaimAccountScreen() {
  const { serverUrl } = useAppConfig();
  const trpcClient = useTRPCClient();
  const params = useLocalSearchParams<{
    claim?: string | string[];
    claimFlow?: string | string[];
  }>();
  const invalidContinuation = Array.isArray(params.claim) || Array.isArray(params.claimFlow);
  const continuation = useMemo(
    () => ({
      claimId: typeof params.claim === "string" ? params.claim : undefined,
      experienceFlow: typeof params.claimFlow === "string" ? params.claimFlow : undefined,
    }),
    [params.claim, params.claimFlow]
  );
  const { data: session, registerSession } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>("Loading claim status...");
  const [statusTone, setStatusTone] = useState<"default" | "error" | "success">("default");
  const [hasClaim, setHasClaim] = useState(false);
  const [isClaimed, setIsClaimed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const [passwordCreatedFor, setPasswordCreatedFor] = useState<string>();
  const credentialSubject = JSON.stringify([
    session?.user?.id,
    continuation.claimId,
    continuation.experienceFlow,
  ]);
  const passwordCreated = passwordCreatedFor === credentialSubject;

  useEffect(() => {
    if (session?.user.email) {
      setEmail(session.user.email);
    }
  }, [session?.user.email]);

  useEffect(() => {
    let cancelled = false;

    if (invalidContinuation) {
      setStatusTone("error");
      setStatus("This link is invalid or expired. Request a fresh link from the same website.");
      setHasClaim(false);
      return;
    }
    if (isClaimed) {
      return;
    }

    if (!session?.user) {
      setStatusTone("error");
      setStatus("You need to sign in with your magic link before claiming this account.");
      setHasClaim(false);
      return;
    }

    trpcClient.auth.getMyAccountClaimStatus
      .query(continuation)
      .then((claim) => {
        if (cancelled) return;
        setHasClaim(Boolean(claim));
        if (claim?.hasPassword) setPasswordCreatedFor(credentialSubject);
        setStatusTone(claim ? "success" : "error");
        setStatus(claim ? "Claim your account" : "No pending account claim was found.");
        if (claim?.claimedEmail) {
          setEmail(claim.claimedEmail);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setHasClaim(false);
        setStatusTone("error");
        setStatus(error instanceof Error ? error.message : "Unable to load claim status");
      });

    return () => {
      cancelled = true;
    };
  }, [isClaimed, session?.user, continuation, credentialSubject, invalidContinuation, trpcClient]);

  const saveEmail = async () => {
    setIsBusy(true);
    setStatus(null);
    try {
      await trpcClient.auth.setMyAccountClaimEmail.mutate({ email, ...continuation });
      registerSession();
      setStatusTone("success");
      setStatus("Email updated");
    } catch (error) {
      setStatusTone("error");
      setStatus(error instanceof Error ? error.message : "Unable to update email");
    } finally {
      setIsBusy(false);
    }
  };

  const setPasswordAndClaim = async () => {
    setIsBusy(true);
    setStatus(null);
    try {
      if (!passwordCreated) {
        const response = await fetch(`${serverUrl}/api/auth/set-password`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            newPassword: password,
            ...continuation,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        if (!response.ok) {
          throw new Error(payload.message ?? "Unable to set password");
        }

        setPasswordCreatedFor(credentialSubject);
      }

      await trpcClient.auth.acceptMyAccountClaim.mutate(continuation);
      setIsClaimed(true);
      registerSession();
      setStatusTone("success");
      setStatus("Password set. Account claimed.");
    } catch (error) {
      setStatusTone("error");
      setStatus(error instanceof Error ? error.message : "Unable to claim account");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <AuthScaffold
      title="Claim your account"
      description="Set permanent credentials for a provisioned account."
    >
      <View className="gap-4">
        <FormTextField
          label="Email"
          testID="claim-email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          editable={hasClaim && !isBusy}
        />
        <Button testID="claim-email-submit" onPress={saveEmail} isDisabled={!hasClaim || isBusy}>
          Save Email
        </Button>
        <FormTextField
          label="Set password"
          testID="claim-password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={hasClaim && !isBusy && !passwordCreated}
        />
        <Button
          testID="claim-password-submit"
          onPress={setPasswordAndClaim}
          isDisabled={!hasClaim || (!passwordCreated && !password) || isBusy}
        >
          {passwordCreated ? "Finish Claim" : "Set Password and Claim"}
        </Button>
        <StatusText testID="claim-status" tone={statusTone}>
          {status}
        </StatusText>
      </View>
    </AuthScaffold>
  );
}
