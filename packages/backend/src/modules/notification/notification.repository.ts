import type {
  NotificationPlatform,
  NotificationProvider,
  NotificationSendStatus,
} from "@m5kdev/commons/modules/notification/notification.constants";
import { and, desc, eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { ok } from "neverthrow";
import type { ServerResultAsync } from "../base/base.dto";
import { BaseRepository } from "../base/base.repository";
import { notificationDevices, notificationSendLogs } from "./notification.db";

const schema = { notificationDevices, notificationSendLogs };
type Schema = typeof schema;
type Orm = LibSQLDatabase<Schema>;

export interface NotificationDeviceRow {
  readonly id: string;
  readonly userId: string;
  readonly platform: NotificationPlatform;
  readonly endpoint: string | null;
  readonly subscription: Record<string, unknown> | null;
  readonly token: string | null;
  readonly label: string | null;
  readonly enabled: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface InsertSendLogRow {
  readonly batchId: string;
  readonly userId: string;
  readonly deviceId: string;
  readonly provider: NotificationProvider;
  readonly title: string;
  readonly body: string;
  readonly data: Record<string, unknown> | null;
  readonly status: NotificationSendStatus;
}

export class NotificationRepository extends BaseRepository<Orm, Schema, Record<string, never>> {
  async upsertWebDevice(input: {
    userId: string;
    endpoint: string;
    subscription: Record<string, unknown>;
    label: string | null;
  }): ServerResultAsync<NotificationDeviceRow> {
    return this.throwableAsync(async () => {
      const existing = await this.orm
        .select()
        .from(this.schema.notificationDevices)
        .where(eq(this.schema.notificationDevices.endpoint, input.endpoint))
        .limit(1);

      const now = new Date();
      if (existing[0]) {
        await this.orm
          .update(this.schema.notificationDevices)
          .set({
            userId: input.userId,
            subscription: input.subscription,
            label: input.label,
            enabled: true,
            updatedAt: now,
          })
          .where(eq(this.schema.notificationDevices.id, existing[0].id));
        const [row] = await this.orm
          .select()
          .from(this.schema.notificationDevices)
          .where(eq(this.schema.notificationDevices.id, existing[0].id));
        return ok(row as NotificationDeviceRow);
      }

      const [inserted] = await this.orm
        .insert(this.schema.notificationDevices)
        .values({
          userId: input.userId,
          platform: "web",
          endpoint: input.endpoint,
          subscription: input.subscription,
          token: null,
          label: input.label,
          enabled: true,
          updatedAt: now,
        })
        .returning();

      return ok(inserted as NotificationDeviceRow);
    });
  }

  async upsertNativeDevice(input: {
    userId: string;
    platform: "ios" | "android";
    token: string;
    label: string | null;
  }): ServerResultAsync<NotificationDeviceRow> {
    return this.throwableAsync(async () => {
      const existing = await this.orm
        .select()
        .from(this.schema.notificationDevices)
        .where(eq(this.schema.notificationDevices.token, input.token))
        .limit(1);

      const now = new Date();
      if (existing[0]) {
        await this.orm
          .update(this.schema.notificationDevices)
          .set({
            userId: input.userId,
            platform: input.platform,
            label: input.label,
            enabled: true,
            updatedAt: now,
          })
          .where(eq(this.schema.notificationDevices.id, existing[0].id));
        const [row] = await this.orm
          .select()
          .from(this.schema.notificationDevices)
          .where(eq(this.schema.notificationDevices.id, existing[0].id));
        return ok(row as NotificationDeviceRow);
      }

      const [inserted] = await this.orm
        .insert(this.schema.notificationDevices)
        .values({
          userId: input.userId,
          platform: input.platform,
          endpoint: null,
          subscription: null,
          token: input.token,
          label: input.label,
          enabled: true,
          updatedAt: now,
        })
        .returning();

      return ok(inserted as NotificationDeviceRow);
    });
  }

  async listDevicesByUserId(userId: string): ServerResultAsync<NotificationDeviceRow[]> {
    return this.throwableAsync(async () => {
      const rows = await this.orm
        .select()
        .from(this.schema.notificationDevices)
        .where(eq(this.schema.notificationDevices.userId, userId))
        .orderBy(desc(this.schema.notificationDevices.createdAt));
      return ok(rows as NotificationDeviceRow[]);
    });
  }

  async listEnabledDevicesForUser(userId: string): ServerResultAsync<NotificationDeviceRow[]> {
    return this.throwableAsync(async () => {
      const rows = await this.orm
        .select()
        .from(this.schema.notificationDevices)
        .where(
          and(
            eq(this.schema.notificationDevices.userId, userId),
            eq(this.schema.notificationDevices.enabled, true)
          )
        );
      return ok(rows as NotificationDeviceRow[]);
    });
  }

  async getDeviceOwnedByUser(
    deviceId: string,
    userId: string
  ): ServerResultAsync<NotificationDeviceRow | undefined> {
    return this.throwableAsync(async () => {
      const [row] = await this.orm
        .select()
        .from(this.schema.notificationDevices)
        .where(
          and(
            eq(this.schema.notificationDevices.id, deviceId),
            eq(this.schema.notificationDevices.userId, userId)
          )
        )
        .limit(1);
      return ok(row as NotificationDeviceRow | undefined);
    });
  }

  async getDeviceById(deviceId: string): ServerResultAsync<NotificationDeviceRow | undefined> {
    return this.throwableAsync(async () => {
      const [row] = await this.orm
        .select()
        .from(this.schema.notificationDevices)
        .where(eq(this.schema.notificationDevices.id, deviceId))
        .limit(1);
      return ok(row as NotificationDeviceRow | undefined);
    });
  }

  async setDeviceEnabled(deviceId: string, enabled: boolean): ServerResultAsync<void> {
    return this.throwableAsync(async () => {
      await this.orm
        .update(this.schema.notificationDevices)
        .set({ enabled, updatedAt: new Date() })
        .where(eq(this.schema.notificationDevices.id, deviceId));
      return ok();
    });
  }

  async deleteDeviceOwnedByUser(deviceId: string, userId: string): ServerResultAsync<boolean> {
    return this.throwableAsync(async () => {
      const removed = await this.orm
        .delete(this.schema.notificationDevices)
        .where(
          and(
            eq(this.schema.notificationDevices.id, deviceId),
            eq(this.schema.notificationDevices.userId, userId)
          )
        )
        .returning({ id: this.schema.notificationDevices.id });
      return ok(removed.length > 0);
    });
  }

  async insertSendLogs(rows: InsertSendLogRow[]): ServerResultAsync<void> {
    return this.throwableAsync(async () => {
      if (rows.length === 0) return ok();
      const now = new Date();
      await this.orm.insert(this.schema.notificationSendLogs).values(
        rows.map((r) => ({
          batchId: r.batchId,
          userId: r.userId,
          deviceId: r.deviceId,
          provider: r.provider,
          title: r.title,
          body: r.body,
          data: r.data,
          status: r.status,
          error: null,
          jobId: null,
          updatedAt: now,
        }))
      );
      return ok();
    });
  }

  async updateSendLogJobIdForBatch(batchId: string, jobId: string): ServerResultAsync<void> {
    return this.throwableAsync(async () => {
      await this.orm
        .update(this.schema.notificationSendLogs)
        .set({ jobId, updatedAt: new Date() })
        .where(eq(this.schema.notificationSendLogs.batchId, batchId));
      return ok();
    });
  }

  async updateSendLogResult(
    logId: string,
    patch: { status: NotificationSendStatus; error: string | null }
  ): ServerResultAsync<void> {
    return this.throwableAsync(async () => {
      await this.orm
        .update(this.schema.notificationSendLogs)
        .set({
          status: patch.status,
          error: patch.error,
          updatedAt: new Date(),
        })
        .where(eq(this.schema.notificationSendLogs.id, logId));
      return ok();
    });
  }

  async listPendingLogsByBatch(batchId: string): ServerResultAsync<
    {
      id: string;
      deviceId: string;
      provider: NotificationProvider;
      title: string;
      body: string;
      data: Record<string, unknown> | null;
      userId: string;
    }[]
  > {
    return this.throwableAsync(async () => {
      const rows = await this.orm
        .select({
          id: this.schema.notificationSendLogs.id,
          deviceId: this.schema.notificationSendLogs.deviceId,
          provider: this.schema.notificationSendLogs.provider,
          title: this.schema.notificationSendLogs.title,
          body: this.schema.notificationSendLogs.body,
          data: this.schema.notificationSendLogs.data,
          userId: this.schema.notificationSendLogs.userId,
        })
        .from(this.schema.notificationSendLogs)
        .where(
          and(
            eq(this.schema.notificationSendLogs.batchId, batchId),
            eq(this.schema.notificationSendLogs.status, "pending")
          )
        );
      return ok(rows);
    });
  }

  async listSendLogsForUser(input: {
    userId: string;
    batchId?: string;
    limit: number;
  }): ServerResultAsync<
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
    return this.throwableAsync(async () => {
      const conditions = [eq(this.schema.notificationSendLogs.userId, input.userId)];
      if (input.batchId) {
        conditions.push(eq(this.schema.notificationSendLogs.batchId, input.batchId));
      }
      const rows = await this.orm
        .select()
        .from(this.schema.notificationSendLogs)
        .where(and(...conditions))
        .orderBy(desc(this.schema.notificationSendLogs.createdAt))
        .limit(input.limit);
      return ok(rows);
    });
  }
}
