import { type Client, LibsqlError, type Transaction } from "@libsql/client";
import { getLibsqlErrorCode, isRetryableLibsqlError, withLibsqlRetry } from "./libsql";

function streamError(): LibsqlError {
  return new LibsqlError("stream not found", "HRANA_WEBSOCKET_ERROR");
}

function makeClient(overrides: Partial<Client> = {}): Client & { reconnect: jest.Mock } {
  return {
    execute: jest.fn().mockResolvedValue({ rows: [] }),
    batch: jest.fn().mockResolvedValue([]),
    migrate: jest.fn().mockResolvedValue([]),
    executeMultiple: jest.fn().mockResolvedValue(undefined),
    sync: jest.fn().mockResolvedValue(undefined),
    transaction: jest.fn(),
    close: jest.fn(),
    reconnect: jest.fn(),
    closed: false,
    protocol: "file",
    ...overrides,
  } as unknown as Client & { reconnect: jest.Mock };
}

describe("isRetryableLibsqlError", () => {
  it("matches hrana transport errors by code", () => {
    expect(isRetryableLibsqlError(streamError())).toBe(true);
    expect(isRetryableLibsqlError(new LibsqlError("proto", "HRANA_PROTO_ERROR"))).toBe(true);
  });

  it("matches server errors only for stream/baton messages", () => {
    expect(isRetryableLibsqlError(new LibsqlError("The stream has expired", "SERVER_ERROR"))).toBe(
      true
    );
    expect(isRetryableLibsqlError(new LibsqlError("Invalid baton", "SERVER_ERROR"))).toBe(true);
    expect(
      isRetryableLibsqlError(new LibsqlError("UNIQUE constraint failed", "SQLITE_CONSTRAINT"))
    ).toBe(false);
  });

  it("matches embedded-replica Hrana(Api) stream-not-found SQLITE_* errors", () => {
    const embedded = new LibsqlError(
      'Hrana(Api("status=404 Not Found, body={\\"error\\":\\"stream not found: 32fa65f6:927a6\\"}"))',
      "SQLITE_ERROR"
    );
    expect(isRetryableLibsqlError(embedded)).toBe(true);
    expect(
      isRetryableLibsqlError(new LibsqlError('Hrana(Api("status=404 Not Found"))', "SQLITE_IOERR"))
    ).toBe(true);
  });

  it("matches plain Error Hrana stream-not-found messages from native bindings", () => {
    const plain = new Error(
      'Hrana(Api("status=404 Not Found, body={\\"error\\":\\"stream not found: 436821a5:cbf426\\"}"))'
    );
    expect(isRetryableLibsqlError(plain)).toBe(true);
  });

  it("matches duck-typed libsql errors when instanceof fails across package copies", () => {
    const duckTyped = Object.assign(new Error("stream not found: dead:stream"), {
      code: "SQLITE_ERROR",
    });
    expect(getLibsqlErrorCode(duckTyped)).toBe("SQLITE_ERROR");
    expect(isRetryableLibsqlError(duckTyped)).toBe(true);
  });

  it("matches LibsqlError whose cause carries the Hrana stream message", () => {
    const cause = new Error(
      'Hrana(Api("status=404 Not Found, body={\\"error\\":\\"stream not found: abc:def\\"}"))'
    );
    const wrapped = new LibsqlError("query failed", "SERVER_ERROR", undefined, undefined, cause);
    expect(isRetryableLibsqlError(wrapped)).toBe(true);
  });

  it("ignores unrelated plain errors", () => {
    expect(isRetryableLibsqlError(new Error("UNIQUE constraint failed"))).toBe(false);
  });
});

