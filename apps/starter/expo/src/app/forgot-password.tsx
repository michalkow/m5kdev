import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";
import { useAuthClient } from "@m5kdev/frontend/modules/auth/hooks/useAuthClient";
import { Button } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { AuthScaffold } from "../components/AuthScaffold";
import { FormTextField } from "../components/FormTextField";
import { StatusText } from "../components/StatusText";

export default function ForgotPasswordScreen() {
  const authClient = useAuthClient();
  const { appUrl } = useAppConfig();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [tone, setTone] = useState<"error" | "success">("success");
  const [isBusy, setIsBusy] = useState(false);

  const submit = async () => {
    setIsBusy(true);
    setStatus(null);
    try {
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: new URL("/reset-password", appUrl).href,
      });
      if (result.error)
        throw new Error("Unable to request a reset link. Try again from the same website.");
      setTone("success");
      setStatus("Password reset email sent");
    } catch (error) {
      setTone("error");
      setStatus(error instanceof Error ? error.message : "Failed to request password reset");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <AuthScaffold title="Reset password">
      <View className="gap-4">
        <FormTextField
          label="Email"
          testID="forgot-password-email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
        />
        <StatusText testID="auth-status" tone={tone}>
          {status}
        </StatusText>
        <Button testID="forgot-password-submit" onPress={submit} isDisabled={isBusy}>
          Reset password
        </Button>
      </View>
    </AuthScaffold>
  );
}
