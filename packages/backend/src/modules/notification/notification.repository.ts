import type {
  NotificationChannel,
  NotificationPlatform,
  NotificationProvider,
  NotificationSendStatus,
} from "@m5kdev/commons/modules/notification/notification.constants";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { err, ok } from "neverthrow";
import { members, users } from "../auth/auth.db";
import type { ServerResultAsync } from "../base/base.dto";
import { BaseRepository } from "../base/base.repository";
import {
  notificationDevices,
  notificationPreferences,
  notificationSendLogs,
  notifications,
} from "./notification.db";

const schema = {
  notifications,
  notificationDevices,
  notificationPreferences,
  notificationSendLogs,
  users,
  members,
};
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

export interface NotificationMembershipRow {
  readonly id: string;
  readonly userId: string;
  readonly organizationId: string;
}

export interface NotificationInstanceRow {
  readonly id: string;
  readonly memberId: string;
  readonly userId: string;
  readonly kind: string;
  readonly title: string;
  readonly body: string;
  readonly data: Record<string, unknown> | null;
  readonly visibleInInbox: boolean;
  readonly armedChannels: readonly NotificationChannel[];
  readonly webPushedAt: Date | null;
  readonly mobilePushedAt: Date | null;
  readonly emailedAt: Date | null;
  readonly readAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface InsertSendLogRow {
  readonly batchId: string;
  readonly notificationId: string;
  readonly userId: string;
  readonly deviceId: string | null;
  readonly channel: NotificationChannel;
  readonly provider: NotificationProvider | null;
  readonly title: string;
  readonly body: string;
  readonly data: Record<string, unknown> | null;
  readonly status: NotificationSendStatus;
  readonly error: string | null;
}

export class NotificationRepository extends BaseRepository<Orm, Schema, Record<string, never>> {
  async findActiveMembership(
    memberId: string
  ): ServerResultAsync<NotificationMembershipRow | undefined> {
    const rowResult = await this.throwableQuery(() =>
      this.orm
        .select({
          id: this.schema.members.id,
          userId: this.schema.members.userId,
          organizationId: this.schema.members.organizationId,
        })
        .from(this.schema.members)
        .where(
          and(
            eq(this.schema.members.id, memberId),
            isNull(this.schema.members.deletedAt),
            isNotNull(this.schema.members.userId)
          )
        )
        .limit(1)
    );
    if (rowResult.isErr()) return err(rowResult.error);
    const [row] = rowResult.value;
    if (!row?.userId) return ok(undefined);
    return ok({
      id: row.id,
      userId: row.userId,
      organizationId: row.organizationId,
    });
  }

  async insertNotification(input: {
    memberId: string;
    userId: string;
    kind: string;
    title: string;
    body: string;
    data: Record<string, unknown> | null;
    visibleInInbox: boolean;
    armedChannels: readonly NotificationChannel[];
  }): ServerResultAsync<NotificationInstanceRow> {
    const now = new Date();
    const rowResult = await this.throwableQuery(() =>
      this.orm
        .insert(this.schema.notifications)
        .values({
          memberId: input.memberId,
          userId: input.userId,
          kind: input.kind,
          title: input.title,
          body: input.body,
          data: input.data,
          visibleInInbox: input.visibleInInbox,
          armedChannels: [...input.armedChannels],
          webPushedAt: null,
          mobilePushedAt: null,
          emailedAt: null,
          readAt: null,
          updatedAt: now,
        })
        .returning()
    );
    if (rowResult.isErr()) return err(rowResult.error);
    const [row] = rowResult.value;
    return ok(row as NotificationInstanceRow);
  }

  async listVisibleInboxByMemberId(memberId: string): ServerResultAsync<NotificationInstanceRow[]> {
    const rowsResult = await this.throwableQuery(() =>
      this.orm
        .select()
        .from(this.schema.notifications)
        .where(
          and(
            eq(this.schema.notifications.memberId, memberId),
            eq(this.schema.notifications.visibleInInbox, true)
          )
        )
        .orderBy(desc(this.schema.notifications.createdAt))
    );
    if (rowsResult.isErr()) return err(rowsResult.error);
    return ok(rowsResult.value as NotificationInstanceRow[]);
  }

  async markNotificationRead(input: {
    id: string;
    memberId: string;
  }): ServerResultAsync<NotificationInstanceRow | undefined> {
    const now = new Date();
    const rowResult = await this.throwableQuery(() =>
      this.orm
        .update(this.schema.notifications)
        .set({ readAt: now, updatedAt: now })
        .where(
          and(
            eq(this.schema.notifications.id, input.id),
            eq(this.schema.notifications.memberId, input.memberId),
            eq(this.schema.notifications.visibleInInbox, true)
          )
        )
        .returning()
    );
    if (rowResult.isErr()) return err(rowResult.error);
    const [row] = rowResult.value;
    return ok(row as NotificationInstanceRow | undefined);
  }

  async findNotificationById(id: string): ServerResultAsync<NotificationInstanceRow | undefined> {
    const rowResult = await this.throwableQuery(() =>
      this.orm
        .select()
        .from(this.schema.notifications)
        .where(eq(this.schema.notifications.id, id))
        .limit(1)
    );
    if (rowResult.isErr()) return err(rowResult.error);
    const [row] = rowResult.value;
    return ok(row as NotificationInstanceRow | undefined);
  }

