import type { TableProps } from "@m5kdev/frontend/modules/table/hooks/useNuqsTable";
import { useEffect, useState } from "react";
import { Input } from "../../../components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationNext,
  PaginationPrevious,
} from "../../../components/ui/pagination";

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
  const [inputValue, setInputValue] = useState(String(page));

  useEffect(() => {
    setInputValue(String(page));
  }, [page]);

  const commitPage = () => {
    const newPage = Number(inputValue);
    if (Number.isFinite(newPage) && newPage >= 1 && newPage <= pageCount) {
      setPagination?.({ pageIndex: newPage - 1, pageSize: limit });
    } else {
      setInputValue(String(page));
    }
  };

  const isFirstPage = page === 1;
  const isLastPage = page >= pageCount;
  return (
    <Pagination>
      <PaginationContent>
        <PaginationPrevious
          isActive={!isFirstPage}
          aria-disabled={isFirstPage}
          className={isFirstPage ? "pointer-events-none opacity-50" : undefined}
          onClick={() => {
            if (!isFirstPage) {
              setPagination?.({ pageIndex: page - 2, pageSize: limit });
            }
          }}
        />
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            value={inputValue}
            min={1}
            max={pageCount}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={commitPage}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitPage();
              }
            }}
          />
          <span className="text-sm text-muted-foreground whitespace-nowrap">/ {pageCount}</span>
        </div>
        <PaginationNext
          isActive={!isLastPage}
          aria-disabled={isLastPage}
          className={isLastPage ? "pointer-events-none opacity-50" : undefined}
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
