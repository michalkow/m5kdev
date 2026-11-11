import { AsyncLocalStorage } from "node:async_hooks";
import type { PostHog } from "posthog-node";

declare global {
  // eslint-disable-next-line no-var
  var m5Posthog: PostHog | undefined;
}

export function getPosthog(): PostHog | undefined {
  return globalThis.m5Posthog;
}

export function setPosthog(posthog: PostHog | undefined): void {
  globalThis.m5Posthog = posthog;
}

type PosthogRequestState = {
  disableCapture: boolean;
  /** Skip PostHog exception capture so a later terminal boundary can report once. */
  deferExceptionCapture?: boolean;
};

const posthogRequestState = new AsyncLocalStorage<PosthogRequestState>();

export function runWithPosthogRequestState<T>(state: PosthogRequestState, callback: () => T): T {
  return posthogRequestState.run(state, callback);
}

export function isPosthogCaptureDisabled(): boolean {
  return posthogRequestState.getStore()?.disableCapture ?? false;
}

export function isExceptionCaptureDeferred(): boolean {
  return posthogRequestState.getStore()?.deferExceptionCapture === true;
}

export function posthogCapture(
  event: Parameters<PostHog["capture"]>[0]
): ReturnType<PostHog["capture"]> | undefined {
  if (isPosthogCaptureDisabled()) {
    return undefined;
  }

  const posthog = getPosthog();
  if (!posthog) {
    return undefined;
  }
  return posthog.capture(event);
}
