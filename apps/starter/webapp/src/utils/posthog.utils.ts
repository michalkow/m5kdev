import posthog, { type PostHog } from "posthog-js";
// Bundle exception conversion/listeners so capture works before remote scripts load.
import "posthog-js/dist/exception-autocapture";

export function initBrowserPosthog({
  apiKey,
  host,
}: {
  apiKey?: string;
  host?: string;
}): PostHog | undefined {
  const normalizedKey = apiKey?.trim();
  if (!normalizedKey || normalizedKey === "demo") return undefined;
  return posthog.init(normalizedKey, {
    api_host: host || "https://us.i.posthog.com",
    defaults: "2025-05-24",
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
  });
}

/** Keep exception identity in sync with authenticated session transitions. */
export function syncBrowserPosthogIdentity(
  client: PostHog | undefined,
  session:
    | { user: { id: string }; session: { activeOrganizationId?: string | null } }
    | null
    | undefined
): void {
  if (!client) return;
  const userId = session?.user.id;
  const previousUserId = client.get_property("user.id");
  if (previousUserId && previousUserId !== userId) client.reset();
  if (!userId) {
    client.unregister("user.id");
    client.unregister("organization.id");
    return;
  }
  client.identify(userId);
  client.register({ "user.id": userId });
  const organizationId = session?.session.activeOrganizationId;
  if (organizationId) client.register({ "organization.id": organizationId });
  else client.unregister("organization.id");
}
