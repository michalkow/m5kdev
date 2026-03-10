import type { TableProps } from "@m5kdev/frontend/modules/table/hooks/useNuqsTable";
import { Input } from "#components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationNext,
  PaginationPrevious,
} from "#components/ui/pagination";

interface TablePaginationProps {
  pageCount: number;
  page: TableProps["page"];
  limit: TableProps["limit"];
  setPagination: TableProps["setPagination"];
}

export const TablePagination = ({
  pageCount,
  page = 1,
  limit = 10,
  setPagination,
}: TablePaginationProps) => {
  const isFirstPage = page === 1;
  const isLastPage = page >= pageCount;
  return (
    <Pagination>
      <PaginationContent>
        <PaginationPrevious
          isActive={!isFirstPage}
          onClick={() => {
            if (!isFirstPage) {
              setPagination?.({ pageIndex: page - 2, pageSize: limit });
            }
          }}
        />
        <Input
          type="number"
          value={page}
          min={1}
          max={pageCount}
          onChange={(e) => {
            const newPage = e.target.valueAsNumber;
            if (newPage >= 1 && newPage <= pageCount) {
              setPagination?.({ pageIndex: newPage - 1, pageSize: limit });
            }
          }}
        />
        <PaginationNext
          isActive={!isLastPage}
          onClick={() => {
            if (!isLastPage) {
              setPagination?.({ pageIndex: page, pageSize: limit });
            }
          }}
        />
      </PaginationContent>
    </Pagination>
  );
};
