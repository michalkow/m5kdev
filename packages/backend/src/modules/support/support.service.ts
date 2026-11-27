import { createHash } from "node:crypto";
import {
  supportCreateCaseSchema,
  supportListSchema,
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
import { supportSchemas } from "./support.dto";
import { defaultSupportGrants } from "./support.grants";
import type {
  SupportCaseRow,
  SupportMessageRow,
  SupportRepository,
  SupportTransaction,
} from "./support.repository";
import type { SupportConfig } from "./support.types";

const hash = (data: unknown) => createHash("sha256").update(JSON.stringify(data)).digest("hex");

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
            uiLocale: input.uiLocale ?? this.locales[0],
            experienceId: input.experienceId ?? null,
            organizationId: ctx.actor.userId === userId ? ctx.actor.organizationId : null,
            origin: authorKind,
            waitingOn: authorKind === "admin" ? "user" : "support",
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
      return ok({
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
    .output(supportSchemas.output.case.array())
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .handle(async ({ input, ctx }) => {
      const result = await this.repository.support.list(
        ctx.actor.userRole === "admin" ? null : ctx.actor.userId,
        input
      );
      if (result.isErr()) return err(result.error);
      const rows = this.filterPermission(ctx.actor, "read", result.value);
      const unread = await this.repository.support.unreadCounts(
        rows.map((row) => row.id),
        ctx.actor.userId,
        ctx.actor.userRole === "admin"
      );
      if (unread.isErr()) return err(unread.error);
      const counts = new Map(unread.value.map((row) => [row.caseId, row.total]));
      return ok(
        rows.map((row) =>
          supportSchemas.output.case.parse({ ...row, unreadCount: counts.get(row.id) ?? 0 })
        )
      );
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
        const requestHash = hash({
          body: input.body,
          visibility: input.visibility,
          attachmentIds: input.attachmentIds,
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
          input.locale ??
          (authorKind === "admin"
            ? (working.value ?? settings.value.fallbackLocale)
            : (current.supportLocale ?? current.detectedLocale ?? current.uiLocale));
        const targetLocale = current.supportLocale ?? current.detectedLocale ?? current.uiLocale;
        const translating =
          authorKind === "admin" &&
          input.visibility === "public" &&
          settings.value.translation.enabled &&
          sourceLocale !== targetLocale;
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
              sourceHash: hash(message.body),
              epoch: current.handlingEpoch,
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
              epoch: current.handlingEpoch,
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
              sourceHash: hash(message.body),
              epoch: current.handlingEpoch,
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
      return ok({
        case: supportSchemas.output.case.parse(state.case),
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
        return this.repository.support.markRead(
          input.id,
          ctx.actor.userId,
          input.throughSequence,
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
      if (patch.handling === "ai")
        return this.error("BAD_REQUEST", "Documentation AI is not enabled");
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
        return this.repository.support.record(
          current,
          {
            ...patch,
            resolvedAt: status === "resolved" ? (current.resolvedAt ?? new Date()) : null,
            cycle:
              current.status === "resolved" && status === "open"
                ? current.cycle + 1
                : current.cycle,
            handlingEpoch: patch.handling ? current.handlingEpoch + 1 : current.handlingEpoch,
          },
          "case.updated",
          { userId: ctx.actor.userId, kind: admin ? "admin" : "user" },
          { ...patch, cycle: current.cycle, previousStatus: current.status },
          tx
        );
      });
      if (result.isOk()) await this.notify(id, state.case.userId, ctx.actor.userId);
      return result.map((row) => supportSchemas.output.case.parse(row));
    });

  readonly getCatalog = this.procedure("getCatalog")
    .input(z.object({}))
    .output(supportSchemas.output.catalog)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
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
      const reserved = await this.repository.support.reserveAttachment({
        caseId: input.id,
        fileId: upload.value.fileId,
        userId: ctx.actor.userId,
      });
      if (reserved.isErr()) return err(reserved.error);
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
      return ok({ id: input.messageId, cleanupPending: cleanup.isErr() });
    });
  async cleanupRevokedFiles(): ServerResultAsync<void> {
    const pending = await this.repository.support.pendingFileCleanup();
    if (pending.isErr()) return err(pending.error);
    for (const attachment of pending.value) {
      if (!this.service.file)
        return this.error("INTERNAL_SERVER_ERROR", "Support File integration is unavailable");
      const purged = await this.service.file.purgeSharedFile(attachment.fileId);
      if (purged.isErr()) return err(purged.error);
      const marked = await this.repository.support.fileCleaned(attachment.id);
      if (marked.isErr()) return err(marked.error);
    }
    return ok(undefined);
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
        (value) => value === locale || value === locale.split("-")[0]
      )
    );
  }
  readonly getSettings = this.procedure("getSettings")
    .input(z.object({}), true)
    .output(supportSchemas.output.settings)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
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
      if (input.ai.enabled)
        return this.error(
          "BAD_REQUEST",
          "Documentation AI requires an enabled provider and corpus"
        );
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
        return this.repository.support.record(
          current,
          { supportLocale: input.locale, handlingEpoch: current.handlingEpoch + 1 },
          "language.changed",
          { userId: ctx.actor.userId, kind: ctx.actor.userRole === "admin" ? "admin" : "user" },
          { locale: input.locale },
          tx
        );
      });
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
            sourceHash: hash(message.body),
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
    await this.repository.support.updateMessage(
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
              sourceHash: hash(message.body),
              epoch: current.handlingEpoch,
            },
            tx
          );
          return this.repository.support.updateMessage(
            message.id,
            { translationState: "pending" },
            tx
          );
        }
        const body = input.action === "send-original" ? message.body : message.publishedBody;
        if (!body) throw this.error("BAD_REQUEST", "Translation preview is not ready").error;
        await this.publishHeld(
          current,
          message,
          body,
          { userId: ctx.actor.userId, kind: "admin" },
          tx
        );
        return (await this.repository.support.message(message.id, tx))!;
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
      if (candidate.purpose === "answer") continue;
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
        if (
          !current ||
          !message ||
          message.redactedAt ||
          hash(message.body) !== work.sourceHash ||
          work.epoch !== current.handlingEpoch
        ) {
          await this.repository.support.updateWork(
            work.id,
            { state: "cancelled", error: "source-changed" },
            tx
          );
          return null;
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
          if (work.purpose === "outbound")
            await this.repository.support.updateMessage(
              message.id,
              { translationState: "failed" },
              tx
            );
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
          if (work.purpose === "outbound")
            await this.repository.support.updateMessage(
              message.id,
              { translationState: "failed" },
              tx
            );
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
        return { work: updated, message, current, usageId: usage.id };
      });
      if (claimed.isErr()) return err(claimed.error);
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
          hash(source.body) === work.sourceHash &&
          current.handlingEpoch === work.epoch &&
          recipient &&
          !recipient.closedAt &&
          !recipient.banned &&
          (work.purpose !== "outbound" ||
            (author?.role === "admin" && !author.closedAt && !author.banned));
        if (!allowed) {
          await this.repository.support.updateWork(
            work.id,
            { state: "cancelled", error: "authorization-or-source-changed" },
            tx
          );
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
          if (current.lastSequence === source.sequence)
            await this.repository.support.record(
              current,
              { detectedLocale: value.locale },
              "language.detected",
              { kind: "system" },
              { locale: value.locale },
              tx
            );
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
                { state: "cancelled", error: "language-changed" },
                tx
              );
              return;
            }
            if (source.preview) {
              await this.repository.support.updateMessage(
                source.id,
                { publishedBody: value.text, translationState: "ready" },
                tx
              );
              await this.repository.support.record(
                current,
                {},
                "translation.preview",
                { kind: "system" },
                { visibility: "internal", messageSequence: source.sequence },
                tx
              );
            } else await this.publishHeld(current, source, value.text, { kind: "system" }, tx);
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
}
