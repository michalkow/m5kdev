import { useAuthClient } from "@m5kdev/frontend/modules/auth/hooks/useAuthClient";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { Link, useRouter } from "expo-router";
import { Button } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";
import { AuthScaffold } from "../components/AuthScaffold";
import { FormTextField } from "../components/FormTextField";
import { StatusText } from "../components/StatusText";

export default function LoginScreen() {
  const authClient = useAuthClient();
  const { registerSession } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const submit = async () => {
    setIsBusy(true);
    setStatus(null);
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error || !result.data?.user) {
        setStatus(result.error?.message ?? "Authentication failed");
        return;
      }
      registerSession(() => router.replace("/posts"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <AuthScaffold title="Login" description="Sign in to the protected Expo test app.">
      <View className="gap-4">
        <FormTextField
          label="Email"
          testID="login-email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
        />
        <FormTextField
          label="Password"
          testID="login-password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <StatusText testID="auth-error" tone="error">
          {status}
        </StatusText>
        <Button testID="login-submit" onPress={submit} isDisabled={isBusy}>
          Login
        </Button>
        <View className="flex-row justify-between">
          <Link href="/signup" asChild>
            <Text className="text-primary underline">Sign up</Text>
          </Link>
          <Link href="/forgot-password" asChild>
            <Text className="text-primary underline">Forgot password</Text>
          </Link>
        </View>
      </View>
    </AuthScaffold>
  );
}
