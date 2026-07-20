import { createAiVectorStore } from "./ai.vector";

jest.mock("@mastra/libsql", () => ({
  LibSQLVector: jest.fn().mockImplementation((config: { id: string; url: string }) => ({
    id: config.id,
    url: config.url,
    close: jest.fn(),
  })),
}));

describe("createAiVectorStore", () => {
  const env = { NODE_ENV: "development" } as Record<string, string | undefined>;

  it("rejects a local vector file that matches context.databaseUrl", () => {
    expect(() =>
      createAiVectorStore(
        { localUrl: "file:./local.db" },
        { env, databaseUrl: "file:./local.db" }
      )
    ).toThrow(/must not share the app database file/);
  });

  it("uses context.databaseUrl over env.DATABASE_URL for the conflict check", () => {
    expect(() =>
      createAiVectorStore(
        { localUrl: "file:./local.db" },
        {
          env: { ...env, DATABASE_URL: "file:./other.db" },
          databaseUrl: "file:./local.db",
        }
      )
    ).toThrow(/must not share the app database file/);
  });

  it("falls back to env.DATABASE_URL when context.databaseUrl is unset", () => {
    expect(() =>
      createAiVectorStore(
        { localUrl: "file:./local.db" },
        { env: { ...env, DATABASE_URL: "file:./local.db" } }
      )
    ).toThrow(/must not share the app database file/);
  });

  it("allows a distinct local vector file when the app database is configured programmatically", () => {
    const store = createAiVectorStore(
      { localUrl: "file:./vector.db" },
      { env, databaseUrl: "file:./local.db" }
    );

    expect(store).toMatchObject({ url: "file:./vector.db" });
  });
});
