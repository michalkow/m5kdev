import type {
  NotificationChannel,
  NotificationKind,
  NotificationPlatform,
  NotificationProvider,
  NotificationSendStatus,
} from "@m5kdev/commons/modules/notification/notification.constants";
import type { NotificationRegisterDeviceInput } from "@m5kdev/commons/modules/notification/notification.schema";
import { err, ok } from "neverthrow";
import { v4 as uuidv4 } from "uuid";
import type { Context } from "../../utils/trpc";
import type { AuthService } from "../auth/auth.service";
import type { ServerResultAsync } from "../base/base.dto";
import type { ResourceGrant } from "../base/base.grants";
import { BasePermissionService } from "../base/base.service";
import type { WorkflowService } from "../workflow/workflow.service";
import type { FireAndForgetJobDefinition } from "../workflow/workflow.types";
import {
  providerForPermanentTokenFailure,
  readVapidPublicKey,
  sendApnNotification,
  sendFcmNotification,
  sendWebPushNotification,
} from "./notification.providers";
import type { NotificationInstanceRow, NotificationRepository } from "./notification.repository";

export interface NotificationServiceJobPayload {
  readonly notificationId: string;
}

export interface NotificationEmailSender {
  sendTemplate(
    to: string,
    templateKey: string,
    templateProps: Record<string, unknown>
  ): ServerResultAsync<unknown>;
}

export interface NotificationServiceOptions {
  deliveryTimeout?: number;
  notificationQueue?: string;
  kinds?: readonly NotificationKind[];
}

const NOTIFICATION_WEB_PUSH_JOB_NAME = "notification.webPush";
const NOTIFICATION_MOBILE_PUSH_JOB_NAME = "notification.mobilePush";
const NOTIFICATION_EMAIL_JOB_NAME = "notification.email";
const NOTIFICATION_DEFAULT_WEB_PUSH_DELAY_MS = 2 * 60 * 1000;
const NOTIFICATION_DEFAULT_MOBILE_PUSH_DELAY_MS = 5 * 60 * 1000;
const NOTIFICATION_DEFAULT_EMAIL_DELAY_MS = 15 * 60 * 1000;

function platformToProvider(platform: NotificationPlatform): NotificationProvider {
  if (platform === "web") return "web";
  if (platform === "ios") return "apn";
  return "fcm";
}

