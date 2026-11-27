import { z } from "zod";
/** Configuration boundary; provider secrets remain in the owning AI/app composition. */
export const supportConfigSchema = z.object({
  maxAttachments: z.number().int().min(1).max(50).optional(),
  maxFileBytes: z
    .number()
    .int()
    .min(1)
    .max(50 * 1024 * 1024)
    .optional(),
  retentionDays: z.number().int().min(1).max(36500).optional(),
  locales: z.array(z.string().min(2).max(35)).min(1).optional(),
  translation: z
    .object({
      id: z.string().min(1),
      languages: z.array(z.string().min(2).max(35)).min(1),
      translate: z.custom((value) => typeof value === "function"),
      detect: z.custom((value) => typeof value === "function").optional(),
    })
    .optional(),
  assistant: z
    .object({ id: z.string().min(1), answer: z.custom((value) => typeof value === "function") })
    .optional(),
  documentation: z
    .object({
      applicationVersion: z.string().min(1).max(100),
      allowedOrigins: z
        .array(
          z
            .url()
            .refine(
              (value) => new URL(value).origin === value,
              "Use a canonical origin without a path or trailing slash"
            )
        )
        .min(1),
      manifestPath: z.string().min(1).optional(),
    })
    .optional(),
  models: z
    .object({
      assistant: z.object({ model: z.string().trim().min(1) }).optional(),
      translation: z
        .object({ model: z.string().trim().min(1), languages: z.array(z.string().min(2)).min(1) })
        .optional(),
    })
    .optional(),
});
