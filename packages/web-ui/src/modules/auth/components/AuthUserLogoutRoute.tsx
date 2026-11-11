import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { AppLoader } from "../../app/components/AppLoader";

export function AuthUserLogoutRoute({ loader = <AppLoader /> }: { loader?: React.ReactNode }) {
  const navigate = useNavigate();
  const { signOut } = useSession();

  useEffect(() => {
    void signOut().then(() => {
      navigate("/login");
    });
  }, [signOut, navigate]);

  return loader;
}
