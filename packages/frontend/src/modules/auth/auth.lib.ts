import {
  adminClient,
  inferAdditionalFields,
  lastLoginMethodClient,
  organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_SERVER_URL,
  plugins: [
    lastLoginMethodClient(),
    organizationClient({
      teams: {
        enabled: true,
      },
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
        preferences: {
          type: "string",
          required: false,
        },
        flags: {
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
