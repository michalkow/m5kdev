import type {
  QueryFilter,
  QueryFilters,
  QueryInput,
} from "@m5kdev/commons/modules/schemas/query.schema";
import {
  and,
  count,
  eq,
  type InferInsertModel,
  type InferSelectModel,
  inArray,
  isNull,
  like,
  or,
  type SelectedFields,
  type SQL,
} from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { SQLiteColumn, SQLiteTableWithColumns } from "drizzle-orm/sqlite-core";
import { ok } from "neverthrow";
import { ServerError } from "../../utils/errors";
import { applyPagination } from "../utils/applyPagination";
import { applySorting } from "../utils/applySorting";
import { getConditionsFromFilters } from "../utils/getConditionsFromFilters";
import { pushGlobalSearch } from "../utils/getGlobalSearchCondition";
import { Base } from "./base.abstract";
import { pickColumns, type ServerResult, type ServerResultAsync } from "./base.dto";

/** Payload for update/updateMany: id key required (string), other table fields optional. */
export type TableUpdatePayload<
  TTable extends SQLiteTableWithColumns<any>,
  TIdKey extends Extract<keyof InferSelectModel<TTable>, string> = "id",
> = Record<TIdKey, string> & Partial<Omit<InferSelectModel<TTable>, TIdKey>>;

export class ConditionBuilder {
  constructor(private conditions: SQL[] = []) {
    this.conditions = conditions;
  }

  push(condition?: SQL) {
    if (condition) this.conditions.push(condition);
  }

  join(type: "and" | "or" = "and") {
    if (this.conditions.length === 0) return undefined;
    if (this.conditions.length === 1) return this.conditions[0];
    return type === "and" ? and(...this.conditions) : or(...this.conditions);
  }

  [Symbol.iterator]() {
    return this.conditions[Symbol.iterator]();
  }
}

export class TableConditionBuilder<
  TTable extends SQLiteTableWithColumns<any>,
> extends ConditionBuilder {
  private table: TTable;

  constructor(table: TTable) {
    super();
    this.table = table;
  }

  applyFilters({ filters }: { filters?: QueryFilters } = {}) {
    if (filters && filters.length > 0) getConditionsFromFilters(this, filters, this.table);
  }

  applyGlobalSearch(q: string | undefined, columns: readonly SQLiteColumn[]) {
    pushGlobalSearch(this, q, columns);
  }
}

export const arrayContains = (table: SQLiteColumn, values: string[]) => {
  const arrayContains: SQL[] = [];
  for (const value of values) {
    arrayContains.push(like(table, `%"${value}%"`));
  }
  return or(...arrayContains);
};

export class BaseRepository<
  O extends LibSQLDatabase<any>,
  S extends Record<string, SQLiteTableWithColumns<any>>,
  R extends Record<string, BaseRepository<any, any, any> | BaseExternaRepository>,
> extends Base {
  protected orm: O;
  protected schema: S;
  public repository?: R;

  constructor(options: { orm: O; schema: S }, repository?: R) {
    super("repository");
    this.orm = options.orm;
    this.schema = options.schema;
    this.repository = repository;
  }
  getConditionBuilder(): ConditionBuilder;
  getConditionBuilder(table: undefined): ConditionBuilder;
  getConditionBuilder<TTable extends SQLiteTableWithColumns<any>>(
    table: TTable
  ): TableConditionBuilder<TTable>;
  getConditionBuilder<TTable extends SQLiteTableWithColumns<any>>(
    table?: TTable
  ): ConditionBuilder | TableConditionBuilder<TTable> {
    if (table === undefined) {
      return new ConditionBuilder();
    }
    return new TableConditionBuilder(table);
  }
  throwableQuery<T>(fn: () => Promise<T>): ServerResultAsync<T> {
    return this.throwablePromise(
      () => fn(),
      (error) =>
        new ServerError({
          code: "INTERNAL_SERVER_ERROR",
          layer: "repository",
          layerName: this.constructor.name,
          message: "Database query failed",
          cause: error,
        })
    );
  }

  withPagination<TQuery>(
    query: TQuery,
    { page, limit }: Pick<QueryInput, "page" | "limit">
  ): TQuery {
    return applyPagination(query, limit, page);
  }

  withSorting<TTable extends SQLiteTableWithColumns<any>, TQuery>(
    query: TQuery,
    { sort, order }: Pick<QueryInput, "sort" | "order">,
    table?: TTable
  ): TQuery {
    if (!table) throw new Error("No table provided");
    return applySorting(query, table, sort, order);
  }

  withSortingAndPagination<TTable extends SQLiteTableWithColumns<any>, TQuery>(
    query: TQuery,
    { sort, order, page, limit }: Pick<QueryInput, "sort" | "order" | "page" | "limit">,
    table?: TTable
  ): TQuery {
    if (!table) throw new Error("No table provided");
    return this.withSorting(this.withPagination(query, { page, limit }), { sort, order }, table);
  }

  addUserIdFilter(userId: string, query?: QueryInput): QueryInput {
    const userIdFilter: QueryFilter = {
      columnId: "userId",
      type: "string",
      method: "equals",
      value: userId,
    };
    return query
      ? { ...query, filters: [...(query?.filters ?? []), userIdFilter] }
      : { filters: [userIdFilter] };
  }

  helpers = {
    pickColumns,
    arrayContains,
    ConditionBuilder,
  };
}

