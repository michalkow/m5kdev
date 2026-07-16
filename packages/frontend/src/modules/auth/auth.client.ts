import type { BetterAuth } from "@m5kdev/backend/modules/auth/auth.lib";
import {
  adminClient,
  inferAdditionalFields,
  inferOrgAdditionalFields,
  lastLoginMethodClient,
  organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export function createM5KAuthClient(baseURL?: string) {
  return createAuthClient({
    ...(baseURL ? { baseURL } : {}),
    plugins: [
      lastLoginMethodClient(),
      organizationClient({
        teams: {
          enabled: true,
        },
        schema: inferOrgAdditionalFields<BetterAuth>(),
      }),
      adminClient(),
      inferAdditionalFields({
        session: {
          activeOrganizationId: {
            type: "string",
            required: false,
          },
          activeTeamId: {
            type: "string",
            required: false,
          },
          activeTeamRole: {
            type: "string",
            required: false,
          },
          activeOrganizationRole: {
            type: "string",
            required: false,
          },
          activeOrganizationType: {
            type: "string",
            required: false,
          },
        },
        user: {
          onboarding: {
            type: "number",
            required: false,
          },
          // preferences/metadata/flags are writable via updateUser but
          // returned: false on the server — never present in session
          // responses; read them via authService procedures
          preferences: {
            type: "string",
            required: false,
          },
          metadata: {
            type: "string",
            required: false,
          },
          flags: {
            type: "string",
            required: false,
          },
          locale: {
            type: "string",
            required: false,
          },
          stripeCustomerId: {
            type: "string",
            required: false,
          },
        },
        teamMembers: {
          role: {
            type: "string",
            required: true,
          },
        },
      }),
    ],
  });
}

export type M5KAuthClient = ReturnType<typeof createM5KAuthClient>;
