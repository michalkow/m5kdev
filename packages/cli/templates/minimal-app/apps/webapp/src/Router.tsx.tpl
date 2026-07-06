import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { AuthAdminRouter } from "@m5kdev/web-ui/modules/auth/components/AuthAdminRouter";
import { AuthOrganizationAcceptInvitationRoute } from "@m5kdev/web-ui/modules/auth/components/AuthOrganizationAcceptInvitationRoute";
import { AuthOrganizationChildOrganizationsRoute } from "@m5kdev/web-ui/modules/auth/components/AuthOrganizationChildOrganizationsRoute";
import { AuthOrganizationMembersRoute } from "@m5kdev/web-ui/modules/auth/components/AuthOrganizationMembersRoute";
import { AuthOrganizationPreferences } from "@m5kdev/web-ui/modules/auth/components/AuthOrganizationPreferences";
import { AuthPublicRouter } from "@m5kdev/web-ui/modules/auth/components/AuthPublicRouter";
import { syncI18nLocale } from "@m5kdev/frontend/modules/app/utils/locale";
import { AuthUserRouter } from "@m5kdev/web-ui/modules/auth/components/AuthUserRouter";
import { APP_NAME } from "{{PACKAGE_SCOPE}}/shared/modules/app/app.constants";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Outlet, Route, Routes } from "react-router";
import { z } from "zod";
import { PostsRoute } from "@/modules/posts/PostsRoute";
import { Layout } from "./Layout";

const preferenceSchema = z.object({
  compactMode: z.boolean().optional(),
  postsPerPage: z.number().min(1).max(20).optional(),
});

const preferenceControls = {
  compactMode: {
    label: "Compact mode",
    element: "switch",
  },
  postsPerPage: {
    label: "Posts per page",
    element: "number",
    min: 1,
    max: 20,
    step: 1,
  },
} as const;

function ProtectedRoutes({ children }: { children?: ReactNode }) {
  const { data: session } = useSession();

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children ?? <Outlet />;
}

function AuthHeader() {
  const { t } = useTranslation("blog{{PACKAGE_SCOPE}}");

  return (
    <div className="text-center">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.3em] text-default-500">
        {t("auth.header.eyebrow")}
      </p>
      <h1 className="mt-3 font-editorial text-4xl text-ink">{APP_NAME}</h1>
      <p className="mt-3 text-sm text-default-600">{t("auth.header.tagline")}</p>
    </div>
  );
}

export function Router() {
  const isWaitlist = import.meta.env.VITE_ENABLE_WAITLIST === "true";

  return (
    <Routes>
      {AuthPublicRouter({
        header: <AuthHeader />,
        waitlist: isWaitlist,
        onLocaleChange: syncI18nLocale,
      })}

      <Route
        path="/organization/accept-invitation"
        element={<AuthOrganizationAcceptInvitationRoute />}
      />

      <Route element={<ProtectedRoutes />}>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/posts" replace />} />
          <Route path="posts" element={<PostsRoute />} />
          <Route
            path="organization/members"
            element={<AuthOrganizationMembersRoute managerRoles={["admin", "owner"]} />}
          />
          <Route
            path="organization/manage"
            element={<AuthOrganizationChildOrganizationsRoute managerRoles={["admin", "owner"]} />}
          />
          <Route
            path="organization/preferences"
            element={
              <AuthOrganizationPreferences
                schema={preferenceSchema}
                controls={preferenceControls}
                managerRoles={["admin", "owner"]}
              />
            }
          />
          {AuthUserRouter({
            schema: preferenceSchema,
            controls: preferenceControls,
            onLocaleChange: syncI18nLocale,
          })}
          {AuthAdminRouter({
            enableWaitlist: true,
            enableAccountClaimActions: true,
          })}
        </Route>
      </Route>
    </Routes>
  );
}
