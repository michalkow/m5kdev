import { Spinner } from "@heroui/react";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useEffect } from "react";
import { useNavigate } from "react-router";

export default function Logout() {
  const navigate = useNavigate();

  // biome-ignore lint/correctness/useExhaustiveDependencies(authClient): authClient is a singleton
  // biome-ignore lint/correctness/useExhaustiveDependencies(navigate): navigate is a global hook
  useEffect(() => {
    authClient.signOut();
    navigate("/login");
  }, []);

  return (
    <div className="flex-1 justify-center align-center">
      <Spinner />
    </div>
  );
}
