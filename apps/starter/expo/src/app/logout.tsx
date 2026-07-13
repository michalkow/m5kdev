import { useAuthClient } from "@m5kdev/frontend/modules/auth/hooks/useAuthClient";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { LoadingScreen } from "../components/LoadingScreen";

export default function LogoutScreen() {
  const authClient = useAuthClient();
  const [done, setDone] = useState(false);

  useEffect(() => {
    authClient.signOut().finally(() => setDone(true));
  }, [authClient]);

  if (!done) {
    return <LoadingScreen />;
  }

  return <Redirect href="/login" />;
}
