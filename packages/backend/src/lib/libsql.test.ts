import { type Client, LibsqlError, type Transaction } from "@libsql/client";
import { isRetryableLibsqlError, withLibsqlRetry } from "./libsql";

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

  it("ignores non-libsql errors", () => {
    expect(isRetryableLibsqlError(new Error("stream not found"))).toBe(false);
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

  it("delegates non-retried members to the inner client", () => {
    const inner = makeClient();
    const client = withLibsqlRetry(inner, { backoffMs: 1 });

    client.close();

    expect(inner.close).toHaveBeenCalledTimes(1);
    expect(client.protocol).toBe("file");
  });
});
