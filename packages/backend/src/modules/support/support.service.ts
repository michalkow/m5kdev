import { createHash } from "node:crypto";
import {
  supportCreateCaseSchema,
  supportListSchema,
  supportSendMessageSchema,
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
import type { SupportRepository } from "./support.repository";

const hash = (data: unknown) => createHash("sha256").update(JSON.stringify(data)).digest("hex");

export class SupportService extends BasePermissionService<
  { support: SupportRepository },
  { auth?: AuthService; file?: FileService }
> {
  constructor(
    repositories: { support: SupportRepository },
    services: { auth?: AuthService; file?: FileService },
    grants: ResourceGrant[] = defaultSupportGrants,
    private readonly config: { maxAttachments?: number; maxFileBytes?: number } = {}
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

  private async notify(id: string, userId: string, actingUserId: string): Promise<void> {
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
        await this.repository.support.append(
          {
            caseId: created.id,
            sequence: 1,
            authorUserId: ctx.actor.userId,
            authorKind,
            body: input.body,
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
        const message = await this.repository.support.append(
          {
            caseId: input.id,
            sequence: current.lastSequence + 1,
            authorUserId: ctx.actor.userId,
            authorKind,
            body: input.body,
            visibility: input.visibility,
            attachmentIds: input.attachmentIds,
            clientId: input.clientId,
            requestHash,
            acceptedAt: now,
            publishedAt: now,
          },
          {
            caseId: input.id,
            sequence: current.version + 1,
            type: input.visibility === "internal" ? "note.created" : "message.published",
            actorUserId: ctx.actor.userId,
            actorKind: authorKind,
            occurredAt: now,
            data: {
              messageSequence: current.lastSequence + 1,
              visibility: input.visibility,
              cycle:
                current.status === "resolved" && authorKind === "user"
                  ? current.cycle + 1
                  : current.cycle,
              reopened: current.status === "resolved" && authorKind === "user",
            },
          },
          tx
        );
        if (input.visibility === "public")
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
}
