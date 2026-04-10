import { type AnySQLiteColumn, integer, text } from "drizzle-orm/sqlite-core";
import { v4 as uuidv4 } from "uuid";

type DbReferenceTable = {
  id: AnySQLiteColumn;
};

export type DbOwnershipReferences = {
  users: DbReferenceTable;
  organizations: DbReferenceTable;
  teams: DbReferenceTable;
};

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

export function createDbUserId(usersTable: DbReferenceTable) {
  return text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" });
}

export function createDbOrganizationId(organizationsTable: DbReferenceTable) {
  return text("organization_id").references(() => organizationsTable.id, {
    onDelete: "cascade",
  });
}

export function createDbTeamId(teamsTable: DbReferenceTable) {
  return text("team_id").references(() => teamsTable.id, { onDelete: "set null" });
}

export function createDbDates() {
  return {
    createdAt: createDbCreatedAt(),
    updatedAt: createDbUpdatedAt(),
    deletedAt: createDbDeletedAt(),
  };
}

export function createDbReferences(references: DbOwnershipReferences) {
  return {
    userId: createDbUserId(references.users),
    organizationId: createDbOrganizationId(references.organizations),
    teamId: createDbTeamId(references.teams),
  };
}

export function createDbColumns(references: DbOwnershipReferences) {
  return {
    id: createDbId(),
    ...createDbDates(),
    ...createDbReferences(references),
  };
}
