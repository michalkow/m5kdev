import { Pagination } from "@heroui/react";
import type { TableProps } from "@m5kdev/frontend/modules/table/hooks/useNuqsTable";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

interface TablePaginationProps {
  pageCount: number;
  page: TableProps["page"];
  limit: TableProps["limit"];
  setPagination: TableProps["setPagination"];
  /** When set, summary matches HeroUI Table footer pattern: “start–end of total”. */
  total?: number;
}

export const TablePagination = ({
  pageCount,
  page = 1,
  limit = 10,
  setPagination,
  total,
}: TablePaginationProps) => {
  const { t } = useTranslation("web-ui");
  const safePageCount = Math.max(1, pageCount);
  const pages = useMemo(
    () => Array.from({ length: safePageCount }, (_, i) => i + 1),
    [safePageCount]
  );

  const isFirstPage = page <= 1;
  const isLastPage = page >= safePageCount;

  const start = (page - 1) * limit + 1;
  const end = total !== undefined ? Math.min(page * limit, total) : undefined;

  const summary =
    total !== undefined && end !== undefined
      ? t("table.pagination.summaryRange", { start, end, total })
      : t("table.pagination.summaryPage", { page, pageCount: safePageCount });

  /** Avoid hundreds of page links when `pageCount` is large. */
  const MAX_PAGE_LINKS = 12;
  const pageLinks = useMemo(() => {
    if (safePageCount <= MAX_PAGE_LINKS) {
      return pages;
    }
    const windowSize = 5;
    const half = Math.floor(windowSize / 2);
    let from = Math.max(1, page - half);
    const to = Math.min(safePageCount, from + windowSize - 1);
    from = Math.max(1, to - windowSize + 1);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }, [pages, page, safePageCount]);

  const goToPage = (newPage: number) => {
    setPagination?.({ pageIndex: newPage - 1, pageSize: limit });
  };

  return (
    <Pagination size="sm">
      <Pagination.Summary>{summary}</Pagination.Summary>
      <Pagination.Content>
        <Pagination.Item>
          <Pagination.Previous
            isDisabled={isFirstPage}
            onPress={() => goToPage(Math.max(1, page - 1))}
          >
            <Pagination.PreviousIcon />
            {t("table.pagination.previous")}
          </Pagination.Previous>
        </Pagination.Item>
        {pageLinks.map((p) => (
          <Pagination.Item key={p}>
            <Pagination.Link isActive={p === page} onPress={() => goToPage(p)}>
              {p}
            </Pagination.Link>
          </Pagination.Item>
        ))}
        <Pagination.Item>
          <Pagination.Next
            isDisabled={isLastPage}
            onPress={() => goToPage(Math.min(safePageCount, page + 1))}
          >
            {t("table.pagination.next")}
            <Pagination.NextIcon />
          </Pagination.Next>
        </Pagination.Item>
      </Pagination.Content>
    </Pagination>
  );
};
