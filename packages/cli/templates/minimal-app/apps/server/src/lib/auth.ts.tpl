import {
  createOrganizationAndTeam,
  getActiveOrganizationAndTeam,
} from "@m5kdev/backend/modules/auth/auth.utils";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, lastLoginMethod, organization } from "better-auth/plugins";
import { orm, schema } from "../db";
import { emailService } from "../service";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.VITE_SERVER_URL ?? "http://localhost:8080",
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
    additionalFields: {
      activeOrganizationRole: {
        type: "string",
        required: false,
        defaultValue: null,
      },
      activeTeamRole: {
        type: "string",
        required: false,
        defaultValue: null,
      },
    },
  },
  user: {
    additionalFields: {
      onboarding: {
        type: "number",
        required: false,
        defaultValue: null,
      },
      preferences: {
        type: "string",
        required: false,
        defaultValue: null,
      },
      flags: {
        type: "string",
        required: false,
        defaultValue: null,
      },
      stripeCustomerId: {
        type: "string",
        required: false,
        defaultValue: null,
        input: false,
      },
      paymentCustomerId: {
        type: "string",
        required: false,
        defaultValue: null,
        input: false,
      },
      paymentPlanTier: {
        type: "string",
        required: false,
        defaultValue: null,
        input: false,
      },
      paymentPlanExpiresAt: {
        type: "number",
        required: false,
        defaultValue: null,
        input: false,
      },
    },
  },
  database: drizzleAdapter(orm, {
    provider: "sqlite",
    schema,
    usePlural: true,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      await emailService.sendResetPassword(user.email, url);
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await emailService.sendVerification(user.email, url);
    },
  },
  plugins: [
    admin(),
    lastLoginMethod(),
    organization({
      allowUserToCreateOrganization: false,
      teams: {
        enabled: true,
        allowRemovingAllTeams: false,
      },
      sendInvitationEmail: async (data) => {
        const invitationUrl = `${process.env.VITE_APP_URL ?? "http://localhost:5173"}/organization/accept-invitation?id=${data.id}`;
        await emailService.sendOrganizationInvite(
          data.email,
          data.organization.name,
          data.inviter.user.name || data.inviter.user.email,
          data.role,
          invitationUrl
        );
      },
      schema: {
        team: {
          modelName: "team",
        },
        teamMember: {
          modelName: "teamMember",
          additionalFields: {
            role: {
              type: "string",
              required: true,
            },
          },
        },
        member: {
          modelName: "member",
        },
        invitation: {
          modelName: "invitation",
        },
        organization: {
          modelName: "organization",
        },
      },
    }),
  ],
  trustedOrigins: [
    process.env.VITE_APP_URL ?? "http://localhost:5173",
    process.env.VITE_SERVER_URL ?? "http://localhost:8080",
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await createOrganizationAndTeam(orm, schema, user);
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const { organizationId, teamId, organizationRole, teamRole } =
            await getActiveOrganizationAndTeam(orm, schema, session.userId);

          return {
            data: {
              ...session,
              activeOrganizationId: organizationId,
              activeTeamId: teamId,
              activeOrganizationRole: organizationRole,
              activeTeamRole: teamRole,
            },
          };
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
export type User = Session["user"];
