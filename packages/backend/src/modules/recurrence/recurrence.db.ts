import { integer, sqliteTable as table, text } from "drizzle-orm/sqlite-core";
import { v4 as uuidv4 } from "uuid";
import { organizations, teams, users } from "#modules/auth/auth.db";

export const recurrence = table("recurrence", {
  id: text("id").primaryKey().$default(uuidv4),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").references(() => organizations.id, {
    onDelete: "cascade",
  }),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
  name: text("name"),
  kind: text("kind"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, any>>(),
});

export const recurrenceRules = table("recurrence_rules", {
  id: text("id").primaryKey().$default(uuidv4),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  recurrenceId: text("recurrence_id").references(() => recurrence.id, {
    onDelete: "cascade",
  }),

  // Required: frequency
  freq: integer("freq").notNull(),

  // Start date; base for recurrence and source for missing instance params
  dtstart: integer("dtstart", { mode: "timestamp" }),

  // Interval between each freq iteration (default 1)
  interval: integer("interval").notNull().default(1),

  // Week start: MO, TU, WE, ... or integer 0–6
  wkst: integer("wkst"),

  // How many occurrences to generate
  count: integer("count"),

  // Last occurrence date (inclusive)
  until: integer("until", { mode: "timestamp" }),

  // IANA timezone string (Intl API)
  tzid: text("tzid"),

  // BYSETPOS: occurrence number(s) in the frequency period (e.g. -1 = last)
  bysetpos: text("bysetpos", { mode: "json" }).$type<number | number[]>(),

  // BYMONTH: month(s) 1–12
  bymonth: text("bymonth", { mode: "json" }).$type<number | number[]>(),

  // BYMONTHDAY: day(s) of month
  bymonthday: text("bymonthday", { mode: "json" }).$type<number | number[]>(),

  // BYYEARDAY: day(s) of year
  byyearday: text("byyearday", { mode: "json" }).$type<number | number[]>(),

  // BYWEEKNO: week number(s) (ISO8601)
  byweekno: text("byweekno", { mode: "json" }).$type<number | number[]>(),

  // BYWEEKDAY: weekday(s) 0–6, or nth e.g. { weekday: 4, n: 1 } for first Friday
  byweekday: text("byweekday", { mode: "json" }).$type<number | number[]>(),

  // BYHOUR, BYMINUTE, BYSECOND
  byhour: text("byhour", { mode: "json" }).$type<number | number[]>(),
  byminute: text("byminute", { mode: "json" }).$type<number | number[]>(),
  bysecond: text("bysecond", { mode: "json" }).$type<number | number[]>(),
});
