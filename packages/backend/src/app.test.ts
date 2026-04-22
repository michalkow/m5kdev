import { createClient, type Client } from "@libsql/client";
import { BaseModule, type TableMap } from "./modules/base/base.module";
import { createBackendApp } from "./app";

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

    const built = createBackendApp({ db: { client } }, [main, dep] as const);

    expect(Object.keys(built.modules)).toEqual(["dep", "main"]);
    expect(calls).toEqual([
      "dep:repositories",
      "main:repositories",
      "dep:services",
      "main:services",
      "dep:trpc",
      "main:trpc",
    ]);
  });

  it("fails on missing required dependencies", () => {
    const main = new (class MainMissingDep extends BaseModule<{ dep: any }, TableMap> {
      readonly id = "main";
      override readonly dependsOn = ["dep"] as const;
    })();

    expect(() => createBackendApp({ db: { client } }, [main] as const)).toThrow(
      'missing required dependency "dep"'
    );
  });

  it("fails on circular dependencies", () => {
    const a = new (class A extends BaseModule<{ b: any }, TableMap> {
      readonly id = "a";
      override readonly dependsOn = ["b"] as const;
    })();

    const b = new (class B extends BaseModule<{ a: any }, TableMap> {
      readonly id = "b";
      override readonly dependsOn = ["a"] as const;
    })();

    expect(() => createBackendApp({ db: { client } }, [a, b] as const)).toThrow(
      "Circular backend module dependency detected"
    );
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
        return { shared: trpc.router({ ping: trpc.publicProcedure.query(() => "pong") }) };
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
        return { shared: trpc.router({ ping: trpc.publicProcedure.query(() => "pong") }) };
      }
    })();

    expect(() => createBackendApp({ db: { client } }, [first, second] as const)).toThrow(
      'Duplicate backend tRPC router namespace "shared"'
    );
  });
});

