import type { TRPC_ERROR_CODE_KEY } from "@trpc/server";
import { err, ok } from "neverthrow";
import { captureServerError, ServerError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import type { ServerResult, ServerResultAsync } from "./base.dto";
import type { ServerErrorLayer } from "./base.types";

export abstract class Base {
  public layer: ServerErrorLayer;
  public logger: ReturnType<typeof logger.child>;

  constructor(layer: ServerErrorLayer) {
    this.layer = layer;
    this.logger = logger.child({ layer: this.layer, layerName: this.constructor.name });
  }

  error(
    code: TRPC_ERROR_CODE_KEY,
    message?: string,
    {
      cause,
      clientMessage,
      context,
      log = true,
    }: {
      cause?: unknown;
      clientMessage?: string;
      context?: Record<string, unknown>;
      log?: boolean;
    } = {}
  ) {
    const serverError = new ServerError({
      code,
      layer: this.layer,
      layerName: this.constructor.name,
      message,
      clientMessage,
      cause,
      context,
    });
    Error.captureStackTrace?.(serverError, this.error);
    serverError.refreshOrigin();
    // capture at creation so the error survives even if the Result is dropped;
    // log: false only demotes the log line to debug, Sentry still gets 5xx
    captureServerError(serverError, {
      logger: this.logger,
      level: log ? undefined : "debug",
    });
    return err(serverError);
  }

  handleUnknownError(error: unknown) {
    // a thrown ServerError keeps its code and its original capture
    if (error instanceof ServerError) {
      return captureServerError(error, { logger: this.logger });
    }
    const serverError = ServerError.fromUnknown("INTERNAL_SERVER_ERROR", error, {
      layer: this.layer,
      layerName: this.constructor.name,
    });
    return captureServerError(serverError, { logger: this.logger });
  }

  throwable<T>(fn: () => ServerResult<T>): ServerResult<T> {
    try {
      return fn();
    } catch (error) {
      return err(this.handleUnknownError(error));
    }
  }

  async throwableAsync<T>(fn: () => ServerResultAsync<T>): ServerResultAsync<T> {
    try {
      return await fn();
    } catch (error) {
      return err(this.handleUnknownError(error));
    }
  }

  async throwablePromise<T>(
    fn: () => Promise<T>,
    errorHandler?: (error: unknown) => ServerError
  ): ServerResultAsync<T> {
    try {
      const result = await fn();
      return ok(result);
    } catch (error) {
      return err(errorHandler ? errorHandler(error) : this.handleUnknownError(error));
    }
  }
}
