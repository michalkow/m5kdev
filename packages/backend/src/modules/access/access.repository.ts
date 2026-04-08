import { and, eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { err, ok } from "neverthrow";
import * as auth from "../auth/auth.db";
import type { ServerResultAsync } from "../base/base.dto";
import { BaseRepository } from "../base/base.repository";

const schema = { ...auth };
type Schema = typeof schema;
type Orm = LibSQLDatabase<Schema>;

export class AccessRepository extends BaseRepository<Orm, Schema, Record<string, never>> {
  async getOrganizationRole(userId: string, organizationId: string): ServerResultAsync<string> {
    const memberResult = await this.throwableQuery(() =>
      this.orm
        .select({ role: schema.members.role })
        .from(schema.members)
        .where(and(eq(schema.members.organizationId, organizationId), eq(schema.members.userId, userId)))
        .limit(1)
    );
    if (memberResult.isErr()) return err(memberResult.error);
    const [member] = memberResult.value;
    return ok(member?.role ?? "");
  }

  async getTeamRole(userId: string, teamId: string): ServerResultAsync<string> {
    const memberResult = await this.throwableQuery(() =>
      this.orm
        .select({ role: schema.teamMembers.role })
        .from(schema.teamMembers)
        .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, userId)))
        .limit(1)
    );
    if (memberResult.isErr()) return err(memberResult.error);
    const [member] = memberResult.value;
    return ok(member?.role ?? "");
  }
}
