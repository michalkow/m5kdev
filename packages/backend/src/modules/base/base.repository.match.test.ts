import { queryFiltersToMatch } from "@m5kdev/commons/modules/schemas/queryMatch";
import type { QueryFilter } from "@m5kdev/commons/modules/schemas/query.schema";
import { createClient } from "@libsql/client";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { drizzle } from "drizzle-orm/libsql";
import { BaseTableRepository } from "./base.repository";

const matchItems = sqliteTable("match_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  age: integer("age").notNull(),
  featured: integer("featured", { mode: "boolean" }).notNull(),
  publishedAt: integer("published_at", { mode: "timestamp" }).notNull(),
  startsAt: integer("starts_at", { mode: "timestamp" }).notNull(),
  endsAt: integer("ends_at", { mode: "timestamp" }),
  tags: text("tags", { mode: "json" }).notNull().$type<string[]>(),
  memberId: text("member_id").notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

const schema = { matchItems };
type Schema = typeof schema;
type Orm = LibSQLDatabase<Schema>;

class MatchItemRepository extends BaseTableRepository<
  Orm,
  Schema,
  Record<string, never>,
  typeof matchItems
> {}

const PUBLISHED_EQUALS: QueryFilter = {
  columnId: "status",
  type: "enum",
  method: "equals",
  value: "published",
};
const NAME_CONTAINS: QueryFilter = {
  columnId: "name",
  type: "string",
  method: "contains",
  value: "Widget",
};
const AGE_GREATER_THAN: QueryFilter = {
  columnId: "age",
  type: "number",
  method: "greater_than",
  value: 18,
};
const AFTER_JAN_15: QueryFilter = {
  columnId: "publishedAt",
  type: "date",
  method: "after",
  value: "2026-01-15",
};
const TAGS_EQUALS: QueryFilter = {
  columnId: "tags",
  type: "jsonArray",
  method: "equals",
  value: ["red"],
};
const INTERVAL_INTERSECT: QueryFilter = {
  columnId: "startsAt",
  type: "date",
  method: "intersect",
  value: "2026-01-10",
  valueTo: "2026-01-20",
  endColumnId: "endsAt",
};
const NAME_EMPTY: QueryFilter = {
  columnId: "name",
  type: "string",
  method: "isEmpty",
  value: true,
};
const STATUS_ONE_OF: QueryFilter = {
  columnId: "status",
  type: "enum",
  method: "oneOf",
  value: ["published", "draft"],
};
const TAGS_ONE_OF: QueryFilter = {
  columnId: "tags",
  type: "jsonArray",
  method: "oneOf",
  value: ["blue", "green"],
};

function rowIds(result: { rows: { id: string }[] }): string[] {
  return result.rows.map((row) => row.id).toSorted();
}

describe("BaseTableRepository matchList / matchFind", () => {
  const client = createClient({ url: ":memory:" });
  const orm = drizzle(client, { schema }) as Orm;
  const repo = new MatchItemRepository({ orm, schema, table: matchItems });

  beforeAll(async () => {
    await client.execute(`
      CREATE TABLE match_items (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        age INTEGER NOT NULL,
        featured INTEGER NOT NULL,
        published_at INTEGER NOT NULL,
        starts_at INTEGER NOT NULL,
        ends_at INTEGER,
        tags TEXT NOT NULL,
        member_id TEXT NOT NULL,
        deleted_at INTEGER
      );
    `);

    await orm.insert(matchItems).values([
      {
        id: "a",
        name: "Alpha Widget",
        status: "published",
        age: 21,
        featured: true,
        publishedAt: new Date("2026-01-15T12:00:00.000Z"),
        startsAt: new Date("2026-01-01T00:00:00.000Z"),
        endsAt: new Date("2026-01-31T00:00:00.000Z"),
        tags: ["red", "blue"],
        memberId: "m1",
      },
      {
        id: "b",
        name: "Beta Draft",
        status: "draft",
        age: 18,
        featured: false,
        publishedAt: new Date("2026-01-15T00:00:00.000Z"),
        startsAt: new Date("2026-02-01T00:00:00.000Z"),
        endsAt: new Date("2026-02-28T00:00:00.000Z"),
        tags: ["red"],
        memberId: "m2",
      },
      {
        id: "c",
        name: "Gamma Mine",
        status: "published",
        age: 17,
        featured: true,
        publishedAt: new Date("2025-12-31T23:00:00.000Z"),
        startsAt: new Date("2026-01-20T00:00:00.000Z"),
        endsAt: null,
        tags: [],
        memberId: "m1",
      },
      {
        id: "d",
        name: "Deleted Row",
        status: "published",
        age: 30,
        featured: false,
        publishedAt: new Date("2026-03-01T00:00:00.000Z"),
        startsAt: new Date("2026-03-01T00:00:00.000Z"),
        endsAt: new Date("2026-03-10T00:00:00.000Z"),
        tags: ["green"],
        memberId: "m1",
        deletedAt: new Date("2026-04-01T00:00:00.000Z"),
      },
      {
        id: "e",
        name: "",
        status: "draft",
        age: 0,
        featured: false,
        publishedAt: new Date("2026-06-01T00:00:00.000Z"),
        startsAt: new Date("2026-06-01T00:00:00.000Z"),
        endsAt: new Date("2026-06-02T00:00:00.000Z"),
        tags: ["solo"],
        memberId: "m3",
      },
    ]);
  });

  it("returns matching rows for a shorthand equality match", async () => {
    const result = await repo.matchList({ match: { status: "published" } });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(rowIds(result.value)).toEqual(["a", "c"]);
      expect(result.value.total).toBe(2);
    }
  });

  it("treats empty match as a no-op and hides soft-deleted rows", async () => {
    const result = await repo.matchList({ match: {} });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(rowIds(result.value)).toEqual(["a", "b", "c", "e"]);
    }
  });

  it("keeps queryList rows unchanged for representative QueryFilters", async () => {
    const result = await repo.queryList({ filters: [PUBLISHED_EQUALS] });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(rowIds(result.value)).toEqual(["a", "c"]);
    }
  });

  it("returns the same rows as queryList after converting QueryFilters", async () => {
    const filters = [
      PUBLISHED_EQUALS,
      NAME_CONTAINS,
      AGE_GREATER_THAN,
      AFTER_JAN_15,
      TAGS_EQUALS,
      INTERVAL_INTERSECT,
      NAME_EMPTY,
      STATUS_ONE_OF,
      TAGS_ONE_OF,
    ];

    for (const filter of filters) {
      const list = await repo.queryList({ filters: [filter] });
      const match = await repo.matchList({ match: queryFiltersToMatch([filter]) });
      expect(list.isOk()).toBe(true);
      expect(match.isOk()).toBe(true);
      if (list.isOk() && match.isOk()) {
        expect(rowIds(match.value)).toEqual(rowIds(list.value));
      }
    }
  });

  it("treats $gt as strict and $greater_than as gte", async () => {
    const strict = await repo.matchList({ match: { age: { $gt: 18 } } });
    const ui = await repo.matchList({ match: { age: { $greater_than: 18 } } });
    expect(strict.isOk()).toBe(true);
    expect(ui.isOk()).toBe(true);
    if (strict.isOk() && ui.isOk()) {
      expect(rowIds(strict.value)).toEqual(["a"]);
      expect(rowIds(ui.value)).toEqual(["a", "b"]);
    }
  });

  it("ANDs field keys with a sibling $or group", async () => {
    const result = await repo.matchList({
      match: {
        memberId: "m1",
        $or: [{ status: "draft" }, { featured: true }],
      },
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(rowIds(result.value)).toEqual(["a", "c"]);
    }
  });

  it("negates a field operator map and a whole QueryMatch", async () => {
    const fieldNot = await repo.matchList({ match: { age: { $not: { $gt: 18 } } } });
    const groupNot = await repo.matchList({ match: { $not: { status: "draft" } } });
    expect(fieldNot.isOk()).toBe(true);
    expect(groupNot.isOk()).toBe(true);
    if (fieldNot.isOk() && groupNot.isOk()) {
      expect(rowIds(fieldNot.value)).toEqual(["b", "c", "e"]);
      expect(rowIds(groupNot.value)).toEqual(["a", "c"]);
    }
  });

  it("errors on unknown column, unknown operator, and malformed payload", async () => {
    const unknownColumn = await repo.matchList({ match: { missing: "x" } });
    const unknownOp = await repo.matchList({ match: { age: { $regex: "18" } } as never });
    const unknownBoolean = await repo.matchList({ match: { $nor: [{ status: "draft" }] } as never });
    const malformed = await repo.matchList({ match: { age: { $in: 18 } } as never });

    expect(unknownColumn.isErr()).toBe(true);
    expect(unknownOp.isErr()).toBe(true);
    expect(unknownBoolean.isErr()).toBe(true);
    expect(malformed.isErr()).toBe(true);
    if (unknownColumn.isErr()) {
      expect(unknownColumn.error.code).toBe("BAD_REQUEST");
    }
  });

  it("returns one row or none from matchFind", async () => {
    const found = await repo.matchFind({ match: { id: "a" } });
    const missing = await repo.matchFind({ match: { status: "archived" } });
    expect(found.isOk()).toBe(true);
    expect(missing.isOk()).toBe(true);
    if (found.isOk()) {
      expect(found.value?.id).toBe("a");
    }
    if (missing.isOk()) {
      expect(missing.value).toBeUndefined();
    }
  });

  it("applies sort, pagination, and global search on matchList", async () => {
    const paged = await repo.matchList({
      match: { status: "published" },
      sort: "name",
      order: "asc",
      page: 1,
      limit: 1,
    });
    const searched = await repo.matchList(
      { q: "Widget" },
      { globalSearchColumns: ["name"] }
    );

    expect(paged.isOk()).toBe(true);
    expect(searched.isOk()).toBe(true);
    if (paged.isOk()) {
      expect(paged.value.rows.map((row) => row.id)).toEqual(["a"]);
      expect(paged.value.total).toBe(2);
    }
    if (searched.isOk()) {
      expect(rowIds(searched.value)).toEqual(["a"]);
    }
  });

  it("treats empty $in as matching no rows and does not rewrite json $in to $oneOf", async () => {
    const emptyIn = await repo.matchList({ match: { age: { $in: [] } } });
    const jsonIn = await repo.matchList({ match: { tags: { $in: ["red"] } } });
    const jsonOneOf = await repo.matchList({ match: { tags: { $oneOf: ["red"] } } });
    expect(emptyIn.isOk()).toBe(true);
    expect(jsonIn.isOk()).toBe(true);
    expect(jsonOneOf.isOk()).toBe(true);
    if (emptyIn.isOk() && jsonIn.isOk() && jsonOneOf.isOk()) {
      expect(rowIds(emptyIn.value)).toEqual([]);
      expect(rowIds(jsonIn.value)).toEqual([]);
      expect(rowIds(jsonOneOf.value)).toEqual(["a", "b"]);
    }
  });

  it("includes soft-deleted rows only when showDeleted is set", async () => {
    const hidden = await repo.matchList({ match: { status: "published" } });
    const shown = await repo.matchList(
      { match: { status: "published" } },
      { showDeleted: true }
    );
    expect(hidden.isOk()).toBe(true);
    expect(shown.isOk()).toBe(true);
    if (hidden.isOk() && shown.isOk()) {
      expect(rowIds(hidden.value)).toEqual(["a", "c"]);
      expect(rowIds(shown.value)).toEqual(["a", "c", "d"]);
    }
  });
});
