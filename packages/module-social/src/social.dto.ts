import { z } from "zod";

export const socialMediaInputSchema = z.object({
  s3Path: z.string().min(1, "Media S3 path is required"),
  mediaType: z.enum(["image", "video", "document"]).optional(),
  title: z.string().max(300).optional(),
  description: z.string().max(2000).optional(),
});

export const socialPostInputSchema = z.object({
  text: z.string().min(1, "Post text is required"),
  media: z.array(socialMediaInputSchema).max(4).optional(),
  visibility: z.enum(["PUBLIC", "CONNECTIONS"]).default("PUBLIC"),
});

export const socialPostOutputSchema = z.object({
  shareUrn: z.string().optional(),
});

export type SocialPostInput = z.infer<typeof socialPostInputSchema>;
export type SocialMediaInput = z.infer<typeof socialMediaInputSchema>;
export type SocialPostOutput = z.infer<typeof socialPostOutputSchema>;
