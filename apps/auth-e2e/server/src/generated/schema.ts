export * from "@m5kdev/backend/modules/auth/auth.db";
export * from "../modules/posts/posts.db";

import * as authTables from "@m5kdev/backend/modules/auth/auth.db";
import * as postsTables from "../modules/posts/posts.db";

export const schema = {
  ...authTables,
  ...postsTables,
};

export type AppDbSchema = typeof schema;
