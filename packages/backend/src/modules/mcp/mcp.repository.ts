import { and, eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { err, ok } from "neverthrow";
import type { ServerResultAsync } from "../../base/base.dto";
import { BaseTableRepository } from "../../base/base.repository";
import { mcpAllowlistEntries } from "./mcp.db";

const schema = { mcpAllowlistEntries };
type Schema = typeof schema;
type Orm = LibSQLDatabase<Schema>;

export class McpRepository extends BaseTableRepository<
  Orm,
  Schema,
  Record<string, never>,
  Schema["mcpAllowlistEntries"]
> {
  async listOrganizationIds({
    oauthClientId,
    userId,
  }: {
    oauthClientId: string;
    userId: string;
  }): ServerResultAsync<string[]> {
    const result = await this.throwableQuery(() =>
      this.orm
        .select({ organizationId: this.table.organizationId })
        .from(this.table)
        .where(and(eq(this.table.oauthClientId, oauthClientId), eq(this.table.userId, userId)))
    );
    if (result.isErr()) return err(result.error);
    return ok(result.value.map((row) => row.organizationId));
  }

  async replaceAllowlist({
    oauthClientId,
    userId,
    organizationIds,
  }: {
    oauthClientId: string;
    userId: string;
    organizationIds: readonly string[];
  }): ServerResultAsync<void> {
    const uniqueIds = [...new Set(organizationIds)];
    const cleared = await this.throwableQuery(() =>
      this.orm
        .delete(this.table)
        .where(and(eq(this.table.oauthClientId, oauthClientId), eq(this.table.userId, userId)))
    );
    if (cleared.isErr()) return err(cleared.error);
    if (uniqueIds.length === 0) return ok(undefined);
    const inserted = await this.throwableQuery(() =>
      this.orm.insert(this.table).values(
        uniqueIds.map((organizationId) => ({
          oauthClientId,
          userId,
          organizationId,
        }))
      )
    );
    if (inserted.isErr()) return err(inserted.error);
    return ok(undefined);
  }
}
