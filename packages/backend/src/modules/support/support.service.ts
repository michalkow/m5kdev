import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import {
  supportCreateCaseSchema,
  supportListSchema,
  supportManifestSchema,
  supportSendMessageSchema,
  supportSettingsSchema,
} from "@m5kdev/commons/modules/support/support.schema";
import { err, ok } from "neverthrow";
import { z } from "zod";
import type { AuthenticatedActor } from "../../base/base.actor";
import type { ServerResultAsync } from "../../base/base.dto";
import type { ResourceGrant } from "../../base/base.grants";
import { BasePermissionService } from "../../base/base.service";
import type { AuthService } from "../auth/auth.service";
import type { FileService } from "../file/file.service";
import { supportOpenNow } from "./support.calendar";
import { supportConfigSchema } from "./support.config";
import { supportSchemas } from "./support.dto";
import { defaultSupportGrants } from "./support.grants";
import { supportCaseMetrics, supportDistribution } from "./support.metrics";
import type {
  SupportCaseRow,
  SupportMessageRow,
  SupportRepository,
  SupportTransaction,
  SupportWorkRow,
} from "./support.repository";
import type { SupportConfig } from "./support.types";

const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value !== null && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, value]) => [key, canonical(value)])
        )
      : value;
const hash = (data: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(data)))
    .digest("hex");

const answerSourceHash = (message: SupportMessageRow) =>
  hash({
    body: message.body,
    publishedBody: message.publishedBody,
    redactedAt: message.redactedAt,
  });

const workSourceHash = (purpose: string, message: SupportMessageRow) =>
  purpose === "view" || purpose === "outbound"
    ? hash({ body: message.body, locale: message.authoredLocale })
    : hash(message.body);

export class SupportService extends BasePermissionService<
  { support: SupportRepository },
  { auth?: AuthService; file?: FileService }
