import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { AppLoader } from "../../app/components/AppLoader";

export default function Logout({ loader = <AppLoader /> }: { loader?: React.ReactNode }) {
  const navigate = useNavigate();

  // biome-ignore lint/correctness/useExhaustiveDependencies(authClient): authClient is a singleton
  // biome-ignore lint/correctness/useExhaustiveDependencies(navigate): navigate is a global hook
  useEffect(() => {
    authClient.signOut();
    navigate("/login");
  }, []);

  return loader;
}
