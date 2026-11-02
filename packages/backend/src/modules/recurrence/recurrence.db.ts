import { boolean, integer, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { v4 as uuidv4 } from "uuid";
import { appDatabaseSchema } from "../../base/database.schema";
import { members, organizations, users } from "../auth/auth.db";

export const recurrence = appDatabaseSchema.table("recurrence", {
  id: text("id").primaryKey().$default(uuidv4),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  memberId: text("member_id").references(() => members.id, { onDelete: "set null" }),
  organizationId: text("organization_id").references(() => organizations.id, {
    onDelete: "cascade",
  }),
  teamId: text("team_id"),
  name: text("name"),
  kind: text("kind"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$default(() => new Date()),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
});

export const recurrenceRules = appDatabaseSchema.table("recurrence_rules", {
  id: text("id").primaryKey().$default(uuidv4),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$default(() => new Date()),
  recurrenceId: text("recurrence_id").references(() => recurrence.id, {
    onDelete: "cascade",
  }),

  // Required: frequency
  freq: integer("freq").notNull(),

  // Start date; base for recurrence and source for missing instance params
  dtstart: timestamp("dtstart", { withTimezone: true, mode: "date" }),

  // Interval between each freq iteration (default 1)
  interval: integer("interval").notNull().default(1),

  // Week start: MO, TU, WE, ... or integer 0–6
  wkst: integer("wkst"),

  // How many occurrences to generate
  count: integer("count"),

  // Last occurrence date (inclusive)
  until: timestamp("until", { withTimezone: true, mode: "date" }),

  // IANA timezone string (Intl API)
  tzid: text("tzid"),

  // BYSETPOS: occurrence number(s) in the frequency period (e.g. -1 = last)
  bysetpos: jsonb("bysetpos").$type<number | number[]>(),

  // BYMONTH: month(s) 1–12
  bymonth: jsonb("bymonth").$type<number | number[]>(),

  // BYMONTHDAY: day(s) of month
  bymonthday: jsonb("bymonthday").$type<number | number[]>(),

  // BYYEARDAY: day(s) of year
  byyearday: jsonb("byyearday").$type<number | number[]>(),

  // BYWEEKNO: week number(s) (ISO8601)
  byweekno: jsonb("byweekno").$type<number | number[]>(),

  // BYWEEKDAY: weekday(s) 0–6, or nth e.g. { weekday: 4, n: 1 } for first Friday
  byweekday: jsonb("byweekday").$type<number | number[]>(),

  // BYHOUR, BYMINUTE, BYSECOND
  byhour: jsonb("byhour").$type<number | number[]>(),
  byminute: jsonb("byminute").$type<number | number[]>(),
  bysecond: jsonb("bysecond").$type<number | number[]>(),
});
