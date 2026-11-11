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
  if (!apiKey?.trim() || apiKey === "demo") return undefined;
  return posthog.init(apiKey, {
    api_host: host || "https://us.i.posthog.com",
    defaults: "2025-05-24",
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
  });
}
