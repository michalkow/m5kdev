import { randomUUID } from "node:crypto";
import { PostHog } from "posthog-node";
import { setErrorReporter } from "../utils/errors";
import { getPosthog, setPosthog } from "../utils/posthog";

/** Explicit, optional app instrumentation. The ingestion key is public configuration. */
export function initPosthog({
  apiKey = process.env.VITE_PUBLIC_POSTHOG_KEY,
  host = process.env.VITE_PUBLIC_POSTHOG_HOST,
}: {
  apiKey?: string;
  host?: string;
} = {}): PostHog | undefined {
  const existing = getPosthog();
  if (existing) return existing;
  if (!apiKey?.trim() || apiKey === "demo") return undefined;

  const client = new PostHog(apiKey, { host, enableExceptionAutocapture: true });
  setPosthog(client);
  setErrorReporter({
    captureException(error, properties) {
      const userId = properties?.["user.id"];
      const eventId = randomUUID();
      client.captureException(
        error,
        typeof userId === "string" ? userId : undefined,
        properties,
        eventId
      );
      return eventId;
    },
  });
  return client;
}

/** Flush before Kernel shutdown completes, alongside OpenTelemetry. */
export async function shutdownPosthog(): Promise<void> {
  const client = getPosthog();
  setPosthog(undefined);
  setErrorReporter(undefined);
  await client?.shutdown();
}
