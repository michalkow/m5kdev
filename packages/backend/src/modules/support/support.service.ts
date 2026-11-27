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
import { supportSchemas } from "./support.dto";
import { defaultSupportGrants } from "./support.grants";
import type { SupportRepository } from "./support.repository";

const hash = (data: unknown) => createHash("sha256").update(JSON.stringify(data)).digest("hex");

export class SupportService extends BasePermissionService<
  { support: SupportRepository },
  { auth?: AuthService }
> {
  constructor(
    repositories: { support: SupportRepository },
    services: { auth?: AuthService },
    grants: ResourceGrant[] = defaultSupportGrants
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
    .input(supportCreateCaseSchema)
    .output(supportSchemas.output.case)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .handle(async ({ input, ctx }) => {
      const userId = input.userId ?? ctx.actor.userId;
      const permission = this.accessGuard(ctx.actor, "write", { userId });
      if (permission.isErr()) return err(permission.error);
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
    .input(supportSchemas.input.history)
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
      return ok({
        case: supportSchemas.output.case.parse({ ...state.case, unreadCount: unread.value }),
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
    .input(supportListSchema)
    .output(supportSchemas.output.case.array())
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .handle(async ({ input, ctx }) => {
      const result = await this.repository.support.list(
        ctx.actor.userRole === "admin" ? null : ctx.actor.userId,
        input.limit
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
    .input(supportSendMessageSchema)
    .output(supportSchemas.output.message)
    .requireAuth("user")
    .use("identity", ({ ctx }) => this.checkIdentity(ctx.actor))
    .loadResource("case", ({ input }) => this.repository.support.findById(input.id))
    .access({ action: "write", entityStep: "case" })
    .handle(async ({ input, ctx, state }) => {
      const result = await this.repository.support.transaction(async (tx) => {
        const current = await this.repository.support.lockCase(input.id, tx);
        if (!current) throw this.error("NOT_FOUND", "Support Case not found").error;
        const requestHash = hash(input.body);
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
        const now = new Date();
        const authorKind = ctx.actor.userRole === "admin" ? "admin" : "user";
        return this.repository.support.append(
          {
            caseId: input.id,
            sequence: current.lastSequence + 1,
            authorUserId: ctx.actor.userId,
            authorKind,
            body: input.body,
            visibility: "public",
            clientId: input.clientId,
            requestHash,
            acceptedAt: now,
            publishedAt: now,
          },
          {
            caseId: input.id,
            sequence: current.version + 1,
            type: "message.published",
            actorUserId: ctx.actor.userId,
            actorKind: authorKind,
            occurredAt: now,
            data: { messageSequence: current.lastSequence + 1, visibility: "public" },
          },
          tx
        );
      });
      if (result.isOk()) await this.notify(input.id, state.case.userId, ctx.actor.userId);
      return result.map((value) => supportSchemas.output.message.parse(value));
    });
  readonly sync = this.procedure("sync")
    .input(supportSchemas.input.sync)
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
          data: event.data,
        })),
        messages: messages.value.map((message) => supportSchemas.output.message.parse(message)),
      });
    });

  readonly markRead = this.procedure("markRead")
    .input(supportSchemas.input.markRead)
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
}
