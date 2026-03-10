import type { Result } from "neverthrow";
import type { ServerError } from "./errors";

export type ServerResult<T> = Result<T, ServerError>;
export type ServerResultAsync<T> = Promise<ServerResult<T>>;
