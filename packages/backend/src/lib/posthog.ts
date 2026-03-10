import { PostHog } from "posthog-node";

export const posthogClient = new PostHog(process.env.VITE_PUBLIC_POSTHOG_KEY!, {
  host: process.env.VITE_PUBLIC_POSTHOG_HOST!,
});
