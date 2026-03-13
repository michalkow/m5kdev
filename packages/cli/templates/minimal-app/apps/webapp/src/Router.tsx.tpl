import { APP_NAME } from "{{PACKAGE_SCOPE}}/shared/modules/app/app.constants";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { AuthRouter } from "@m5kdev/web-ui/modules/auth/components/AuthRouter";
import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";
import { PostsRoute } from "@/modules/posts/PostsRoute";
import { Layout } from "./Layout";

function ProtectedRoutes({ children }: { children: ReactNode }) {
  const { data: session } = useSession();

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AuthHeader() {
  return (
    <div className="text-center">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.32em] text-amber-700/80">
        Editorial Workspace
      </p>
      <h1 className="mt-3 font-editorial text-4xl text-ink">{APP_NAME}</h1>
      <p className="mt-3 text-sm text-ink/70">
        A minimal m5kdev starter with auth, tRPC, and one polished posts module.
      </p>
    </div>
  );
}

export function Router() {
  return (
    <Routes>
      {AuthRouter({
        header: <AuthHeader />,
      })}

      <Route
        path="/"
        element={
          <ProtectedRoutes>
            <Layout />
          </ProtectedRoutes>
        }
      >
        <Route index element={<Navigate to="/posts" replace />} />
        <Route path="posts" element={<PostsRoute />} />
      </Route>
    </Routes>
  );
}
