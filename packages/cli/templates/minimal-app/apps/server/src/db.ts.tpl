import * as auth from "@m5kdev/backend/modules/auth/auth.db";
import * as notification from "@m5kdev/backend/modules/notification/notification.db";
import * as workflow from "@m5kdev/backend/modules/workflow/workflow.db";
import { drizzle } from "drizzle-orm/libsql";
import * as posts from "./modules/posts/posts.db";

export const schema = {
  ...auth,
  ...workflow,
  ...notification,
  ...posts,
};

const databaseUrl = process.env.DATABASE_URL ?? "file:./local.db";
const syncUrl = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

const connection =
  syncUrl && authToken
    ? {
        url: databaseUrl,
        syncUrl,
        authToken,
        syncInterval: 60,
        readYourWrites: true,
      }
    : {
        url: databaseUrl,
      };

export const orm = drizzle({
  connection,
  schema,
});

export type Orm = typeof orm;
export type Schema = typeof schema;
