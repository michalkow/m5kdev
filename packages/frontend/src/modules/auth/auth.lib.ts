import type { ClientOptions } from "better-auth";
import {
  adminClient,
  inferAdditionalFields,
  lastLoginMethodClient,
  organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const options = {
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
} satisfies ClientOptions;

export const authClient = createAuthClient(options);