function fcmDataStrings(data: Record<string, unknown> | null): Record<string, string> {
  if (!data) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

function maskEndpoint(endpoint: string): string {
  try {
    const u = new URL(endpoint);
    return `${u.hostname.slice(0, 12)}…`;
  } catch {
    return "…";
  }
}

export class NotificationService extends BasePermissionService<
  { notification: NotificationRepository },
  {
    workflow: WorkflowService;
    auth: Pick<AuthService, "userEmit">;
    email?: NotificationEmailSender;
  }
> {
  readonly webPushJob: FireAndForgetJobDefinition<NotificationServiceJobPayload>;
  readonly mobilePushJob: FireAndForgetJobDefinition<NotificationServiceJobPayload>;
  readonly emailJob: FireAndForgetJobDefinition<NotificationServiceJobPayload>;
  private readonly kindsById: ReadonlyMap<string, NotificationKind>;

  constructor(
    repositories: { notification: NotificationRepository },
    services: {
      workflow: WorkflowService;
      auth: Pick<AuthService, "userEmit">;
      email?: NotificationEmailSender;
    },
    grants: ResourceGrant[],
    options?: NotificationServiceOptions
  ) {
    super(repositories, services, grants);

    this.kindsById = new Map((options?.kinds ?? []).map((kind) => [kind.id, kind]));

    this.webPushJob = this.service.workflow
      .job<NotificationServiceJobPayload>({
        name: NOTIFICATION_WEB_PUSH_JOB_NAME,
        ...(options?.notificationQueue ? { queue: options.notificationQueue } : {}),
        timeout: options?.deliveryTimeout ?? 60_000,
        id: (p) => `web:${p.notificationId}`,
      })
      .handle(async (payload) => {
        const result = await this.deliverWebPush(payload.notificationId);
        if (result.isErr()) throw new Error(result.error.message);
      });

    this.mobilePushJob = this.service.workflow
      .job<NotificationServiceJobPayload>({
        name: NOTIFICATION_MOBILE_PUSH_JOB_NAME,
        ...(options?.notificationQueue ? { queue: options.notificationQueue } : {}),
        timeout: options?.deliveryTimeout ?? 60_000,
        id: (p) => `mobile:${p.notificationId}`,
      })
      .handle(async (payload) => {
        const result = await this.deliverMobilePush(payload.notificationId);
        if (result.isErr()) throw new Error(result.error.message);
      });

    this.emailJob = this.service.workflow
      .job<NotificationServiceJobPayload>({
        name: NOTIFICATION_EMAIL_JOB_NAME,
        ...(options?.notificationQueue ? { queue: options.notificationQueue } : {}),
        timeout: options?.deliveryTimeout ?? 60_000,
        id: (p) => `email:${p.notificationId}`,
      })
      .handle(async (payload) => {
        const result = await this.deliverEmail(payload.notificationId);
        if (result.isErr()) throw new Error(result.error.message);
      });
  }

  async vapidPublicKey(): ServerResultAsync<{ publicKey: string }> {
    const publicKey = readVapidPublicKey();
    if (!publicKey) {
      return this.error(
        "PRECONDITION_FAILED",
        "Web push is not configured (missing VAPID_PUBLIC_KEY)"
      );
    }
    return ok({ publicKey });
  }

  async registerDevice(
    ctx: Context,
    input: NotificationRegisterDeviceInput
  ): ServerResultAsync<{ deviceId: string }> {
    const writeGuard = this.accessGuard(ctx.actor, "write", { userId: ctx.actor.userId });
    if (writeGuard.isErr()) return err(writeGuard.error);

    const userId = ctx.actor.userId;
    if (input.platform === "web") {
      const existing = await this.repository.notification.findDeviceByEndpoint(
        input.subscription.endpoint
      );
      if (existing.isErr()) return err(existing.error);
      if (existing.value && existing.value.userId !== userId) {
        return this.error("CONFLICT", "Device already registered to another User");
      }
      const row = await this.repository.notification.upsertWebDevice({
        userId,
        endpoint: input.subscription.endpoint,
        subscription: input.subscription as unknown as Record<string, unknown>,
        label: input.label ?? null,
      });
      if (row.isErr()) return err(row.error);
      return ok({ deviceId: row.value.id });
    }
    const existing = await this.repository.notification.findDeviceByToken(input.token);
    if (existing.isErr()) return err(existing.error);
    if (existing.value && existing.value.userId !== userId) {
      return this.error("CONFLICT", "Device already registered to another User");
    }
    const row = await this.repository.notification.upsertNativeDevice({
      userId,
      platform: input.platform,
      token: input.token,
      label: input.label ?? null,
    });
    if (row.isErr()) return err(row.error);
    return ok({ deviceId: row.value.id });
  }

  async unregisterDevice(ctx: Context, deviceId: string): ServerResultAsync<{ ok: true }> {
    const deleteGuard = this.accessGuard(ctx.actor, "delete", { userId: ctx.actor.userId });
    if (deleteGuard.isErr()) return err(deleteGuard.error);

    const removed = await this.repository.notification.deleteDeviceOwnedByUser(
      deviceId,
      ctx.actor.userId
    );
    if (removed.isErr()) return err(removed.error);
    if (!removed.value) return this.error("NOT_FOUND", "Device not found");
    return ok({ ok: true });
  }

  async listMyDevices(ctx: Context): ServerResultAsync<
    {
      id: string;
      userId: string;
      platform: NotificationPlatform;
      endpoint: string | null;
      label: string | null;
      enabled: boolean;
      createdAt: Date;
      updatedAt: Date;
    }[]
  > {
    const readGuard = this.accessGuard(ctx.actor, "read", { userId: ctx.actor.userId });
    if (readGuard.isErr()) return err(readGuard.error);

    const rows = await this.repository.notification.listDevicesByUserId(ctx.actor.userId);
    if (rows.isErr()) return err(rows.error);
    return ok(
      rows.value.map((r) => ({
        id: r.id,
        userId: r.userId,
        platform: r.platform,
        endpoint: r.platform === "web" && r.endpoint ? maskEndpoint(r.endpoint) : null,
        label: r.label,
        enabled: r.enabled,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }))
    );
  }

  async listMySendLogs(
    ctx: Context,
    input?: { batchId?: string; limit?: number }
  ): ServerResultAsync<
    {
      id: string;
      batchId: string;
      notificationId: string;
      userId: string;
      deviceId: string | null;
      channel: NotificationChannel;
      provider: NotificationProvider | null;
      title: string;
      body: string;
      data: Record<string, unknown> | null;
      status: NotificationSendStatus;
      error: string | null;
      jobId: string | null;
      createdAt: Date;
      updatedAt: Date;
    }[]
  > {
    const readGuard = this.accessGuard(ctx.actor, "read", { userId: ctx.actor.userId });
    if (readGuard.isErr()) return err(readGuard.error);

    return this.repository.notification.listSendLogsForUser({
      userId: ctx.actor.userId,
      batchId: input?.batchId,
      limit: input?.limit ?? 50,
    });
  }

  async send(input: {
    userId: string;
    kind: string;
    title: string;
    body: string;
    data?: Record<string, unknown> | null;
    channels?: readonly NotificationChannel[];
  }): ServerResultAsync<NotificationInstanceRow> {
    const kind = this.kindsById.get(input.kind);
    if (!kind) {
      return this.error("BAD_REQUEST", "Unknown Notification kind");
    }

    const muted = await this.repository.notification.listMutedPreferencesByUserId(input.userId);
    if (muted.isErr()) return err(muted.error);
    const mutedSet = new Set(
      muted.value.filter((row) => row.kind === kind.id).map((row) => row.channel)
    );
    const offered = kind.defaultChannels;
    const requested = input.channels ?? offered;
    const armed = requested.filter(
      (channel) => offered.includes(channel) && !mutedSet.has(channel)
    );
    const visibleInInbox = armed.includes("in-app");

    const inserted = await this.repository.notification.insertNotification({
      userId: input.userId,
      kind: kind.id,
      title: input.title,
      body: input.body,
      data: input.data ?? null,
      visibleInInbox,
      armedChannels: armed,
    });
    if (inserted.isErr()) return err(inserted.error);

    this.service.auth.userEmit({
      userId: input.userId,
      resource: "notification",
      id: inserted.value.id,
      change: "created",
      organizationId: null,
    });

    await this.enqueueArmedOutboundJobs(inserted.value.id, kind, armed);

    return ok(inserted.value);
  }

  async listMyInbox(ctx: Context): ServerResultAsync<NotificationInstanceRow[]> {
    const readGuard = this.accessGuard(ctx.actor, "read", { userId: ctx.actor.userId });
    if (readGuard.isErr()) return err(readGuard.error);

    return this.repository.notification.listVisibleInboxByUserId(ctx.actor.userId);
  }

  async getMyPreferences(ctx: Context): ServerResultAsync<
    {
      kind: string;
      channels: { channel: NotificationChannel; enabled: boolean }[];
    }[]
  > {
    const readGuard = this.accessGuard(ctx.actor, "read", { userId: ctx.actor.userId });
    if (readGuard.isErr()) return err(readGuard.error);

    const muted = await this.repository.notification.listMutedPreferencesByUserId(ctx.actor.userId);
    if (muted.isErr()) return err(muted.error);
    const mutedSet = new Set(muted.value.map((row) => `${row.kind}:${row.channel}`));

    return ok(
      [...this.kindsById.values()].map((kind) => ({
        kind: kind.id,
        channels: kind.defaultChannels.map((channel) => ({
          channel,
          enabled: !mutedSet.has(`${kind.id}:${channel}`),
        })),
      }))
    );
  }

  async setMyPreference(
    ctx: Context,
    input: { kind: string; channel: NotificationChannel; enabled: boolean }
  ): ServerResultAsync<{
    kind: string;
    channels: { channel: NotificationChannel; enabled: boolean }[];
  }> {
    const writeGuard = this.accessGuard(ctx.actor, "write", { userId: ctx.actor.userId });
    if (writeGuard.isErr()) return err(writeGuard.error);

    const kind = this.kindsById.get(input.kind);
    if (!kind) {
      return this.error("BAD_REQUEST", "Unknown Notification kind");
    }
    if (!kind.defaultChannels.includes(input.channel)) {
      return this.error("BAD_REQUEST", "Channel is not offered by this Notification kind");
    }

    const userId = ctx.actor.userId;
    if (input.enabled) {
      const cleared = await this.repository.notification.deleteMutedPreference({
        userId,
        kind: kind.id,
        channel: input.channel,
      });
      if (cleared.isErr()) return err(cleared.error);
    } else {
      const muted = await this.repository.notification.insertMutedPreference({
        userId,
        kind: kind.id,
        channel: input.channel,
      });
      if (muted.isErr()) return err(muted.error);
    }

    const listed = await this.getMyPreferences(ctx);
    if (listed.isErr()) return err(listed.error);
    const updated = listed.value.find((row) => row.kind === kind.id);
    if (!updated) {
      return this.error("INTERNAL_SERVER_ERROR", "Notification kind preference missing after save");
    }
    return ok(updated);
  }

  async markRead(ctx: Context, id: string): ServerResultAsync<NotificationInstanceRow> {
    const writeGuard = this.accessGuard(ctx.actor, "write", { userId: ctx.actor.userId });
    if (writeGuard.isErr()) return err(writeGuard.error);

    const updated = await this.repository.notification.markNotificationRead({
      id,
      userId: ctx.actor.userId,
    });
    if (updated.isErr()) return err(updated.error);
    if (!updated.value) return this.error("NOT_FOUND", "Notification not found");
    return ok(updated.value);
  }

  async sendTestAsAdmin(
    ctx: Context,
    input: {
      userId?: string;
      kind: string;
      title: string;
      body: string;
      data?: Record<string, unknown>;
    }
  ): ServerResultAsync<{ id: string }> {
    const userId = input.userId ?? ctx.actor.userId;
    const sent = await this.send({
      userId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      data: input.data ?? null,
    });
    if (sent.isErr()) return err(sent.error);
    return ok({ id: sent.value.id });
  }

  async deliverWebPush(notificationId: string): ServerResultAsync<void> {
    return this.deliverPushChannel({
      notificationId,
      channel: "web-push",
      platforms: ["web"],
      stamp: (id) => this.repository.notification.stampWebPushedAt(id),
    });
  }

  async deliverMobilePush(notificationId: string): ServerResultAsync<void> {
    return this.deliverPushChannel({
      notificationId,
      channel: "mobile-push",
      platforms: ["ios", "android"],
      stamp: (id) => this.repository.notification.stampMobilePushedAt(id),
    });
  }

  async deliverEmail(notificationId: string): ServerResultAsync<void> {
    const instance = await this.repository.notification.findNotificationById(notificationId);
    if (instance.isErr()) return err(instance.error);
    if (!instance.value) return ok();
    if (instance.value.readAt) return ok();
    if (!instance.value.armedChannels.includes("email")) return ok();

    const existing = await this.repository.notification.listSendLogsForNotificationChannel({
      notificationId,
      channel: "email",
    });
    if (existing.isErr()) return err(existing.error);
    if (existing.value.length > 0) return ok();

    const kind = this.kindsById.get(instance.value.kind);
    const fail = async (error: string): ServerResultAsync<void> => {
      const logged = await this.repository.notification.insertSendLogs([
        {
          batchId: uuidv4(),
          notificationId: instance.value.id,
          userId: instance.value.userId,
          deviceId: null,
          channel: "email",
          provider: null,
          title: instance.value.title,
          body: instance.value.body,
          data: instance.value.data,
          status: "failed",
          error,
        },
      ]);
      if (logged.isErr()) return err(logged.error);
      return ok();
    };

    if (!this.service.email) {
      return fail("EmailModule is not registered");
    }
    if (!kind?.emailTemplate) {
      return fail("Email template is not configured on this Notification kind");
    }
    const to = await this.repository.notification.findUserEmail(instance.value.userId);
    if (to.isErr()) return err(to.error);
    if (!to.value) {
      return fail("User email is missing");
    }

    try {
      const sent = await this.service.email.sendTemplate(to.value, kind.emailTemplate, {
        title: instance.value.title,
        body: instance.value.body,
        data: instance.value.data,
      });
      if (sent.isErr()) {
        return fail(sent.error.message);
      }
    } catch (cause) {
      return fail(cause instanceof Error ? cause.message : String(cause));
    }

    const logged = await this.repository.notification.insertSendLogs([
      {
        batchId: uuidv4(),
        notificationId: instance.value.id,
        userId: instance.value.userId,
        deviceId: null,
        channel: "email",
        provider: null,
        title: instance.value.title,
        body: instance.value.body,
        data: instance.value.data,
        status: "sent",
        error: null,
      },
    ]);
    if (logged.isErr()) return err(logged.error);
    return this.repository.notification.stampEmailedAt(instance.value.id);
  }

  private async enqueueArmedOutboundJobs(
    notificationId: string,
    kind: NotificationKind,
    armed: readonly NotificationChannel[]
  ): Promise<void> {
    if (armed.includes("web-push")) {
      try {
        await this.webPushJob.trigger(
          { notificationId },
          {
            jobOptions: {
              delay: kind.delays?.webPushMs ?? NOTIFICATION_DEFAULT_WEB_PUSH_DELAY_MS,
            },
          }
        );
      } catch (cause) {
        this.logger.error({ err: cause, notificationId }, "Failed to enqueue web push cascade");
      }
    }
    if (armed.includes("mobile-push")) {
      try {
        await this.mobilePushJob.trigger(
          { notificationId },
          {
            jobOptions: {
              delay: kind.delays?.mobilePushMs ?? NOTIFICATION_DEFAULT_MOBILE_PUSH_DELAY_MS,
            },
          }
        );
      } catch (cause) {
        this.logger.error({ err: cause, notificationId }, "Failed to enqueue mobile push cascade");
      }
    }
    if (armed.includes("email")) {
      try {
        await this.emailJob.trigger(
          { notificationId },
          {
            jobOptions: {
              delay: kind.delays?.emailMs ?? NOTIFICATION_DEFAULT_EMAIL_DELAY_MS,
            },
          }
        );
      } catch (cause) {
        this.logger.error({ err: cause, notificationId }, "Failed to enqueue email cascade");
      }
    }
  }

  private async deliverPushChannel(input: {
    notificationId: string;
    channel: Extract<NotificationChannel, "web-push" | "mobile-push">;
    platforms: readonly NotificationPlatform[];
    stamp: (id: string) => ServerResultAsync<void>;
  }): ServerResultAsync<void> {
    const instance = await this.repository.notification.findNotificationById(input.notificationId);
    if (instance.isErr()) return err(instance.error);
    if (!instance.value) return ok();
    if (instance.value.readAt) return ok();
    if (!instance.value.armedChannels.includes(input.channel)) return ok();

    const existing = await this.repository.notification.listSendLogsForNotificationChannel({
      notificationId: input.notificationId,
      channel: input.channel,
    });
    if (existing.isErr()) return err(existing.error);
    if (existing.value.length > 0) return ok();

    const devices = await this.repository.notification.listEnabledDevicesForUser(
      instance.value.userId
    );
    if (devices.isErr()) return err(devices.error);
    const channelDevices = devices.value.filter((device) =>
      input.platforms.includes(device.platform)
    );

    const batchId = uuidv4();
    if (channelDevices.length === 0) {
      const logged = await this.repository.notification.insertSendLogs([
        {
          batchId,
          notificationId: instance.value.id,
          userId: instance.value.userId,
          deviceId: null,
          channel: input.channel,
          provider: null,
          title: instance.value.title,
          body: instance.value.body,
          data: instance.value.data,
          status: "failed",
          error: "No enabled Device",
        },
      ]);
      if (logged.isErr()) return err(logged.error);
      return ok();
    }

    let anySent = false;
    for (const device of channelDevices) {
      const provider = platformToProvider(device.platform);
      try {
        await this.sendToDevice(device, instance.value);
        anySent = true;
        const logged = await this.repository.notification.insertSendLogs([
          {
            batchId,
            notificationId: instance.value.id,
            userId: instance.value.userId,
            deviceId: device.id,
            channel: input.channel,
            provider,
            title: instance.value.title,
            body: instance.value.body,
            data: instance.value.data,
            status: "sent",
            error: null,
          },
        ]);
        if (logged.isErr()) return err(logged.error);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        const logged = await this.repository.notification.insertSendLogs([
          {
            batchId,
            notificationId: instance.value.id,
            userId: instance.value.userId,
            deviceId: device.id,
            channel: input.channel,
            provider,
            title: instance.value.title,
            body: instance.value.body,
            data: instance.value.data,
            status: "failed",
            error: message,
          },
        ]);
        if (logged.isErr()) return err(logged.error);
        if (providerForPermanentTokenFailure(provider, cause)) {
          const disable = await this.repository.notification.setDeviceEnabled(device.id, false);
          if (disable.isErr()) return err(disable.error);
        }
      }
    }

    if (anySent) {
      const stamped = await input.stamp(instance.value.id);
      if (stamped.isErr()) return err(stamped.error);
    }
    return ok();
  }

  private async sendToDevice(
    device: {
      platform: NotificationPlatform;
      subscription: Record<string, unknown> | null;
      token: string | null;
    },
    instance: NotificationInstanceRow
  ): Promise<void> {
    const payloadBody = { title: instance.title, body: instance.body, data: instance.data };
    if (device.platform === "web") {
      if (!device.subscription || typeof device.subscription !== "object") {
        throw new Error("Invalid web subscription");
      }
      const sub = device.subscription as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
      await sendWebPushNotification(sub, JSON.stringify(payloadBody));
      return;
    }
    if (device.platform === "ios") {
      if (!device.token) throw new Error("Missing APNs device token");
      await sendApnNotification(
        device.token,
        { title: instance.title, body: instance.body },
        {
          ...payloadBody,
        }
      );
      return;
    }
    if (!device.token) throw new Error("Missing FCM token");
    await sendFcmNotification(
      device.token,
      { title: instance.title, body: instance.body },
      fcmDataStrings(instance.data)
    );
  }
}
