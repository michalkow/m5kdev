import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import * as libsql from "@libsql/client";
import { type Client, createClient } from "@libsql/client";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { defineDrizzleKitConfig, runDb } from "./db";

const items = sqliteTable("items", {
  id: integer("id").primaryKey(),
  value: integer("value").notNull(),
});

const schema = { items };

async function withArgv(input: {
  command: string;
  extra?: string;
  run: () => Promise<void>;
}): Promise<void> {
  const previous = process.argv;
  process.argv = ["node", "db.ts", input.command, ...(input.extra ? [input.extra] : [])];
  try {
    await input.run();
  } finally {
    process.argv = previous;
  }
}

async function listen(): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      resolve(server);
    });
    server.on("error", reject);
  });
}

function fakeReplicaClient(sync: jest.Mock): Client {
  return {
    execute: jest.fn().mockResolvedValue({ rows: [] }),
    batch: jest.fn().mockResolvedValue([]),
    migrate: jest.fn().mockResolvedValue([]),
    executeMultiple: jest.fn().mockResolvedValue(undefined),
    sync,
    transaction: jest.fn(),
    close: jest.fn(),
    reconnect: jest.fn(),
    closed: false,
    protocol: "file",
  } as unknown as Client;
}

describe("runDb", () => {
  let tempRoot: string;
  let previousArgv: string[];

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-rundb-"));
    previousArgv = process.argv;
  });

  afterEach(async () => {
    process.argv = previousArgv;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("fails clearly on an unknown Database command", async () => {
    await expect(
      withArgv({
        command: "vacuum",
        run: () =>
          runDb({
            schema,
            databaseUrl: `file:${path.join(tempRoot, "local.db")}`,
            skipGuard: true,
          }),
      })
    ).rejects.toThrow(/unknown database command/i);
  });

  it("fails when an extra positional token follows a valid command", async () => {
    await expect(
      withArgv({
        command: "reset",
        extra: "vacuum",
        run: () =>
          runDb({
            schema,
            databaseUrl: `file:${path.join(tempRoot, "local.db")}`,
            skipGuard: true,
          }),
      })
    ).rejects.toThrow(/unknown database command/i);
  });

  it("fails clearly when seed is omitted for the seed command", async () => {
    await expect(
      withArgv({
        command: "seed",
        run: () =>
          runDb({
            schema,
            databaseUrl: `file:${path.join(tempRoot, "local.db")}`,
            skipGuard: true,
          }),
      })
    ).rejects.toThrow(/seed/i);
  });

  it("reset deletes the sqlite file and sidecars and recreates the directory", async () => {
    const dbPath = path.join(tempRoot, "data", "local.db");
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    await fs.writeFile(dbPath, "db");
    await fs.writeFile(`${dbPath}-wal`, "wal");
    await fs.writeFile(`${dbPath}-shm`, "shm");
    await fs.writeFile(`${dbPath}-journal`, "journal");
    await fs.writeFile(`${dbPath}-info`, "info");
    await fs.writeFile(`${dbPath}-client_wal_index`, "idx");

    await withArgv({
      command: "reset",
      run: () =>
        runDb({
          schema,
          databaseUrl: `file:${dbPath}`,
          skipGuard: true,
        }),
    });

    await expect(fs.access(dbPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.access(`${dbPath}-wal`)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.access(`${dbPath}-shm`)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.access(`${dbPath}-journal`)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.access(`${dbPath}-info`)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.access(`${dbPath}-client_wal_index`)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect((await fs.stat(path.dirname(dbPath))).isDirectory()).toBe(true);
  });

  it("reset wipes the email output directory when set", async () => {
    const emailDir = path.join(tempRoot, "emails");
    await fs.mkdir(emailDir, { recursive: true });
    await fs.writeFile(path.join(emailDir, "note.html"), "hi");

    await withArgv({
      command: "reset",
      run: () =>
        runDb({
          schema,
          databaseUrl: `file:${path.join(tempRoot, "local.db")}`,
          skipGuard: true,
          emailOutputDirectory: emailDir,
        }),
    });

    await expect(fs.access(path.join(emailDir, "note.html"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect((await fs.stat(emailDir)).isDirectory()).toBe(true);
  });

  it("reset does not delete ./local.db when DATABASE_URL is unset", async () => {
    const previousCwd = process.cwd();
    const previousUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    const sentinel = path.join(tempRoot, "local.db");
    await fs.writeFile(sentinel, "keep");

    try {
      process.chdir(tempRoot);
      await withArgv({
        command: "reset",
        run: () =>
          runDb({
            schema,
            skipGuard: true,
          }),
      });
      expect(await fs.readFile(sentinel, "utf8")).toBe("keep");
    } finally {
      process.chdir(previousCwd);
      if (previousUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousUrl;
      }
    }
  });

  it("reset does not delete a non-file database URL", async () => {
    const sentinel = path.join(tempRoot, "keep.txt");
    await fs.writeFile(sentinel, "keep");

    await withArgv({
      command: "reset",
      run: () =>
        runDb({
          schema,
          databaseUrl: "libsql://example.invalid",
          skipGuard: true,
        }),
    });

    expect(await fs.readFile(sentinel, "utf8")).toBe("keep");
  });

  it("guard fails when a file database is used and PORT is occupied", async () => {
    const blocker = await listen();
    const address = blocker.address();
    if (address === null || typeof address === "string") {
      throw new Error("expected a TCP port");
    }
    const port = address.port;
    const dbPath = path.join(tempRoot, "local.db");
    await fs.writeFile(dbPath, "db");

    try {
      await expect(
        withArgv({
          command: "reset",
          run: () =>
            runDb({
              schema,
              databaseUrl: `file:${dbPath}`,
              port,
              skipGuard: false,
            }),
        })
      ).rejects.toThrow(/stop the dev server/i);
      expect(await fs.readFile(dbPath, "utf8")).toBe("db");
    } finally {
      await new Promise<void>((resolve) => {
        blocker.close(() => resolve());
      });
    }
  });

  it("guard succeeds when SKIP_DB_GUARD is set even if PORT is occupied", async () => {
    const blocker = await listen();
    const address = blocker.address();
    if (address === null || typeof address === "string") {
      throw new Error("expected a TCP port");
    }
    const port = address.port;
    const dbPath = path.join(tempRoot, "local.db");
    await fs.writeFile(dbPath, "db");

    try {
      await withArgv({
        command: "reset",
        run: () =>
          runDb({
            schema,
            databaseUrl: `file:${dbPath}`,
            port,
            skipGuard: true,
          }),
      });
      await expect(fs.access(dbPath)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await new Promise<void>((resolve) => {
        blocker.close(() => resolve());
      });
    }
  });

  it("guard succeeds when PORT is free", async () => {
    const dbPath = path.join(tempRoot, "local.db");
    await fs.writeFile(dbPath, "db");

    await withArgv({
      command: "reset",
      run: () =>
        runDb({
          schema,
          databaseUrl: `file:${dbPath}`,
          port: 59999,
          skipGuard: false,
        }),
    });
    await expect(fs.access(dbPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("sync succeeds as a no-op for a local-only database", async () => {
    const dbPath = path.join(tempRoot, "local.db");
    await withArgv({
      command: "sync",
      run: () =>
        runDb({
          schema,
          databaseUrl: `file:${dbPath}`,
          skipGuard: true,
        }),
    });
  });

  it("syncs a replica client", async () => {
    const sync = jest.fn().mockResolvedValue(undefined);
    const spy = jest.spyOn(libsql, "createClient").mockReturnValue(fakeReplicaClient(sync));
    try {
      await withArgv({
        command: "sync",
        run: () =>
          runDb({
            schema,
            databaseUrl: `file:${path.join(tempRoot, "local.db")}`,
            tursoDatabaseUrl: "libsql://example.turso.io",
            tursoAuthToken: "token",
            skipGuard: true,
          }),
      });
      expect(sync).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("seed syncs a replica client before the callback", async () => {
    const sync = jest.fn().mockResolvedValue(undefined);
    const spy = jest.spyOn(libsql, "createClient").mockReturnValue(fakeReplicaClient(sync));
    try {
      await withArgv({
        command: "seed",
        run: () =>
          runDb({
            schema,
            databaseUrl: `file:${path.join(tempRoot, "local.db")}`,
            tursoDatabaseUrl: "libsql://example.turso.io",
            tursoAuthToken: "token",
            skipGuard: true,
            seed: async ({ isRemote }) => {
              expect(isRemote).toBe(true);
              expect(sync).toHaveBeenCalled();
            },
          }),
      });
    } finally {
      spy.mockRestore();
    }
  });

  it("seed skips replica sync when syncBeforeSeed is false", async () => {
    const sync = jest.fn().mockResolvedValue(undefined);
    const spy = jest.spyOn(libsql, "createClient").mockReturnValue(fakeReplicaClient(sync));
    try {
      await withArgv({
        command: "seed",
        run: () =>
          runDb({
            schema,
            databaseUrl: `file:${path.join(tempRoot, "local.db")}`,
            tursoDatabaseUrl: "libsql://example.turso.io",
            tursoAuthToken: "token",
            skipGuard: true,
            syncBeforeSeed: false,
            seed: async () => undefined,
          }),
      });
      expect(sync).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("reset uses DATABASE_URL from env when the knob is omitted", async () => {
    const dbPath = path.join(tempRoot, "from-env.db");
    await fs.writeFile(dbPath, "db");
    const previousUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = `file:${dbPath}`;
    try {
      await withArgv({
        command: "reset",
        run: () =>
          runDb({
            schema,
            skipGuard: true,
          }),
      });
      await expect(fs.access(dbPath)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      if (previousUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousUrl;
      }
    }
  });

  it("does not import the HTTP Kernel or queue libraries", async () => {
    const source = await fs.readFile(path.join(__dirname, "db.ts"), "utf8");
    expect(source).not.toMatch(/createBackendApp/);
    expect(source).not.toMatch(/ioredis/);
    expect(source).not.toMatch(/bullmq/);
  });

  it("seed inserts rows the caller can read back", async () => {
    const dbPath = path.join(tempRoot, "local.db");
    const databaseUrl = `file:${dbPath}`;
    const setup = createClient({ url: databaseUrl });
    await setup.execute("CREATE TABLE items (id INTEGER PRIMARY KEY, value INTEGER NOT NULL)");
    await setup.close();

    await withArgv({
      command: "seed",
      run: () =>
        runDb({
          schema,
          databaseUrl,
          skipGuard: true,
          seed: async ({ orm, schema: tables, client, isRemote }) => {
            expect(client).toBeDefined();
            expect(isRemote).toBe(false);
            await orm.insert(tables.items).values({ id: 1, value: 42 });
          },
        }),
    });

    const reader = createClient({ url: databaseUrl });
    const result = await reader.execute("SELECT value FROM items WHERE id = 1");
    await reader.close();
    expect(result.rows[0]?.value).toBe(42);
  });
});

describe("defineDrizzleKitConfig", () => {
  const keys = ["DATABASE_URL", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"] as const;
  const previous: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of keys) {
      previous[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("selects sqlite when only DATABASE_URL is set", () => {
    process.env.DATABASE_URL = "file:./local.db";
    expect(defineDrizzleKitConfig({ schema: "./src/schema.ts" })).toEqual({
      dialect: "sqlite",
      schema: "./src/schema.ts",
      out: "./drizzle",
      dbCredentials: { url: "file:./local.db" },
    });
  });

  it("selects turso when TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are set", () => {
    process.env.TURSO_DATABASE_URL = "libsql://example.turso.io";
    process.env.TURSO_AUTH_TOKEN = "token";
    expect(defineDrizzleKitConfig({ schema: "./src/schema.ts" })).toEqual({
      dialect: "turso",
      schema: "./src/schema.ts",
      out: "./drizzle",
      dbCredentials: {
        url: "libsql://example.turso.io",
        authToken: "token",
      },
    });
  });
});