  async stampWebPushedAt(id: string): ServerResultAsync<void> {
    const now = new Date();
    const updateResult = await this.throwableQuery(() =>
      this.orm
        .update(this.schema.notifications)
        .set({ webPushedAt: now, updatedAt: now })
        .where(eq(this.schema.notifications.id, id))
    );
    if (updateResult.isErr()) return err(updateResult.error);
    return ok();
  }

  async stampMobilePushedAt(id: string): ServerResultAsync<void> {
    const now = new Date();
    const updateResult = await this.throwableQuery(() =>
      this.orm
        .update(this.schema.notifications)
        .set({ mobilePushedAt: now, updatedAt: now })
        .where(eq(this.schema.notifications.id, id))
    );
    if (updateResult.isErr()) return err(updateResult.error);
    return ok();
  }

  async stampEmailedAt(id: string): ServerResultAsync<void> {
    const now = new Date();
    const updateResult = await this.throwableQuery(() =>
      this.orm
        .update(this.schema.notifications)
        .set({ emailedAt: now, updatedAt: now })
        .where(eq(this.schema.notifications.id, id))
    );
    if (updateResult.isErr()) return err(updateResult.error);
    return ok();
  }

  async findUserEmail(userId: string): ServerResultAsync<string | undefined> {
    const rowResult = await this.throwableQuery(() =>
      this.orm
        .select({ email: this.schema.users.email })
        .from(this.schema.users)
        .where(eq(this.schema.users.id, userId))
        .limit(1)
    );
    if (rowResult.isErr()) return err(rowResult.error);
    const [row] = rowResult.value;
    return ok(row?.email);
  }

  async listMutedPreferencesByMemberId(
    memberId: string
  ): ServerResultAsync<{ kind: string; channel: NotificationChannel }[]> {
    const rowsResult = await this.throwableQuery(() =>
      this.orm
        .select({
          kind: this.schema.notificationPreferences.kind,
          channel: this.schema.notificationPreferences.channel,
        })
        .from(this.schema.notificationPreferences)
        .where(eq(this.schema.notificationPreferences.memberId, memberId))
    );
    if (rowsResult.isErr()) return err(rowsResult.error);
    return ok(rowsResult.value);
  }

  async insertMutedPreference(input: {
    memberId: string;
    kind: string;
    channel: NotificationChannel;
  }): ServerResultAsync<void> {
    const now = new Date();
    const insertResult = await this.throwableQuery(() =>
      this.orm
        .insert(this.schema.notificationPreferences)
        .values({
          memberId: input.memberId,
          kind: input.kind,
          channel: input.channel,
          updatedAt: now,
        })
        .onConflictDoNothing({
          target: [
            this.schema.notificationPreferences.memberId,
            this.schema.notificationPreferences.kind,
            this.schema.notificationPreferences.channel,
          ],
        })
    );
    if (insertResult.isErr()) return err(insertResult.error);
    return ok();
  }

  async deleteMutedPreference(input: {
    memberId: string;
    kind: string;
    channel: NotificationChannel;
  }): ServerResultAsync<void> {
    const deleteResult = await this.throwableQuery(() =>
      this.orm
        .delete(this.schema.notificationPreferences)
        .where(
          and(
            eq(this.schema.notificationPreferences.memberId, input.memberId),
            eq(this.schema.notificationPreferences.kind, input.kind),
            eq(this.schema.notificationPreferences.channel, input.channel)
          )
        )
    );
    if (deleteResult.isErr()) return err(deleteResult.error);
    return ok();
  }

  async findDeviceByEndpoint(
    endpoint: string
  ): ServerResultAsync<NotificationDeviceRow | undefined> {
    const rowResult = await this.throwableQuery(() =>
      this.orm
        .select()
        .from(this.schema.notificationDevices)
        .where(eq(this.schema.notificationDevices.endpoint, endpoint))
        .limit(1)
    );
    if (rowResult.isErr()) return err(rowResult.error);
    const [row] = rowResult.value;
    return ok(row as NotificationDeviceRow | undefined);
  }

  async findDeviceByToken(token: string): ServerResultAsync<NotificationDeviceRow | undefined> {
    const rowResult = await this.throwableQuery(() =>
      this.orm
        .select()
        .from(this.schema.notificationDevices)
        .where(eq(this.schema.notificationDevices.token, token))
        .limit(1)
    );
    if (rowResult.isErr()) return err(rowResult.error);
    const [row] = rowResult.value;
    return ok(row as NotificationDeviceRow | undefined);
  }

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
          notificationId: r.notificationId,
          userId: r.userId,
          deviceId: r.deviceId,
          channel: r.channel,
          provider: r.provider,
          title: r.title,
          body: r.body,
          data: r.data,
          status: r.status,
          error: r.error,
          jobId: null,
          updatedAt: now,
        }))
      )
    );
    if (insertResult.isErr()) return err(insertResult.error);
    return ok();
  }

  async listSendLogsForNotificationChannel(input: {
    notificationId: string;
    channel: NotificationChannel;
  }): ServerResultAsync<{ id: string }[]> {
    const rowsResult = await this.throwableQuery(() =>
      this.orm
        .select({ id: this.schema.notificationSendLogs.id })
        .from(this.schema.notificationSendLogs)
        .where(
          and(
            eq(this.schema.notificationSendLogs.notificationId, input.notificationId),
            eq(this.schema.notificationSendLogs.channel, input.channel)
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
