import type {
  TaggingSchema,
  TagLinkSchema,
  TagListInputSchema,
  TagListSchema,
  TagSchema,
} from "@m5kdev/commons/modules/tag/tag.schema";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { err, ok } from "neverthrow";
import type { ServerResultAsync } from "../base/base.dto";
import { BaseTableRepository } from "../base/base.repository";
import { taggings, tags } from "./tag.db";
import type { TaggingSelectOutputResult, TagSelectOutputResult } from "./tag.dto";

const schema = { tags, taggings };
type Schema = typeof schema;
type Orm = LibSQLDatabase<Schema>;

export class TagRepository extends BaseTableRepository<
  Orm,
  Schema,
  Record<string, never>,
  Schema["tags"]
> {
  async link(
    { userId, ...data }: TagLinkSchema & { userId: string },
    tx?: Orm
  ): Promise<TaggingSelectOutputResult> {
    const db = tx ?? this.orm;

    const foundTagResult = await this.throwableQuery(() =>
      db
        .select({ id: this.schema.tags.id })
        .from(this.schema.tags)
        .where(and(eq(this.schema.tags.id, data.tagId), eq(this.schema.tags.userId, userId)))
        .limit(1)
    );
    if (foundTagResult.isErr()) return err(foundTagResult.error);
    const [foundTag] = foundTagResult.value;
    if (!foundTag) return this.error("FORBIDDEN");

    const taggingResult = await this.throwableQuery(() =>
      db
        .insert(this.schema.taggings)
        .values({ ...data, tagId: foundTag.id })
        .returning()
    );
    if (taggingResult.isErr()) return err(taggingResult.error);
    const [tagging] = taggingResult.value;
    if (!tagging) return this.error("NOT_FOUND");
    return ok(tagging);
  }

  async linkBulk(data: TagLinkSchema[], tx?: Orm): ServerResultAsync<TagSchema[]> {
    const db = tx ?? this.orm;

    const insertResult = await this.throwableQuery(() =>
      db.insert(this.schema.taggings).values(data)
    );
    if (insertResult.isErr()) return err(insertResult.error);

    const tagsResult = await this.throwableQuery(() =>
      db
        .select()
        .from(this.schema.tags)
        .where(
          inArray(
            this.schema.tags.id,
            data.map((tag) => tag.tagId)
          )
        )
    );
    if (tagsResult.isErr()) return err(tagsResult.error);
    return ok(tagsResult.value);
  }

  async set(data: TagLinkSchema[], tx?: Orm): ServerResultAsync<TagSchema[]> {
    const db = tx ?? this.orm;
    if (data.length === 0) return ok([]);

    const tagsResult = await this.throwableQuery(() =>
      db.transaction(async (trx) => {
        // FIXME: We are assuming that all resourceIds are the same, this is not a good assumption.
        await trx
          .delete(this.schema.taggings)
          .where(eq(this.schema.taggings.resourceId, data[0].resourceId));

        await trx.insert(this.schema.taggings).values(data);

        const tags = await trx
          .select()
          .from(this.schema.tags)
          .where(
            inArray(
              this.schema.tags.id,
              data.map((tag) => tag.tagId)
            )
          );

        return tags;
      })
    );
    if (tagsResult.isErr()) return err(tagsResult.error);
    return ok(tagsResult.value);
  }

  async unlink(
    { userId, ...data }: TagLinkSchema & { userId: string },
    tx?: Orm
  ): Promise<TagSelectOutputResult> {
    const db = tx ?? this.orm;

    const foundTagResult = await this.throwableQuery(() =>
      db
        .select()
        .from(this.schema.tags)
        .where(and(eq(this.schema.tags.id, data.tagId), eq(this.schema.tags.userId, userId)))
        .limit(1)
    );
    if (foundTagResult.isErr()) return err(foundTagResult.error);
    const [foundTag] = foundTagResult.value;
    if (!foundTag) return this.error("FORBIDDEN");

    const deleteResult = await this.throwableQuery(() =>
      db
        .delete(this.schema.taggings)
        .where(
          and(
            eq(this.schema.taggings.tagId, data.tagId),
            eq(this.schema.taggings.resourceId, data.resourceId),
            eq(this.schema.taggings.resourceType, data.resourceType)
          )
        )
    );
    if (deleteResult.isErr()) return err(deleteResult.error);

    return ok(foundTag);
  }

  async findTagsForResources(
    data: { resourceType: string; resourceIds: readonly string[] },
    tx?: Orm
  ): ServerResultAsync<Record<string, TagSchema[]>> {
    const db = tx ?? this.orm;
    if (data.resourceIds.length === 0) return ok({});

    const taggingsResult = await this.throwableQuery(() =>
      db
        .select({
          resourceId: this.schema.taggings.resourceId,
          tagId: this.schema.taggings.tagId,
        })
        .from(this.schema.taggings)
        .where(
          and(
            eq(this.schema.taggings.resourceType, data.resourceType),
            inArray(this.schema.taggings.resourceId, data.resourceIds as string[])
          )
        )
    );
    if (taggingsResult.isErr()) return err(taggingsResult.error);
    const taggings = taggingsResult.value;

    if (taggings.length === 0) return ok({});

    const tagIds = Array.from(new Set(taggings.map((tagging) => tagging.tagId)));
    const tagsResult = await this.throwableQuery(() =>
      db.select().from(this.schema.tags).where(inArray(this.schema.tags.id, tagIds))
    );
    if (tagsResult.isErr()) return err(tagsResult.error);
    const tags = tagsResult.value;

    const tagById = tags.reduce<Record<string, TagSchema>>((acc, tagRow) => {
      acc[tagRow.id] = tagRow;
      return acc;
    }, {});

    const grouped = taggings.reduce<Record<string, TagSchema[]>>((acc, tagging) => {
      const tagRow = tagById[tagging.tagId];
      if (!tagRow) return acc;
      const existing = acc[tagging.resourceId] ?? [];
      acc[tagging.resourceId] = [...existing, tagRow];
      return acc;
    }, {});

    return ok(grouped);
  }

  async attachTagsToResources<TRow extends { id: string }>(
    resourceType: string,
    rows: readonly TRow[],
    tx?: Orm
  ): ServerResultAsync<Array<TRow & { tags: TagSchema[] }>> {
    if (rows.length === 0) return ok([]);
    const tagsResult = await this.findTagsForResources(
      { resourceType, resourceIds: rows.map((row) => row.id) },
      tx
    );
    if (tagsResult.isErr()) return err(tagsResult.error);
    const tagsByResource = tagsResult.value;
    const withTags = rows.map((row) => ({
      ...row,
      tags: tagsByResource[row.id] ?? [],
    }));
    return ok(withTags);
  }

  async listTaggings(
    input: { resourceType: string; resourceIds?: readonly string[] },
    tx?: Orm
  ): ServerResultAsync<TaggingSchema[]> {
    const db = tx ?? this.orm;
    const filters = [eq(this.schema.taggings.resourceType, input.resourceType)];
    if (input.resourceIds?.length) {
      filters.push(inArray(this.schema.taggings.resourceId, input.resourceIds as string[]));
    }
    const rows = await this.throwableQuery(() =>
      db
        .select()
        .from(this.schema.taggings)
        .where(and(...filters))
    );
    if (rows.isErr()) return err(rows.error);
    return ok(rows.value);
  }

  async listTaggingsForUser(
    input: { resourceType: string; resourceIds?: readonly string[] },
    userId: string,
    tx?: Orm
  ): ServerResultAsync<TaggingSchema[]> {
    const db = tx ?? this.orm;
    const filters = [
      eq(this.schema.taggings.resourceType, input.resourceType),
      eq(this.schema.tags.userId, userId),
      isNull(this.schema.tags.deletedAt),
    ];

    if (input.resourceIds?.length) {
      filters.push(inArray(this.schema.taggings.resourceId, input.resourceIds as string[]));
    }

    const rows = await this.throwableQuery(() =>
      db
        .select({
          id: this.schema.taggings.id,
          createdAt: this.schema.taggings.createdAt,
          tagId: this.schema.taggings.tagId,
          resourceType: this.schema.taggings.resourceType,
          resourceId: this.schema.taggings.resourceId,
        })
        .from(this.schema.taggings)
        .innerJoin(this.schema.tags, eq(this.schema.tags.id, this.schema.taggings.tagId))
        .where(and(...filters))
    );
    if (rows.isErr()) return err(rows.error);
    return ok(rows.value);
  }

  async list(
    input: (TagListInputSchema & TagListSchema) | undefined,
    tx?: Orm
  ): ServerResultAsync<{ rows: TagSchema[]; total: number }> {
    const db = tx ?? this.orm;
    const conditions = this.getConditionBuilder(this.table);
    conditions.push(isNull(this.table.deletedAt));
    conditions.applyFilters(input);

    if (input?.assignableTo) {
      conditions.push(this.helpers.arrayContains(this.table.assignableTo, [input.assignableTo]));
    }
    const whereClause = conditions.join();
    const rowsQuery = this.withSortingAndPagination(
      db.select().from(this.table).where(whereClause),
      input || {}
    );
    const countQuery = db.select({ count: count() }).from(this.table).where(whereClause);
    const countResult = await this.throwableQuery(() => Promise.all([rowsQuery, countQuery]));
    if (countResult.isErr()) return err(countResult.error);
    const [rows, [totalResult]] = countResult.value;
    return ok({ rows, total: totalResult?.count ?? 0 });
  }
}