/**
 * Generic table-bound repository with typed CRUD, returning ServerResultAsync via throwableAsync.
 *
 * Example:
 * const userRepo = new UserRepository(db, schema);
 * class UserRepository extends BaseTableRepository<typeof schema.user> {
 *   constructor(db: LibSQLDatabase<typeof schema>, schema: typeof schema) {
 *     super(db, schema, schema.user);
 *   }
 * }
 */
export class BaseTableRepository<
  O extends LibSQLDatabase<any>,
  S extends Record<string, SQLiteTableWithColumns<any>>,
  R extends Record<string, BaseRepository<any, any, any> | BaseExternaRepository>,
  TTable extends SQLiteTableWithColumns<any>,
  TIdKey extends Extract<keyof InferSelectModel<TTable>, string> = "id",
> extends BaseRepository<O, S, R> {
  protected readonly table: TTable;
  protected readonly idKey: TIdKey;
  protected readonly idColumn: SQLiteColumn;

  constructor(options: { orm: O; schema: S; table: TTable; idKey?: TIdKey }, repository?: R) {
    super({ orm: options.orm, schema: options.schema }, repository);
    this.table = options.table;
    this.idKey = options.idKey ?? ("id" as TIdKey);
    this.idColumn = (this.table as any)[this.idKey] as SQLiteColumn;
  }

  override withSorting<TQuery>(
    query: TQuery,
    { sort, order }: Pick<QueryInput, "sort" | "order">,
    table?: SQLiteTableWithColumns<any>
  ): TQuery {
    return super.withSorting(query, { sort, order }, table || this.table);
  }

  override withSortingAndPagination<MTable extends SQLiteTableWithColumns<any>, TQuery>(
    query: TQuery,
    { sort, order, page, limit }: Pick<QueryInput, "sort" | "order" | "page" | "limit">,
    table?: MTable
  ): TQuery {
    return super.withSortingAndPagination(query, { sort, order, page, limit }, table || this.table);
  }

  async queryList(
    query?: QueryInput,
    options?: {
      conditions?: TableConditionBuilder<TTable>;
      select?: SelectedFields<SQLiteColumn, TTable>;
      globalSearchColumns?: string[];
      showDeleted?: boolean;
    },
    tx?: O
  ): ServerResultAsync<{ rows: InferSelectModel<TTable>[]; total: number }> {
    return this.throwableAsync(async () => {
      type Row = InferSelectModel<TTable>;

      const db = tx ?? this.orm;
      const conditions = options?.conditions ?? this.getConditionBuilder(this.table);
      conditions.applyFilters(query);
      if (options?.globalSearchColumns?.length) {
        const columns = options.globalSearchColumns.map((c) => {
          const column = this.table[c as keyof TTable] as SQLiteColumn;
          if (!column) {
            throw new Error(`Column ${c} not found in table ${this.table.name}`);
          }
          return column;
        });
        conditions.applyGlobalSearch(query?.q, columns);
      }
      if (this.table.deletedAt && !options?.showDeleted) {
        conditions.push(isNull(this.table.deletedAt));
      }
      const whereClause = conditions.join();
      const rowsQuery = this.withSortingAndPagination(
        (options?.select ? db.select(options.select) : db.select())
          .from(this.table as any)
          .where(whereClause),
        query || {}
      );
      const countQuery = db
        .select({ count: count() })
        .from(this.table as any)
        .where(whereClause);
      const [rows, [totalResult]] = await Promise.all([rowsQuery, countQuery]);

      return ok({ rows: rows as Row[], total: totalResult?.count ?? 0 });
    });
  }

  async findById(id: string, tx?: O): ServerResultAsync<InferSelectModel<TTable> | undefined> {
    return this.throwableAsync(async () => {
      const db = tx ?? this.orm;
      type Row = InferSelectModel<TTable>;

      const rows = (await db
        .select()
        .from(this.table as any)
        .where(eq(this.idColumn as SQLiteColumn, id))) as Row[];

      return ok(rows[0]);
    });
  }

  async findManyById(
    ids: readonly string[],
    tx?: O
  ): ServerResultAsync<Array<InferSelectModel<TTable>>> {
    return this.throwableAsync(async () => {
      const db = tx ?? this.orm;
      type Row = InferSelectModel<TTable>;

      if (ids.length === 0) {
        return ok<Row[]>([]);
      }

      const rows = (await db
        .select()
        .from(this.table as any)
        .where(inArray(this.idColumn as SQLiteColumn, ids as string[]))) as Row[];

      return ok(rows);
    });
  }

  async create(
    data: InferInsertModel<TTable>,
    tx?: O
  ): ServerResultAsync<InferSelectModel<TTable>> {
    return this.throwableAsync(async () => {
      const db = tx ?? this.orm;
      type Row = InferSelectModel<TTable>;

      const rows = (await db
        .insert(this.table as any)
        .values(data as any)
        .returning()) as unknown as Row[];

      if (rows.length === 0) return this.error("UNPROCESSABLE_CONTENT");
      return ok(rows[0] as Row);
    });
  }

  async createMany(
    data: readonly InferInsertModel<TTable>[],
    tx?: O
  ): ServerResultAsync<Array<InferSelectModel<TTable>>> {
    return this.throwableAsync(async () => {
      const db = tx ?? this.orm;
      type Row = InferSelectModel<TTable>;

      if (data.length === 0) {
        return ok<Row[]>([]);
      }

      const rows = (await db
        .insert(this.table as any)
        .values(data as any)
        .returning()) as unknown as Row[];

      return ok(rows as Row[]);
    });
  }

  async update(
    data: TableUpdatePayload<TTable, TIdKey>,
    tx?: O
  ): ServerResultAsync<InferSelectModel<TTable>> {
    return this.throwableAsync(async () => {
      const db = tx ?? this.orm;
      type Row = InferSelectModel<TTable>;

      const single = data as Record<string, unknown>;
      const id = String(single[this.idKey]);
      const { [this.idKey]: _removed, ...rest } = single;
      const update = rest;
      if (this.table.updatedAt) (update as any).updatedAt = new Date();
      const rows = (await db
        .update(this.table as any)
        .set(update as unknown as Partial<InferInsertModel<TTable>>)
        .where(eq(this.idColumn as SQLiteColumn, id))
        .returning()) as unknown as Row[];
      const [row] = rows;

      if (!row) return this.error("NOT_FOUND");
      return ok(row) as ServerResult<Row>;
    });
  }

  async updateMany(
    data: readonly TableUpdatePayload<TTable, TIdKey>[],
    tx?: O
  ): ServerResultAsync<Array<InferSelectModel<TTable>>> {
    return this.throwableAsync(async () => {
      const db = tx ?? this.orm;
      type Row = InferSelectModel<TTable>;

      if (data.length === 0) {
        return ok<Row[]>([]);
      }

      const results: Row[] = [];
      for (const item of data) {
        const record = item as Record<string, unknown>;
        const id = String(record[this.idKey]);
        const { [this.idKey]: _removed, ...rest } = record;
        const update = rest;
        if (this.table.updatedAt) (update as any).updatedAt = new Date();
        const rows = (await db
          .update(this.table as any)
          .set(update as unknown as Partial<InferInsertModel<TTable>>)
          .where(eq(this.idColumn as SQLiteColumn, id))
          .returning()) as unknown as Row[];
        if (rows[0]) results.push(rows[0]);
      }

      return ok(results) as ServerResult<Row[]>;
    });
  }

  async softDeleteById(id: string, tx?: O): ServerResultAsync<{ id: string }> {
    return this.throwableAsync(async () => {
      const db = tx ?? this.orm;
      if (!this.table.deletedAt) return this.error("METHOD_NOT_SUPPORTED");

      const rows = await db
        .update(this.table as any)
        .set({ deletedAt: new Date() })
        .where(eq(this.idColumn as SQLiteColumn, id))
        .returning({
          id: this.idColumn as SQLiteColumn,
        });

      if (rows.length === 0) return this.error("NOT_FOUND");
      return ok(rows[0] as { id: string });
    });
  }

  async softDeleteManyById(
    ids: readonly string[],
    tx?: O
  ): ServerResultAsync<Array<{ id: string }>> {
    return this.throwableAsync(async () => {
      const db = tx ?? this.orm;
      if (!this.table.deletedAt) return this.error("METHOD_NOT_SUPPORTED");

      const rows = await db
        .update(this.table as any)
        .set({ deletedAt: new Date() })
        .where(inArray(this.idColumn as SQLiteColumn, ids as string[]))
        .returning({
          id: this.idColumn as SQLiteColumn,
        });
      if (rows.length === 0) return this.error("NOT_FOUND");
      return ok(rows as { id: string }[]);
    });
  }

  async deleteById(id: string, tx?: O): ServerResultAsync<{ id: string }> {
    return this.throwableAsync(async () => {
      const db = tx ?? this.orm;

      const rows = await db
        .delete(this.table as any)
        .where(eq(this.idColumn as SQLiteColumn, id))
        .returning({
          id: this.idColumn as SQLiteColumn,
        });

      if (rows.length === 0) return this.error("NOT_FOUND");
      return ok(rows[0] as { id: string });
    });
  }

  async deleteManyById(ids: readonly string[], tx?: O): ServerResultAsync<Array<{ id: string }>> {
    return this.throwableAsync(async () => {
      const db = tx ?? this.orm;

      if (ids.length === 0) {
        return ok<{ id: string }[]>([]);
      }

      const rows = await db
        .delete(this.table as any)
        .where(inArray(this.idColumn as SQLiteColumn, ids as string[]))
        .returning({
          id: this.idColumn as SQLiteColumn,
        });

      return ok(rows as { id: string }[]);
    });
  }
}

export class BaseExternaRepository extends Base {
  constructor() {
    super("repository");
  }
}
