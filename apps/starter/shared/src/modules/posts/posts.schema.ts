import { z } from "zod";
import { POST_STATUS_VALUES } from "./posts.constants";

/**
 * Shared schemas have a deliberately narrow role: server row/list types are
 * inferred from the tRPC router (AppRouter), and the API surface is defined by
 * the server module's DTO. A schema lives here only when the frontend needs it
 * at runtime (form validation) or when both sides genuinely share it — the
 * DTO imports these create/update schemas so the contract cannot drift.
 */
export const postStatusSchema = z.enum(POST_STATUS_VALUES);
export type PostStatusSchema = z.infer<typeof postStatusSchema>;

export const postCreateInputSchema = z.object({
  title: z.string().min(1),
  slug: z.string().optional(),
  excerpt: z.string().optional(),
  content: z.string().min(1),
});
export type PostCreateInputSchema = z.infer<typeof postCreateInputSchema>;

export const postUpdateInputSchema = postCreateInputSchema.extend({
  id: z.string(),
});
export type PostUpdateInputSchema = z.infer<typeof postUpdateInputSchema>;
