import { getTableColumns, type InferSelectModel, type Table } from "drizzle-orm";
import { createSelectSchema } from "drizzle-zod";
import type { Result } from "neverthrow";
import { z } from "zod";
import type { ServerError } from "../../utils/errors";

type Simplify<T> = { [K in keyof T]: T[K] } & {};
type StringKeys<T> = Extract<keyof T, string>;

export type ServerResult<T> = Result<T, ServerError>;
export type ServerResultAsync<T> = Promise<ServerResult<T>>;

// Wrapper to force the drizzle-zod overload to the Table version
export const createTableSelectSchema = <T extends Table>(table: T) => createSelectSchema(table);

export type ExtractColumnTypes<T extends Table, C extends Record<string, unknown>> = Simplify<
  Pick<InferSelectModel<T>, Extract<keyof C, keyof InferSelectModel<T>>>
>;

export function toZodFilter<const T extends readonly string[]>(array: T): Record<T[number], true> {
  return array.reduce(
    (acc, column) => {
      acc[column as T[number]] = true;
      return acc;
    },
    {} as Record<T[number], true>
  );
}

export function pickSchema<
  Shape extends z.ZodRawShape,
  const Keys extends readonly StringKeys<Shape>[],
>(schema: z.ZodObject<Shape>, keys: Keys): z.ZodObject<Pick<Shape, Keys[number]>> {
  const mask: Record<keyof Shape, true> = {} as Record<keyof Shape, true>;
  for (const k of keys) {
    mask[k] = true;
  }
  return schema.pick(mask) as z.ZodObject<Pick<Shape, Keys[number]>>;
}

export function pickTableSchema<T extends Table, K extends keyof InferSelectModel<T>>(
  table: T,
  columns: readonly K[]
) {
  return pickSchema(createSelectSchema(table), columns);
}

export function omitSchema<
  Shape extends z.ZodRawShape,
  const Keys extends readonly StringKeys<Shape>[],
>(schema: z.ZodObject<Shape>, keys: Keys): z.ZodObject<Omit<Shape, Keys[number]>> {
  const mask: Record<keyof Shape, true> = {} as Record<keyof Shape, true>;
  for (const k of keys) {
    mask[k] = true;
  }
  return schema.omit(mask) as z.ZodObject<Omit<Shape, Keys[number]>>;
}

export function omitTableSchema<T extends Table, K extends keyof InferSelectModel<T>>(
  table: T,
  columns: readonly K[]
) {
  return omitSchema(createSelectSchema(table), columns);
}

export { getTableColumns };

export function pickColumns<T extends Table, Shape extends z.ZodRawShape>(
  table: T,
  schema: z.ZodObject<Shape>
): Pick<ReturnType<typeof getTableColumns<T>>, Extract<keyof Shape, string>> {
  const allColumns = getTableColumns(table);
  const schemaKeys = Object.keys(schema.shape) as Array<Extract<keyof Shape, string>>;

  const result = {} as Pick<typeof allColumns, Extract<keyof Shape, string>>;
  for (const key of schemaKeys) {
    if (key in allColumns) {
      (result as any)[key] = allColumns[key as keyof typeof allColumns];
    }
  }

  return result;
}

export function pickTableColumns<T extends Table, K extends keyof InferSelectModel<T>>(
  table: T,
  columns: readonly K[]
): Pick<ReturnType<typeof getTableColumns<T>>, K> {
  const allColumns = getTableColumns(table);
  const result = {} as Pick<typeof allColumns, K>;
  for (const key of columns) {
    if (key in allColumns) {
      result[key] = allColumns[key];
    }
  }
  return result;
}

export function omitTableColumns<T extends Table, K extends keyof InferSelectModel<T>>(
  table: T,
  columns: readonly K[]
): Omit<ReturnType<typeof getTableColumns<T>>, K> {
  const allColumns = getTableColumns(table);
  const columnsToOmit = new Set(columns as readonly string[]);
  const filteredEntries = Object.entries(allColumns).filter(([key]) => !columnsToOmit.has(key));
  return Object.fromEntries(filteredEntries) as Omit<typeof allColumns, K>;
}

// Overloads to narrow return type based on provided partial
export function createSelectDTO<T extends Table>(
  table: T
): {
  columns: ReturnType<typeof getTableColumns<T>>;
  schema: ReturnType<typeof createTableSelectSchema<T>>;
};
export function createSelectDTO<
  T extends Table,
  K extends Extract<keyof InferSelectModel<T>, string>,
>(
  table: T,
  partial: { omit: readonly K[] }
): {
  columns: ReturnType<typeof omitTableColumns<T, K>>;
  schema: ReturnType<typeof omitTableSchema<T, K>>;
};
export function createSelectDTO<
  T extends Table,
  K extends Extract<keyof InferSelectModel<T>, string>,
>(
  table: T,
  partial: { pick: readonly K[] }
): {
  columns: ReturnType<typeof pickTableColumns<T, K>>;
  schema: ReturnType<typeof pickTableSchema<T, K>>;
};

// Implementation
export function createSelectDTO<T extends Table>(
  table: T,
  partial?:
    | { omit: readonly (keyof InferSelectModel<T>)[] }
    | { pick: readonly (keyof InferSelectModel<T>)[] }
): { columns: unknown; schema: unknown } {
  if (partial) {
    if ("omit" in partial && partial.omit) {
      return {
        columns: omitTableColumns(table, partial.omit),
        schema: omitTableSchema(table, partial.omit),
      };
    }
    if ("pick" in partial && partial.pick) {
      return {
        columns: pickTableColumns(table, partial.pick),
        schema: pickTableSchema(table, partial.pick),
      };
    }
  }
  return { columns: getTableColumns(table), schema: createTableSelectSchema(table) };
}

export function createSelectUtils<
  T extends Record<
    string,
    {
      columns: unknown;
      schema: z.ZodTypeAny;
    }
  >,
  S extends z.ZodTypeAny,
>(
  dtos: T,
  output: S,
  transformer: (rows: Array<{ [K in keyof T]: z.infer<T[K]["schema"]> }>) => z.infer<S>
): {
  select: { [K in keyof T]: T[K]["columns"] };
  output: S;
  transformer: (rows: Array<{ [K in keyof T]: z.infer<T[K]["schema"]> }>) => z.infer<S>;
} {
  return {
    select: Object.fromEntries(Object.entries(dtos).map(([key, dto]) => [key, dto.columns])) as {
      [K in keyof T]: T[K]["columns"];
    },
    output,
    transformer,
  };
}

export const uuidOutput = z.object({
  id: z.uuid(),
});

export const uuidManyOutput = z.object({
  ids: z.array(z.uuid()),
});

export const scheduleOutput = z.object({
  jobId: z.string(),
});

export const scheduleManyOutput = z.object({
  jobIds: z.array(z.string()),
});

export const deleteOutput = uuidOutput;

export const deleteManyOutput = uuidManyOutput;
