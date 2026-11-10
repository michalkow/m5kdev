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

  const objectStoreFor = (appEnv: string, nodeEnv: string) => {
    process.env.APP_ENV = appEnv;
    process.env.NODE_ENV = nodeEnv;
    const repositories = new FileModule({ buckets: ["app-bucket"] }).repositories({
      db: { orm: {}, schema: { files } },
    } as never);
    return repositories.fileS3;
  };

  it("uses the local object store only when APP_ENV is local", () => {
    expect(objectStoreFor("local", "production")).toBeInstanceOf(LocalFileObjectStore);
    expect(objectStoreFor("staging", "development")).not.toBeInstanceOf(LocalFileObjectStore);
  });
});
