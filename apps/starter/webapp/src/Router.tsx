import { syncI18nLocale } from "@m5kdev/frontend/modules/app/utils/locale";
import { AuthAdminRouter } from "@m5kdev/web-ui/modules/auth/components/AuthAdminRouter";
import { AuthOrganizationAcceptInvitationRoute } from "@m5kdev/web-ui/modules/auth/components/AuthOrganizationAcceptInvitationRoute";
import { AuthOrganizationRouter } from "@m5kdev/web-ui/modules/auth/components/AuthOrganizationRouter";
import { AuthPublicRouter } from "@m5kdev/web-ui/modules/auth/components/AuthPublicRouter";
import { AuthUserRouter } from "@m5kdev/web-ui/modules/auth/components/AuthUserRouter";
import { AuthUtilityProtectedRoutes as ProtectedRoutes } from "@m5kdev/web-ui/modules/auth/components/AuthUtilityProtectedRoutes";
import { APP_NAME } from "@starter-app/shared/modules/app/app.constants";
import { useTranslation } from "react-i18next";
import { Route, Routes } from "react-router";
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

function AuthHeader() {
  const { t } = useTranslation("starter-app");

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
      {/* Built-in routers register as function calls so their <Route> elements
          land directly in this tree. */}
      {AuthPublicRouter({
        header: <AuthHeader />,
        waitlist: isWaitlist,
        onLocaleChange: syncI18nLocale,
      })}

      {/* public: a logged-out invitee must reach this route so it can send
          them to signup — inside ProtectedRoutes they'd bounce to /login */}
      <Route
        path="/organization/accept-invitation"
        element={<AuthOrganizationAcceptInvitationRoute />}
      />

      <Route
        element={
          <ProtectedRoutes>
            <Layout />
          </ProtectedRoutes>
        }
      >
        <Route index element={<PostsRoute />} />

        {AuthUserRouter({
          schema: preferenceSchema,
          controls: preferenceControls,
          onLocaleChange: syncI18nLocale,
        })}
        {AuthOrganizationRouter({
          schema: preferenceSchema,
          controls: preferenceControls,
        })}
        {AuthAdminRouter({
          enableWaitlist: true,
          enableAccountClaimActions: true,
        })}
      </Route>
    </Routes>
  );
}
