import type {
  PostSchema,
  PostsListInputSchema,
  PostsListOutputSchema,
} from "{{PACKAGE_SCOPE}}/shared/modules/posts/posts.schema";
import { BaseTableRepository } from "@m5kdev/backend/modules/base/base.repository";
import type { ServerResultAsync } from "@m5kdev/backend/utils/types";
import { and, asc, count, desc, eq, isNull, like, ne, or } from "drizzle-orm";
import { err, ok } from "neverthrow";
import type { Orm, Schema } from "../../db";

export class PostsRepository extends BaseTableRepository<
  Orm,
  Schema,
  Record<string, never>,
  Schema["posts"]
> {
  async list(input: PostsListInputSchema = {}): ServerResultAsync<PostsListOutputSchema> {
    const page = input.page ?? 1;
    const limit = input.limit ?? 6;
    const search = input.search?.trim();
    const conditions = [isNull(this.table.deletedAt)];

    if (input.status) {
      conditions.push(eq(this.table.status, input.status));
    }

    if (search) {
      const pattern = `%${search}%`;
      const searchCondition = or(
        like(this.table.title, pattern),
        like(this.table.slug, pattern),
        like(this.table.excerpt, pattern),
        like(this.table.content, pattern)
      );

      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    const whereClause = and(...conditions);
    const ordering =
      input.sort === "title"
        ? input.order === "asc"
          ? asc(this.table.title)
          : desc(this.table.title)
        : input.sort === "publishedAt"
          ? input.order === "asc"
            ? asc(this.table.publishedAt)
            : desc(this.table.publishedAt)
          : input.order === "asc"
            ? asc(this.table.updatedAt)
            : desc(this.table.updatedAt);

    const rowsQuery = this.orm
      .select()
      .from(this.table)
      .where(whereClause)
      .orderBy(ordering, desc(this.table.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const countQuery = this.orm.select({ count: count() }).from(this.table).where(whereClause);

    const result = await this.throwableQuery(() => Promise.all([rowsQuery, countQuery]));
    if (result.isErr()) return err(result.error);
    const [rows, [totalRow]] = result.value;

    return ok({
      rows: rows as PostSchema[],
      total: totalRow?.count ?? 0,
    });
  }

  async findBySlug(slug: string, excludeId?: string) {
    const whereClause = excludeId
      ? and(eq(this.table.slug, slug), ne(this.table.id, excludeId), isNull(this.table.deletedAt))
      : and(eq(this.table.slug, slug), isNull(this.table.deletedAt));

    const result = await this.throwableQuery(() =>
      this.orm.select().from(this.table).where(whereClause).limit(1)
    );
    if (result.isErr()) return err(result.error);
    const [row] = result.value;
    return ok(row);
  }

  async resolveUniqueSlug(candidate: string, excludeId?: string) {
    let slug = candidate;
    let suffix = 2;

    while (true) {
      const existing = await this.findBySlug(slug, excludeId);
      if (existing.isErr()) {
        return existing;
      }

      if (!existing.value) {
        return ok(slug);
      }

      slug = `${candidate}-${suffix}`;
      suffix += 1;
    }
  }
}
