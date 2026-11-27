import { createHash } from "node:crypto";
import {
  supportCaseIdSchema,
  supportCreateCaseSchema,
  supportListSchema,
  supportSendMessageSchema,
} from "@m5kdev/commons/modules/support/support.schema";
import { err, ok } from "neverthrow";
import type { ResourceGrant } from "../../base/base.grants";
import { BasePermissionService } from "../../base/base.service";
import { supportSchemas } from "./support.dto";
import { defaultSupportGrants } from "./support.grants";
import type { SupportRepository } from "./support.repository";

const hash = (data: unknown) => createHash("sha256").update(JSON.stringify(data)).digest("hex");

export class SupportService extends BasePermissionService<
  { support: SupportRepository },
  Record<string, never>
> {
  constructor(
    repositories: { support: SupportRepository },
    services: Record<string, never>,
    grants: ResourceGrant[] = defaultSupportGrants
  ) {
    super(repositories, services, grants);
  }

  readonly createCase = this.procedure("createCase")
    .input(supportCreateCaseSchema)
    .output(supportSchemas.output.case)
    .requireAuth("user")
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
      return result.map((value) => supportSchemas.output.case.parse(value));
    });

  readonly getCase = this.procedure("getCase")
    .input(supportCaseIdSchema)
    .output(supportSchemas.output.transcript)
    .requireAuth("user")
    .loadResource("case", ({ input }) => this.repository.support.findById(input.id))
    .access({ action: "read", entityStep: "case" })
    .handle(async ({ state, ctx }) => {
      const messages = await this.repository.support.messages(
        state.case.id,
        ctx.actor.userRole === "admin"
      );
      if (messages.isErr()) return err(messages.error);
      return ok({
        case: supportSchemas.output.case.parse(state.case),
        messages: messages.value.map((value) => supportSchemas.output.message.parse(value)),
      });
    });

  readonly listCases = this.procedure("listCases")
    .input(supportListSchema)
    .output(supportSchemas.output.case.array())
    .requireAuth("user")
    .handle(async ({ input, ctx }) => {
      const result = await this.repository.support.list(
        ctx.actor.userRole === "admin" ? null : ctx.actor.userId,
        input.limit
      );
      return result.map((rows) =>
        this.filterPermission(ctx.actor, "read", rows).map((value) =>
          supportSchemas.output.case.parse(value)
        )
      );
    });

  readonly sendMessage = this.procedure("sendMessage")
    .input(supportSendMessageSchema)
    .output(supportSchemas.output.message)
    .requireAuth("user")
    .loadResource("case", ({ input }) => this.repository.support.findById(input.id))
    .access({ action: "write", entityStep: "case" })
    .handle(async ({ input, ctx }) => {
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
      return result.map((value) => supportSchemas.output.message.parse(value));
    });
}
