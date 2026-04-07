import {
  notificationListDevicesOutputSchema,
  notificationListSendLogsInputSchema,
  notificationListSendLogsOutputSchema,
  notificationRegisterDeviceInputSchema,
  notificationRegisterDeviceOutputSchema,
  notificationSendTestInputSchema,
  notificationSendTestOutputSchema,
  notificationUnregisterDeviceInputSchema,
  notificationUnregisterDeviceOutputSchema,
  notificationVapidPublicKeyOutputSchema,
} from "@m5kdev/commons/modules/notification/notification.schema";
import { handleTRPCResult, type TRPCMethods } from "../../utils/trpc";
import type { NotificationService } from "./notification.service";

export function createNotificationTRPC(
  { router, publicProcedure, privateProcedure, adminProcedure }: TRPCMethods,
  notificationService: NotificationService
) {
  return router({
    vapidPublicKey: publicProcedure
      .output(notificationVapidPublicKeyOutputSchema)
      .query(async () => handleTRPCResult(await notificationService.vapidPublicKey())),

    registerDevice: privateProcedure
      .input(notificationRegisterDeviceInputSchema)
      .output(notificationRegisterDeviceOutputSchema)
      .mutation(async ({ ctx, input }) =>
        handleTRPCResult(await notificationService.registerDevice(ctx, input))
      ),

    unregisterDevice: privateProcedure
      .input(notificationUnregisterDeviceInputSchema)
      .output(notificationUnregisterDeviceOutputSchema)
      .mutation(async ({ ctx, input }) =>
        handleTRPCResult(await notificationService.unregisterDevice(ctx, input.deviceId))
      ),

    listMyDevices: privateProcedure
      .output(notificationListDevicesOutputSchema)
      .query(async ({ ctx }) => handleTRPCResult(await notificationService.listMyDevices(ctx))),

    listMySendLogs: privateProcedure
      .input(notificationListSendLogsInputSchema)
      .output(notificationListSendLogsOutputSchema)
      .query(async ({ ctx, input }) =>
        handleTRPCResult(await notificationService.listMySendLogs(ctx, input))
      ),

    sendTest: adminProcedure
      .input(notificationSendTestInputSchema)
      .output(notificationSendTestOutputSchema)
      .mutation(async ({ ctx, input }) =>
        handleTRPCResult(await notificationService.sendTestAsAdmin(ctx, input))
      ),
  });
}
