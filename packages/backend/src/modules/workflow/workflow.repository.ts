import type {
  WorkflowListInputSchema,
  WorkflowListOutputSchema,
  WorkflowReadOutputSchema,
} from "@m5kdev/commons/modules/workflow/workflow.schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { ok } from "neverthrow";
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
    return this.throwableAsync(async () => {
      const [wf] = await this.orm
        .select()
        .from(this.schema.workflows)
        .where(
          and(eq(this.schema.workflows.jobId, jobId), eq(this.schema.workflows.userId, userId))
        );
      if (!wf) return this.error("NOT_FOUND");
      return ok(wf);
    });
  }

  async list({
    userId,
    status,
    jobName,
  }: WorkflowListInputSchema & {
    userId: string;
  }): ServerResultAsync<WorkflowListOutputSchema> {
    return this.throwableAsync(async () => {
      const { ConditionBuilder } = this.helpers;
      const condition = new ConditionBuilder([eq(this.schema.workflows.userId, userId)]);
      if (status) condition.push(inArray(this.schema.workflows.status, status));
      if (jobName) condition.push(eq(this.schema.workflows.jobName, jobName));

      const workflows = await this.orm.select().from(this.schema.workflows).where(condition.join());

      return ok(workflows);
    });
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
    return this.throwableAsync(async () => {
      const [wf] = await this.orm
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
        .returning();
      return ok(wf);
    });
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
    return this.throwableAsync(async () => {
      const wfs = await this.orm
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
        .returning();
      return ok(wfs);
    });
  }

  async started({ jobId }: { jobId: string }): ServerResultAsync<WorkflowReadOutputSchema> {
    return this.throwableAsync(async () => {
      const [wf] = await this.orm
        .update(this.schema.workflows)
        .set({ status: "running", updatedAt: new Date(), processedAt: new Date() })
        .where(eq(this.schema.workflows.jobId, jobId))
        .returning();
      return ok(wf);
    });
  }

  async failed({
    jobId,
    error,
  }: {
    jobId: string;
    error: string;
  }): ServerResultAsync<WorkflowReadOutputSchema> {
    return this.throwableAsync(async () => {
      const [wf] = await this.orm
        .update(this.schema.workflows)
        .set({
          status: "failed",
          error,
          retries: sql`${this.schema.workflows.retries} + 1`,
          updatedAt: new Date(),
          finishedAt: new Date(),
        })
        .where(eq(this.schema.workflows.jobId, jobId))
        .returning();
      return ok(wf);
    });
  }

  async completed({
    jobId,
    output,
  }: {
    jobId: string;
    output: unknown;
  }): ServerResultAsync<WorkflowReadOutputSchema> {
    return this.throwableAsync(async () => {
      const [wf] = await this.orm
        .update(this.schema.workflows)
        .set({ status: "completed", updatedAt: new Date(), finishedAt: new Date(), output })
        .where(eq(this.schema.workflows.jobId, jobId))
        .returning();
      return ok(wf);
    });
  }
}
