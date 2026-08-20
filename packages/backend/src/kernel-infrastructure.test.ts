import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { createBackendApp } from "./app";
import { BaseModule, type TableMap } from "./base/base.module";
import { BaseModule as BaseModuleCompat } from "./modules/base/base.module";

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

interface PackageExports {
  readonly exports: Record<string, unknown>;
}

class CoreFixtureModule extends BaseModule<never, TableMap, {}, {}, never> {
  readonly id = "core-fixture";
}

describe("Kernel infrastructure package surface", () => {
  const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8")) as PackageExports;

  it("exports Base from ./base/* and keeps ./modules/base/*", () => {
    expect(pkg.exports["./base/*"]).toBeDefined();
    expect(pkg.exports["./modules/base/*"]).toBeDefined();
  });

  it("does not export a Utils Backend Module path", () => {
    expect(pkg.exports["./modules/utils/*"]).toBeUndefined();
  });

  it("loads BaseModule from Kernel infrastructure and the compatibility re-export", () => {
    expect(BaseModule).toBe(BaseModuleCompat);
  });

  it("boots createBackendApp with a Core Module that is not base or utils", () => {
    const client = createClient({ url: ":memory:" });
    const module = new CoreFixtureModule();
    expect(module.id).not.toBe("base");
    expect(module.id).not.toBe("utils");
    const built = createBackendApp({ db: { client } }, [module] as const);
    expect(Object.keys(built.modules)).toEqual(["core-fixture"]);
    void client.close?.();
  });
});
