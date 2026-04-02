import { integer, text } from "drizzle-orm/sqlite-core";
import { v4 as uuidv4 } from "uuid";
import { organizations, teams, users } from "../auth/auth.db";

export const dbId = text("id").primaryKey().$default(uuidv4);
export const dbCreatedAt = integer("created_at", { mode: "timestamp" })
  .notNull()
  .$default(() => new Date());
export const dbUpdatedAt = integer("updated_at", { mode: "timestamp" });
export const dbDeletedAt = integer("deleted_at", { mode: "timestamp" });
export const dbUserId = text("user_id")
  .notNull()
  .references(() => users.id, { onDelete: "cascade" });
export const dbOrganizationId = text("organization_id").references(() => organizations.id, {
  onDelete: "cascade",
});
export const dbTeamId = text("team_id").references(() => teams.id, { onDelete: "set null" });

export const dbDates = {
  createdAt: dbCreatedAt,
  updatedAt: dbUpdatedAt,
  deletedAt: dbDeletedAt,
};

export const dbReferences = {
  userId: dbUserId,
  organizationId: dbOrganizationId,
  teamId: dbTeamId,
};

export const dbColumns = {
  id: dbId,
  ...dbDates,
  ...dbReferences,
};
