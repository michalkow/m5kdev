import { z } from "zod";

export const postSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  excerpt: z.string(),
  content: z.string(),
  authorUserId: z.string(),
  organizationId: z.string().nullable(),
  createdAt: z.coerce.date(),
});

export const postCreateSchema = z.object({
  title: z.string().min(1),
  excerpt: z.string().min(1),
  content: z.string().min(1),
});

export type Post = z.infer<typeof postSchema>;
export type PostCreateInput = z.infer<typeof postCreateSchema>;
