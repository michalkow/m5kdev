import { z } from "zod";

export const connectSelectSchema = z.object({
  id: z.string(),
  userId: z.string(),
  provider: z.string(),
  accountType: z.string(),
  providerAccountId: z.string(),
  handle: z.string().nullish(),
  displayName: z.string().nullish(),
  avatarUrl: z.string().nullish(),
  accessToken: z.string(),
  refreshToken: z.string().nullish(),
  tokenType: z.string().nullish(),
  scope: z.string().nullish(),
  expiresAt: z.date().nullish(),
  parentId: z.string().nullish(),
  metadataJson: z.unknown().nullish(),
  revokedAt: z.date().nullish(),
  lastRefreshedAt: z.date().nullish(),
  createdAt: z.date(),
  updatedAt: z.date().nullish(),
});

export type ConnectSelectSchema = z.infer<typeof connectSelectSchema>;

export const connectSelectOutputSchema = connectSelectSchema.omit({
  accessToken: true,
  refreshToken: true,
});

export const connectListInputSchema = z.object({
  providers: z.array(z.string()).optional(),
  inactive: z.boolean().optional(),
});

export type ConnectListInputSchema = z.infer<typeof connectListInputSchema>;

export const connectListOutputSchema = z.array(connectSelectOutputSchema);

export const connectDeleteInputSchema = z.object({ id: z.string() });
export const connectDeleteOutputSchema = z.object({ id: z.string() });
export type ConnectDeleteInputSchema = z.infer<typeof connectDeleteInputSchema>;
export type ConnectDeleteOutputSchema = z.infer<typeof connectDeleteOutputSchema>;

export const connectStartInputSchema = z.object({
  provider: z.string().min(1),
  redirect: z.string().optional(),
});
export type ConnectStartInput = z.infer<typeof connectStartInputSchema>;
/** Browser JSON starts cannot replace the route-selected provider or private OAuth state. */
export const connectBrowserStartInputSchema = connectStartInputSchema
  .omit({ provider: true })
  .strict();

export const connectCallbackInputSchema = z.object({
  provider: z.string().min(1),
  state: z.string().min(1),
  code: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
  redirect: z.string().optional(),
});
export type ConnectCallbackInput = z.infer<typeof connectCallbackInputSchema>;

export const connectNavigationSchema = z.object({
  url: z.url(),
  outcome: z.enum(["authorized", "connected", "failed"]),
});
export type ConnectNavigation = z.infer<typeof connectNavigationSchema>;
