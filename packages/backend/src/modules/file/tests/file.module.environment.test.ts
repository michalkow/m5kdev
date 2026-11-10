import { files } from "../file.db";
import { LocalFileObjectStore } from "../file.local-store";
import { FileModule } from "../file.module";

jest.mock("@m5kdev/commons/utils/trpc", () => ({
  transformer: { serialize: (value: unknown) => value, deserialize: (value: unknown) => value },
}));
jest.mock("better-auth/node", () => ({
  toNodeHandler: () => () => undefined,
  fromNodeHeaders: (headers: unknown) => headers,
}));

describe("FileModule Deployment environment", () => {
  const previous = { APP_ENV: process.env.APP_ENV, NODE_ENV: process.env.NODE_ENV };

  afterEach(() => {
    process.env.APP_ENV = previous.APP_ENV;
    process.env.NODE_ENV = previous.NODE_ENV;
  });

  const objectStoreFor = (
    environment: string,
    processEnv: { APP_ENV: string; NODE_ENV: string }
  ) => {
    // The validated appConfig decides, not whatever process.env says.
    process.env.APP_ENV = processEnv.APP_ENV;
    process.env.NODE_ENV = processEnv.NODE_ENV;
    const repositories = new FileModule({ buckets: ["app-bucket"] }).repositories({
      db: { orm: {}, schema: { files } },
      appConfig: { environment, slug: "editorial-desk" },
    } as never);
    return repositories.fileS3;
  };

  it("uses the local object store only when the Deployment environment is local", () => {
    expect(objectStoreFor("local", { APP_ENV: "staging", NODE_ENV: "production" })).toBeInstanceOf(
      LocalFileObjectStore
    );
    expect(
      objectStoreFor("staging", { APP_ENV: "local", NODE_ENV: "development" })
    ).not.toBeInstanceOf(LocalFileObjectStore);
  });
});
