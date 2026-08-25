import type {
  NotificationKind,
  NotificationPlatform,
  NotificationProvider,
  NotificationSendStatus,
} from "@m5kdev/commons/modules/notification/notification.constants";
import { NOTIFICATION_DELIVER_JOB_NAME } from "@m5kdev/commons/modules/notification/notification.constants";
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
  readonly batchId: string;
  readonly userId: string;
}

export interface NotificationServiceOptions {
  deliveryTimeout?: number;
  notificationQueue?: string;
  kinds?: readonly NotificationKind[];
}

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
  { workflow: WorkflowService; auth: Pick<AuthService, "userEmit"> }
> {
  readonly deliverNotificationJob: FireAndForgetJobDefinition<NotificationServiceJobPayload>;
  private readonly kindsById: ReadonlyMap<string, NotificationKind>;

  constructor(
    repositories: { notification: NotificationRepository },
    services: { workflow: WorkflowService; auth: Pick<AuthService, "userEmit"> },
    grants: ResourceGrant[],
    options?: NotificationServiceOptions
  ) {
    super(repositories, services, grants);

    this.kindsById = new Map((options?.kinds ?? []).map((kind) => [kind.id, kind]));

    this.deliverNotificationJob = this.service.workflow
      .job<NotificationServiceJobPayload>({
        name: NOTIFICATION_DELIVER_JOB_NAME,
        ...(options?.notificationQueue ? { queue: options.notificationQueue } : {}),
        timeout: options?.deliveryTimeout ?? 60_000,
        id: (p) => p.batchId,
        meta: (p) => ({ userId: p.userId }),
      })
      .handle(async (payload) => {
        await this.deliverBatch(payload);
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
      userId: string;
      deviceId: string;
      provider: NotificationProvider;
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
  }): ServerResultAsync<NotificationInstanceRow> {
    const kind = this.kindsById.get(input.kind);
    if (!kind) {
      return this.error("BAD_REQUEST", "Unknown Notification kind");
    }

    const visibleInInbox = kind.defaultChannels.includes("in-app");

    const inserted = await this.repository.notification.insertNotification({
      userId: input.userId,
      kind: kind.id,
      title: input.title,
      body: input.body,
      data: input.data ?? null,
      visibleInInbox,
    });
    if (inserted.isErr()) return err(inserted.error);

    this.service.auth.userEmit({
      userId: input.userId,
      resource: "notification",
      id: inserted.value.id,
      change: "created",
      organizationId: null,
    });

    return ok(inserted.value);
  }

  async listMyInbox(ctx: Context): ServerResultAsync<NotificationInstanceRow[]> {
    const readGuard = this.accessGuard(ctx.actor, "read", { userId: ctx.actor.userId });
    if (readGuard.isErr()) return err(readGuard.error);

    return this.repository.notification.listVisibleInboxByUserId(ctx.actor.userId);
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

  async enqueueSendToUser(input: {
    userId: string;
    title: string;
    body: string;
    data?: Record<string, unknown> | null;
  }): ServerResultAsync<{ batchId: string; jobId: string }> {
    const devices = await this.repository.notification.listEnabledDevicesForUser(input.userId);
    if (devices.isErr()) return err(devices.error);
    if (devices.value.length === 0) {
      return this.error("BAD_REQUEST", "No enabled notification devices for user");
    }

    const batchId = uuidv4();

    const insert = await this.repository.notification.insertSendLogs(
      devices.value.map((d) => ({
        batchId,
        userId: input.userId,
        deviceId: d.id,
        provider: platformToProvider(d.platform),
        title: input.title,
        body: input.body,
        data: input.data ?? null,
        status: "pending",
      }))
    );
    if (insert.isErr()) return err(insert.error);

    const jobId = batchId;
    const patchJob = await this.repository.notification.updateSendLogJobIdForBatch(batchId, jobId);
    if (patchJob.isErr()) return err(patchJob.error);

    try {
      await this.deliverNotificationJob.trigger({
        batchId,
        userId: input.userId,
      });
    } catch (cause) {
      const rollback = await this.repository.notification.clearSendLogJobIdForBatch(batchId, jobId);
      if (rollback.isErr()) {
        this.logger.error(
          { err: rollback.error, batchId, jobId },
          "Failed to clear send log jobId after notification enqueue failure"
        );
      }
      return this.error("INTERNAL_SERVER_ERROR", "Failed to enqueue notification delivery job", {
        cause,
      });
    }

    return ok({ batchId, jobId });
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

  private async deliverBatch(payload: NotificationServiceJobPayload): Promise<void> {
    const logs = await this.repository.notification.listPendingLogsByBatch(payload.batchId);
    if (logs.isErr()) {
      throw new Error(logs.error.message);
    }

    for (const log of logs.value) {
      const deviceRow = await this.repository.notification.getDeviceById(log.deviceId);
      if (deviceRow.isErr()) {
        throw new Error(deviceRow.error.message);
      }
      const device = deviceRow.value;
      if (!device) {
        await this.repository.notification.updateSendLogResult(log.id, {
          status: "failed",
          error: "Device not found",
        });
        continue;
      }
      if (!device.enabled) {
        await this.repository.notification.updateSendLogResult(log.id, {
          status: "failed",
          error: "Device disabled",
        });
        continue;
      }

      const payloadBody = { title: log.title, body: log.body, data: log.data };

      try {
        if (log.provider === "web") {
          if (!device.subscription || typeof device.subscription !== "object") {
            throw new Error("Invalid web subscription");
          }
          const sub = device.subscription as {
            endpoint: string;
            keys: { p256dh: string; auth: string };
          };
          await sendWebPushNotification(sub, JSON.stringify(payloadBody));
        } else if (log.provider === "apn") {
          if (!device.token) throw new Error("Missing APNs device token");
          await sendApnNotification(
            device.token,
            { title: log.title, body: log.body },
            {
              ...payloadBody,
            }
          );
        } else {
          if (!device.token) throw new Error("Missing FCM token");
          await sendFcmNotification(
            device.token,
            { title: log.title, body: log.body },
            fcmDataStrings(log.data)
          );
        }

        const okUpdate = await this.repository.notification.updateSendLogResult(log.id, {
          status: "sent",
          error: null,
        });
        if (okUpdate.isErr()) {
          this.logger.error(
            {
              err: okUpdate.error,
              logId: log.id,
              batchId: payload.batchId,
              deviceId: log.deviceId,
            },
            "Notification was sent but updating send log to sent failed — not retrying send"
          );
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const failUpdate = await this.repository.notification.updateSendLogResult(log.id, {
          status: "failed",
          error: message,
        });
        if (failUpdate.isErr()) throw new Error(failUpdate.error.message);

        if (providerForPermanentTokenFailure(log.provider, e)) {
          const disable = await this.repository.notification.setDeviceEnabled(device.id, false);
          if (disable.isErr()) throw new Error(disable.error.message);
        }
      }
    }
  }
}
