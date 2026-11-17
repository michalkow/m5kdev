import { z } from "zod";

export const experienceIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9._-]*$/)
  .brand<"ExperienceId">();
export type ExperienceId = z.infer<typeof experienceIdSchema>;
export const canonicalOriginSchema = z
  .url({ protocol: /^https?$/, normalize: true })
  .transform((value) => value.replace(/\/$/, ""))
  .refine(
    (value) => /^https?:\/\/[^/@?#\\\s]+$/.test(value),
    "Expected an HTTP(S) origin without credentials, a path, query or fragment"
  )
  .brand<"CanonicalOrigin">();
export const brandProfileSchema = z
  .object({
    name: z.string().min(1),
    logo: z.string().optional(),
    tagline: z.string().optional(),
    themeKey: z.string().optional(),
    copyNamespace: z.string().optional(),
    supportUrl: z.url().optional(),
    helpUrl: z.url().optional(),
  })
  .strict();
export const publicExperienceSchema = z
  .object({
    id: experienceIdSchema,
    product: z.string().min(1),
    brand: brandProfileSchema,
    webOrigin: canonicalOriginSchema,
    apiOrigin: canonicalOriginSchema,
  })
  .strict();
export type PublicExperience = z.infer<typeof publicExperienceSchema>;
export const experienceEmailProfileSchema = z
  .object({
    from: z
      .string()
      .trim()
      .min(1)
      .regex(/^[^\r\n]+$/, "Expected a single-line sender")
      .optional(),
    templateSet: z.string().min(1).optional(),
    systemNotificationEmail: z.string().min(1).optional(),
  })
  .strict();
export const experienceRegistrySchema = z
  .object({
    defaultExperience: z.string().min(1),
    brands: z.record(z.string(), brandProfileSchema),
    emailProfiles: z.record(z.string(), experienceEmailProfileSchema).default({}),
    definitions: z.record(
      z.string(),
      z
        .object({
          product: z.string().min(1),
          brand: z.string().min(1),
          webOrigin: canonicalOriginSchema,
          apiOrigin: canonicalOriginSchema,
          aliases: z.array(canonicalOriginSchema).default([]),
          emailProfile: z.string().optional(),
          disabled: z.boolean().default(false),
        })
        .strict()
    ),
    infrastructureHosts: z.array(z.string()).default([]),
    trustedProxyHeaders: z.boolean().default(false),
  })
  .strict();
export type ExperienceRegistryConfig = z.input<typeof experienceRegistrySchema>;
