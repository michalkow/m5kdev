import {
  notificationInstanceSelectSchema,
  notificationListDevicesOutputSchema,
  notificationListInboxOutputSchema,
  notificationListPreferencesOutputSchema,
  notificationListSendLogsInputSchema,
  notificationListSendLogsOutputSchema,
  notificationMarkReadInputSchema,
  notificationRegisterDeviceInputSchema,
  notificationRegisterDeviceOutputSchema,
  notificationSendTestInputSchema,
  notificationSendTestOutputSchema,
  notificationSetPreferenceInputSchema,
  notificationSetPreferenceOutputSchema,
  notificationUnregisterDeviceInputSchema,
  notificationUnregisterDeviceOutputSchema,
  notificationVapidPublicKeyOutputSchema,
} from "@m5kdev/commons/modules/notification/notification.schema";
import { handleTRPCResult, type TRPCMethods } from "../../utils/trpc";
import type { NotificationService } from "./notification.service";

export function createNotificationTRPC(
  { router, publicProcedure, privateProcedure, organizationProcedure, adminProcedure }: TRPCMethods,
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

    listMyInbox: organizationProcedure
      .output(notificationListInboxOutputSchema)
      .query(async ({ ctx }) => handleTRPCResult(await notificationService.listMyInbox(ctx))),

    getMyPreferences: organizationProcedure
      .output(notificationListPreferencesOutputSchema)
      .query(async ({ ctx }) => handleTRPCResult(await notificationService.getMyPreferences(ctx))),

    setMyPreference: organizationProcedure
      .input(notificationSetPreferenceInputSchema)
      .output(notificationSetPreferenceOutputSchema)
      .mutation(async ({ ctx, input }) =>
        handleTRPCResult(await notificationService.setMyPreference(ctx, input))
      ),

    markRead: organizationProcedure
      .input(notificationMarkReadInputSchema)
      .output(notificationInstanceSelectSchema)
      .mutation(async ({ ctx, input }) =>
        handleTRPCResult(await notificationService.markRead(ctx, input.id))
      ),

    listMySendLogs: privateProcedure
      .input(notificationListSendLogsInputSchema)
      .output(notificationListSendLogsOutputSchema)
      .query(async ({ ctx, input }) =>
        handleTRPCResult(await notificationService.listMySendLogs(ctx, input))
      ),

    sendTest: adminProcedure
      .input(notificationSendTestInputSchema)
      .output(notificationSendTestOutputSchema)
      .mutation(async ({ input }) =>
        handleTRPCResult(await notificationService.sendTestAsAdmin(input))
      ),
  });
}
