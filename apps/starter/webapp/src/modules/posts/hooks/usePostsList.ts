import {
  POST_FILTER_VALUES,
  POSTS_PAGE_SIZE,
} from "@starter-app/shared/modules/posts/posts.constants";
import type {
  PostsListInputSchema,
  PostsListOutputSchema,
} from "@starter-app/shared/modules/posts/posts.schema";
import { type UseQueryOptions, useQuery } from "@tanstack/react-query";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { startTransition, useDeferredValue, useMemo } from "react";
import { useTRPC } from "@/utils/trpc";

export type PostStatusFilter = (typeof POST_FILTER_VALUES)[number];
export type PostRow = PostsListOutputSchema["rows"][number];

const STATUS_PARSER = parseAsStringLiteral(POST_FILTER_VALUES).withDefault("all");

/** List query plus its URL state (search, status filter, page) and derived stats. */
export function usePostsList() {
  const trpc = useTRPC();

  const [search, setSearchParam] = useQueryState("search", parseAsString.withDefault(""));
  const [status, setStatusParam] = useQueryState<PostStatusFilter>("status", STATUS_PARSER);
  const [page, setPageParam] = useQueryState("page", parseAsInteger.withDefault(1));

  const deferredSearch = useDeferredValue(search);

  const listInput = useMemo<PostsListInputSchema>(
    () => ({
      page,
      limit: POSTS_PAGE_SIZE,
      search: deferredSearch || undefined,
      status: status === "all" ? undefined : status,
      sort: "updatedAt",
      order: "desc",
    }),
    [deferredSearch, page, status]
  );

  const { data, isLoading, isFetching } = useQuery(
    trpc.posts.list.queryOptions(listInput) as unknown as UseQueryOptions<PostsListOutputSchema>
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
