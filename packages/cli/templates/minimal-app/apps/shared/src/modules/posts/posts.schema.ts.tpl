import { querySchema } from "@m5kdev/commons/modules/schemas/query.schema";
import { z } from "zod";
import { POST_STATUS_VALUES } from "./posts.constants";

export const postStatusSchema = z.enum(POST_STATUS_VALUES);
export type PostStatusSchema = z.infer<typeof postStatusSchema>;

export const postSchema = z.object({
  id: z.string(),
  authorUserId: z.string().nullish(),
  organizationId: z.string().nullish(),
  teamId: z.string().nullish(),
  title: z.string(),
  slug: z.string(),
  excerpt: z.string().nullish(),
  content: z.string(),
  status: postStatusSchema,
  publishedAt: z.date().nullish(),
  createdAt: z.date(),
  updatedAt: z.date().nullish(),
  deletedAt: z.date().nullish(),
});
export type PostSchema = z.infer<typeof postSchema>;

export const postsListInputSchema = querySchema.extend({
  search: z.string().optional(),
  status: postStatusSchema.optional(),
});
export type PostsListInputSchema = z.infer<typeof postsListInputSchema>;

export const postsListOutputSchema = z.object({
  rows: z.array(postSchema),
  total: z.number(),
});
export type PostsListOutputSchema = z.infer<typeof postsListOutputSchema>;

export const postCreateInputSchema = z.object({
  title: z.string().min(1),
  slug: z.string().optional(),
  excerpt: z.string().optional(),
  content: z.string().min(1),
});
export type PostCreateInputSchema = z.infer<typeof postCreateInputSchema>;

export const postCreateOutputSchema = postSchema;
export type PostCreateOutputSchema = z.infer<typeof postCreateOutputSchema>;

export const postUpdateInputSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  slug: z.string().optional(),
  excerpt: z.string().optional(),
  content: z.string().min(1),
});
export type PostUpdateInputSchema = z.infer<typeof postUpdateInputSchema>;

export const postUpdateOutputSchema = postSchema;
export type PostUpdateOutputSchema = z.infer<typeof postUpdateOutputSchema>;

export const postPublishInputSchema = z.object({
  id: z.string(),
});
export type PostPublishInputSchema = z.infer<typeof postPublishInputSchema>;

export const postPublishOutputSchema = postSchema;
export type PostPublishOutputSchema = z.infer<typeof postPublishOutputSchema>;

export const postSoftDeleteInputSchema = z.object({
  id: z.string(),
});
export type PostSoftDeleteInputSchema = z.infer<typeof postSoftDeleteInputSchema>;

export const postSoftDeleteOutputSchema = z.object({
  id: z.string(),
});
export type PostSoftDeleteOutputSchema = z.infer<typeof postSoftDeleteOutputSchema>;
