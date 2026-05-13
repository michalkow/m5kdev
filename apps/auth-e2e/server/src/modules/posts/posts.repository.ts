import type { ServerResultAsync } from "@m5kdev/backend/modules/base/base.dto";
import { BaseTableRepository } from "@m5kdev/backend/modules/base/base.repository";
import { desc } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { ok } from "neverthrow";
import type { AppDbSchema } from "../../generated/schema";
import type { posts } from "./posts.db";

type Orm = LibSQLDatabase<AppDbSchema>;
type PostRow = typeof posts.$inferSelect;

export class PostsRepository extends BaseTableRepository<
  Orm,
  AppDbSchema,
  Record<string, never>,
  typeof posts
> {
  async listLatest(): ServerResultAsync<PostRow[]> {
    const result = await this.throwableQuery(() =>
      this.orm.select().from(this.table).orderBy(desc(this.table.createdAt)).limit(20)
    );
    if (result.isErr()) return result;
    return ok(result.value);
  }
}
