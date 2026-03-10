import type { Job, JobsOptions } from "bullmq";
import type { ServerResultAsync } from "#modules/base/base.dto";
import type { ServerError } from "#utils/errors";

export type WorkflowMeta = {
  queue?: string;
  userId?: string;
  tags?: string[];
  timeout?: number;
  disablePosthogCapture?: boolean;
};

export type WorkflowDataType<Payload> = {
  payload: Payload;
  meta: WorkflowMeta;
};

export type WorkflowJob<
  DataType extends WorkflowDataType<any>,
  ReturnType extends ServerResultAsync<any>,
  Name extends string,
> = JobsOptions & {
  run: (job: Job<DataType, ReturnType, Name>) => ReturnType;
  onComplete?: (job: Job<DataType, ReturnType, Name>) => ReturnType;
  onSuccess?: (job: Job<DataType, ReturnType, Name>) => ServerResultAsync<any>;
  onFailure?: (
    job: Job<DataType, ReturnType, Name>,
    error?: ServerError | unknown
  ) => ServerResultAsync<any>;
};
