import type { QueryInput } from "@m5kdev/commons/modules/schemas/query.schema";
import type { AppRouter } from "@starter-app/server/types";
import {
  POST_FILTER_VALUES,
  POSTS_PAGE_SIZE,
} from "@starter-app/shared/modules/posts/posts.constants";
import { type UseQueryOptions, useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { startTransition, useDeferredValue, useMemo } from "react";
import { useTRPC } from "@/utils/trpc";

export type PostStatusFilter = (typeof POST_FILTER_VALUES)[number];

// row/list types are inferred from the server router — no hand-written mirrors
type PostsListOutput = inferRouterOutputs<AppRouter>["posts"]["list"];
export type PostRow = PostsListOutput["rows"][number];

const STATUS_PARSER = parseAsStringLiteral(POST_FILTER_VALUES).withDefault("all");

/** List query plus its URL state (search, status filter, page) and derived stats. */
export function usePostsList() {
  const trpc = useTRPC();

  const [search, setSearchParam] = useQueryState("search", parseAsString.withDefault(""));
  const [status, setStatusParam] = useQueryState<PostStatusFilter>("status", STATUS_PARSER);
  const [page, setPageParam] = useQueryState("page", parseAsInteger.withDefault(1));

  const deferredSearch = useDeferredValue(search);

  // the generic list contract: q for global search, filters for column filters
  const listInput = useMemo<QueryInput>(
    () => ({
      page,
      limit: POSTS_PAGE_SIZE,
      q: deferredSearch || undefined,
      filters:
        status === "all"
          ? undefined
          : [{ columnId: "status", type: "enum", method: "equals", value: status }],
      sort: "updatedAt",
      order: "desc",
    }),
    [deferredSearch, page, status]
  );

  const { data, isLoading, isFetching } = useQuery(
    trpc.posts.list.queryOptions(listInput) as unknown as UseQueryOptions<PostsListOutput>
  );

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / POSTS_PAGE_SIZE));

  const stats = useMemo(
    () => ({
      published: rows.filter((row) => row.status === "published").length,
      drafts: rows.filter((row) => row.status === "draft").length,
      total,
    }),
    [rows, total]
  );

  const setSearch = (value: string) => {
    startTransition(() => {
      void setSearchParam(value || null);
      void setPageParam(1);
    });
  };

  const setStatus = (value: PostStatusFilter) => {
    startTransition(() => {
      void setStatusParam(value);
      void setPageParam(1);
    });
  };

  const goToPage = (next: number) => {
    startTransition(() => {
      void setPageParam(Math.min(Math.max(1, next), pageCount));
    });
  };

  return {
    rows,
    total,
    pageCount,
    stats,
    page,
    search,
    status,
    isLoading,
    isFetching,
    setSearch,
    setStatus,
    goToPage,
  };
}
