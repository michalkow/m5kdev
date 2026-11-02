import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { v4 as uuidv4 } from "uuid";
import { appDatabaseSchema, jsonbValue } from "../../base/database.schema";

export const webhook = appDatabaseSchema.table("webhook", {
  id: text("id").primaryKey().$default(uuidv4),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }),
  timeoutSec: integer("timeout_sec").notNull().default(60),
  status: text("status")
    .notNull()
    .default("WAITING")
    .$type<"WAITING" | "COMPLETED" | "TIMEOUT" | "ERROR_CALLBACK" | "ERROR_DATA">(),
  error: text("error"),
  payload: jsonbValue("payload"),
  name: text("name"),
  secret: text("secret"),
});
