import type { Config } from "@libsql/client";

const sync = jest.fn(async () => undefined);
const close = jest.fn(async () => undefined);

jest.mock("@libsql/client", () => {
  const actual: typeof import("@libsql/client") = jest.requireActual("@libsql/client");
  return {
    ...actual,
    createClient: (config: Config) => {
      if (config.syncUrl) {
        return {
          sync,
          close,
          execute: jest.fn(async () => ({
            rows: [],
            columns: [],
            columnTypes: [],
            rowsAffected: 0,
            lastInsertRowid: 0n,
          })),
          batch: jest.fn(),
          migrate: jest.fn(),
          executeMultiple: jest.fn(),
          transaction: jest.fn(),
        };
      }
      return actual.createClient(config);
    },
  };
});

jest.mock("@m5kdev/commons/utils/trpc", () => ({
  transformer: {
    serialize: (value: unknown) => value,
    deserialize: (value: unknown) => value,
  },
}));

jest.mock("better-auth/node", () => ({
  toNodeHandler: () => () => undefined,
  fromNodeHeaders: (headers: unknown) => headers,
}));

import { createBackendApp } from "./app";

describe("createBackendApp embedded replica sync", () => {
  beforeEach(() => {
    sync.mockClear();
    close.mockClear();
  });

  it("awaits client.sync when db config has syncUrl, including start({ listen: false })", async () => {
    const built = createBackendApp({
      db: {
        url: "file:./local.db",
        syncUrl: "libsql://example.turso.io",
        authToken: "token",
      },
    });

    await built.start({ listen: false });
    expect(sync).toHaveBeenCalledTimes(1);
    await built.shutdown();
  });

  it("does not sync for local file-only db config", async () => {
    const built = createBackendApp({
      db: {
        url: ":memory:",
      },
    });

    await built.start({ listen: false });
    expect(sync).not.toHaveBeenCalled();
    await built.shutdown();
  });
});
