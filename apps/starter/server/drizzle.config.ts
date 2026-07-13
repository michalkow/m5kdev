import * as dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({ path: process.env.DRIZZLE_ENV_PATH || "../shared/.env" });

const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
const schema = process.env.DRIZZLE_SCHEMA_PATH || "./src/schema.ts";

if (!url) {
  throw new Error("DATABASE_URL or TURSO_DATABASE_URL must be set");
}

export default defineConfig(
  url && authToken
    ? {
        dialect: "turso",
        schema,
        out: "./drizzle",
        dbCredentials: {
          url,
          authToken,
        },
      }
    : {
        dialect: "sqlite",
        schema,
        out: "./drizzle",
        dbCredentials: {
          url,
        },
      }
);
