import { useAuthClient } from "@m5kdev/frontend/modules/auth/hooks/useAuthClient";
import { useLocalSearchParams } from "expo-router";
import { Button } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { AuthScaffold } from "../components/AuthScaffold";
import { FormTextField } from "../components/FormTextField";
import { StatusText } from "../components/StatusText";

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function ResetPasswordScreen() {
  const authClient = useAuthClient();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = singleParam(params.token);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [tone, setTone] = useState<"error" | "success">("success");
  const [isBusy, setIsBusy] = useState(false);

  const submit = async () => {
    setStatus(null);
    if (!token) {
      setTone("error");
      setStatus("Reset token is required");
      return;
    }
    if (newPassword !== confirmPassword) {
      setTone("error");
      setStatus("Passwords do not match");
      return;
    }
    setIsBusy(true);
    try {
      await authClient.resetPassword({ newPassword, token });
      setTone("success");
      setStatus("Password reset successfully");
    } catch (error) {
      setTone("error");
      setStatus(error instanceof Error ? error.message : "Password reset failed");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <AuthScaffold title="Set a new password">
      <View className="gap-4">
        <FormTextField
          label="New password"
          testID="reset-password-new"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
        />
        <FormTextField
          label="Confirm password"
          testID="reset-password-confirm"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
        />
        <StatusText testID="auth-status" tone={tone}>
          {status}
        </StatusText>
        <Button testID="reset-password-submit" onPress={submit} isDisabled={isBusy}>
          Reset password
        </Button>
      </View>
    </AuthScaffold>
  );
}
