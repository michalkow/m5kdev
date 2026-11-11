import type { ErrorRequestHandler } from "express";
import { captureServerError, reportError, ServerError } from "./errors";
import { logger } from "./logger";

/** Terminal HTTP reporting; Express retains ownership of the error response. */
export const handleHTTPBoundaryError: ErrorRequestHandler = (error, req, res, next) => {
  const serverError =
    error instanceof ServerError
      ? error
      : error instanceof Error && error.cause instanceof ServerError
        ? error.cause
        : undefined;
  const status =
    serverError?.getHTTPStatusCode() ??
    [error?.status, error?.statusCode, res.statusCode].find(
      (candidate) => Number.isInteger(candidate) && candidate >= 400 && candidate <= 599
    ) ??
    500;
  const properties = { method: req.method, path: req.path, httpStatus: status };
  if (serverError) {
    serverError.addContext(properties);
    captureServerError(serverError);
    logger.warn(
      { ...properties, code: serverError.code, errorEventId: serverError.errorEventId },
      serverError.message
    );
  } else {
    if (status >= 500) reportError(error, properties);
    logger[status >= 500 ? "error" : "warn"]({ ...properties, err: error }, "HTTP request failed");
  }
  if (!res.headersSent) res.statusCode = status;
  next(error);
};
