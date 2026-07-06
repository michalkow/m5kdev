import { useAuthClient } from "@m5kdev/frontend/modules/auth/hooks/useAuthClient";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { USER_LOCALE_HEADER } from "@m5kdev/commons/modules/auth/auth.constants";
import { resolveAppLocale } from "@m5kdev/commons/modules/auth/auth.locale";
import { AUTH_LOCALE_CONFIG } from "m5kdev-auth-e2e-shared/modules/app/locale.constants";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "heroui-native";
import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { AuthScaffold } from "../components/AuthScaffold";
import { FormTextField } from "../components/FormTextField";
import { StatusText } from "../components/StatusText";
import { isWaitlistProfile } from "../config";
import { trpcClient } from "../lib/trpc";

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function SignupScreen() {
  const authClient = useAuthClient();
  const { registerSession } = useSession();
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string | string[];
    email?: string | string[];
    invitation?: string | string[];
  }>();
  const code = singleParam(params.code);
  const invitation = singleParam(params.invitation);
  const lockedEmail = singleParam(params.email);
  const isPublicWaitlist = isWaitlistProfile && !code && !invitation;
  const [email, setEmail] = useState(lockedEmail ?? "");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"error" | "success">("success");
  const [isBusy, setIsBusy] = useState(false);
  const [waitlistCodeStatus, setWaitlistCodeStatus] = useState<string | null>(null);
  const [isValidatingWaitlistCode, setIsValidatingWaitlistCode] = useState(false);
  const [waitlistCodeError, setWaitlistCodeError] = useState(false);

  const waitlistStatusText = useMemo(() => {
    if (!code) return null;
    if (isValidatingWaitlistCode) return "Validating the invitation code...";
    if (waitlistCodeError) return "An error occurred while validating the invitation code.";
    if (waitlistCodeStatus === "VALID") return "Invitation code is valid. You can proceed.";
    if (waitlistCodeStatus === "EXPIRED") return "Invitation code has expired.";
    if (waitlistCodeStatus === "NOT_FOUND") return "Invitation code not found.";
    if (waitlistCodeStatus) return "Invalid invitation code.";
    return null;
  }, [code, isValidatingWaitlistCode, waitlistCodeError, waitlistCodeStatus]);

  useEffect(() => {
    if (lockedEmail) setEmail(lockedEmail);
  }, [lockedEmail]);

  useEffect(() => {
    let cancelled = false;
    if (!code) {
      setWaitlistCodeStatus(null);
      setWaitlistCodeError(false);
      return;
    }

    setIsValidatingWaitlistCode(true);
    setWaitlistCodeError(false);
    trpcClient.auth.validateWaitlistCode
      .query({ code })
      .then((result) => {
        if (!cancelled) setWaitlistCodeStatus(result.status);
      })
      .catch(() => {
        if (!cancelled) setWaitlistCodeError(true);
      })
      .finally(() => {
        if (!cancelled) setIsValidatingWaitlistCode(false);
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  const submitWaitlist = async () => {
    setIsBusy(true);
    setStatus(null);
    try {
      await trpcClient.auth.joinWaitlist.mutate({ email });
      setStatusTone("success");
      setStatus("Waitlist confirmation email sent");
    } catch (error) {
      setStatusTone("error");
      setStatus(error instanceof Error ? error.message : "Failed to join waitlist");
    } finally {
      setIsBusy(false);
    }
  };

  const submitSignup = async () => {
    setIsBusy(true);
    setStatus(null);
    try {
      const deviceLocale = Intl.DateTimeFormat().resolvedOptions().locale;
      const userLocale = resolveAppLocale(deviceLocale, AUTH_LOCALE_CONFIG);
      const result = await authClient.signUp.email(
        {
          name: email,
          email,
          password,
        },
        {
          headers: {
            "Waitlist-Invitation-Code": code ?? "",
            "Organization-Invitation-Code": invitation ?? "",
            [USER_LOCALE_HEADER]: userLocale,
          },
        }
      );
      if (result.error) {
        setStatusTone("error");
        setStatus(result.error.message ?? "Signup failed");
        return;
      }
      if (isWaitlistProfile || invitation) {
        const loginResult = await authClient.signIn.email({ email, password });
        if (loginResult.error || !loginResult.data?.user) {
          setStatusTone("error");
          setStatus(loginResult.error?.message ?? "Authentication failed");
          return;
        }
        registerSession(() => router.replace("/posts"));
        return;
      }
      setStatusTone("success");
      setStatus("Verification email sent");
    } catch (error) {
      setStatusTone("error");
      setStatus(error instanceof Error ? error.message : "Signup failed");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <AuthScaffold
      title={isPublicWaitlist ? "Join the waitlist" : "Sign up"}
      description={
        isPublicWaitlist
          ? "Request access to the waitlist test profile."
          : "Create a test account for the Expo app."
      }
    >
      <View className="gap-4">
        <FormTextField
          label="Email"
          testID={isPublicWaitlist ? "waitlist-email" : "signup-email"}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          editable={!lockedEmail}
        />
        {isPublicWaitlist ? null : (
          <FormTextField
            label="Password"
            testID="signup-password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        )}
        <StatusText
          testID="waitlist-code-status"
          tone={waitlistCodeStatus === "VALID" ? "success" : "error"}
        >
          {waitlistStatusText}
        </StatusText>
        <StatusText testID="auth-status" tone={statusTone}>
          {status}
        </StatusText>
        <Button
          testID={isPublicWaitlist ? "waitlist-submit" : "signup-submit"}
          onPress={isPublicWaitlist ? submitWaitlist : submitSignup}
          isDisabled={isBusy}
        >
          {isPublicWaitlist ? "Join the waitlist" : "Sign up"}
        </Button>
        <Link href="/login" asChild>
          <Text className="text-center text-primary underline">Already have an account?</Text>
        </Link>
      </View>
    </AuthScaffold>
  );
}
