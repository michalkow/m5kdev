import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { ClayModule } from "../../module-clay/src/clay.module";
import { DocxModule } from "../../module-docx/src/docx.module";
import { PdfModule } from "../../module-pdf/src/pdf.module";
import { SocialModule } from "../../module-social/src/social.module";
import { VideoModule } from "../../module-video/src/video.module";
import { createBackendApp } from "./app";
import { BaseModule, type TableMap } from "./base/base.module";
import { BaseModule as BaseModuleCompat } from "./modules/base/base.module";
import * as connectTables from "./modules/connect/connect.db";
import { ConnectModule } from "./modules/connect/connect.module";
import * as fileTables from "./modules/file/file.db";
import { FileModule } from "./modules/file/file.module";
import * as webhookTables from "./modules/webhook/webhook.db";
import { WebhookModule } from "./modules/webhook/webhook.module";

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

jest.mock("openid-client", () => ({}));

interface PackageExports {
  readonly exports: Record<string, unknown>;
}

class CoreFixtureModule extends BaseModule<never, TableMap, {}, {}, never> {
  readonly id = "core-fixture";
}

class AuthFixtureModule extends BaseModule<never, TableMap, {}, {}, never> {
  readonly id = "auth";
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

  it("does not export AccessModule, CryptoModule, PdfModule, DocxModule, VideoModule, SocialModule, or ClayModule", () => {
    expect(pkg.exports["./modules/access/*"]).toBeUndefined();
    expect(pkg.exports["./modules/crypto/*"]).toBeUndefined();
    expect(pkg.exports["./modules/pdf/*"]).toBeUndefined();
    expect(pkg.exports["./modules/docx/*"]).toBeUndefined();
    expect(pkg.exports["./modules/video/*"]).toBeUndefined();
    expect(pkg.exports["./modules/social/*"]).toBeUndefined();
    expect(pkg.exports["./modules/clay/*"]).toBeUndefined();
  });

  it("does not depend on pdf-parse, mammoth, turndown, or ffmpeg-ffprobe-static", () => {
    const manifest = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(manifest.dependencies?.["pdf-parse"]).toBeUndefined();
    expect(manifest.dependencies?.mammoth).toBeUndefined();
    expect(manifest.dependencies?.turndown).toBeUndefined();
    expect(manifest.devDependencies?.["@types/turndown"]).toBeUndefined();
    expect(manifest.dependencies?.["ffmpeg-ffprobe-static"]).toBeUndefined();
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

  it("boots createBackendApp when VideoModule from the Optional package is registered", () => {
    const client = createClient({ url: ":memory:" });
    const built = createBackendApp({ db: { client } }, [new VideoModule()] as const);
    expect(Object.keys(built.modules)).toEqual(["video"]);
    void client.close?.();
  });

  it("keeps Connection module id as connect", () => {
    expect(new ConnectModule([]).id).toBe("connect");
  });

  it("boots createBackendApp when SocialModule from the Optional package is registered with Connection and File", () => {
    const client = createClient({ url: ":memory:" });
    const built = createBackendApp(
      { db: { client }, schema: { ...connectTables, ...fileTables } },
      [
        new SocialModule([]),
        new ConnectModule([]),
        new FileModule(),
        new AuthFixtureModule(),
      ] as const
    );
    expect(Object.keys(built.modules).sort()).toEqual(["auth", "connect", "file", "social"]);
    void client.close?.();
  });

  it("throws when SocialModule is missing Connection or File", () => {
    const client = createClient({ url: ":memory:" });
    const schema = { ...connectTables, ...fileTables };
    expect(() => createBackendApp({ db: { client } }, [new SocialModule([])] as const)).toThrow(
      'Backend module "social" is missing required dependency "connect"'
    );
    expect(() =>
      createBackendApp({ db: { client }, schema }, [
        new SocialModule([]),
        new ConnectModule([]),
      ] as const)
    ).toThrow('Backend module "social" is missing required dependency "file"');
    expect(() =>
      createBackendApp({ db: { client }, schema }, [
        new SocialModule([]),
        new FileModule(),
        new AuthFixtureModule(),
      ] as const)
    ).toThrow('Backend module "social" is missing required dependency "connect"');
    void client.close?.();
  });

  it("keeps Inbound callback module id as webhook", () => {
    expect(new WebhookModule().id).toBe("webhook");
  });

  it("boots createBackendApp when ClayModule from the Optional package is registered with Inbound callback", () => {
    const client = createClient({ url: ":memory:" });
    const built = createBackendApp(
      { db: { client }, schema: { ...webhookTables } },
      [
        new ClayModule({
          tables: { enrichment: { webhookUrl: "https://example.test/clay" } },
        }),
        new WebhookModule(),
      ] as const
    );
    expect(Object.keys(built.modules).sort()).toEqual(["clay", "webhook"]);
    void client.close?.();
  });

  it("throws when ClayModule is missing Inbound callback", () => {
    const client = createClient({ url: ":memory:" });
    expect(() =>
      createBackendApp({ db: { client } }, [
        new ClayModule({
          tables: { enrichment: { webhookUrl: "https://example.test/clay" } },
        }),
      ] as const)
    ).toThrow('Backend module "clay" is missing required dependency "webhook"');
    void client.close?.();
  });
});
