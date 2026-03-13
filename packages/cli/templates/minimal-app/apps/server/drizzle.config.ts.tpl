import * as dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({ path: "../shared/.env" });

const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
const schema = [
  "./src/modules/**/*.db.ts",
  "./node_modules/@m5kdev/backend/dist/src/modules/auth/*.db.js",
];

if (!url) {
  throw new Error("DATABASE_URL or TURSO_DATABASE_URL must be set");
}

const isRemote = Boolean(process.env.TURSO_DATABASE_URL && authToken);

export default defineConfig(
  isRemote
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
