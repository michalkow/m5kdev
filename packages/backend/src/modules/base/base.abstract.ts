import type { TRPC_ERROR_CODE_KEY } from "@trpc/server";
import { err } from "neverthrow";
import type { ServerResult, ServerResultAsync } from "./base.dto";
import type { ServerErrorLayer } from "./base.types";
import { reportError, ServerError } from "../../utils/errors";
import { logger } from "../../utils/logger";

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
      log = process.env.NODE_ENV === "development",
    }: { cause?: unknown; clientMessage?: string; log?: boolean } = {}
  ) {
    const serverError = new ServerError({
      code,
      layer: this.layer,
      layerName: this.constructor.name,
      message,
      clientMessage,
      cause,
      captureBoundary: true,
    });
    if (serverError.is5xxError()) reportError(serverError);
    if (log) logger.error(serverError);
    return err(serverError);
  }

  handleUnknownError(error: unknown) {
    return ServerError.fromUnknown("INTERNAL_SERVER_ERROR", error, {
      layer: this.layer,
      layerName: this.constructor.name,
    });
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
      return fn();
    } catch (error) {
      return err(this.handleUnknownError(error));
    }
  }
}
