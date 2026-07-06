import { queryListOutput, querySchema } from "@m5kdev/commons/modules/schemas/query.schema";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { createLocaleValueSchema, type AuthLocaleConfig } from "@m5kdev/commons/modules/auth/auth.locale";
import { accountClaimMagicLinks, members, organizations, users, waitlist } from "./auth.db";

const organizationRoleSchema = z.enum(["member", "admin", "owner"]);

export const settingsSchemas = {
  output: {
    record: z.record(z.string(), z.unknown()),
    flags: z.array(z.string()),
    onboarding: z.number(),
    locale: z.string(),
  },
  input: {
    patchRecord: z.record(z.string(), z.unknown()),
    flags: z.array(z.string()),
    onboarding: z.number(),
    setLocale: (config: AuthLocaleConfig) =>
      z.object({
        locale: createLocaleValueSchema(config),
      }),
  },
};

export const adminUserSummarySchema = createSelectSchema(users).pick({
  id: true,
  name: true,
  email: true,
  role: true,
  banned: true,
  emailVerified: true,
});

export const organizationSchema = createSelectSchema(organizations);
const organizationMemberSchema = createSelectSchema(members).extend({
  user: adminUserSummarySchema,
});

export const organizationSchemas = {
  output: {
    single: organizationSchema,
    list: queryListOutput(organizationSchema),
    simple: organizationSchema.omit({
      metadata: true,
      preferences: true,
      flags: true,
    }),
    child: organizationSchema.omit({
      preferences: true,
      flags: true,
    }),
    admin: organizationSchema.omit({
      metadata: true,
      preferences: true,
      flags: true,
    }),
    member: organizationMemberSchema,
    members: z.object({
      organization: organizationSchema.omit({
        metadata: true,
        preferences: true,
        flags: true,
      }),
      members: organizationMemberSchema.array(),
    }),
    adminUsers: queryListOutput(adminUserSummarySchema),
  },
  input: {
    list: querySchema,

    adminMembers: z.object({
      organizationId: z.string(),
    }),
    create: z.object({
      name: z.string(),
    }),
    updateChild: z.object({
      id: z.string(),
      name: z.string().min(1),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
    createAdmin: z.object({
      name: z.string(),
      slug: z.string(),
      type: organizationSchema.shape.type.optional(),
      locale: z.string(),
    }),
    updateAdmin: z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      slug: z.string().min(1).optional(),
      type: organizationSchema.shape.type.optional(),
      parentId: z.string().nullable().optional(),
    }),
    addAdminMember: z.object({
      organizationId: z.string(),
      userId: z.string(),
      role: organizationRoleSchema,
    }),
    updateAdminMemberRole: z.object({
      organizationId: z.string(),
      memberId: z.string(),
      role: organizationRoleSchema,
    }),
    removeAdminMember: z.object({
      organizationId: z.string(),
      memberId: z.string(),
    }),
  },
};

export const waitlistSchema = createSelectSchema(waitlist);

export const waitlistSchemas = {
  output: {
    single: waitlistSchema.omit({ code: true, expiresAt: true }),
    full: waitlistSchema,
    claim: waitlistSchema.omit({ code: true }),
    simple: waitlistSchema.pick({
      id: true,
      email: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      status: true,
    }),
    accountClaim: waitlistSchema.pick({
      id: true,
      claimUserId: true,
      status: true,
      expiresAt: true,
      claimedAt: true,
      claimedEmail: true,
      createdAt: true,
      updatedAt: true,
    }),
  },
  input: {
    create: z.object({
      name: z.string().optional(),
    }),
    add: z.object({
      email: z.string(),
    }),
    invite: z.object({
      email: z.string(),
      name: z.string().optional(),
    }),
    inviteFrom: z.object({
      id: z.string(),
    }),
    remove: z.object({
      id: z.string(),
    }),
    join: z.object({
      email: z.string(),
    }),
    validateCode: z.object({
      code: z.string(),
    }),
  },
};

export const invitationSchemas = {
  output: {
    read: z.object({
      organizationId: z.string(),
      email: z.string(),
      name: z.string().nullable(),
      slug: z.string().nullable(),
      logo: z.string().nullable(),
    }),
  },
  input: {
    read: z.object({
      id: z.string(),
    }),
  },
};

export const accountClaimMagicLinkSchema = createSelectSchema(accountClaimMagicLinks);
const accountClaimMagicLinkOutputSchema = accountClaimMagicLinkSchema.omit({ token: true });

export const accountClaimMagicLinkSchemas = {
  output: {
    single: accountClaimMagicLinkOutputSchema,
  },
  input: {
    create: z.object({
      userId: z.string(),
      expiresInHours: z.number().optional(),
    }),
    generateLink: z.object({
      claimId: z.string(),
      email: z.string().email().optional(),
    }),
    listLinks: z.object({
      claimId: z.string(),
    }),
    setEmail: z.object({
      email: z.string().email(),
    }),
  },
};
