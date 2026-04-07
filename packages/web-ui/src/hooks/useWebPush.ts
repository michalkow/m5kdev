import type { NotificationRegisterDeviceInput } from "@m5kdev/commons/modules/notification/notification.schema";
import {
  type UseMutationOptions,
  type UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useNotificationPermission } from "./useNotificationPermission";

export interface UseWebPushMessages {
  readonly unsupported: string;
  readonly denied: string;
  readonly noVapid: string;
  readonly badSubscription: string;
  readonly failed: string;
  readonly enabled: string;
}

export interface VapidPublicKeyQueryData {
  readonly publicKey: string;
}

export interface UseWebPushOptions {
  /** When false, the VAPID query stays disabled (e.g. signed-out). */
  readonly enabled: boolean;
  readonly messages: UseWebPushMessages;
  /** Service worker script URL (default `/push-sw.js`). */
  readonly serviceWorkerScriptUrl?: string;
  readonly serviceWorkerScope?: string;
  /**
   * VAPID public key query — typically `trpc.notification.vapidPublicKey.queryOptions()`.
   * `enabled` is merged with {@link UseWebPushOptions.enabled}.
   */
  readonly vapidPublicKeyQuery: Omit<
    UseQueryOptions<VapidPublicKeyQueryData, Error, VapidPublicKeyQueryData>,
    "enabled"
  > &
    Partial<
      Pick<UseQueryOptions<VapidPublicKeyQueryData, Error, VapidPublicKeyQueryData>, "enabled">
    >;
  /**
   * Register device mutation — typically `trpc.notification.registerDevice.mutationOptions()`.
   */
  readonly registerDeviceMutation: UseMutationOptions<
    { deviceId: string },
    Error,
    NotificationRegisterDeviceInput
  >;
}

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Web Push: VAPID query + service worker + {@link useNotificationPermission} + `pushManager.subscribe` + server registration.
 * Pass tRPC (or other) query/mutation options from your app.
 */
export function useWebPush(options: UseWebPushOptions): {
  permission: NotificationPermission;
  isSupported: boolean;
  vapidQuery: ReturnType<typeof useQuery<VapidPublicKeyQueryData, Error, VapidPublicKeyQueryData>>;
  subscribe: () => Promise<void>;
  reset: () => void;
  flowStatus: "idle" | "working" | "done" | "error";
  feedback: string | null;
  isWorking: boolean;
  canSubscribe: boolean;
  vapidError: boolean;
  isVapidLoading: boolean;
  requestPermission: () => Promise<NotificationPermission>;
  refreshPermission: () => void;
} {
  const { permission, requestPermission, refresh: refreshPermission } = useNotificationPermission();
  const [flowStatus, setFlowStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [feedback, setFeedback] = useState<string | null>(null);

  const swUrl = options.serviceWorkerScriptUrl ?? "/push-sw.js";
  const swScope = options.serviceWorkerScope ?? "/";

  const vapidQuery = useQuery({
    ...options.vapidPublicKeyQuery,
    enabled: options.enabled && (options.vapidPublicKeyQuery.enabled ?? true),
  });

  const register = useMutation(options.registerDeviceMutation);

  const isSupported = useMemo(
    () =>
      typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window,
    []
  );

  const reset = useCallback(() => {
    setFlowStatus("idle");
    setFeedback(null);
    refreshPermission();
  }, [refreshPermission]);

  const subscribe = useCallback(async () => {
    setFlowStatus("working");
    setFeedback(null);
    try {
      if (!isSupported) {
        throw new Error(options.messages.unsupported);
      }
      const registration = await navigator.serviceWorker.register(swUrl, {
        scope: swScope,
      });
      const nextPermission = await requestPermission();
      if (nextPermission !== "granted") {
        throw new Error(options.messages.denied);
      }
      const vapid = vapidQuery.data;
      if (!vapid?.publicKey) {
        throw new Error(options.messages.noVapid);
      }
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
      });
      const json = sub.toJSON();
      if (!json?.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error(options.messages.badSubscription);
      }
      const payload: NotificationRegisterDeviceInput = {
        platform: "web",
        subscription: {
          endpoint: json.endpoint,
          expirationTime: json.expirationTime ?? null,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        },
      };
      await register.mutateAsync(payload);
      setFlowStatus("done");
      setFeedback(options.messages.enabled);
    } catch (e) {
      setFlowStatus("error");
      setFeedback(e instanceof Error ? e.message : options.messages.failed);
    }
  }, [isSupported, options.messages, register, requestPermission, swScope, swUrl, vapidQuery.data]);

  const isWorking = flowStatus === "working";
  const canSubscribe =
    options.enabled &&
    isSupported &&
    permission !== "denied" &&
    !vapidQuery.isLoading &&
    !vapidQuery.isError;

  return {
    permission,
    isSupported,
    vapidQuery,
    subscribe,
    reset,
    flowStatus,
    feedback,
    isWorking,
    canSubscribe,
    vapidError: vapidQuery.isError,
    isVapidLoading: vapidQuery.isLoading,
    requestPermission,
    refreshPermission,
  };
}
