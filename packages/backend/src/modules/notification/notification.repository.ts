import type {
  NotificationPlatform,
  NotificationProvider,
  NotificationSendStatus,
} from "@m5kdev/commons/modules/notification/notification.constants";
import { and, desc, eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { err, ok } from "neverthrow";
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
    const now = new Date();
    const rowResult = await this.throwableQuery(() =>
      this.orm
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
        .onConflictDoUpdate({
          target: this.schema.notificationDevices.endpoint,
          set: {
            userId: input.userId,
            subscription: input.subscription,
            label: input.label,
            enabled: true,
            updatedAt: now,
          },
        })
        .returning()
    );
    if (rowResult.isErr()) return err(rowResult.error);
    const [row] = rowResult.value;
    return ok(row as NotificationDeviceRow);
  }

  async upsertNativeDevice(input: {
    userId: string;
    platform: "ios" | "android";
    token: string;
    label: string | null;
  }): ServerResultAsync<NotificationDeviceRow> {
    const now = new Date();
    const rowResult = await this.throwableQuery(() =>
      this.orm
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
        .onConflictDoUpdate({
          target: this.schema.notificationDevices.token,
          set: {
            userId: input.userId,
            platform: input.platform,
            label: input.label,
            enabled: true,
            updatedAt: now,
          },
        })
        .returning()
    );
    if (rowResult.isErr()) return err(rowResult.error);
    const [row] = rowResult.value;
    return ok(row as NotificationDeviceRow);
  }

  async listDevicesByUserId(userId: string): ServerResultAsync<NotificationDeviceRow[]> {
    const rowsResult = await this.throwableQuery(() =>
      this.orm
        .select()
        .from(this.schema.notificationDevices)
        .where(eq(this.schema.notificationDevices.userId, userId))
        .orderBy(desc(this.schema.notificationDevices.createdAt))
    );
    if (rowsResult.isErr()) return err(rowsResult.error);
    return ok(rowsResult.value as NotificationDeviceRow[]);
  }

  async listEnabledDevicesForUser(userId: string): ServerResultAsync<NotificationDeviceRow[]> {
    const rowsResult = await this.throwableQuery(() =>
      this.orm
        .select()
        .from(this.schema.notificationDevices)
        .where(
          and(
            eq(this.schema.notificationDevices.userId, userId),
            eq(this.schema.notificationDevices.enabled, true)
          )
        )
    );
    if (rowsResult.isErr()) return err(rowsResult.error);
    return ok(rowsResult.value as NotificationDeviceRow[]);
  }

  async getDeviceOwnedByUser(
    deviceId: string,
    userId: string
  ): ServerResultAsync<NotificationDeviceRow | undefined> {
    const rowResult = await this.throwableQuery(() =>
      this.orm
        .select()
        .from(this.schema.notificationDevices)
        .where(
          and(
            eq(this.schema.notificationDevices.id, deviceId),
            eq(this.schema.notificationDevices.userId, userId)
          )
        )
        .limit(1)
    );
    if (rowResult.isErr()) return err(rowResult.error);
    const [row] = rowResult.value;
    return ok(row as NotificationDeviceRow | undefined);
  }

  async getDeviceById(deviceId: string): ServerResultAsync<NotificationDeviceRow | undefined> {
    const rowResult = await this.throwableQuery(() =>
      this.orm
        .select()
        .from(this.schema.notificationDevices)
        .where(eq(this.schema.notificationDevices.id, deviceId))
        .limit(1)
    );
    if (rowResult.isErr()) return err(rowResult.error);
    const [row] = rowResult.value;
    return ok(row as NotificationDeviceRow | undefined);
  }

  async setDeviceEnabled(deviceId: string, enabled: boolean): ServerResultAsync<void> {
    const updateResult = await this.throwableQuery(() =>
      this.orm
        .update(this.schema.notificationDevices)
        .set({ enabled, updatedAt: new Date() })
        .where(eq(this.schema.notificationDevices.id, deviceId))
    );
    if (updateResult.isErr()) return err(updateResult.error);
    return ok();
  }

  async deleteDeviceOwnedByUser(deviceId: string, userId: string): ServerResultAsync<boolean> {
    const removedResult = await this.throwableQuery(() =>
      this.orm
        .delete(this.schema.notificationDevices)
        .where(
          and(
            eq(this.schema.notificationDevices.id, deviceId),
            eq(this.schema.notificationDevices.userId, userId)
          )
        )
        .returning({ id: this.schema.notificationDevices.id })
    );
    if (removedResult.isErr()) return err(removedResult.error);
    return ok(removedResult.value.length > 0);
  }

  async insertSendLogs(rows: InsertSendLogRow[]): ServerResultAsync<void> {
    if (rows.length === 0) return ok();
    const now = new Date();
    const insertResult = await this.throwableQuery(() =>
      this.orm.insert(this.schema.notificationSendLogs).values(
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
      )
    );
    if (insertResult.isErr()) return err(insertResult.error);
    return ok();
  }

  async updateSendLogJobIdForBatch(batchId: string, jobId: string): ServerResultAsync<void> {
    const updateResult = await this.throwableQuery(() =>
      this.orm
        .update(this.schema.notificationSendLogs)
        .set({ jobId, updatedAt: new Date() })
        .where(eq(this.schema.notificationSendLogs.batchId, batchId))
    );
    if (updateResult.isErr()) return err(updateResult.error);
    return ok();
  }

  /** Clears jobId for send logs in a batch when enqueue failed after the job id was persisted. */
  async clearSendLogJobIdForBatch(batchId: string, jobId: string): ServerResultAsync<void> {
    const updateResult = await this.throwableQuery(() =>
      this.orm
        .update(this.schema.notificationSendLogs)
        .set({ jobId: null, updatedAt: new Date() })
        .where(
          and(
            eq(this.schema.notificationSendLogs.batchId, batchId),
            eq(this.schema.notificationSendLogs.jobId, jobId)
          )
        )
    );
    if (updateResult.isErr()) return err(updateResult.error);
    return ok();
  }

  async updateSendLogResult(
    logId: string,
    patch: { status: NotificationSendStatus; error: string | null }
  ): ServerResultAsync<void> {
    const updateResult = await this.throwableQuery(() =>
      this.orm
        .update(this.schema.notificationSendLogs)
        .set({
          status: patch.status,
          error: patch.error,
          updatedAt: new Date(),
        })
        .where(eq(this.schema.notificationSendLogs.id, logId))
    );
    if (updateResult.isErr()) return err(updateResult.error);
    return ok();
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
    const rowsResult = await this.throwableQuery(() =>
      this.orm
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
        )
    );
    if (rowsResult.isErr()) return err(rowsResult.error);
    return ok(rowsResult.value);
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
    const conditions = [eq(this.schema.notificationSendLogs.userId, input.userId)];
    if (input.batchId) {
      conditions.push(eq(this.schema.notificationSendLogs.batchId, input.batchId));
    }
    const rowsResult = await this.throwableQuery(() =>
      this.orm
        .select()
        .from(this.schema.notificationSendLogs)
        .where(and(...conditions))
        .orderBy(desc(this.schema.notificationSendLogs.createdAt))
        .limit(input.limit)
    );
    if (rowsResult.isErr()) return err(rowsResult.error);
    return ok(rowsResult.value);
  }
}
