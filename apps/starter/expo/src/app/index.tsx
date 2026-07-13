import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { Redirect } from "expo-router";

export default function IndexScreen() {
  const { data: session } = useSession();

  return <Redirect href={session ? "/posts" : "/login"} />;
}
