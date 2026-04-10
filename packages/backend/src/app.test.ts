import { createClient, type Client } from "@libsql/client";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { collectBackendSchema, createBackendApp, defineBackendModule } from "./app";

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

describe("createBackendApp", () => {
  let client: Client;

  beforeEach(() => {
    client = createClient({ url: ":memory:" });
  });

  afterEach(async () => {
    await client.close?.();
  });

  it("resolves required dependencies in build order instead of registration order", () => {
    const calls: string[] = [];

    const dep = defineBackendModule({
      id: "dep",
      db: () => {
        calls.push("dep:db");
        return { tables: {} };
      },
      repositories: () => {
        calls.push("dep:repositories");
        return { depRepository: { ok: true } };
      },
      services: () => {
        calls.push("dep:services");
        return { depService: { ok: true } };
      },
      trpc: ({ trpc }) => {
        calls.push("dep:trpc");
        return {
          dep: trpc.router({
            ping: trpc.publicProcedure.query(() => "pong"),
          }),
        };
      },
    });

    const main = defineBackendModule({
      id: "main",
      dependsOn: ["dep"],
      db: ({ deps }) => {
        expect(deps.dep).toBeDefined();
        calls.push("main:db");
        return { tables: {} };
      },
      repositories: ({ deps }) => {
        expect(deps.dep.repositories.depRepository).toEqual({ ok: true });
        calls.push("main:repositories");
        return { mainRepository: { ok: true } };
      },
      services: ({ deps }) => {
        expect(deps.dep.services.depService).toEqual({ ok: true });
        calls.push("main:services");
        return { mainService: { ok: true } };
      },
      trpc: ({ trpc }) => {
        calls.push("main:trpc");
        return {
          main: trpc.router({
            ping: trpc.publicProcedure.query(() => "pong"),
          }),
        };
      },
    });

    const built = createBackendApp({ db: { client } }).use(main).use(dep).build();

    expect(Object.keys(built.modules)).toEqual(["dep", "main"]);
    expect(calls).toEqual([
      "dep:db",
      "main:db",
      "dep:repositories",
      "main:repositories",
      "dep:services",
      "main:services",
      "dep:trpc",
      "main:trpc",
    ]);
  });

  it("fails on missing required dependencies", () => {
    const app = createBackendApp({ db: { client } }).use(
      defineBackendModule({
        id: "main",
        dependsOn: ["dep"],
      })
    );

    expect(() => app.build()).toThrow('missing required dependency "dep"');
  });

  it("fails on circular dependencies", () => {
    const app = createBackendApp({ db: { client } })
      .use(
        defineBackendModule({
          id: "a",
          dependsOn: ["b"],
        })
      )
      .use(
        defineBackendModule({
          id: "b",
          dependsOn: ["a"],
        })
      );

    expect(() => app.build()).toThrow("Circular backend module dependency detected");
  });

  it("fails on duplicate schema keys and table names", () => {
    const sharedNameA = sqliteTable("shared_table", {
      id: text("id").primaryKey(),
    });
    const sharedNameB = sqliteTable("shared_table", {
      id: text("id").primaryKey(),
    });

    const duplicateKeyApp = createBackendApp({ db: { client } })
      .use(
        defineBackendModule({
          id: "one",
          db: () => ({
            tables: { shared: sharedNameA },
          }),
        })
      )
      .use(
        defineBackendModule({
          id: "two",
          db: () => ({
            tables: { shared: sharedNameB },
          }),
        })
      );

    expect(() => duplicateKeyApp.build()).toThrow('Duplicate backend schema key "shared"');

    const duplicateTableNameApp = createBackendApp({ db: { client } })
      .use(
        defineBackendModule({
          id: "one",
          db: () => ({
            tables: { first: sharedNameA },
          }),
        })
      )
      .use(
        defineBackendModule({
          id: "two",
          db: () => ({
            tables: { second: sharedNameB },
          }),
        })
      );

    expect(() => duplicateTableNameApp.build()).toThrow('Duplicate backend table name "shared_table"');
  });

  it("fails on duplicate tRPC namespaces", () => {
    const first = defineBackendModule({
      id: "first",
      trpc: ({ trpc }) => ({
        shared: trpc.router({
          one: trpc.publicProcedure.query(() => "one"),
        }),
      }),
    });

    const second = defineBackendModule({
      id: "second",
      trpc: ({ trpc }) => ({
        shared: trpc.router({
          two: trpc.publicProcedure.query(() => "two"),
        }),
      }),
    });

    const app = createBackendApp({ db: { client } }).use(first).use(second);

    expect(() => app.build()).toThrow('Duplicate backend tRPC router namespace "shared"');
  });

  it("collects runtime schema with the same module db phase used by build", () => {
    const table = sqliteTable("schema_parity", {
      id: text("id").primaryKey(),
    });

    const module = defineBackendModule({
      id: "parity",
      db: () => ({
        tables: { parity: table },
      }),
    });

    const collected = collectBackendSchema([module]);
    const built = createBackendApp({ db: { client } }).use(module).build();

    expect(Object.keys(collected.schema)).toEqual(["parity"]);
    expect(Object.keys(built.db.schema)).toEqual(["parity"]);
  });
});
