import { BaseTableRepository } from "@m5kdev/backend/modules/base/base.repository";

import { and, eq, isNull, ne } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { err, ok } from "neverthrow";
import { z } from "zod";
import { posts } from "./posts.db";
import { postSchemas } from "./posts.dto";

const schema = { posts };
type Schema = typeof schema;
type Orm = LibSQLDatabase<Schema>;

export class PostsRepository extends BaseTableRepository<
  Orm,
  Schema,
  Record<string, never>,
  Schema["posts"]
> {
  findBySlug = this.query("findBySlug")
    .input(
      z.object({
        slug: z.string(),
        excludeId: z.string().optional(),
      })
    )
    .output(postSchemas.output.single)
    .handle(async ({ excludeId, slug }) => {
      const whereClause = excludeId
        ? and(eq(this.table.slug, slug), ne(this.table.id, excludeId), isNull(this.table.deletedAt))
        : and(eq(this.table.slug, slug), isNull(this.table.deletedAt));

      const result = await this.throwableQuery(() =>
        this.orm.select().from(this.table).where(whereClause).limit(1)
      );
      if (result.isErr()) return err(result.error);
      const [row] = result.value;
      return ok(row);
    });

  resolveUniqueSlug = this.query("resolveUniqueSlug")
    .input(
      z.object({
        candidate: z.string(),
        excludeId: z.string().optional(),
      })
    )
    .output(z.string())
    .handle(async ({ candidate, excludeId }) => {
      let slug = candidate;
      let suffix = 2;

      while (true) {
        const existing = await this.findBySlug({ slug, excludeId });
        if (existing.isErr()) {
          return err(existing.error);
        }

        if (!existing.value) {
          return ok(slug);
        }

        slug = `${candidate}-${suffix}`;
        suffix += 1;
      }
    });
}
