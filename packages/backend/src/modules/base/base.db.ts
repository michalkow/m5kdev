import { integer, text } from "drizzle-orm/sqlite-core";
import { v4 as uuidv4 } from "uuid";
import { organizations, teams, users } from "../auth/auth.db";

export function createDbId() {
  return text("id").primaryKey().$default(uuidv4);
}

export function createDbCreatedAt() {
  return integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date());
}

export function createDbUpdatedAt() {
  return integer("updated_at", { mode: "timestamp" });
}

export function createDbDeletedAt() {
  return integer("deleted_at", { mode: "timestamp" });
}

export function createDbUserId() {
  return text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });
}

export function createDbOrganizationId() {
  return text("organization_id").references(() => organizations.id, {
    onDelete: "cascade",
  });
}

export function createDbTeamId() {
  return text("team_id").references(() => teams.id, { onDelete: "set null" });
}

export function createDbDates() {
  return {
    createdAt: createDbCreatedAt(),
    updatedAt: createDbUpdatedAt(),
    deletedAt: createDbDeletedAt(),
  };
}

export function createDbReferences() {
  return {
    userId: createDbUserId(),
    organizationId: createDbOrganizationId(),
    teamId: createDbTeamId(),
  };
}

export function createDbColumns() {
  return {
    id: createDbId(),
    ...createDbDates(),
    ...createDbReferences(),
  };
}
