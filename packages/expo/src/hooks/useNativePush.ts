import type { NotificationRegisterDeviceInput } from "@m5kdev/commons/modules/notification/notification.schema";
import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import { PermissionStatus } from "expo";
import * as Notifications from "expo-notifications";
import { useCallback, useMemo, useState } from "react";
import { Platform } from "react-native";

export interface UseNativePushMessages {
  readonly unsupported: string;
  readonly denied: string;
  readonly noToken: string;
  readonly failed: string;
  readonly enabled: string;
}

export type NativePushPermission = `${PermissionStatus}`;

export interface UseNativePushOptions<TMutationError = unknown> {
  /** When false, subscribe is a no-op (e.g. signed-out). */
  readonly enabled: boolean;
  readonly messages: UseNativePushMessages;
  /**
   * Register device mutation — typically `trpc.notification.registerDevice.mutationOptions()`.
   */
  readonly registerDeviceMutation: UseMutationOptions<
    { deviceId: string },
    TMutationError,
    NotificationRegisterDeviceInput
  >;
}

function nativePlatform(): "ios" | "android" | null {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return null;
}

/**
 * Native push: permission + device token + server Device registration (UserId).
 * Pass tRPC (or other) mutation options from your app. No-op on web.
 */
export function useNativePush<TMutationError = unknown>(
  options: UseNativePushOptions<TMutationError>
): {
  permission: NativePushPermission;
  isSupported: boolean;
  subscribe: () => Promise<void>;
  reset: () => void;
  flowStatus: "idle" | "working" | "done" | "error";
  feedback: string | null;
  isWorking: boolean;
  canSubscribe: boolean;
} {
  const [permission, setPermission] = useState<NativePushPermission>(PermissionStatus.UNDETERMINED);
  const [flowStatus, setFlowStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [feedback, setFeedback] = useState<string | null>(null);
  const register = useMutation(options.registerDeviceMutation);
  const platform = nativePlatform();
  const isSupported = platform != null;

  const reset = useCallback(() => {
    setFlowStatus("idle");
    setFeedback(null);
  }, []);

  const subscribe = useCallback(async () => {
    setFlowStatus("working");
    setFeedback(null);
    try {
      if (!options.enabled) {
        throw new Error(options.messages.failed);
      }
      if (platform == null) {
        throw new Error(options.messages.unsupported);
      }
      const permissionResult = await Notifications.requestPermissionsAsync();
      setPermission(permissionResult.status);
      if (permissionResult.status !== PermissionStatus.GRANTED) {
        throw new Error(options.messages.denied);
      }
      const tokenResult = await Notifications.getDevicePushTokenAsync();
      const token = typeof tokenResult.data === "string" ? tokenResult.data : null;
      if (!token) {
        throw new Error(options.messages.noToken);
      }
      const payload: NotificationRegisterDeviceInput = { platform, token };
      await register.mutateAsync(payload);
      setFlowStatus("done");
      setFeedback(options.messages.enabled);
    } catch (error) {
      setFlowStatus("error");
      setFeedback(error instanceof Error ? error.message : options.messages.failed);
    }
  }, [options.enabled, options.messages, platform, register]);

  const canSubscribe = useMemo(
    () =>
      options.enabled &&
      isSupported &&
      permission !== PermissionStatus.DENIED &&
      flowStatus !== "done" &&
      flowStatus !== "working",
    [flowStatus, isSupported, options.enabled, permission]
  );

  return {
    permission,
    isSupported,
    subscribe,
    reset,
    flowStatus,
    feedback,
    isWorking: flowStatus === "working",
    canSubscribe,
  };
}
