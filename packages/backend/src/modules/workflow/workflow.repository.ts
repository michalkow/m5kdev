import type {
  WorkflowListInputSchema,
  WorkflowListOutputSchema,
  WorkflowReadOutputSchema,
} from "@m5kdev/commons/modules/workflow/workflow.schema";
import { and, asc, eq, inArray, lt, type SQL, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { err, ok } from "neverthrow";
import type { ServerResultAsync } from "../base/base.dto";
import { BaseRepository } from "../base/base.repository";
import { workflows } from "./workflow.db";

const schema = { workflows };

type Schema = typeof schema;
type Orm = LibSQLDatabase<Schema>;

/**
 * Sync model: BullMQ/Redis is the runtime source of truth; this table is a
 * write-behind log. Queue events can arrive in any order (a fast job can
 * complete before the trigger's own insert lands), so every write is an upsert
 * guarded by status precedence — queued < running < completed/failed — and a
 * terminal status is never overwritten. Any arrival order converges to the
 * same row.
 */
export class WorkflowRepository extends BaseRepository<Orm, Schema, Record<string, never>> {
  /** `status` is terminal — SQL predicate against the existing row. */
  private terminalStatus(): SQL {
    return sql`${this.schema.workflows.status} IN ('completed', 'failed')`;
  }

  /** Epoch seconds for raw SQL against `integer(..., { mode: "timestamp" })` columns. */
  private static toEpochSeconds(date: Date): number {
    return Math.floor(date.getTime() / 1000);
  }

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

  /**
   * Conflict set shared by {@link added} / {@link addedMany}.
   *
   * A conflicting row is either a previous run of the same deterministic jobId
   * (stale — `updated_at` predates this trigger) or the current run whose queue
   * events landed before this insert (fresh). Stale rows are reset for the new
   * run; fresh rows keep their status (which may already be terminal) and only
   * receive the trigger-side fields the events couldn't know (input, tags, …).
   */
  private addedConflictSet(triggeredAt: Date) {
    const t0 = WorkflowRepository.toEpochSeconds(triggeredAt);
    const stale = sql`${this.schema.workflows.updatedAt} < ${t0}`;
    return {
      status: sql`CASE WHEN ${stale} THEN 'queued' ELSE ${this.schema.workflows.status} END`,
      output: sql`CASE WHEN ${stale} THEN NULL ELSE ${this.schema.workflows.output} END`,
      error: sql`CASE WHEN ${stale} THEN NULL ELSE ${this.schema.workflows.error} END`,
      retries: sql`CASE WHEN ${stale} THEN 0 ELSE ${this.schema.workflows.retries} END`,
      finishedAt: sql`CASE WHEN ${stale} THEN NULL ELSE ${this.schema.workflows.finishedAt} END`,
      processedAt: sql`CASE WHEN ${stale} THEN NULL ELSE ${this.schema.workflows.processedAt} END`,
      createdAt: sql`CASE WHEN ${stale} THEN excluded.created_at ELSE ${this.schema.workflows.createdAt} END`,
      userId: sql`COALESCE(excluded.user_id, ${this.schema.workflows.userId})`,
      jobName: sql`excluded.job_name`,
      queueName: sql`excluded.queue_name`,
      timeout: sql`COALESCE(excluded.timeout, ${this.schema.workflows.timeout})`,
      tags: sql`excluded.tags`,
      input: sql`excluded.input`,
      updatedAt: sql`excluded.updated_at`,
    };
  }

  async added({
    userId,
    jobId,
    jobName,
    queueName,
    timeout,
    tags,
    input,
    triggeredAt,
  }: {
    userId?: string;
    jobId: string;
    jobName: string;
    queueName: string;
    timeout?: number;
    tags?: string[];
    input: unknown;
    /** When the trigger began — rows last touched before this belong to a previous run. */
    triggeredAt?: Date;
  }): ServerResultAsync<WorkflowReadOutputSchema> {
    const now = new Date();
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
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: this.schema.workflows.jobId,
          set: this.addedConflictSet(triggeredAt ?? now),
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
    }[],
    { triggeredAt }: { triggeredAt?: Date } = {}
  ): ServerResultAsync<WorkflowReadOutputSchema[]> {
    if (data.length === 0) return ok([]);
    const now = new Date();
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
            createdAt: now,
            updatedAt: now,
          }))
        )
        .onConflictDoUpdate({
          target: this.schema.workflows.jobId,
          set: this.addedConflictSet(triggeredAt ?? now),
        })
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
    const nowSec = WorkflowRepository.toEpochSeconds(now);
    const terminal = this.terminalStatus();

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
          set: {
            // a stale active event must never resurrect a terminal row
            status: sql`CASE WHEN ${terminal} THEN ${this.schema.workflows.status} ELSE 'running' END`,
            processedAt: sql`CASE WHEN ${terminal} THEN ${this.schema.workflows.processedAt} ELSE ${nowSec} END`,
            // the trigger-side insert has richer data; only fill gaps
            userId: sql`COALESCE(${this.schema.workflows.userId}, excluded.user_id)`,
            updatedAt: sql`${nowSec}`,
          },
        })
        .returning()
    );
    if (wfResult.isErr()) return err(wfResult.error);
    const [wf] = wfResult.value;
    return ok(wf);
  }

  async completed({
    jobId,
    queueName,
    jobName,
    output,
  }: {
    jobId: string;
    queueName: string;
    jobName?: string;
    output: unknown;
  }): ServerResultAsync<WorkflowReadOutputSchema> {
    const now = new Date();
    const nowSec = WorkflowRepository.toEpochSeconds(now);
    const terminal = this.terminalStatus();

    const wfResult = await this.throwableQuery(() =>
      this.orm
        .insert(this.schema.workflows)
        .values({
          jobId,
          jobName: jobName ?? "__unknown__",
          queueName,
          status: "completed",
          output,
          input: null,
          tags: [],
          retries: 0,
          finishedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: this.schema.workflows.jobId,
          set: {
            // first terminal status wins; never flip failed -> completed
            status: sql`CASE WHEN ${terminal} THEN ${this.schema.workflows.status} ELSE 'completed' END`,
            output: sql`CASE WHEN ${terminal} THEN ${this.schema.workflows.output} ELSE excluded.output END`,
            finishedAt: sql`CASE WHEN ${terminal} THEN ${this.schema.workflows.finishedAt} ELSE ${nowSec} END`,
            updatedAt: sql`${nowSec}`,
          },
        })
        .returning()
    );
    if (wfResult.isErr()) return err(wfResult.error);
    const [wf] = wfResult.value;
    return ok(wf);
  }

  async failed({
    jobId,
    queueName,
    jobName,
    error,
    retries,
  }: {
    jobId: string;
    queueName: string;
    jobName?: string;
    error: string;
    /** `job.attemptsMade` when known; falls back to incrementing. */
    retries?: number;
  }): ServerResultAsync<WorkflowReadOutputSchema> {
    const now = new Date();
    const nowSec = WorkflowRepository.toEpochSeconds(now);
    const terminal = this.terminalStatus();
    const retriesValue =
      retries !== undefined
        ? sql`${retries}`
        : sql`COALESCE(${this.schema.workflows.retries}, 0) + 1`;

    const wfResult = await this.throwableQuery(() =>
      this.orm
        .insert(this.schema.workflows)
        .values({
          jobId,
          jobName: jobName ?? "__unknown__",
          queueName,
          status: "failed",
          error,
          input: null,
          tags: [],
          retries: retries ?? 1,
          finishedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: this.schema.workflows.jobId,
          set: {
            // first terminal status wins; never flip completed -> failed
            status: sql`CASE WHEN ${terminal} THEN ${this.schema.workflows.status} ELSE 'failed' END`,
            error: sql`CASE WHEN ${terminal} THEN ${this.schema.workflows.error} ELSE excluded.error END`,
            retries: sql`CASE WHEN ${terminal} THEN ${this.schema.workflows.retries} ELSE ${retriesValue} END`,
            finishedAt: sql`CASE WHEN ${terminal} THEN ${this.schema.workflows.finishedAt} ELSE ${nowSec} END`,
            updatedAt: sql`${nowSec}`,
          },
        })
        .returning()
    );
    if (wfResult.isErr()) return err(wfResult.error);
    const [wf] = wfResult.value;
    return ok(wf);
  }

  /** Non-terminal rows not touched since `before` — candidates for reconciliation. */
  async listStale({
    before,
    limit,
  }: {
    before: Date;
    limit: number;
  }): ServerResultAsync<WorkflowReadOutputSchema[]> {
    const rowsResult = await this.throwableQuery(() =>
      this.orm
        .select()
        .from(this.schema.workflows)
        .where(
          and(
            inArray(this.schema.workflows.status, ["queued", "running"]),
            lt(this.schema.workflows.updatedAt, before)
          )
        )
        .orderBy(asc(this.schema.workflows.updatedAt))
        .limit(limit)
    );
    if (rowsResult.isErr()) return err(rowsResult.error);
    return ok(rowsResult.value);
  }

  /** Bump `updatedAt` after confirming the job is still alive in Redis. */
  async touch(jobId: string): ServerResultAsync<void> {
    const result = await this.throwableQuery(() =>
      this.orm
        .update(this.schema.workflows)
        .set({ updatedAt: new Date() })
        .where(eq(this.schema.workflows.jobId, jobId))
    );
    if (result.isErr()) return err(result.error);
    return ok(undefined);
  }
}
