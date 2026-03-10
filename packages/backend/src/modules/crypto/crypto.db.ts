import { integer, real, sqliteTable as table, text } from "drizzle-orm/sqlite-core";
import { v4 as uuidv4 } from "uuid";

export const cryptoPayments = table("crypto_payments", {
  id: text("id").primaryKey().$default(uuidv4),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
  address: text("address").notNull(),
  referenceId: text("reference_id").notNull(),
  status: text("status").notNull().default("pending"),
  derivationIndex: integer("derivation_index").notNull(),
  amountExpected: real("amount_expected").notNull(),
});
