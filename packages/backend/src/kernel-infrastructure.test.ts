import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { DocxModule } from "../../module-docx/src/docx.module";
import { PdfModule } from "../../module-pdf/src/pdf.module";
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
  const pkg = JSON.parse(
    readFileSync(join(__dirname, "../package.json"), "utf8")
  ) as PackageExports;

  it("exports Base from ./base/* and keeps ./modules/base/*", () => {
    expect(pkg.exports["./base/*"]).toBeDefined();
    expect(pkg.exports["./modules/base/*"]).toBeDefined();
  });

  it("does not export a Utils Backend Module path", () => {
    expect(pkg.exports["./modules/utils/*"]).toBeUndefined();
  });

  it("does not export AccessModule, CryptoModule, PdfModule, or DocxModule", () => {
    expect(pkg.exports["./modules/access/*"]).toBeUndefined();
    expect(pkg.exports["./modules/crypto/*"]).toBeUndefined();
    expect(pkg.exports["./modules/pdf/*"]).toBeUndefined();
    expect(pkg.exports["./modules/docx/*"]).toBeUndefined();
  });

  it("does not depend on pdf-parse, mammoth, or turndown", () => {
    const manifest = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(manifest.dependencies?.["pdf-parse"]).toBeUndefined();
    expect(manifest.dependencies?.mammoth).toBeUndefined();
    expect(manifest.dependencies?.turndown).toBeUndefined();
    expect(manifest.devDependencies?.["@types/turndown"]).toBeUndefined();
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

  it("boots createBackendApp when PdfModule from the Optional package is registered", () => {
    const client = createClient({ url: ":memory:" });
    const built = createBackendApp({ db: { client } }, [new PdfModule()] as const);
    expect(Object.keys(built.modules)).toEqual(["pdf"]);
    void client.close?.();
  });

  it("boots createBackendApp when DocxModule from the Optional package is registered", () => {
    const client = createClient({ url: ":memory:" });
    const built = createBackendApp({ db: { client } }, [new DocxModule()] as const);
    expect(Object.keys(built.modules)).toEqual(["docx"]);
    void client.close?.();
  });
});
