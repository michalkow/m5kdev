import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { Button } from "heroui-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { AuthScaffold } from "../components/AuthScaffold";
import { FormTextField } from "../components/FormTextField";
import { StatusText } from "../components/StatusText";
import { trpcClient } from "../lib/trpc";

export default function ClaimAccountScreen() {
  const { serverUrl } = useAppConfig();
  const { data: session, registerSession } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>("Loading claim status...");
  const [statusTone, setStatusTone] = useState<"default" | "error" | "success">("default");
  const [hasClaim, setHasClaim] = useState(false);
  const [isClaimed, setIsClaimed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (session?.user.email) {
      setEmail(session.user.email);
    }
  }, [session?.user.email]);

  useEffect(() => {
    let cancelled = false;

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
      .query()
      .then((claim) => {
        if (cancelled) return;
        setHasClaim(Boolean(claim));
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
  }, [isClaimed, session?.user]);

  const saveEmail = async () => {
    setIsBusy(true);
    setStatus(null);
    try {
      await trpcClient.auth.setMyAccountClaimEmail.mutate({ email });
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
      const response = await fetch(`${serverUrl}/api/auth/set-password`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          newPassword: password,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "Unable to set password");
      }

      await trpcClient.auth.acceptMyAccountClaim.mutate();
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
          editable={hasClaim && !isBusy}
        />
        <Button
          testID="claim-password-submit"
          onPress={setPasswordAndClaim}
          isDisabled={!hasClaim || !password || isBusy}
        >
          Set Password and Claim
        </Button>
        <StatusText testID="claim-status" tone={statusTone}>
          {status}
        </StatusText>
      </View>
    </AuthScaffold>
  );
}
