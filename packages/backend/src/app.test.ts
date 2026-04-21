import { createClient, type Client } from "@libsql/client";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { collectBackendSchema, createBackendApp, generateBackendSchemaSource } from "./app";
import { BaseModule, type TableMap } from "./modules/base/base.module";

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

    class DepModule extends BaseModule<
      never,
      TableMap,
      { depRepository: { ok: boolean } },
      { depService: { ok: boolean } },
      any
    > {
      readonly id = "dep";
      override db() {
        calls.push("dep:db");
        return { tables: {} as TableMap };
      }
      override repositories() {
        calls.push("dep:repositories");
        return { depRepository: { ok: true } };
      }
      override services() {
        calls.push("dep:services");
        return { depService: { ok: true } };
      }
      override trpc({ trpc }: any) {
        calls.push("dep:trpc");
        return {
          dep: trpc.router({
            ping: trpc.publicProcedure.query(() => "pong"),
          }),
        };
      }
    }

    class MainModule extends BaseModule<
      { dep: DepModule },
      TableMap,
      { mainRepository: { ok: boolean } },
      { mainService: { ok: boolean } },
      any
    > {
      readonly id = "main";
      override readonly dependsOn = ["dep"] as const;
      override db({ deps }: any) {
        expect(deps.dep).toBeDefined();
        calls.push("main:db");
        return { tables: {} as TableMap };
      }
      override repositories({ deps }: any) {
        expect(deps.dep.repositories.depRepository).toEqual({ ok: true });
        calls.push("main:repositories");
        return { mainRepository: { ok: true } };
      }
      override services({ deps }: any) {
        expect(deps.dep.services.depService).toEqual({ ok: true });
        calls.push("main:services");
        return { mainService: { ok: true } };
      }
      override trpc({ trpc }: any) {
        calls.push("main:trpc");
        return {
          main: trpc.router({
            ping: trpc.publicProcedure.query(() => "pong"),
          }),
        };
      }
    }

    const dep = new DepModule();
    const main = new MainModule();

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
      new (class MainMissingDep extends BaseModule<{ dep: any }, TableMap> {
        readonly id = "main";
        override readonly dependsOn = ["dep"] as const;
      })()
    );

    expect(() => app.build()).toThrow('missing required dependency "dep"');
  });

  it("fails on circular dependencies", () => {
    const app = createBackendApp({ db: { client } })
      .use(
        new (class A extends BaseModule<{ b: any }, TableMap> {
          readonly id = "a";
          override readonly dependsOn = ["b"] as const;
        })()
      )
      .use(
        new (class B extends BaseModule<{ a: any }, TableMap> {
          readonly id = "b";
          override readonly dependsOn = ["a"] as const;
        })()
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
        new (class One extends BaseModule {
          readonly id = "one";
          override db() {
            return { tables: { shared: sharedNameA } as TableMap };
          }
        })()
      )
      .use(
        new (class Two extends BaseModule {
          readonly id = "two";
          override db() {
            return { tables: { shared: sharedNameB } as TableMap };
          }
        })()
      );

    expect(() => duplicateKeyApp.build()).toThrow('Duplicate backend schema key "shared"');

    const duplicateTableNameApp = createBackendApp({ db: { client } })
      .use(
        new (class One extends BaseModule {
          readonly id = "one";
          override db() {
            return { tables: { first: sharedNameA } as TableMap };
          }
        })()
      )
      .use(
        new (class Two extends BaseModule {
          readonly id = "two";
          override db() {
            return { tables: { second: sharedNameB } as TableMap };
          }
        })()
      );

    expect(() => duplicateTableNameApp.build()).toThrow('Duplicate backend table name "shared_table"');
  });

  it("fails on duplicate tRPC namespaces", () => {
    const first = new (class First extends BaseModule<
      never,
      TableMap,
      Record<string, never>,
      Record<string, never>,
      { shared: any }
    > {
      readonly id = "first";
      override trpc({ trpc }: any) {
        return {
          shared: trpc.router({
            one: trpc.publicProcedure.query(() => "one"),
          }),
        };
      }
    })();

    const second = new (class Second extends BaseModule<
      never,
      TableMap,
      Record<string, never>,
      Record<string, never>,
      { shared: any }
    > {
      readonly id = "second";
      override trpc({ trpc }: any) {
        return {
          shared: trpc.router({
            two: trpc.publicProcedure.query(() => "two"),
          }),
        };
      }
    })();

    const app = createBackendApp({ db: { client } }).use(first).use(second);

    expect(() => app.build()).toThrow('Duplicate backend tRPC router namespace "shared"');
  });

  it("collects runtime schema with the same module db phase used by build", () => {
    const table = sqliteTable("schema_parity", {
      id: text("id").primaryKey(),
    });

    const module = new (class Parity extends BaseModule {
      readonly id = "parity";
      override db() {
        return {
          tables: { parity: table } as TableMap,
        };
      }
    })();

    const collected = collectBackendSchema([module]);
    const built = createBackendApp({ db: { client } }).use(module).build();

    expect(Object.keys(collected.schema)).toEqual(["parity"]);
    expect(Object.keys(built.db.schema)).toEqual(["parity"]);
  });

  it("generates DrizzleKit-consumable source with top-level table exports", () => {
    const users = sqliteTable("users", {
      id: text("id").primaryKey(),
    });
    const posts = sqliteTable("posts", {
      id: text("id").primaryKey(),
    });

    const collected = collectBackendSchema([
      new (class Schema extends BaseModule {
        readonly id = "schema";
        override db() {
          return {
            tables: {
              users,
              posts,
            } as TableMap,
          };
        }
      })(),
    ]);

    const source = generateBackendSchemaSource({
      schema: collected.schema,
      schemaExpression: "collected.schema",
    });

    expect(source).toContain("export const posts = collected.schema.posts;");
    expect(source).toContain("export const users = collected.schema.users;");
    expect(source).toContain("export const schema = {");
    expect(source).toContain("  posts,");
    expect(source).toContain("  users,");
  });
});
