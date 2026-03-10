import type { Result } from "neverthrow";
import type { ServerError } from "#utils/errors";
import { logger } from "#utils/logger";

export async function handleAsyncTRPCResult<T>(result: Promise<Result<T, ServerError>>) {
  return handleTRPCResult(await result);
}

export function handleTRPCResult<T>(result: Result<T, ServerError>) {
  if (result.isErr()) {
    logger.debug("Is tRPC Error");
    logger.error({
      layer: result.error.layer,
      layerName: result.error.layerName,
      error: result.error.toJSON(),
    });
    throw result.error.toTRPC();
  }
  return result.value;
}
