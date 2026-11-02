import { defineDrizzleKitConfig } from "./db";

jest.mock("dotenv", () => ({ config: jest.fn() }));

describe("PostgreSQL migration configuration", () => {
  const environment = process.env;

  beforeEach(() => {
    process.env = { ...environment };
    delete process.env.DATABASE_DIRECT_URL;
    delete process.env.DATABASE_SCHEMA;
  });

  afterEach(() => {
    process.env = environment;
  });

  it("does not fall back to the runtime connection for migrations", () => {
    process.env.DATABASE_URL = "postgresql://localhost:6432/runtime";

    expect(() => defineDrizzleKitConfig({ schema: "./src/schema.ts" })).toThrow(
      "DATABASE_DIRECT_URL"
    );
  });

  it("uses the direct connection and a separate PostgreSQL migration history", () => {
    process.env.DATABASE_URL = "postgresql://localhost:6432/runtime";
    process.env.DATABASE_DIRECT_URL = "postgresql://localhost:5432/direct";
    process.env.DATABASE_SCHEMA = "example_app";

    expect(defineDrizzleKitConfig({ schema: "./src/schema.ts" })).toEqual({
      dialect: "postgresql",
      schema: "./src/schema.ts",
      out: "./drizzle-postgresql",
      schemaFilter: ["example_app"],
      dbCredentials: { url: "postgresql://localhost:5432/direct" },
    });
  });

  it("rejects non-PostgreSQL direct connections without exposing credentials", () => {
    process.env.DATABASE_DIRECT_URL = "libsql://private-user:private-password@example.test/db";

    expect(() => defineDrizzleKitConfig({ schema: "./src/schema.ts" })).toThrow(
      "DATABASE_DIRECT_URL must be a PostgreSQL connection URL"
    );
  });
});
