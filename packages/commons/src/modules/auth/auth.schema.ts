import { z } from "zod";

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  image: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  role: z.string().nullable(),
  banned: z.boolean().nullable(),
  banReason: z.string().nullable(),
  banExpires: z.date().nullable(),
  paymentCustomerId: z.string().nullable(),
  paymentPlanTier: z.string().nullable(),
  paymentPlanExpiresAt: z.date().nullable(),
  preferences: z.string().nullable(),
  onboarding: z.boolean().nullable(),
});

export type UserSchema = z.infer<typeof userSchema>;
