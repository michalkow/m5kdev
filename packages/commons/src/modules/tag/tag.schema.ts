import { z } from "zod";
import { querySchema } from "../schemas/query.schema";

export const tagSchema = z.object({
  id: z.string(),
  organizationId: z.string().nullish(),
  teamId: z.string().nullish(),
  createdAt: z.date(),
  updatedAt: z.date().nullish(),
  deletedAt: z.date().nullish(),
  userId: z.string(),
  name: z.string(),
  color: z.string().nullish(),
  type: z.string().nullish(),
  isEnabled: z.boolean(),
  parentId: z.string().nullish(),
  assignableTo: z.string().array().nullish().default([]),
});

export const taggingSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
  tagId: z.string(),
  resourceType: z.string(),
  resourceId: z.string(),
});

export const tagListInputSchema = querySchema;

export const tagListOutputSchema = z.object({
  rows: z.array(tagSchema),
  total: z.number(),
});

export const tagListSchema = z.object({
  assignableTo: z.string().optional(),
});

export const tagCreateSchema = z.object({
  organizationId: z.string().optional(),
  teamId: z.string().optional(),
  name: z.string(),
  color: z.string(),
  assignableTo: z.string().array().optional().default([]),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
});

export const tagUpdateSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  color: z.string().optional(),
});

export const tagLinkSchema = z.object({
  tagId: z.string(),
  resourceType: z.string(),
  resourceId: z.string(),
});

export type TagSchema = z.infer<typeof tagSchema>;
export type TaggingSchema = z.infer<typeof taggingSchema>;
export type TagListSchema = z.infer<typeof tagListSchema>;
export type TagCreateSchema = z.infer<typeof tagCreateSchema>;
export type TagUpdateSchema = z.infer<typeof tagUpdateSchema>;
export type TagLinkSchema = z.infer<typeof tagLinkSchema>;
export type TagListOutputSchema = z.infer<typeof tagListOutputSchema>;
export type TagListInputSchema = z.infer<typeof tagListInputSchema>;
