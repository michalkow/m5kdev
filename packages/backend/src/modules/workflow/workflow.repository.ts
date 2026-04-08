import type {
  WorkflowListInputSchema,
  WorkflowListOutputSchema,
  WorkflowReadOutputSchema,
} from "@m5kdev/commons/modules/workflow/workflow.schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { err, ok } from "neverthrow";
import type { ServerResultAsync } from "../base/base.dto";
import { BaseRepository } from "../base/base.repository";
import * as workflow from "./workflow.db";

const schema = { ...workflow };

type Schema = typeof schema;
type Orm = LibSQLDatabase<Schema>;

export class WorkflowRepository extends BaseRepository<Orm, Schema, Record<string, never>> {
  async read({
    jobId,
    userId,
  }: {
    jobId: string;
    userId: string;
  }): ServerResultAsync<WorkflowReadOutputSchema> {
    const wfResult = await this.throwableQuery(() =>
      this.orm
        .select()
        .from(this.schema.workflows)
        .where(and(eq(this.schema.workflows.jobId, jobId), eq(this.schema.workflows.userId, userId)))
    );
    if (wfResult.isErr()) return err(wfResult.error);
    const [wf] = wfResult.value;
    if (!wf) return this.error("NOT_FOUND");
    return ok(wf);
  }

  async list({
    userId,
    status,
    jobName,
  }: WorkflowListInputSchema & {
    userId: string;
  }): ServerResultAsync<WorkflowListOutputSchema> {
    const { ConditionBuilder } = this.helpers;
    const condition = new ConditionBuilder([eq(this.schema.workflows.userId, userId)]);
    if (status) condition.push(inArray(this.schema.workflows.status, status));
    if (jobName) condition.push(eq(this.schema.workflows.jobName, jobName));

    const workflowsResult = await this.throwableQuery(() =>
      this.orm.select().from(this.schema.workflows).where(condition.join())
    );
    if (workflowsResult.isErr()) return err(workflowsResult.error);
    return ok(workflowsResult.value);
  }

  async added({
    userId,
    jobId,
    jobName,
    queueName,
    timeout,
    tags,
    input,
  }: {
    userId?: string;
    jobId: string;
    jobName: string;
    queueName: string;
    timeout?: number;
    tags?: string[];
    input: unknown;
  }): ServerResultAsync<WorkflowReadOutputSchema> {
    const wfResult = await this.throwableQuery(() =>
      this.orm
        .insert(this.schema.workflows)
        .values({
          userId,
          jobId,
          jobName,
          input,
          status: "queued",
          queueName,
          timeout,
          tags,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning()
    );
    if (wfResult.isErr()) return err(wfResult.error);
    const [wf] = wfResult.value;
    return ok(wf);
  }

  async addedMany(
    data: {
      userId?: string;
      jobId: string;
      jobName: string;
      queueName: string;
      timeout?: number;
      tags?: string[];
      input: unknown;
    }[]
  ): ServerResultAsync<WorkflowReadOutputSchema[]> {
    const wfsResult = await this.throwableQuery(() =>
      this.orm
        .insert(this.schema.workflows)
        .values(
          data.map((d) => ({
            userId: d.userId,
            jobId: d.jobId,
            jobName: d.jobName,
            queueName: d.queueName,
            timeout: d.timeout,
            tags: d.tags,
            input: d.input,
            status: "queued" as const,
            createdAt: new Date(),
            updatedAt: new Date(),
          }))
        )
        .returning()
    );
    if (wfsResult.isErr()) return err(wfsResult.error);
    return ok(wfsResult.value);
  }

  async started({
    jobId,
    jobName,
    queueName,
    userId,
  }: {
    jobId: string;
    jobName: string;
    queueName: string;
    userId?: string;
  }): ServerResultAsync<WorkflowReadOutputSchema> {
    const now = new Date();
    const conflictSet = {
      status: "running" as const,
      updatedAt: now,
      processedAt: now,
      ...(userId !== undefined ? { userId } : {}),
    };

    const wfResult = await this.throwableQuery(() =>
      this.orm
        .insert(this.schema.workflows)
        .values({
          jobId,
          jobName,
          queueName,
          userId,
          status: "running",
          retries: 0,
          tags: [],
          input: null,
          processedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: this.schema.workflows.jobId,
          set: conflictSet,
        })
        .returning()
    );
    if (wfResult.isErr()) return err(wfResult.error);
    const [wf] = wfResult.value;
    return ok(wf);
  }

  async failed({
    jobId,
    error,
  }: {
    jobId: string;
    error: string;
  }): ServerResultAsync<WorkflowReadOutputSchema> {
    const wfResult = await this.throwableQuery(() =>
      this.orm
        .update(this.schema.workflows)
        .set({
          status: "failed",
          error,
          retries: sql`COALESCE(${this.schema.workflows.retries}, 0) + 1`,
          updatedAt: new Date(),
          finishedAt: new Date(),
        })
        .where(eq(this.schema.workflows.jobId, jobId))
        .returning()
    );
    if (wfResult.isErr()) return err(wfResult.error);
    const [wf] = wfResult.value;
    return ok(wf);
  }

  async completed({
    jobId,
    output,
  }: {
    jobId: string;
    output: unknown;
  }): ServerResultAsync<WorkflowReadOutputSchema> {
    const wfResult = await this.throwableQuery(() =>
      this.orm
        .update(this.schema.workflows)
        .set({ status: "completed", updatedAt: new Date(), finishedAt: new Date(), output })
        .where(eq(this.schema.workflows.jobId, jobId))
        .returning()
    );
    if (wfResult.isErr()) return err(wfResult.error);
    const [wf] = wfResult.value;
    return ok(wf);
  }
}