> {
  constructor(
    repositories: { support: SupportRepository },
    services: { auth?: AuthService; file?: FileService },
    grants: ResourceGrant[] = defaultSupportGrants,
    private readonly config: SupportConfig = {}
  ) {
    super(repositories, services, grants);
    supportConfigSchema.parse(config);
  }

  private async checkIdentity(actor: AuthenticatedActor): ServerResultAsync<void> {
    const result = await this.repository.support.currentUser(actor.userId);
    if (result.isErr()) return err(result.error);
    const user = result.value;
    if (!user || user.closedAt || user.banned || (user.role ?? "user") !== actor.userRole)
      return this.error("UNAUTHORIZED", "Support session no longer active");
    return ok(undefined);
  }

  private dispatchWork: (() => Promise<unknown>) | undefined;
  bindWorkDispatcher(dispatch: () => Promise<unknown>): void {
    this.dispatchWork = dispatch;
  }

  private async notify(id: string, userId: string, actingUserId: string): Promise<void> {
    if (this.dispatchWork)
      void this.dispatchWork().catch(() =>
        this.logger.warn("Support work remains queued for the recovery sweep")
      );
    if (!this.service.auth) return;
    const staff = await this.repository.support.staffUserIds();
    if (staff.isErr()) return;
    this.service.auth.batchUserEmit({
      userIds: [...new Set([userId, ...staff.value.map((user) => user.id)])].filter(
        (value) => value !== actingUserId
      ),
      resource: "support.case",
      id,
      change: "updated",
      organizationId: null,
    });
  }

  readonly createCase = this.procedure("createCase")
    .input(supportCreateCaseSchema, true)
    .output(supportSchemas.output.case)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .handle(async ({ input, ctx }) => {
      const userId = input.userId ?? ctx.actor.userId;
      const permission = this.accessGuard(ctx.actor, "write", { userId });
      if (permission.isErr()) return err(permission.error);
      if (userId !== ctx.actor.userId) {
        const target = await this.repository.support.currentUser(userId);
        if (target.isErr()) return err(target.error);
        if (!target.value || target.value.closedAt)
          return this.error("BAD_REQUEST", "Support recipient is unavailable");
      }
      const settings = await this.readSettings();
      if (settings.isErr()) return err(settings.error);
      const requestHash = hash({ ...input, userId });
      const result = await this.repository.support.transaction(async (tx) => {
        await this.repository.support.lockRequest(
          `${ctx.actor.userId}:create:${input.clientId}`,
          tx
        );
        const existing = await this.repository.support.findRequest(
          ctx.actor.userId,
          input.clientId,
          tx
        );
        if (existing) {
          if (existing.requestHash !== requestHash)
            throw this.error("CONFLICT", "Idempotency key already used with different content")
              .error;
          return existing;
        }
        const now = new Date();
        const authorKind = ctx.actor.userRole === "admin" ? "admin" : "user";
        const created = await this.repository.support.insertCase(
          {
            userId,
            initiatorUserId: ctx.actor.userId,
            subject: input.subject,
            uiLocale: (input.uiLocale ?? this.locales[0]).replaceAll("_", "-"),
            experienceId:
              typeof ctx.experience === "object" && ctx.experience && "id" in ctx.experience
                ? String(ctx.experience.id)
                : (input.experienceId ?? "default"),
            organizationId: ctx.actor.userId === userId ? ctx.actor.organizationId : null,
            origin: authorKind,
            waitingOn: authorKind === "admin" ? "user" : "support",
            handling: authorKind === "user" && settings.value.ai.enabled ? "ai" : "human",
            clientId: input.clientId,
            requestHash,
            createdAt: now,
            updatedAt: now,
          },
          tx
        );
        const first = await this.repository.support.append(
          {
            caseId: created.id,
            sequence: 1,
            authorUserId: ctx.actor.userId,
            authorKind,
            body: input.body,
            publishedBody: input.body,
            authoredLocale: input.uiLocale ?? this.locales[0],
            visibility: "public",
            clientId: input.clientId,
            requestHash: hash(input.body),
            acceptedAt: now,
            publishedAt: now,
          },
          {
            caseId: created.id,
            sequence: 1,
            type: "case.created",
            actorUserId: ctx.actor.userId,
            actorKind: authorKind,
            occurredAt: now,
            data: { origin: authorKind },
          },
          tx
        );
        if (
          authorKind === "user" &&
          settings.value.translation.enabled &&
          this.config.translation?.detect
        )
          await this.repository.support.queueWork(
            {
              caseId: created.id,
              messageId: first.id,
              userId,
              purpose: "detect",
              locale: created.uiLocale,
              sourceHash: hash(first.body),
              epoch: created.handlingEpoch,
            },
            tx
          );
        if (
          authorKind === "user" &&
          settings.value.translation.enabled &&
          !settings.value.nativeLocales.includes(created.uiLocale)
        )
          await this.repository.support.queueWork(
            {
              caseId: created.id,
              messageId: first.id,
              userId,
              purpose: "view",
              locale: settings.value.fallbackLocale,
              sourceHash: workSourceHash("view", first),
              epoch: created.handlingEpoch,
            },
            tx
          );
        if (created.handling === "ai")
          await this.repository.support.queueWork(
            {
              caseId: created.id,
              messageId: first.id,
              userId,
              purpose: "answer",
              locale: created.uiLocale,
              sourceHash: hash(first.body),
              epoch: created.handlingEpoch,
            },
            tx
          );
        return created;
      });
      if (result.isOk()) await this.notify(result.value.id, result.value.userId, ctx.actor.userId);
      return result.map((value) => supportSchemas.output.case.parse(value));
    });

  readonly getCase = this.procedure("getCase")
    .input(supportSchemas.input.history, true)
    .output(supportSchemas.output.transcript)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .loadResource("case", ({ input }) => this.repository.support.findById(input.id))
    .access({ action: "read", entityStep: "case" })
    .handle(async ({ input, state, ctx }) => {
      const messages = await this.repository.support.messages(
        state.case.id,
        ctx.actor.userRole === "admin",
        {
          beforeSequence: input.beforeSequence,
          throughSequence: state.case.lastSequence,
          limit: input.limit + 1,
        }
      );
      if (messages.isErr()) return err(messages.error);
      const unread = await this.repository.support.unread(
        state.case.id,
        ctx.actor.userId,
        ctx.actor.userRole === "admin"
      );
      if (unread.isErr()) return err(unread.error);
      const assignedTags = await this.repository.support.assignedTags(input.id);
      if (assignedTags.isErr()) return err(assignedTags.error);
      const feedback = await this.feedbackForCase(state.case);
      if (feedback.isErr()) return err(feedback.error);
      return ok({
        feedback: feedback.value,
        case: supportSchemas.output.case.parse({
          ...state.case,
          unreadCount: unread.value,
          tagIds: assignedTags.value.map((tag) => tag.id),
        }),
        messages: messages.value
          .slice(-input.limit)
          .map((value) => supportSchemas.output.message.parse(value)),
        hasOlder: messages.value.length > input.limit,
        cursor: Buffer.from(
          JSON.stringify({ id: input.id, sequence: state.case.version })
        ).toString("base64url"),
      });
    });

  readonly listCases = this.procedure("listCases")
    .input(supportListSchema, true)
    .output(supportSchemas.output.list)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .handle(async ({ input, ctx }) => {
      let after: { updatedAt: Date; id: string } | undefined;
      if (input.cursor) {
        try {
          after = z
            .object({ updatedAt: z.coerce.date(), id: z.string().min(1) })
            .parse(JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")));
        } catch {
          return this.error("BAD_REQUEST", "Invalid Case-list cursor");
        }
      }
      const result = await this.repository.support.list(
        this.checkPermission(ctx.actor, "read") ? null : ctx.actor.userId,
        input,
        after
      );
      if (result.isErr()) return err(result.error);
      const page = result.value.slice(0, input.limit);
      const rows = this.filterPermission(ctx.actor, "read", page);
      const unread = await this.repository.support.unreadCounts(
        rows.map((row) => row.id),
        ctx.actor.userId,
        ctx.actor.userRole === "admin"
      );
      if (unread.isErr()) return err(unread.error);
      const counts = new Map(unread.value.map((row) => [row.caseId, row.total]));
      const last = page.at(-1);
      return ok({
        items: rows.map((row) =>
          supportSchemas.output.case.parse({ ...row, unreadCount: counts.get(row.id) ?? 0 })
        ),
        cursor:
          result.value.length > input.limit && last
            ? Buffer.from(
                JSON.stringify({ updatedAt: last.updatedAt.toISOString(), id: last.id })
              ).toString("base64url")
            : null,
      });
    });

  readonly sendMessage = this.procedure("sendMessage")
    .input(supportSendMessageSchema, true)
    .output(supportSchemas.output.message)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .loadResource("case", ({ input }) => this.repository.support.findById(input.id))
    .access({ action: "write", entityStep: "case" })
    .handle(async ({ input, ctx, state }) => {
      const settings = await this.readSettings();
      if (settings.isErr()) return err(settings.error);
      const working = await this.repository.support.workingLocale(ctx.actor.userId);
      if (working.isErr()) return err(working.error);
      if (input.visibility === "internal" && ctx.actor.userRole !== "admin")
        return this.error("FORBIDDEN", "Internal notes require platform administration");
      const result = await this.repository.support.transaction(async (tx) => {
        const current = await this.repository.support.lockCase(input.id, tx);
        if (!current) throw this.error("NOT_FOUND", "Support Case not found").error;
        const recipient = await this.repository.support.lockUser(current.userId, tx);
        if (input.visibility === "public" && (!recipient || recipient.closedAt || recipient.banned))
          throw this.error("FORBIDDEN", "Support recipient is unavailable").error;
        const requestHash = hash({
          body: input.body,
          visibility: input.visibility,
          attachmentIds: input.attachmentIds,
          locale: input.locale ?? null,
          preview: input.preview,
        });
        const existing = await this.repository.support.findMessage(
          input.id,
          ctx.actor.userId,
          input.clientId,
          tx
        );
        if (existing) {
          if (existing.requestHash !== requestHash)
            throw this.error("CONFLICT", "Idempotency key already used with different content")
              .error;
          return existing;
        }
        if (input.attachmentIds.length > (this.config.maxAttachments ?? 5))
          throw this.error("BAD_REQUEST", "Too many attachments").error;
        const attachments = await this.repository.support.attachments(
          input.id,
          input.attachmentIds,
          tx
        );
        if (
          attachments.length !== new Set(input.attachmentIds).size ||
          attachments.some(
            (file) => file.userId !== ctx.actor.userId || file.messageId || file.revokedAt
          )
        )
          throw this.error("FORBIDDEN", "Attachment is not an unused upload for this Case").error;
        for (const attachment of attachments) {
          if (!this.service.file)
            throw this.error("INTERNAL_SERVER_ERROR", "Support File integration is unavailable")
              .error;
          const sealed = await this.service.file.sealForSharing(
            attachment.fileId,
            ctx.actor.userId,
            this.config.maxFileBytes ?? 10 * 1024 * 1024
          );
          if (sealed.isErr()) throw sealed.error;
        }
        const now = new Date();
        const authorKind = ctx.actor.userRole === "admin" ? "admin" : "user";
        const sourceLocale =
          input.locale?.replaceAll("_", "-") ??
          (authorKind === "admin"
            ? (working.value ?? settings.value.fallbackLocale)
            : (current.supportLocale ?? current.detectedLocale ?? current.uiLocale));
        const targetLocale = current.supportLocale ?? current.detectedLocale ?? current.uiLocale;
        const translating =
          authorKind === "admin" &&
          input.visibility === "public" &&
          settings.value.translation.enabled &&
          sourceLocale !== targetLocale;
        const epoch =
          current.handlingEpoch +
          (authorKind === "admin" && input.visibility === "public" && current.handling === "ai"
            ? 1
            : 0);
        if (epoch !== current.handlingEpoch)
          await this.repository.support.patchCase(
            input.id,
            { handling: "human", handlingEpoch: epoch },
            tx
          );
        const message = await this.repository.support.append(
          {
            caseId: input.id,
            sequence: current.lastSequence + 1,
            authorUserId: ctx.actor.userId,
            authorKind,
            body: input.body,
            visibility: input.visibility,
            attachmentIds: input.attachmentIds,
            authoredLocale: sourceLocale,
            targetLocale,
            preview: input.preview,
            publishedBody: translating ? null : input.body,
            translationState: translating ? "pending" : "none",
            clientId: input.clientId,
            requestHash,
            acceptedAt: now,
            publishedAt: translating ? null : now,
          },
          {
            caseId: input.id,
            sequence: current.version + 1,
            type:
              input.visibility === "internal"
                ? "note.created"
                : translating
                  ? "message.accepted"
                  : "message.published",
            actorUserId: ctx.actor.userId,
            actorKind: authorKind,
            occurredAt: now,
            data: {
              messageSequence: current.lastSequence + 1,
              visibility: translating ? "internal" : input.visibility,
              cycle:
                current.status === "resolved" && authorKind === "user"
                  ? current.cycle + 1
                  : current.cycle,
              reopened: current.status === "resolved" && authorKind === "user",
            },
          },
          tx
        );
        if (input.visibility === "public" && !translating)
          await this.repository.support.patchCase(
            input.id,
            authorKind === "user"
              ? {
                  status: "open",
                  waitingOn: "support",
                  snoozedUntil: null,
                  resolvedAt: null,
                  cycle: current.status === "resolved" ? current.cycle + 1 : current.cycle,
                }
              : { waitingOn: "user" },
            tx
          );
        await this.repository.support.linkAttachments(input.attachmentIds, message.id, tx);
        if (translating)
          await this.repository.support.queueWork(
            {
              caseId: input.id,
              messageId: message.id,
              userId: current.userId,
              purpose: "outbound",
              locale: targetLocale,
              sourceHash: workSourceHash("outbound", message),
              epoch,
            },
            tx
          );
        else if (
          authorKind === "user" &&
          settings.value.translation.enabled &&
          this.config.translation?.detect
        )
          await this.repository.support.queueWork(
            {
              caseId: input.id,
              messageId: message.id,
              userId: current.userId,
              purpose: "detect",
              locale: current.uiLocale,
              sourceHash: hash(message.body),
              epoch,
            },
            tx
          );
        if (
          authorKind === "user" &&
          settings.value.translation.enabled &&
          !settings.value.nativeLocales.includes(targetLocale)
        )
          await this.repository.support.queueWork(
            {
              caseId: input.id,
              messageId: message.id,
              userId: current.userId,
              purpose: "view",
              locale: settings.value.fallbackLocale,
              sourceHash: workSourceHash("view", message),
              epoch,
            },
            tx
          );
        if (authorKind === "user" && current.handling === "ai")
          await this.repository.support.queueWork(
            {
              caseId: input.id,
              messageId: message.id,
              userId: current.userId,
              purpose: "answer",
              locale: targetLocale,
              sourceHash: hash(message.body),
              epoch,
            },
            tx
          );
        return message;
      });
      if (result.isOk()) await this.notify(input.id, state.case.userId, ctx.actor.userId);
      return result.map((value) => supportSchemas.output.message.parse(value));
    });
  readonly sync = this.procedure("sync")
    .input(supportSchemas.input.sync, true)
    .output(supportSchemas.output.sync)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .loadResource("case", ({ input }) => this.repository.support.findById(input.id))
    .access({ action: "read", entityStep: "case" })
    .handle(async ({ input, ctx, state }) => {
      let after = 0;
      if (input.cursor) {
        try {
          const decoded = z
            .object({ id: z.string(), sequence: z.number().int().min(0) })
            .parse(JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")));
          if (decoded.id !== input.id || decoded.sequence > state.case.version)
            return this.error("BAD_REQUEST", "Cursor does not belong to this Case snapshot");
          after = decoded.sequence;
        } catch {
          return this.error("BAD_REQUEST", "Invalid support cursor");
        }
      }
      const result = await this.repository.support.changes(
        input.id,
        after,
        state.case.version,
        input.limit + 1
      );
      if (result.isErr()) return err(result.error);
      const page = result.value.slice(0, input.limit);
      const admin = ctx.actor.userRole === "admin";
      const changes = page.filter((event) => admin || event.data.visibility !== "internal");
      const sequences = changes
        .map((event) =>
          typeof event.data.messageSequence === "number"
            ? event.data.messageSequence
            : event.type === "case.created"
              ? 1
              : 0
        )
        .filter((sequence) => sequence > 0);
      const messages = await this.repository.support.changedMessages(input.id, sequences, admin);
      if (messages.isErr()) return err(messages.error);
      const through =
        result.value.length > input.limit ? page[page.length - 1].sequence : state.case.version;
      const unread = await this.repository.support.unread(input.id, ctx.actor.userId, admin);
      if (unread.isErr()) return err(unread.error);
      return ok({
        case: supportSchemas.output.case.parse({ ...state.case, unreadCount: unread.value }),
        cursor: Buffer.from(JSON.stringify({ id: input.id, sequence: through })).toString(
          "base64url"
        ),
        hasMore: result.value.length > input.limit,
        changes: changes.map((event) => ({
          sequence: event.sequence,
          type: event.type,
          occurredAt: event.occurredAt,
          data: admin
            ? event.data
            : Object.fromEntries(
                Object.entries(event.data).filter(([key]) => key !== "auditReason")
              ),
        })),
        messages: messages.value.map((message) => supportSchemas.output.message.parse(message)),
      });
    });

  readonly markRead = this.procedure("markRead")
    .input(supportSchemas.input.markRead, true)
    .output(supportSchemas.output.markRead)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .loadResource("case", ({ input }) => this.repository.support.findById(input.id))
    .access({ action: "read", entityStep: "case" })
    .handle(({ input, ctx }) =>
      this.repository.support.transaction(async (tx) => {
        const current = await this.repository.support.lockCase(input.id, tx);
        if (!current) throw this.error("NOT_FOUND", "Support Case not found").error;
        if (input.throughSequence > current.lastSequence)
          throw this.error("BAD_REQUEST", "Cannot mark unseen future messages as read").error;
        const messages = await this.repository.support.messagesByIds(
          input.id,
          input.messageIds,
          tx
        );
        if (
          messages.length !== new Set(input.messageIds).size ||
          messages.some(
            (message) =>
              !message.publishedAt ||
              message.sequence > input.throughSequence ||
              (ctx.actor.userRole !== "admin" && message.visibility !== "public")
          )
        )
          throw this.error(
            "BAD_REQUEST",
            "Acknowledge only published messages in the viewed transcript"
          ).error;
        return this.repository.support.markRead(
          input.id,
          ctx.actor.userId,
          input.throughSequence,
          input.messageIds,
          tx
        );
      })
    );
  readonly updateCase = this.procedure("updateCase")
    .input(supportSchemas.input.updateCase, true)
    .output(supportSchemas.output.case)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .loadResource("case", ({ input }) => this.repository.support.findById(input.id))
    .access({ action: "write", entityStep: "case" })
    .handle(async ({ input, ctx, state }) => {
      const { id, expectedVersion, ...patch } = input;
      const admin = ctx.actor.userRole === "admin";
      if (!admin && Object.keys(patch).some((key) => key !== "status"))
        return this.error("FORBIDDEN", "Staff workflow requires platform administration");
      if (patch.handling === "ai") {
        const settings = await this.readSettings();
        if (settings.isErr()) return err(settings.error);
        if (
          !settings.value.ai.enabled ||
          !settings.value.ai.budget ||
          !this.config.assistant ||
          !this.config.documentation
        )
          return this.error("BAD_REQUEST", "Documentation AI is not enabled");
      }
      if (patch.assignedUserId) {
        const assignee = await this.repository.support.currentUser(patch.assignedUserId);
        if (assignee.isErr()) return err(assignee.error);
        if (
          !assignee.value ||
          assignee.value.closedAt ||
          assignee.value.banned ||
          assignee.value.role !== "admin"
        )
          return this.error("BAD_REQUEST", "Assignee must be a current platform administrator");
      }
      if (patch.snoozedUntil && patch.snoozedUntil <= new Date())
        return this.error("BAD_REQUEST", "Snooze must be in the future");
      const result = await this.repository.support.transaction(async (tx) => {
        const current = await this.repository.support.lockCase(id, tx);
        if (!current) throw this.error("NOT_FOUND", "Support Case not found").error;
        if (current.version !== expectedVersion)
          throw this.error("CONFLICT", "Support Case changed; refresh before editing").error;
        const status = patch.status ?? current.status;
        if (patch.handling === "ai" && status !== "open")
          throw this.error("BAD_REQUEST", "Reopen the Case before enabling AI").error;
        const updated = await this.repository.support.record(
          current,
          {
            ...patch,
            resolvedAt: status === "resolved" ? (current.resolvedAt ?? new Date()) : null,
            cycle:
              current.status === "resolved" && status === "open"
                ? current.cycle + 1
                : current.cycle,
            handlingEpoch:
              patch.handling || status !== current.status
                ? current.handlingEpoch + 1
                : current.handlingEpoch,
          },
          "case.updated",
          { userId: ctx.actor.userId, kind: admin ? "admin" : "user" },
          {
            ...patch,
            cycle: current.cycle,
            previousStatus: current.status,
            previousHandling: current.handling,
          },
          tx
        );
        if (patch.handling === "ai" && updated.waitingOn === "support") {
          const latest = await this.repository.support.latestUserMessage(input.id, tx);
          if (latest)
            await this.repository.support.queueWork(
              {
                caseId: input.id,
                messageId: latest.id,
                userId: current.userId,
                purpose: "answer",
                locale: current.supportLocale ?? current.detectedLocale ?? current.uiLocale,
                sourceHash: hash(latest.body),
                epoch: updated.handlingEpoch,
              },
              tx
            );
        }
        return updated;
      });
      if (result.isOk()) await this.notify(id, state.case.userId, ctx.actor.userId);
      return result.map((row) => supportSchemas.output.case.parse(row));
    });

  readonly getCatalog = this.procedure("getCatalog")
    .input(z.object({}))
    .output(supportSchemas.output.catalog)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .access({ action: "read", entities: () => ({}) })
    .handle(({ ctx }) =>
      ctx.actor.userRole === "admin"
        ? this.repository.support.catalog()
        : Promise.resolve(
            this.error("FORBIDDEN", "Support catalog requires platform administration")
          )
    );

  readonly saveCatalog = this.procedure("saveCatalog")
    .input(supportSchemas.input.catalog, true)
    .output(supportSchemas.output.catalog)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .access({ action: "write", entities: () => ({}) })
    .handle(async ({ input, ctx }) => {
      if (ctx.actor.userRole !== "admin")
        return this.error("FORBIDDEN", "Support catalog requires platform administration");
      if (input.kind === "reply" && !input.remove && !input.body)
        return this.error("BAD_REQUEST", "Saved replies require text");
      const saved = await this.repository.support.transaction((tx) =>
        this.repository.support.saveCatalog(input, tx)
      );
      if (saved.isErr()) return err(saved.error);
      return this.repository.support.catalog();
    });

  readonly setTags = this.procedure("setTags")
    .input(supportSchemas.input.setTags, true)
    .output(supportSchemas.output.case)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .loadResource("case", ({ input }) => this.repository.support.findById(input.id))
    .access({ action: "write", entityStep: "case" })
    .handle(async ({ input, ctx }) => {
      if (ctx.actor.userRole !== "admin")
        return this.error("FORBIDDEN", "Shared Support Tags require platform administration");
      const result = await this.repository.support.transaction(async (tx) => {
        const current = await this.repository.support.lockCase(input.id, tx);
        if (!current) throw this.error("NOT_FOUND", "Support Case not found").error;
        if (current.version !== input.expectedVersion)
          throw this.error("CONFLICT", "Support Case changed").error;
        if (!(await this.repository.support.setTags(input.id, input.tagIds, tx)))
          throw this.error("BAD_REQUEST", "Only shared Support Tags can be assigned").error;
        return this.repository.support.record(
          current,
          {},
          "tags.changed",
          { userId: ctx.actor.userId, kind: "admin" },
          { tagIds: input.tagIds },
          tx
        );
      });
      return result.map((row) => supportSchemas.output.case.parse(row));
    });

  async wakeSnoozed(now = new Date()): ServerResultAsync<number> {
    const due = await this.repository.support.dueCases(now);
    if (due.isErr()) return err(due.error);
    let count = 0;
    for (const candidate of due.value) {
      const result = await this.repository.support.transaction(async (tx) => {
        const current = await this.repository.support.lockCase(candidate.id, tx);
        if (
          !current ||
          current.status !== "open" ||
          !current.snoozedUntil ||
          current.snoozedUntil > now
        )
          return false;
        await this.repository.support.record(
          current,
          { snoozedUntil: null },
          "snooze.expired",
          { kind: "system" },
          {},
          tx
        );
        return true;
      });
      if (result.isErr()) return err(result.error);
      if (result.value) {
        count++;
        await this.notify(candidate.id, candidate.userId, "");
      }
    }
    return ok(count);
  }
  readonly initiateAttachment = this.procedure("initiateAttachment")
    .input(supportSchemas.input.upload, true)
    .output(supportSchemas.output.upload)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .loadResource("case", ({ input }) => this.repository.support.findById(input.id))
    .access({ action: "write", entityStep: "case" })
    .handle(async ({ input, ctx }) => {
      if (input.sizeBytes > (this.config.maxFileBytes ?? 10 * 1024 * 1024))
        return this.error("BAD_REQUEST", "File exceeds the allowed size");
      if (!this.service.file)
        return this.error("INTERNAL_SERVER_ERROR", "Support File integration is unavailable");
      const upload = await this.service.file.initiateSharedUpload({
        originalName: input.originalName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        userId: ctx.actor.userId,
      });
      if (upload.isErr()) return err(upload.error);
      const reserved = await this.repository.support.transaction(async (tx) => {
        const current = await this.repository.support.lockCase(input.id, tx);
        if (!current) throw this.error("NOT_FOUND", "Support Case not found").error;
        return this.repository.support.reserveAttachmentTx(
          { caseId: input.id, fileId: upload.value.fileId, userId: ctx.actor.userId },
          tx
        );
      });
      if (reserved.isErr()) {
        await this.service.file.purgeSharedFile(upload.value.fileId);
        return err(reserved.error);
      }
      return ok({ fileId: upload.value.fileId, url: upload.value.url });
    });
  readonly downloadAttachment = this.procedure("downloadAttachment")
    .input(supportSchemas.input.download, true)
    .output(supportSchemas.output.download)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .loadResource("case", ({ input }) => this.repository.support.findById(input.id))
    .access({ action: "read", entityStep: "case" })
    .handle(async ({ input, ctx }) => {
      const result = await this.repository.support.attachment(input.id, input.fileId);
      if (result.isErr()) return err(result.error);
      const row = result.value;
      if (
        !row ||
        row.message.redactedAt ||
        !row.message.publishedAt ||
        (row.message.visibility === "internal" && ctx.actor.userRole !== "admin")
      )
        return this.error("NOT_FOUND", "Attachment not available");
      if (!this.service.file)
        return this.error("INTERNAL_SERVER_ERROR", "Support File integration is unavailable");
      return this.service.file.sharedDownload(input.fileId);
    });
  readonly redactMessage = this.procedure("redactMessage")
    .input(supportSchemas.input.redact, true)
    .output(supportSchemas.output.redaction)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .loadResource("case", ({ input }) => this.repository.support.findById(input.id))
    .access({ action: "delete", entityStep: "case" })
    .handle(async ({ input, ctx, state }) => {
      const result = await this.repository.support.transaction(async (tx) => {
        const current = await this.repository.support.lockCase(input.id, tx);
        const message = await this.repository.support.message(input.messageId, tx);
        if (!current || !message || message.caseId !== input.id)
          throw this.error("NOT_FOUND", "Support Message not found").error;
        if (message.redactedAt) return;
        await this.repository.support.redact(message.id, tx);
        await this.repository.support.record(
          current,
          {},
          "message.redacted",
          { userId: ctx.actor.userId, kind: "admin" },
          {
            messageSequence: message.sequence,
            visibility: message.visibility,
            auditReason: input.reason,
          },
          tx
        );
      });
      if (result.isErr()) return err(result.error);
      const cleanup = await this.cleanupRevokedFiles();
      await this.notify(input.id, state.case.userId, ctx.actor.userId);
      return ok({
        id: input.messageId,
        cleanupPending: cleanup.isErr() || cleanup.value.pending > 0,
      });
    });
  async cleanupRevokedFiles(): ServerResultAsync<{ pending: number }> {
    const expired = await this.repository.support.expireUnusedAttachments(
      new Date(Date.now() - 86400000)
    );
    if (expired.isErr()) return err(expired.error);
    const pending = await this.repository.support.pendingFileCleanup();
    if (pending.isErr()) return err(pending.error);
    let deferred = 0;
    for (const attachment of pending.value) {
      if (!this.service.file)
        return this.error("INTERNAL_SERVER_ERROR", "Support File integration is unavailable");
      const purged = await this.service.file.purgeSharedFile(attachment.fileId);
      if (purged.isErr()) {
        if (purged.error.code === "CONFLICT") {
          deferred++;
          continue;
        }
        return err(purged.error);
      }
      const marked = await this.repository.support.fileCleaned(attachment.id);
      if (marked.isErr()) return err(marked.error);
    }
    return ok({ pending: deferred });
  }
  private get locales(): readonly string[] {
    return this.config.locales?.length ? this.config.locales : ["en"];
  }
  private async readSettings() {
    const result = await this.repository.support.settings();
    return result.map((row) => ({
      ...supportSettingsSchema.parse(
        row?.config ?? {
          nativeLocales: [this.locales[0]],
          fallbackLocale: this.locales[0],
          translation: { enabled: false },
          ai: { enabled: false },
        }
      ),
      version: row?.version ?? 0,
    }));
  }
  private supportsLanguage(locale: string): boolean {
    return Boolean(
      this.config.translation?.languages.some(
        (value) =>
          value.replaceAll("_", "-") === locale.replaceAll("_", "-") ||
          value === locale.replaceAll("_", "-").split("-")[0]
      )
    );
  }
  readonly getSettings = this.procedure("getSettings")
    .input(z.object({}), true)
    .output(supportSchemas.output.settings)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .access({ action: "read", entities: () => ({}) })
    .handle(async ({ ctx }) => {
      if (ctx.actor.userRole !== "admin")
        return this.error("FORBIDDEN", "Support settings require platform administration");
      const settings = await this.readSettings();
      if (settings.isErr()) return err(settings.error);
      const working = await this.repository.support.workingLocale(ctx.actor.userId);
      if (working.isErr()) return err(working.error);
      return ok({
        ...settings.value,
        locales: [...this.locales],
        workingLocale: working.value ?? settings.value.fallbackLocale,
      });
    });
  readonly saveSettings = this.procedure("saveSettings")
    .input(supportSchemas.input.saveSettings, true)
    .output(supportSchemas.output.settings)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .access({ action: "write", entities: () => ({}) })
    .handle(async ({ input, ctx }) => {
      if (ctx.actor.userRole !== "admin")
        return this.error("FORBIDDEN", "Support settings require platform administration");
      if (
        !this.locales.includes(input.fallbackLocale) ||
        input.nativeLocales.some((locale) => !this.locales.includes(locale))
      )
        return this.error("BAD_REQUEST", "Admin locales must be configured app locales");
      if (input.translation.enabled && (!this.config.translation || !input.translation.budget))
        return this.error(
          "BAD_REQUEST",
          "Translation requires a provider and explicit usage limits"
        );
      if (
        input.ai.enabled &&
        (!this.config.assistant || !this.config.documentation || !input.ai.budget)
      )
        return this.error(
          "BAD_REQUEST",
          "Documentation AI requires a provider, documentation configuration and explicit usage limits"
        );
      if (input.calendar) {
        try {
          new Intl.DateTimeFormat("en", { timeZone: input.calendar.timeZone }).format();
        } catch {
          return this.error("BAD_REQUEST", "Invalid support time zone");
        }
        if (
          input.calendar.weekly.some((window) => window.opens >= window.closes) ||
          input.calendar.holidays.some(
            (date) =>
              !Number.isFinite(Date.parse(date)) ||
              new Date(date).toISOString().slice(0, 10) !== date
          )
        )
          return this.error("BAD_REQUEST", "Invalid support hours or holiday");
      }
      const { expectedVersion, ...config } = input;
      const result = await this.repository.support.transaction(async (tx) => {
        await this.repository.support.lockRequest("support:settings", tx);
        const row = await this.repository.support.saveSettings(config, expectedVersion, tx);
        if (!row)
          throw this.error("CONFLICT", "Support settings changed; refresh before editing").error;
        return row;
      });
      if (result.isErr()) return err(result.error);
      return ok({
        ...result.value.config,
        version: result.value.version,
        locales: [...this.locales],
        workingLocale: input.fallbackLocale,
      });
    });
  readonly setWorkingLocale = this.procedure("setWorkingLocale")
    .input(supportSchemas.input.workingLocale, true)
    .output(supportSchemas.output.locale)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .access({ action: "write", entities: () => ({}) })
    .handle(async ({ input, ctx }) => {
      if (ctx.actor.userRole !== "admin")
        return this.error("FORBIDDEN", "Working locale requires platform administration");
      if (!this.locales.includes(input.locale))
        return this.error("BAD_REQUEST", "Working locale must be a configured app locale");
      const result = await this.repository.support.transaction(async (tx) => {
        await this.repository.support.lockRequest(`support:locale:${ctx.actor.userId}`, tx);
        await this.repository.support.saveWorkingLocale(ctx.actor.userId, input.locale, tx);
        return input;
      });
      return result;
    });
  readonly setLanguage = this.procedure("setLanguage")
    .input(supportSchemas.input.language, true)
    .output(supportSchemas.output.case)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .loadResource("case", ({ input }) => this.repository.support.findById(input.id))
    .access({ action: "write", entityStep: "case" })
    .handle(async ({ input, ctx }) => {
      if (
        input.locale &&
        !this.supportsLanguage(input.locale) &&
        !this.locales.includes(input.locale)
      )
        return this.error("BAD_REQUEST", "Language is not supported");
      const result = await this.repository.support.transaction(async (tx) => {
        const current = await this.repository.support.lockCase(input.id, tx);
        if (!current) throw this.error("NOT_FOUND", "Support Case not found").error;
        const locale = input.locale?.replaceAll("_", "-") ?? null;
        if (current.supportLocale === locale) return current;
        let updated = await this.repository.support.record(
          current,
          {
            supportLocale: locale,
            handlingEpoch: current.handlingEpoch + 1,
          },
          "language.changed",
          { userId: ctx.actor.userId, kind: ctx.actor.userRole === "admin" ? "admin" : "user" },
          { locale: input.locale },
          tx
        );
        for (const message of await this.repository.support.heldReplies(current.id, tx))
          updated = await this.queueOutbound(updated, message, tx);
        if (updated.handling === "ai" && updated.waitingOn === "support") {
          const latest = await this.repository.support.latestUserMessage(current.id, tx);
          if (latest)
            await this.repository.support.queueWork(
              {
                caseId: current.id,
                messageId: latest.id,
                userId: current.userId,
                purpose: "answer",
                locale: locale ?? current.detectedLocale ?? current.uiLocale,
                sourceHash: hash(latest.body),
                epoch: updated.handlingEpoch,
              },
              tx
            );
        }
        return updated;
      });
      if (result.isOk()) await this.notify(input.id, result.value.userId, ctx.actor.userId);
      return result.map((row) => supportSchemas.output.case.parse(row));
    });
  readonly requestTranslation = this.procedure("requestTranslation")
    .input(supportSchemas.input.translate, true)
    .output(supportSchemas.output.work)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .loadResource("case", ({ input }) => this.repository.support.findById(input.id))
    .access({ action: "read", entityStep: "case" })
    .handle(async ({ input, ctx }) => {
      const settings = await this.readSettings();
      if (settings.isErr()) return err(settings.error);
      if (!settings.value.translation.enabled || !this.supportsLanguage(input.locale))
        return this.error("BAD_REQUEST", "Translation is unavailable for this language");
      return this.repository.support.transaction(async (tx) => {
        const current = await this.repository.support.lockCase(input.id, tx);
        const message = await this.repository.support.message(input.messageId, tx);
        if (
          !current ||
          !message ||
          message.caseId !== input.id ||
          message.redactedAt ||
          !message.publishedAt ||
          (message.visibility === "internal" && ctx.actor.userRole !== "admin")
        )
          throw this.error("NOT_FOUND", "Support Message unavailable").error;
        const work = await this.repository.support.queueWork(
          {
            caseId: input.id,
            messageId: message.id,
            userId: current.userId,
            purpose: "view",
            locale: input.locale,
            sourceHash: workSourceHash("view", message),
            epoch: current.handlingEpoch,
          },
          tx
        );
        return { id: work.id, state: work.state };
      });
    });
  private async publishHeld(
    current: SupportCaseRow,
    message: SupportMessageRow,
    text: string,
    actor: { userId?: string; kind: "admin" | "system" },
    tx: SupportTransaction
  ) {
    if (message.redactedAt || message.publishedAt)
      throw this.error("CONFLICT", "Message is no longer awaiting publication").error;
    const published = await this.repository.support.updateMessage(
      message.id,
      {
        publishedBody: text,
        publishedAt: new Date(),
        translationState: message.translationState === "none" ? "none" : "ready",
      },
      tx
    );
    await this.repository.support.record(
      current,
      { waitingOn: "user" },
      "message.published",
      actor,
      { messageSequence: message.sequence, visibility: "public", cycle: current.cycle },
      tx
    );
    return published;
  }
  private async queueOutbound(
    current: SupportCaseRow,
    message: SupportMessageRow,
    tx: SupportTransaction
  ) {
    await this.repository.support.queueWork(
      {
        caseId: current.id,
        messageId: message.id,
        userId: current.userId,
        purpose: "outbound",
        locale: current.supportLocale ?? current.detectedLocale ?? current.uiLocale,
        sourceHash: workSourceHash("outbound", message),
        epoch: current.handlingEpoch,
      },
      tx
    );
    await this.repository.support.updateMessage(
      message.id,
      { publishedBody: null, translationState: "pending" },
      tx
    );
    return this.repository.support.record(
      current,
      {},
      "translation.queued",
      { kind: "system" },
      { visibility: "internal", messageSequence: message.sequence },
      tx
    );
  }
  private async readyOutbound(
    current: SupportCaseRow,
    message: SupportMessageRow,
    text: string,
    tx: SupportTransaction
  ) {
    if (message.preview) {
      await this.repository.support.updateMessage(
        message.id,
        { publishedBody: text, translationState: "ready" },
        tx
      );
      await this.repository.support.record(
        current,
        {},
        "translation.preview",
        { kind: "system" },
        { visibility: "internal", messageSequence: message.sequence },
        tx
      );
    } else await this.publishHeld(current, message, text, { kind: "system" }, tx);
  }
  private async failUnreplacedOutbound(
    work: SupportWorkRow,
    current: SupportCaseRow | undefined,
    message: SupportMessageRow | null | undefined,
    tx: SupportTransaction
  ) {
    if (
      work.purpose === "outbound" &&
      current &&
      message &&
      !message.publishedAt &&
      !message.redactedAt &&
      message.translationState === "pending" &&
      !(await this.repository.support.hasPendingOutbound(message.id, current.handlingEpoch, tx))
    ) {
      await this.repository.support.updateMessage(
        message.id,
        { publishedBody: null, translationState: "failed" },
        tx
      );
      await this.repository.support.record(
        current,
        {},
        "translation.failed",
        { kind: "system" },
        { visibility: "internal", messageSequence: message.sequence },
        tx
      );
    }
  }
  readonly controlMessage = this.procedure("controlMessage")
    .input(supportSchemas.input.controlMessage, true)
    .output(supportSchemas.output.message)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .loadResource("case", ({ input }) => this.repository.support.findById(input.id))
    .access({ action: "publish", entityStep: "case" })
    .handle(async ({ input, ctx, state }) => {
      const result = await this.repository.support.transaction(async (tx) => {
        const current = await this.repository.support.lockCase(input.id, tx);
        const message = await this.repository.support.message(input.messageId, tx);
        if (
          !current ||
          !message ||
          message.caseId !== input.id ||
          message.redactedAt ||
          message.visibility !== "public"
        )
          throw this.error("NOT_FOUND", "Support Message unavailable").error;
        if (message.publishedAt) return message;
        const author = message.authorUserId
          ? await this.repository.support.lockUser(message.authorUserId, tx)
          : null;
        const recipient = await this.repository.support.lockUser(current.userId, tx);
        if (
          !author ||
          author.role !== "admin" ||
          author.closedAt ||
          author.banned ||
          !recipient ||
          recipient.closedAt ||
          recipient.banned
        )
          throw this.error("FORBIDDEN", "Publication authorization changed").error;
        if (input.action === "retry") {
          await this.repository.support.queueWork(
            {
              caseId: input.id,
              messageId: message.id,
              userId: current.userId,
              purpose: "outbound",
              locale: current.supportLocale ?? current.detectedLocale ?? current.uiLocale,
              sourceHash: workSourceHash("outbound", message),
              epoch: current.handlingEpoch,
            },
            tx
          );
          await this.repository.support.record(
            current,
            {},
            "translation.queued",
            { userId: ctx.actor.userId, kind: "admin" },
            { visibility: "internal", messageSequence: message.sequence },
            tx
          );
          return this.repository.support.updateMessage(
            message.id,
            { publishedBody: null, translationState: "pending" },
            tx
          );
        }
        const body = input.action === "send-original" ? message.body : message.publishedBody;
        if (!body) throw this.error("BAD_REQUEST", "Translation preview is not ready").error;
        return this.publishHeld(
          current,
          message,
          body,
          { userId: ctx.actor.userId, kind: "admin" },
          tx
        );
      });
      if (result.isOk()) await this.notify(input.id, state.case.userId, ctx.actor.userId);
      return result.map((row) => supportSchemas.output.message.parse(row));
    });

  /** Durable worker entry. Work rows and usage reservations survive queue/process restarts. */
  async processWork(): ServerResultAsync<number> {
    const pending = await this.repository.support.pendingWork(new Date());
    if (pending.isErr()) return err(pending.error);
    let processed = 0;
    for (const candidate of pending.value) {
      if (candidate.purpose === "answer") {
        const answer = await this.processAnswer(candidate);
        if (answer.isErr()) return err(answer.error);
        if (answer.value) return ok(1);
        continue;
      }
      const settings = await this.readSettings();
      if (settings.isErr()) return err(settings.error);
      const provider = this.config.translation;
      const budget = settings.value.translation.budget;
      const claimed = await this.repository.support.transaction(async (tx) => {
        await this.repository.support.lockRequest("support:translation-budget", tx);
        const work = await this.repository.support.lockWork(candidate.id, tx);
        if (
          !work ||
          (work.state !== "queued" &&
            !(work.state === "running" && work.leaseUntil && work.leaseUntil <= new Date()))
        )
          return null;
        const current = await this.repository.support.lockCase(work.caseId, tx);
        const message = work.messageId
          ? await this.repository.support.message(work.messageId, tx)
          : null;
        const recipient = await this.repository.support.lockUser(work.userId, tx);
        const author = message?.authorUserId
          ? await this.repository.support.lockUser(message.authorUserId, tx)
          : null;
        if (
          !recipient ||
          recipient.closedAt ||
          recipient.banned ||
          recipient.lifecycleVersion !== work.ownerEpoch ||
          (author && author.lifecycleVersion !== work.authorEpoch) ||
          !current ||
          !message ||
          message.redactedAt ||
          workSourceHash(work.purpose, message) !== work.sourceHash ||
          (work.purpose === "outbound" &&
            (work.epoch !== current.handlingEpoch ||
              message.publishedAt ||
              author?.role !== "admin" ||
              author.closedAt ||
              author.banned))
        ) {
          await this.repository.support.updateWork(
            work.id,
            { state: "cancelled", error: "source-changed", leaseUntil: null },
            tx
          );
          await this.failUnreplacedOutbound(work, current, message, tx);
          return null;
        }
        if (
          work.purpose === "outbound" &&
          !message.publishedAt &&
          work.locale !== (current.supportLocale ?? current.detectedLocale ?? current.uiLocale)
        ) {
          await this.repository.support.updateWork(
            work.id,
            { state: "cancelled", error: "language-changed", leaseUntil: null },
            tx
          );
          await this.queueOutbound(current, message, tx);
          return null;
        }
        if (work.purpose === "outbound") {
          const latest = await this.repository.support.latestUserMessage(current.id, tx);
          if (latest && (await this.repository.support.hasPendingDetection(latest.id, tx)))
            return null;
        }
        if (work.purpose === "outbound" && message.authoredLocale === work.locale) {
          await this.readyOutbound(current, message, message.body, tx);
          await this.repository.support.updateWork(
            work.id,
            { state: "succeeded", error: null, leaseUntil: null },
            tx
          );
          return { state: "changed" as const, current };
        }
        if (
          !settings.value.translation.enabled ||
          !provider ||
          !budget ||
          work.attempts >= budget.attempts ||
          message.body.length > budget.maxInputCharacters ||
          !this.supportsLanguage(work.locale)
        ) {
          await this.repository.support.updateWork(
            work.id,
            { state: "failed", error: "automation-unavailable" },
            tx
          );
          await this.failUnreplacedOutbound(work, current, message, tx);
          return null;
        }
        const now = new Date();
        const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const counts = await this.repository.support.automationCounts(
          "translation",
          work.userId,
          month,
          day,
          now,
          tx
        );
        if (counts.monthly >= budget.monthlyCalls || counts.daily >= budget.dailyUserCalls) {
          await this.repository.support.updateWork(
            work.id,
            { state: "failed", error: "usage-limit" },
            tx
          );
          await this.failUnreplacedOutbound(work, current, message, tx);
          return null;
        }
        if (counts.running >= budget.concurrency) return null;
        const usage = await this.repository.support.reserveUsage(
          {
            workId: work.id,
            userId: work.userId,
            kind: "translation",
            provider: provider.id,
            inputCharacters: message.body.length,
          },
          tx
        );
        const updated = await this.repository.support.updateWork(
          work.id,
          {
            state: "running",
            attempts: work.attempts + 1,
            leaseUntil: new Date(now.getTime() + budget.timeoutMs + 5000),
          },
          tx
        );
        return { state: "claimed" as const, work: updated, message, current, usageId: usage.id };
      });
      if (claimed.isErr()) return err(claimed.error);
      if (claimed.value?.state === "changed") {
        await this.notify(claimed.value.current.id, claimed.value.current.userId, "");
        processed++;
        break;
      }
      if (!claimed.value || !provider || !budget) continue;
      const { work, message, usageId } = claimed.value;
      let value: { text?: string; locale?: string } | null = null;
      try {
        const signal = AbortSignal.timeout(budget.timeoutMs);
        const attempt =
          work.purpose === "detect" && provider.detect
            ? provider.detect({ text: message.body, signal })
            : provider.translate({
                text: message.body,
                sourceLocale: message.authoredLocale ?? claimed.value.current.uiLocale,
                targetLocale: work.locale,
                maxOutputCharacters: budget.maxOutputCharacters,
                signal,
              });
        const aborted = new Promise<never>((_, reject) =>
          signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true })
        );
        const raw = await Promise.race([attempt, aborted]);
        const parsed =
          work.purpose === "detect"
            ? z.object({ locale: z.string().min(2).max(35) }).safeParse(raw)
            : z.object({ text: z.string().min(1).max(budget.maxOutputCharacters) }).safeParse(raw);
        if (parsed.success) value = parsed.data;
      } catch {
        /* Provider failure is recorded as a bounded status, never a transcript or provider error dump. */
      }
      const finished = await this.repository.support.transaction(async (tx) => {
        const latest = await this.repository.support.lockWork(work.id, tx);
        if (!latest || latest.state !== "running" || latest.attempts !== work.attempts) return;
        const current = await this.repository.support.lockCase(work.caseId, tx);
        const source = await this.repository.support.message(message.id, tx);
        const recipient = await this.repository.support.lockUser(work.userId, tx);
        const author = source?.authorUserId
          ? await this.repository.support.lockUser(source.authorUserId, tx)
          : null;
        const freshSettings = await this.repository.support.settings(tx);
        if (freshSettings.isErr()) throw freshSettings.error;
        const allowed =
          freshSettings.value?.config.translation.enabled &&
          current &&
          source &&
          !source.redactedAt &&
          workSourceHash(work.purpose, source) === work.sourceHash &&
          (work.purpose !== "outbound" || current.handlingEpoch === work.epoch) &&
          recipient &&
          !recipient.closedAt &&
          !recipient.banned &&
          recipient.lifecycleVersion === work.ownerEpoch &&
          (!author || author.lifecycleVersion === work.authorEpoch) &&
          (work.purpose !== "outbound" ||
            (author?.role === "admin" && !author.closedAt && !author.banned));
        if (!allowed) {
          await this.repository.support.updateWork(
            work.id,
            { state: "cancelled", error: "authorization-or-source-changed", leaseUntil: null },
            tx
          );
          await this.failUnreplacedOutbound(work, current, source, tx);
          return;
        }
        if (!value) {
          const retry = latest.attempts < budget.attempts;
          await this.repository.support.updateWork(
            work.id,
            {
              state: retry ? "queued" : "failed",
              error: "provider-failed",
              nextAt: new Date(Date.now() + 1000 * 2 ** latest.attempts),
              leaseUntil: null,
            },
            tx
          );
          if (work.purpose === "outbound")
            await this.repository.support.updateMessage(
              source.id,
              { translationState: retry ? "pending" : "failed" },
              tx
            );
          await this.repository.support.record(
            current,
            {},
            "translation.failed",
            { kind: "system" },
            { visibility: "internal", messageSequence: source.sequence },
            tx
          );
          return;
        }
        if (work.purpose === "detect" && value.locale && this.supportsLanguage(value.locale)) {
          const detected = await this.repository.support.updateMessage(
            source.id,
            { authoredLocale: value.locale },
            tx
          );
          const lastUser = await this.repository.support.latestUserMessage(current.id, tx);
          if (lastUser?.id === source.id) {
            const locale = current.supportLocale ?? value.locale;
            const changed =
              locale !== (current.supportLocale ?? current.detectedLocale ?? current.uiLocale);
            let updated = await this.repository.support.record(
              current,
              {
                detectedLocale: value.locale,
                handlingEpoch: current.handlingEpoch + (changed ? 1 : 0),
              },
              "language.detected",
              { kind: "system" },
              { locale: value.locale },
              tx
            );
            if (changed)
              for (const held of await this.repository.support.heldReplies(current.id, tx))
                updated = await this.queueOutbound(updated, held, tx);
            if (!freshSettings.value.config.nativeLocales.includes(value.locale))
              await this.repository.support.queueWork(
                {
                  caseId: current.id,
                  messageId: source.id,
                  userId: current.userId,
                  purpose: "view",
                  locale: freshSettings.value.config.fallbackLocale,
                  sourceHash: workSourceHash("view", detected),
                  epoch: updated.handlingEpoch,
                },
                tx
              );
            if (changed && current.handling === "ai" && current.waitingOn === "support")
              await this.repository.support.queueWork(
                {
                  caseId: current.id,
                  messageId: source.id,
                  userId: current.userId,
                  purpose: "answer",
                  locale,
                  sourceHash: hash(source.body),
                  epoch: updated.handlingEpoch,
                },
                tx
              );
          }
        } else if (value.text) {
          const rendition = {
            locale: work.locale,
            text: value.text,
            provider: provider.id,
            sourceHash: work.sourceHash,
            createdAt: new Date().toISOString(),
          };
          await this.repository.support.updateMessage(
            source.id,
            {
              renditions: [
                ...source.renditions.filter((item) => item.locale !== work.locale),
                rendition,
              ],
            },
            tx
          );
          if (work.purpose === "outbound" && !source.publishedAt) {
            if (
              (current.supportLocale ?? current.detectedLocale ?? current.uiLocale) !== work.locale
            ) {
              await this.repository.support.updateWork(
                work.id,
                { state: "cancelled", error: "language-changed", leaseUntil: null },
                tx
              );
              await this.queueOutbound(current, source, tx);
              await this.repository.support.completeUsage(usageId, value.text.length, tx);
              return;
            }
            await this.readyOutbound(current, source, value.text, tx);
          } else
            await this.repository.support.record(
              current,
              {},
              "translation.ready",
              { kind: "system" },
              { messageSequence: source.sequence, visibility: source.visibility },
              tx
            );
          await this.repository.support.completeUsage(usageId, value.text.length, tx);
        }
        await this.repository.support.updateWork(
          work.id,
          { state: "succeeded", error: null, leaseUntil: null },
          tx
        );
      });
      if (finished.isErr()) return err(finished.error);
      await this.notify(work.caseId, work.userId, "");
      processed++;
      break;
    }
    return ok(processed);
  }
  readonly getDocumentation = this.procedure("getDocumentation")
    .input(z.object({}), true)
    .output(supportSchemas.output.documentation)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .access({ action: "read", entities: () => ({}) })
    .handle(({ ctx }) =>
      ctx.actor.userRole === "admin"
        ? this.repository.support.corpusList()
        : Promise.resolve(
            this.error("FORBIDDEN", "Documentation management requires platform administration")
          )
    );
  readonly stageDocumentation = this.procedure("stageDocumentation")
    .input(supportSchemas.input.stageDocumentation, true)
    .output(supportSchemas.output.documentation)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .access({ action: "publish", entities: () => ({}) })
    .handle(async ({ input, ctx }) => {
      if (ctx.actor.userRole !== "admin")
        return this.error("FORBIDDEN", "Documentation management requires platform administration");
      const staged = await this.stageManifest(input.manifest);
      if (staged.isErr()) return err(staged.error);
      if (this.dispatchWork)
        void this.dispatchWork().catch(() =>
          this.logger.warn("Documentation refresh remains queued")
        );
      return this.repository.support.corpusList();
    });
  private stageManifest(manifest: z.infer<typeof supportManifestSchema>) {
    return this.repository.support.transaction(async (tx) => {
      await this.repository.support.lockRequest("support:documentation", tx);
      const row = await this.repository.support.stageCorpus(manifest, tx);
      if (
        hash(row.manifest.entries) !== hash(manifest.entries) ||
        row.applicationVersion !== manifest.applicationVersion
      )
        throw this.error("CONFLICT", "Documentation version already identifies different content")
          .error;
      return row;
    });
  }
  readonly withdrawDocumentation = this.procedure("withdrawDocumentation")
    .input(supportSchemas.input.withdrawDocumentation, true)
    .output(supportSchemas.output.documentation)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .access({ action: "delete", entities: () => ({}) })
    .handle(async ({ input, ctx }) => {
      if (ctx.actor.userRole !== "admin")
        return this.error("FORBIDDEN", "Documentation management requires platform administration");
      const withdrawn = await this.repository.support.transaction(async (tx) => {
        await this.repository.support.lockRequest("support:documentation", tx);
        await this.repository.support.withdrawCorpus(input.version, tx);
      });
      if (withdrawn.isErr()) return err(withdrawn.error);
      return this.repository.support.corpusList();
    });
  async processDocumentation(): ServerResultAsync<number> {
    const sourceConfig = this.config.documentation;
    if (sourceConfig?.manifestPath) {
      let manifest: z.infer<typeof supportManifestSchema> | null = null;
      try {
        const size = await stat(sourceConfig.manifestPath);
        if (size.size > 5 * 1024 * 1024) throw new Error("manifest-too-large");
        manifest = supportManifestSchema.parse(
          JSON.parse(await readFile(sourceConfig.manifestPath, "utf8"))
        );
      } catch {
        /* A failed refresh retains the previous authorized corpus. */
      }
      let failed = !manifest;
      if (manifest) {
        const staged = await this.stageManifest(manifest);
        failed = staged.isErr();
      }
      if (failed) {
        const version = `source-error-${createHash("sha256").update(sourceConfig.manifestPath).digest("hex").slice(0, 32)}`;
        const recorded = await this.repository.support.transaction(async (tx) => {
          await this.repository.support.lockRequest("support:documentation", tx);
          const row = await this.repository.support.stageCorpus(
            {
              schemaVersion: 1,
              version,
              applicationVersion: sourceConfig.applicationVersion,
              generatedAt: new Date().toISOString(),
              entries: [],
            },
            tx
          );
          await this.repository.support.failCorpus(row.id, "manifest-source-unavailable", tx);
        });
        if (recorded.isErr()) return err(recorded.error);
      }
    }
    const pending = await this.repository.support.pendingCorpora();
    if (pending.isErr()) return err(pending.error);
    let count = 0;
    for (const corpus of pending.value) {
      const docs = this.config.documentation;
      let failure: string | null = null;
      if (!docs || corpus.applicationVersion !== docs.applicationVersion)
        failure = "incompatible-application-version";
      const keys = new Set<string>();
      for (const entry of corpus.manifest.entries) {
        const url = new URL(entry.url);
        const key = `${entry.locale}:${entry.experience}:${entry.id}`;
        if (
          !docs ||
          !docs.allowedOrigins.includes(url.origin) ||
          (url.protocol !== "https:" &&
            url.hostname !== "localhost" &&
            url.hostname !== "127.0.0.1") ||
          url.username ||
          url.password ||
          createHash("sha256").update(entry.text).digest("hex") !== entry.sha256 ||
          keys.has(key)
        )
          failure = "invalid-or-unauthorized-documentation";
        keys.add(key);
      }
      const indexed = await this.repository.support.transaction(async (tx) => {
        await this.repository.support.lockRequest("support:documentation", tx);
        if (failure) await this.repository.support.failCorpus(corpus.id, failure, tx);
        else
          await this.repository.support.activateCorpus(
            corpus.id,
            corpus.manifest.entries.map((entry) => ({
              corpusId: corpus.id,
              locale: entry.locale,
              experience: entry.experience,
              url: entry.url,
              title: entry.title,
              text: entry.text,
              sha256: entry.sha256,
            })),
            tx
          );
      });
      if (indexed.isErr()) return err(indexed.error);
      count++;
    }
    return ok(count);
  }
  private async handoff(current: SupportCaseRow, reason: string, tx: SupportTransaction) {
    if (current.handling !== "ai") return current;
    return this.repository.support.record(
      current,
      { handling: "human", handlingEpoch: current.handlingEpoch + 1 },
      "handoff.requested",
      { kind: "system" },
      { reason, cycle: current.cycle },
      tx
    );
  }
  readonly requestHuman = this.procedure("requestHuman")
    .input(supportSchemas.input.read, true)
    .output(supportSchemas.output.case)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .loadResource("case", ({ input }) => this.repository.support.findById(input.id))
    .access({ action: "write", entityStep: "case" })
    .handle(async ({ input, ctx, state }) => {
      const result = await this.repository.support.transaction(async (tx) => {
        const current = await this.repository.support.lockCase(input.id, tx);
        if (!current) throw this.error("NOT_FOUND", "Support Case not found").error;
        if (current.handling === "human") return current;
        return this.repository.support.record(
          current,
          { handling: "human", handlingEpoch: current.handlingEpoch + 1 },
          "handoff.requested",
          { userId: ctx.actor.userId, kind: ctx.actor.userRole === "admin" ? "admin" : "user" },
          { reason: "person-requested", cycle: current.cycle },
          tx
        );
      });
      if (result.isOk()) await this.notify(input.id, state.case.userId, ctx.actor.userId);
      return result.map((row) => supportSchemas.output.case.parse(row));
    });

  private async processAnswer(candidate: SupportWorkRow): ServerResultAsync<boolean> {
    const settings = await this.readSettings();
    if (settings.isErr()) return err(settings.error);
    const provider = this.config.assistant;
    const docs = this.config.documentation;
    const budget = settings.value.ai.budget;
    const snapshot = await this.repository.support.findById(candidate.caseId);
    if (snapshot.isErr()) return err(snapshot.error);
    const currentCase = snapshot.value;
    if (!currentCase) return ok(false);
    const locale = currentCase.supportLocale ?? currentCase.detectedLocale ?? currentCase.uiLocale;
    const question = await this.repository.support.transaction((tx) =>
      candidate.messageId
        ? this.repository.support.message(candidate.messageId, tx)
        : Promise.resolve(undefined)
    );
    if (question.isErr()) return err(question.error);
    const source = question.value;
    const retrieved =
      docs && source
        ? await this.repository.support.retrieveDocumentation(
            docs.applicationVersion,
            currentCase.experienceId ?? "default",
            locale,
            source.body,
            settings.value.fallbackLocale
          )
        : ok(null);
    if (retrieved.isErr()) return err(retrieved.error);
    const corpus = retrieved.value;
    const history = await this.repository.support.messages(currentCase.id, false, {
      throughSequence: currentCase.lastSequence,
      limit: 12,
    });
    if (history.isErr()) return err(history.error);
    const suppliedSources = [...history.value, ...(source ? [source] : [])];
    const payload = {
      question: source?.body ?? "",
      history: history.value.map((message) => ({
        role: message.authorKind === "user" ? ("user" as const) : ("assistant" as const),
        content: message.publishedBody ?? message.body,
      })),
      sources:
        corpus?.documents.map((document) => ({
          url: document.url,
          title: document.title,
          text: document.text,
          sha256: document.sha256,
          locale: document.locale,
        })) ?? [],
      locale,
    };
    const inputCharacters = JSON.stringify(payload).length + 1000;
    const claimed = await this.repository.support.transaction(async (tx) => {
      await this.repository.support.lockRequest("support:ai-budget", tx);
      const work = await this.repository.support.lockWork(candidate.id, tx);
      if (
        !work ||
        (work.state !== "queued" &&
          !(work.state === "running" && work.leaseUntil && work.leaseUntil <= new Date()))
      )
        return { state: "idle" as const };
      const current = await this.repository.support.lockCase(work.caseId, tx);
      const latest = current
        ? await this.repository.support.latestUserMessage(current.id, tx)
        : null;
      const currentSources = current
        ? await this.repository.support.messagesByIds(
            current.id,
            suppliedSources.map((message) => message.id),
            tx
          )
        : [];
      const contextCurrent = suppliedSources.every((message) =>
        currentSources.some(
          (latest) =>
            latest.id === message.id && answerSourceHash(latest) === answerSourceHash(message)
        )
      );
      const recipient = await this.repository.support.lockUser(work.userId, tx);
      if (
        !current ||
        !contextCurrent ||
        current.handling !== "ai" ||
        current.handlingEpoch !== work.epoch ||
        !latest ||
        latest.id !== work.messageId ||
        hash(latest.body) !== work.sourceHash ||
        current.status !== "open" ||
        !recipient ||
        recipient.lifecycleVersion !== work.ownerEpoch ||
        recipient.closedAt ||
        recipient.banned
      ) {
        await this.repository.support.updateWork(
          work.id,
          { state: "cancelled", error: "source-or-authorization-changed" },
          tx
        );
        return { state: "idle" as const };
      }
      if (await this.repository.support.hasPendingDetection(latest.id, tx))
        return { state: "idle" as const };
      const active =
        corpus && docs
          ? await this.repository.support.corpusActive(
              corpus.corpus.id,
              docs.applicationVersion,
              tx
            )
          : null;
      if (
        !settings.value.ai.enabled ||
        !provider ||
        !docs ||
        !budget ||
        !active ||
        !payload.sources.length ||
        inputCharacters > budget.maxInputCharacters ||
        work.attempts >= budget.attempts
      ) {
        await this.repository.support.updateWork(
          work.id,
          { state: "failed", error: "no-authorized-evidence-or-capability" },
          tx
        );
        await this.handoff(current, "no-authorized-evidence-or-capability", tx);
        return { state: "changed" as const };
      }
      const now = new Date();
      const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const counts = await this.repository.support.automationCounts(
        "ai",
        work.userId,
        month,
        day,
        now,
        tx
      );
      if (counts.monthly >= budget.monthlyCalls || counts.daily >= budget.dailyUserCalls) {
        await this.repository.support.updateWork(
          work.id,
          { state: "failed", error: "usage-limit" },
          tx
        );
        await this.handoff(current, "usage-limit", tx);
        return { state: "changed" as const };
      }
      if (counts.running >= budget.concurrency) return { state: "idle" as const };
      const usage = await this.repository.support.reserveUsage(
        {
          workId: work.id,
          userId: work.userId,
          kind: "ai",
          provider: provider.id,
          inputCharacters,
        },
        tx
      );
      const updated = await this.repository.support.updateWork(
        work.id,
        {
          state: "running",
          attempts: work.attempts + 1,
          leaseUntil: new Date(now.getTime() + budget.timeoutMs + 5000),
        },
        tx
      );
      return { state: "run" as const, work: updated, usageId: usage.id };
    });
    if (claimed.isErr()) return err(claimed.error);
    if (claimed.value.state !== "run" || !provider || !budget || !docs || !corpus) {
      if (claimed.value.state === "changed")
        await this.notify(candidate.caseId, candidate.userId, "");
      return ok(false);
    }
    const { work, usageId } = claimed.value;
    let answer: { supported: boolean; text: string; citations: string[] } | null = null;
    try {
      const signal = AbortSignal.timeout(budget.timeoutMs);
      const aborted = new Promise<never>((_, reject) =>
        signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true })
      );
      const raw = await Promise.race([
        provider.answer({ ...payload, maxOutputCharacters: budget.maxOutputCharacters, signal }),
        aborted,
      ]);
      const parsed = z
        .object({
          supported: z.boolean(),
          text: z.string().max(budget.maxOutputCharacters),
          citations: z.array(z.string()).max(10),
        })
        .safeParse(raw);
      if (parsed.success) answer = parsed.data;
    } catch {
      /* Worker retries and handoff own the failure contract. */
    }
    const finished = await this.repository.support.transaction(async (tx) => {
      const latestWork = await this.repository.support.lockWork(work.id, tx);
      if (!latestWork || latestWork.state !== "running" || latestWork.attempts !== work.attempts)
        return;
      const current = await this.repository.support.lockCase(work.caseId, tx);
      const latest = current
        ? await this.repository.support.latestUserMessage(current.id, tx)
        : null;
      const currentSources = current
        ? await this.repository.support.messagesByIds(
            current.id,
            suppliedSources.map((message) => message.id),
            tx
          )
        : [];
      const contextCurrent = suppliedSources.every((message) =>
        currentSources.some(
          (latest) =>
            latest.id === message.id && answerSourceHash(latest) === answerSourceHash(message)
        )
      );
      const recipient = await this.repository.support.lockUser(work.userId, tx);
      const freshSettings = await this.repository.support.settings(tx);
      if (freshSettings.isErr()) throw freshSettings.error;
      const active = await this.repository.support.corpusActive(
        corpus.corpus.id,
        docs.applicationVersion,
        tx
      );
      if (
        !current ||
        !contextCurrent ||
        current.handling !== "ai" ||
        current.status !== "open" ||
        current.handlingEpoch !== work.epoch ||
        latest?.id !== work.messageId ||
        !recipient ||
        recipient.lifecycleVersion !== work.ownerEpoch ||
        recipient.closedAt ||
        recipient.banned ||
        !active ||
        !freshSettings.value?.config.ai.enabled
      ) {
        await this.repository.support.updateWork(
          work.id,
          { state: "cancelled", error: "source-or-authorization-changed" },
          tx
        );
        return;
      }
      if (!answer) {
        const retry = latestWork.attempts < budget.attempts;
        await this.repository.support.updateWork(
          work.id,
          {
            state: retry ? "queued" : "failed",
            error: "provider-failed",
            nextAt: new Date(Date.now() + 1000 * 2 ** latestWork.attempts),
            leaseUntil: null,
          },
          tx
        );
        if (!retry) await this.handoff(current, "provider-failed", tx);
        return;
      }
      const citations = [...new Set(answer.citations)];
      if (
        !answer.supported ||
        !answer.text.trim() ||
        !citations.length ||
        citations.some((url) => !payload.sources.some((source) => source.url === url))
      ) {
        await this.repository.support.updateWork(
          work.id,
          { state: "failed", error: "unsupported-answer" },
          tx
        );
        await this.handoff(current, "unsupported-answer", tx);
        return;
      }
      const now = new Date();
      await this.repository.support.append(
        {
          caseId: current.id,
          sequence: current.lastSequence + 1,
          authorKind: "ai",
          authorUserId: null,
          body: answer.text,
          publishedBody: answer.text,
          authoredLocale: locale,
          targetLocale: locale,
          visibility: "public",
          clientId: work.id,
          requestHash: hash(answer),
          acceptedAt: now,
          publishedAt: now,
          citations,
          aiProvenance: {
            provider: provider.id,
            promptVersion: "support-answer-v1",
            corpusVersion: corpus.corpus.version,
            sourceHashes: payload.sources
              .filter((source) => citations.includes(source.url))
              .map((source) => source.sha256),
          },
        },
        {
          caseId: current.id,
          sequence: current.version + 1,
          type: "message.published",
          actorKind: "ai",
          occurredAt: now,
          data: {
            messageSequence: current.lastSequence + 1,
            visibility: "public",
            cycle: current.cycle,
            provider: provider.id,
            corpusVersion: corpus.corpus.version,
          },
        },
        tx
      );
      await this.repository.support.patchCase(current.id, { waitingOn: "user" }, tx);
      await this.repository.support.completeUsage(usageId, answer.text.length, tx);
      await this.repository.support.updateWork(
        work.id,
        { state: "succeeded", error: null, leaseUntil: null },
        tx
      );
    });
    if (finished.isErr()) return err(finished.error);
    await this.notify(work.caseId, work.userId, "");
    return ok(true);
  }
  private async feedbackForCase(current: SupportCaseRow, tx?: SupportTransaction) {
    const settings = await this.readSettings();
    if (settings.isErr()) return err(settings.error);
    const facts = await this.repository.support.metricCase(current.id, tx);
    if (facts.isErr()) return err(facts.error);
    const rating = await this.repository.support.feedback(current.id, current.cycle, tx);
    if (rating.isErr()) return err(rating.error);
    const cycle = facts.value
      ? supportCaseMetrics(facts.value).cycles.find((cycle) => cycle.number === current.cycle)
      : null;
    return ok({
      eligible: Boolean(
        settings.value.csatEnabled && current.status === "resolved" && cycle?.eligible
      ),
      score: rating.value?.score ?? null,
      cycle: current.cycle,
      handledBy: cycle?.handledBy ?? null,
    });
  }
  readonly rate = this.procedure("rate")
    .input(supportSchemas.input.rate, true)
    .output(supportSchemas.output.feedback)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .loadResource("case", ({ input }) => this.repository.support.findById(input.id))
    .access({ action: "write", entityStep: "case" })
    .handle(async ({ input, ctx }) => {
      const settings = await this.readSettings();
      if (settings.isErr()) return err(settings.error);
      if (!settings.value.csatEnabled) return this.error("BAD_REQUEST", "Feedback is disabled");
      return this.repository.support.transaction(async (tx) => {
        const current = await this.repository.support.lockCase(input.id, tx);
        if (!current || current.userId !== ctx.actor.userId)
          throw this.error("FORBIDDEN", "Only the requesting User can rate support").error;
        if (current.status !== "resolved" || current.cycle !== input.cycle)
          throw this.error("CONFLICT", "Feedback belongs to a different resolved cycle").error;
        const facts = await this.repository.support.metricCase(input.id, tx);
        if (facts.isErr()) throw facts.error;
        const cycle = facts.value
          ? supportCaseMetrics(facts.value).cycles.find((cycle) => cycle.number === input.cycle)
          : null;
        if (!cycle?.eligible || !cycle.handledBy)
          throw this.error("BAD_REQUEST", "Feedback requires a genuine resolved exchange").error;
        const rating = await this.repository.support.rate(
          {
            caseId: input.id,
            cycle: input.cycle,
            userId: ctx.actor.userId,
            score: input.score,
            handledBy: cycle.handledBy,
          },
          tx
        );
        await this.repository.support.record(
          current,
          {},
          "feedback.rated",
          { userId: ctx.actor.userId, kind: "user" },
          { cycle: input.cycle, score: input.score },
          tx
        );
        return { cycle: rating.cycle, score: rating.score };
      });
    });
  readonly getAvailability = this.procedure("getAvailability")
    .input(z.object({}), true)
    .output(supportSchemas.output.availability)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .handle(async () => {
      const settings = await this.readSettings();
      if (settings.isErr()) return err(settings.error);
      return ok({
        version: settings.value.version,
        replyExpectation: settings.value.replyExpectation,
        calendar: settings.value.calendar,
        openNow: supportOpenNow(settings.value.calendar),
        csatEnabled: settings.value.csatEnabled,
        languages: [...new Set([...this.locales, ...(this.config.translation?.languages ?? [])])],
      });
    });
  readonly getCaseMetrics = this.procedure("getCaseMetrics")
    .input(supportSchemas.input.read, true)
    .output(supportSchemas.output.metrics)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .loadResource("case", ({ input }) => this.repository.support.findById(input.id))
    .access({ action: "read", entityStep: "case" })
    .handle(async ({ input, ctx }) => {
      if (ctx.actor.userRole !== "admin")
        return this.error("FORBIDDEN", "Operational metrics require platform administration");
      const facts = await this.repository.support.metricCase(input.id);
      if (facts.isErr()) return err(facts.error);
      if (!facts.value) return this.error("NOT_FOUND", "Support Case not found");
      return ok(supportCaseMetrics(facts.value));
    });
  readonly overview = this.procedure("overview")
    .input(supportSchemas.input.overview, true)
    .output(supportSchemas.output.overview)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .access({ action: "read", entities: () => ({}) })
    .handle(async ({ input, ctx }) => {
      if (ctx.actor.userRole !== "admin")
        return this.error("FORBIDDEN", "Operational metrics require platform administration");
      const to = new Date();
      const from = input.since ?? new Date(to.getTime() - 30 * 86400000);
      if (from > to || from.getTime() < to.getTime() - 90 * 86400000)
        return this.error("BAD_REQUEST", "Overview cohort must start within the last 90 days");
      const cases = await this.repository.support.overviewCases(from, to);
      if (cases.isErr()) return err(cases.error);
      const counts = await this.repository.support.queueCounts();
      if (counts.isErr()) return err(counts.error);
      const oldest = await this.repository.support.oldestUnanswered();
      if (oldest.isErr()) return err(oldest.error);
      const ratings = await this.repository.support.feedbackCounts(from);
      if (ratings.isErr()) return err(ratings.error);
      const facts = await this.repository.support.metricCases(
        cases.value.slice(0, 500).map((row) => row.id)
      );
      if (facts.isErr()) return err(facts.error);
      const samples = facts.value.map((facts) => supportCaseMetrics(facts, to));
      const waiting = { support: 0, user: 0, external: 0 };
      let open = 0;
      let unassigned = 0;
      for (const group of counts.value) {
        open += group.total;
        waiting[group.waitingOn] += group.total;
        if (group.unassigned) unassigned += group.total;
      }
      const csat = (kind: "human" | "ai") => {
        const groups = ratings.value.filter((row) => row.handledBy === kind);
        const total = groups.reduce((sum, row) => sum + row.total, 0);
        const happy = groups
          .filter((row) => row.score === 1)
          .reduce((sum, row) => sum + row.total, 0);
        return { samples: total, positive: total ? happy / total : null };
      };
      return ok({
        from,
        to,
        sampleCases: samples.length,
        partial: cases.value.length > 500,
        open,
        unassigned,
        waiting,
        oldestUnanswered: oldest.value,
        firstHumanResponse: {
          ...supportDistribution(
            samples.flatMap((sample) =>
              sample.firstHumanResponseMs === null ? [] : [sample.firstHumanResponseMs]
            )
          ),
          unanswered: samples.filter(
            (sample) =>
              sample.hasUserExchange &&
              sample.firstHumanResponseMs === null &&
              cases.value.find((row) => row.id === sample.id)?.status === "open"
          ).length,
        },
        handoffWait: supportDistribution(samples.flatMap((sample) => sample.handoffWaitMs)),
        csat: { human: csat("human"), ai: csat("ai") },
      });
    });
  async invalidateUserWork(userId: string, reason: "closed" | "restored"): ServerResultAsync<void> {
    const cases = await this.repository.support.casesForUser(userId);
    if (cases.isErr()) return err(cases.error);
    return this.repository.support.transaction(async (tx) => {
      await this.repository.support.invalidateWork(userId, tx);
      for (const row of cases.value) {
        const current = await this.repository.support.lockCase(row.id, tx);
        if (current)
          await this.repository.support.record(
            current,
            { handling: "human", handlingEpoch: current.handlingEpoch + 1 },
            `privacy.${reason}`,
            { kind: "system" },
            {},
            tx
          );
      }
    });
  }
  private async purgeCase(id: string): ServerResultAsync<void> {
    const marked = await this.repository.support.transaction(async (tx) => {
      const current = await this.repository.support.lockCase(id, tx, true);
      if (current)
        await this.repository.support.patchCase(
          id,
          {
            purgingAt: current.purgingAt ?? new Date(),
            handling: "human",
            handlingEpoch: current.handlingEpoch + 1,
          },
          tx
        );
    });
    if (marked.isErr()) return err(marked.error);
    const files = await this.repository.support.caseFiles(id);
    if (files.isErr()) return err(files.error);
    let pending = false;
    for (const attachment of files.value) {
      if (!this.service.file)
        return this.error("INTERNAL_SERVER_ERROR", "Support File integration unavailable");
      const result = await this.service.file.purgeSharedFile(attachment.fileId);
      if (result.isErr()) {
        if (result.error.code === "CONFLICT") {
          pending = true;
          continue;
        }
        return err(result.error);
      }
    }
    if (pending)
      return this.error(
        "CONFLICT",
        "File cleanup is pending until recent upload authorizations expire; retry Purge in five minutes"
      );
    return this.repository.support.transaction((tx) => this.repository.support.deleteCase(id, tx));
  }
  async purgeUserData(userId: string): ServerResultAsync<void> {
    const invalidated = await this.invalidateUserWork(userId, "closed");
    if (invalidated.isErr()) return err(invalidated.error);
    const cases = await this.repository.support.casesForUser(userId);
    if (cases.isErr()) return err(cases.error);
    let pending = false;
    for (const row of cases.value) {
      const result = await this.purgeCase(row.id);
      if (result.isErr()) {
        if (result.error.code === "CONFLICT") {
          pending = true;
          continue;
        }
        return err(result.error);
      }
    }
    const revoked = await this.repository.support.transaction((tx) =>
      this.repository.support.revokeUploadsForUser(userId, tx)
    );
    if (revoked.isErr()) return err(revoked.error);
    const authored = await this.repository.support.authoredMessages(userId);
    if (authored.isErr()) return err(authored.error);
    for (const message of authored.value) {
      const redacted = await this.repository.support.transaction(async (tx) => {
        const current = await this.repository.support.lockCase(message.caseId, tx);
        if (!current) return;
        await this.repository.support.redact(message.id, tx);
        await this.repository.support.record(
          current,
          {},
          "message.redacted",
          { kind: "system" },
          { messageSequence: message.sequence, visibility: message.visibility },
          tx
        );
      });
      if (redacted.isErr()) return err(redacted.error);
    }
    const cleanup = await this.cleanupRevokedFiles();
    if (cleanup.isErr()) return err(cleanup.error);
    pending ||= cleanup.value.pending > 0;
    if (pending)
      return this.error(
        "CONFLICT",
        "File cleanup is pending until recent upload authorizations expire; retry Purge in five minutes"
      );
    return this.repository.support.transaction((tx) =>
      this.repository.support.eraseActor(userId, tx)
    );
  }
  async cleanupRetention(): ServerResultAsync<number> {
    const pending = await this.repository.support.purgingCases();
    if (pending.isErr()) return err(pending.error);
    const expired = this.config.retentionDays
      ? await this.repository.support.expiredCases(
          new Date(Date.now() - this.config.retentionDays * 86400000)
        )
      : ok([]);
    if (expired.isErr()) return err(expired.error);
    let count = 0;
    for (const row of [
      ...new Map([...pending.value, ...expired.value].map((row) => [row.id, row])).values(),
    ]) {
      const result = await this.purgeCase(row.id);
      if (result.isErr()) {
        if (result.error.code === "CONFLICT") continue;
        return err(result.error);
      }
      count++;
    }
    return ok(count);
  }
  readonly getUnreadCount = this.procedure("getUnreadCount")
    .input(z.object({}), true)
    .output(supportSchemas.output.unread)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .access({ action: "read", entities: ({ ctx }) => ({ userId: ctx.actor.userId }) })
    .handle(({ ctx }) =>
      this.repository.support.unreadTotal(ctx.actor.userId, ctx.actor.userRole === "admin")
    );
}
