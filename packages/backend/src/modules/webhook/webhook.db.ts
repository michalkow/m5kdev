import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { v4 as uuidv4 } from "uuid";
export const webhook = sqliteTable("webhook", {
  id: text("id").primaryKey().$default(uuidv4),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
  timeoutSec: integer("timeout_sec").notNull().default(60),
  status: text("status")
    .notNull()
    .default("WAITING")
    .$type<"WAITING" | "COMPLETED" | "TIMEOUT" | "ERROR_CALLBACK" | "ERROR_DATA">(),
  error: text("error"),
  payload: text("payload"),
});