describe("withLibsqlRetry", () => {
  it("reconnects and retries a call that fails on a dead stream", async () => {
    const inner = makeClient({
      execute: jest
        .fn()
        .mockRejectedValueOnce(streamError())
        .mockResolvedValueOnce({ rows: [{ ok: 1 }] }) as never,
    });
    const client = withLibsqlRetry(inner, { backoffMs: 1 });

    const result = await client.execute("select 1");

    expect(result).toEqual({ rows: [{ ok: 1 }] });
    expect(inner.execute).toHaveBeenCalledTimes(2);
    expect(inner.reconnect).toHaveBeenCalledTimes(1);
  });

  it("reconnects and retries embedded-replica SQLITE_* stream-not-found errors", async () => {
    const embedded = new LibsqlError(
      'Hrana(Api("status=404 Not Found, body={\\"error\\":\\"stream not found: dead:stream\\"}"))',
      "SQLITE_ERROR"
    );
    const inner = makeClient({
      execute: jest
        .fn()
        .mockRejectedValueOnce(embedded)
        .mockResolvedValueOnce({ rows: [{ ok: 1 }] }) as never,
    });
    const client = withLibsqlRetry(inner, { backoffMs: 1 });

    await expect(client.execute("select 1")).resolves.toEqual({ rows: [{ ok: 1 }] });
    expect(inner.reconnect).toHaveBeenCalledTimes(1);
  });

  it("reconnects and retries plain Error Hrana stream-not-found failures", async () => {
    const plain = new Error(
      'Hrana(Api("status=404 Not Found, body={\\"error\\":\\"stream not found: plain:err\\"}"))'
    );
    const logger = { warn: jest.fn(), error: jest.fn() };
    const inner = makeClient({
      execute: jest
        .fn()
        .mockRejectedValueOnce(plain)
        .mockResolvedValueOnce({ rows: [{ ok: 1 }] }) as never,
    });
    const client = withLibsqlRetry(inner, { backoffMs: 1, logger: logger as never });

    await expect(client.execute("select 1")).resolves.toEqual({ rows: [{ ok: 1 }] });
    expect(inner.reconnect).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ method: "execute", attempt: 1 }),
      "libsql call failed on a dead hrana stream; reconnecting and retrying"
    );
  });

  it("logs non-retryable failures including plain Errors", async () => {
    const failure = new Error("UNIQUE constraint failed");
    const logger = { warn: jest.fn(), error: jest.fn() };
    const inner = makeClient({ execute: jest.fn().mockRejectedValue(failure) as never });
    const client = withLibsqlRetry(inner, { backoffMs: 1, logger: logger as never });

    await expect(client.execute("insert ...")).rejects.toBe(failure);
    expect(inner.execute).toHaveBeenCalledTimes(1);
    expect(inner.reconnect).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ method: "execute", err: failure }),
      "libsql call failed with non-retryable error"
    );
  });

  it("does not retry non-retryable errors", async () => {
    const failure = new LibsqlError("UNIQUE constraint failed", "SQLITE_CONSTRAINT");
    const inner = makeClient({ execute: jest.fn().mockRejectedValue(failure) as never });
    const client = withLibsqlRetry(inner, { backoffMs: 1 });

    await expect(client.execute("insert ...")).rejects.toBe(failure);
    expect(inner.execute).toHaveBeenCalledTimes(1);
    expect(inner.reconnect).not.toHaveBeenCalled();
  });

  it("gives up after maxRetries and surfaces the last error", async () => {
    const inner = makeClient({ execute: jest.fn().mockRejectedValue(streamError()) as never });
    const client = withLibsqlRetry(inner, { maxRetries: 2, backoffMs: 1 });

    await expect(client.execute("select 1")).rejects.toBeInstanceOf(LibsqlError);
    expect(inner.execute).toHaveBeenCalledTimes(3);
    expect(inner.reconnect).toHaveBeenCalledTimes(2);
  });

  it("retries the transaction open but returns the transaction untouched", async () => {
    const tx = { execute: jest.fn(), commit: jest.fn(), close: jest.fn() };
    const inner = makeClient({
      transaction: jest
        .fn()
        .mockRejectedValueOnce(streamError())
        .mockResolvedValueOnce(tx as unknown as Transaction) as never,
    });
    const client = withLibsqlRetry(inner, { backoffMs: 1 });

    const opened = await client.transaction("write");

    expect(opened).toBe(tx);
    expect(inner.transaction).toHaveBeenCalledTimes(2);
  });

  it("is idempotent when wrapping an already-wrapped client", async () => {
    const inner = makeClient({
      execute: jest.fn().mockResolvedValue({ rows: [{ ok: 1 }] }) as never,
    });
    const once = withLibsqlRetry(inner, { backoffMs: 1 });
    const twice = withLibsqlRetry(once, { backoffMs: 1 });

    expect(twice).toBe(once);
    await expect(twice.execute("select 1")).resolves.toEqual({ rows: [{ ok: 1 }] });
    expect(inner.execute).toHaveBeenCalledTimes(1);
  });

  it("delegates non-retried members to the inner client", () => {
    const inner = makeClient();
    const client = withLibsqlRetry(inner, { backoffMs: 1 });

    client.close();

    expect(inner.close).toHaveBeenCalledTimes(1);
    expect(client.protocol).toBe("file");
  });
});
