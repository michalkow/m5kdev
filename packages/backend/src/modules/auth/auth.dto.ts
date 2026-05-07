import { queryListOutput, querySchema } from "@m5kdev/commons/modules/schemas/query.schema";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { accountClaimMagicLinks, organizations, waitlist } from "./auth.db";

export const organizationSchema = createSelectSchema(organizations);

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
  },
  input: {
    list: querySchema,
    create: z.object({
      name: z.string(),
    }),
    updateChild: z.object({
      id: z.string(),
      name: z.string().min(1),
    }),
    updateType: z.object({
      organizationId: z.string(),
      type: organizationSchema.shape.type,
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
