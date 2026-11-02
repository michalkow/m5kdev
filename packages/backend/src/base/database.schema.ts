import { customType, pgSchema } from "drizzle-orm/pg-core";

export const appDatabaseSchema = pgSchema(process.env.DATABASE_SCHEMA ?? "app");

export const jsonbValue = customType<{ data: unknown; driverData: unknown }>({
  dataType: () => "jsonb",
  toDriver: (value) => JSON.stringify(value),
  fromDriver: (value) => value,
});
