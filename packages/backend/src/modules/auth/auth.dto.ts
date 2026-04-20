import { z } from "zod";

export const organizationTypeSchema = z.enum(["solo", "organization", "agency", "enterprise"]);
export type OrganizationType = z.infer<typeof organizationTypeSchema>;

export const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().nullable(),
  logo: z.string().nullable(),
  type: z.string().nullable(),
  parentId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.date(),
});

export type Organization = z.infer<typeof organizationSchema>;

export const waitlistSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date().nullable(),
  status: z.string(),
  code: z.string().nullable(),
  expiresAt: z.date().nullable(),
});

export const readInvitationInputSchema = z.object({
  id: z.string(),
});

export const readInvitationOutputSchema = z.object({
  organizationId: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  slug: z.string().nullable(),
  logo: z.string().nullable(),
});

export type ReadInvitationOutput = z.infer<typeof readInvitationOutputSchema>;
export type ReadInvitationInput = z.infer<typeof readInvitationInputSchema>;

export const waitlistOutputSchema = waitlistSchema.omit({ code: true, expiresAt: true });
export type WaitlistOutput = z.infer<typeof waitlistOutputSchema>;
export type Waitlist = z.infer<typeof waitlistSchema>;

export const accountClaimSchema = z.object({
  id: z.string(),
  claimUserId: z.string().nullable(),
  code: z.string().nullable(),
  status: z.string(),
  expiresAt: z.date().nullable(),
  claimedAt: z.date().nullable(),
  claimedEmail: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date().nullable(),
});

export const accountClaimOutputSchema = accountClaimSchema.omit({ code: true });
export type AccountClaim = z.infer<typeof accountClaimSchema>;
export type AccountClaimOutput = z.infer<typeof accountClaimOutputSchema>;

export const accountClaimMagicLinkSchema = z.object({
  id: z.string(),
  claimId: z.string(),
  userId: z.string(),
  email: z.string(),
  token: z.string(),
  url: z.string(),
  expiresAt: z.date().nullable(),
  createdAt: z.date(),
});

export const accountClaimMagicLinkOutputSchema = accountClaimMagicLinkSchema.omit({ token: true });
export type AccountClaimMagicLink = z.infer<typeof accountClaimMagicLinkSchema>;
export type AccountClaimMagicLinkOutput = z.infer<typeof accountClaimMagicLinkOutputSchema>;

export const childOrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().nullable(),
  logo: z.string().nullable(),
  type: z.string().nullable(),
  parentId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.date(),
});

export type ChildOrganization = z.infer<typeof childOrganizationSchema>;

export const adminOrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().nullable(),
  type: z.string().nullable(),
  parentId: z.string().nullable(),
  createdAt: z.date(),
});

export type AdminOrganization = z.infer<typeof adminOrganizationSchema>;

export const updateChildOrganizationInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
});

export type UpdateChildOrganizationInput = z.infer<typeof updateChildOrganizationInputSchema>;
