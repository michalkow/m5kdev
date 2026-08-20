/**
 * Applies pagination (limit and offset) to a drizzle query builder.
 * Returns the query builder with pagination applied, or the original query if no limit is specified.
 * Page is 1-based and only applied if limit is also provided.
 */

export const applyPagination = <TQuery>(query: TQuery, limit?: number, page?: number): TQuery => {
  if (limit) (query as any).limit(limit);

  if (page && page > 1 && limit) (query as any).offset((page - 1) * limit);

  return query;
};
