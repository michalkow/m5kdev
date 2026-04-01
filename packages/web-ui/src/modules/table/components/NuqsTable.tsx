import { Checkbox, Input, Popover, PopoverContent, PopoverTrigger } from "@heroui/react";
import type { QueryFilters } from "@m5kdev/commons/modules/schemas/query.schema";
import type { FilterMethods } from "@m5kdev/commons/modules/table/filter.types";
import type { TableParams } from "@m5kdev/frontend/modules/table/hooks/useNuqsTable";
import type { ColumnDef } from "@tanstack/react-table";
import {
  type ColumnOrderState,
  type ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getGroupedRowModel,
  getPaginationRowModel,
  type Table as ReactTable,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { ChevronDown, ChevronRight, ChevronUp, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { ColumnOrderAndVisibility } from "./ColumnOrderAndVisibility";
import { TableFiltering } from "./TableFiltering";
import { TableGroupBy } from "./TableGroupBy";
import { TablePagination } from "./TablePagination";
import type { ColumnDataType, ColumnItem } from "./table.types";

function getStorageKey(columnIds: string[]): string {
  const sortedIds = [...columnIds].sort().join(",");
  return `table-column-layout-${sortedIds}`;
}

function loadLayoutFromStorage(
  columnIds: string[]
): { order: string[]; visibility: Record<string, boolean> } | null {
  if (typeof window === "undefined") return null;
  try {
    const key = getStorageKey(columnIds);
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { order: string[]; visibility: Record<string, boolean> };
    return parsed;
  } catch {
    return null;
  }
}

function saveLayoutToStorage(
  columnIds: string[],
  order: string[],
  visibility: Record<string, boolean>
): void {
  if (typeof window === "undefined") return;
  try {
    const key = getStorageKey(columnIds);
    localStorage.setItem(key, JSON.stringify({ order, visibility }));
  } catch {
    // Ignore storage errors
  }
}

export type NuqsTableColumn<T> = ColumnDef<T> & {
  visible?: boolean;
  type?: ColumnDataType;
  options?: { label: string; value: string }[];
  endColumnId?: string;
  groupable?: boolean;
};

type NuqsTableParams<T> = {
  data: T[];
  total?: number;
  columns: NuqsTableColumn<T>[];
  tableProps: TableParams;
  /** When true, shows URL-synced global search; enable only if the list API applies `q` server-side. */
  showGlobalSearch?: boolean;
  singleFilter?: boolean;
  filterMethods?: Partial<FilterMethods>;
};

function applyOrder(prev: ColumnItem[], nextOrder: string[]): ColumnItem[] {
  const byId = new Map(prev.map((i) => [i.id, i]));
  const ordered = nextOrder.map((id) => byId.get(id)).filter(Boolean) as ColumnItem[];
  // append any newly added columns (if any appear later)
  for (const item of prev) if (!nextOrder.includes(item.id)) ordered.push(item);
  return ordered;
}

function applyVisibility(prev: ColumnItem[], visibility: VisibilityState): ColumnItem[] {
  return prev.map((column) => ({
    ...column,
    visibility: visibility[String(column.id)] ?? column.visibility,
  }));
}

export const NuqsTable = <T,>({
  data,
  total,
  columns,
  tableProps,
  showGlobalSearch = false,
  singleFilter = false,
  filterMethods,
}: NuqsTableParams<T>) => {
  const columnIds = useMemo(() => columns.map((col) => String(col.id)), [columns]);
  // const columnsWithId = useMemo(() => {
  //   const idColumn: NuqsTableColumn<T> = {
  //     id: "__row_id",
  //     accessorKey: "id",
  //     header: "",
  //     enableSorting: false,
  //     enableHiding: false,
  //     visible: false,
  //   };
  //   return [idColumn, ...columns];
  // }, [columns]);

  const initialLayout = useMemo(() => {
    const defaultLayout = columns.map((column) => ({
      id: String(column.id),
      label: column.header as string,
      visibility: column.visible !== undefined ? column.visible : true,
      options: column.options ?? [],
      type: column.type ?? undefined,
    }));

    const saved = loadLayoutFromStorage(columnIds);
    if (!saved) return defaultLayout;

    // Merge saved layout with default layout
    const savedById = new Map<string, { order: number; visibility: boolean }>();
    saved.order.forEach((id, index) => {
      savedById.set(id, { order: index, visibility: saved.visibility[id] ?? true });
    });

    const merged: ColumnItem[] = [];
    const processedIds = new Set<string>();

    // Add columns in saved order
    saved.order.forEach((id) => {
      const defaultCol = defaultLayout.find((col) => col.id === id);
      if (defaultCol) {
        merged.push({
          ...defaultCol,
          visibility: saved.visibility[id] ?? defaultCol.visibility,
        });
        processedIds.add(id);
      }
    });

    // Add any new columns that weren't in saved layout
    defaultLayout.forEach((col) => {
      if (!processedIds.has(col.id)) {
        merged.push(col);
      }
    });

    return merged;
  }, [columns, columnIds]);

  const [layout, setLayout] = useState<ColumnItem[]>(initialLayout);

  // Sync layout when columns change
  useEffect(() => {
    setLayout(initialLayout);
  }, [initialLayout]);

  // Save to localStorage whenever layout changes
  useEffect(() => {
    const order = layout.map((col) => col.id);
    const visibility = Object.fromEntries(layout.map((col) => [col.id, col.visibility]));
    saveLayoutToStorage(columnIds, order, visibility);
  }, [layout, columnIds]);

  const columnOrder = useMemo(() => layout.map((column) => column.id), [layout]);
  const columnVisibility = useMemo(
    () => Object.fromEntries(layout.map((column) => [column.id, column.visibility])),
    [layout]
  );

  const {
    limit = 10,
    page = 1,
    sorting,
    setSorting,
    setPagination,
    pagination,
    rowSelection,
    setRowSelection,
    setFilters,
    filters,
    grouping,
    setGrouping,
    q,
    setQ,
  } = tableProps;

  const skipFirstGlobalSearchPageReset = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset page when `q` changes (incl. back/forward)
  useEffect(() => {
    if (!showGlobalSearch) return;
    if (skipFirstGlobalSearchPageReset.current) {
      skipFirstGlobalSearchPageReset.current = false;
      return;
    }
    setPagination?.({ pageIndex: 0, pageSize: limit });
  }, [showGlobalSearch, q, limit, setPagination]);

  const isGrouped = grouping.length > 0;
  const [expanded, setExpanded] = useState<ExpandedState>({});

  // Redirect back if we're on an empty page (past the last page)
  useEffect(() => {
    if (!isGrouped && data.length === 0 && page > 1 && total !== undefined) {
      setPagination?.({ pageIndex: page - 2, pageSize: limit });
    }
  }, [data.length, page, limit, total, setPagination, isGrouped]);

  // When grouped, TanStack handles pagination client-side; otherwise use server total
  const serverPageCount =
    total !== undefined
      ? Math.ceil(total / limit) || 1
      : data.length === limit
        ? page + 1
        : Math.max(page, Math.ceil(data.length / limit));

  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => String((row as { id: string | number }).id),
    manualSorting: true,
    manualPagination: !isGrouped,
    state: { pagination, sorting, rowSelection, columnOrder, columnVisibility, grouping, expanded },
    ...(isGrouped ? {} : { pageCount: serverPageCount }),
    manualFiltering: true,
    enableGrouping: true,
    groupedColumnMode: false,
    autoResetExpanded: false,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    onGroupingChange: setGrouping,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onColumnOrderChange: (updater) => {
      setLayout((prev) =>
        applyOrder(prev, typeof updater === "function" ? updater(prev.map((i) => i.id)) : updater)
      );
    },
    onColumnVisibilityChange: (updater) => {
      setLayout((prev) =>
        applyVisibility(
          prev,
          typeof updater === "function"
            ? updater(Object.fromEntries(prev.map((i) => [i.id, i.visibility])))
            : updater
        )
      );
    },
  }) as ReactTable<T>;

  const onChangeOrder = (order: ColumnOrderState) => {
    setLayout((prev) => applyOrder(prev, order));
  };
  const onChangeVisibility = (visibility: VisibilityState) => {
    setLayout((prev) => applyVisibility(prev, visibility));
  };

  const onFiltersChange = (filters: QueryFilters) => {
    setFilters?.(filters);
  };

  const filterableColumns = useMemo(() => {
    const baseColumns = columns
      .filter((column) => Boolean(column.type))
      .map((column) => ({
        id: String(column.id),
        label: String(column.header),
        type: column.type,
        options: column.options ?? [],
        endColumnId: column.endColumnId,
        periodStartColumnId: null,
        periodEndColumnId: null,
      }));

    // Add Period pseudo-columns for date columns with endColumnId
    const periodColumns = columns
      .filter((column) => column.type === "date" && column.endColumnId)
      .map((column) => ({
        id: `${String(column.id)}__period`,
        label: "Period",
        type: "date" as ColumnDataType,
        options: [],
        endColumnId: null,
        periodStartColumnId: String(column.id),
        periodEndColumnId: column.endColumnId,
      }));

    return [...baseColumns, ...periodColumns];
  }, [columns]);

  const groupableColumns = useMemo(
    () =>
      columns
        .filter((col) => col.groupable)
        .map((col) => ({ id: String(col.id), label: String(col.header) })),
    [columns]
  );

  const hasGrouping = grouping.length > 0;

  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isColumnsOpen, setIsColumnsOpen] = useState(false);
  const [isGroupByOpen, setIsGroupByOpen] = useState(false);

  return (
    <>
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center">
          {showGlobalSearch ? (
            <Input
              size="sm"
              className="max-w-xs"
              placeholder="Search…"
              value={q ?? ""}
              onValueChange={(v) => {
                setQ(v === "" ? null : v);
              }}
              startContent={<Search className="h-4 w-4 shrink-0 text-default-400" aria-hidden />}
              aria-label="Search table"
            />
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Popover
            placement="bottom"
            isOpen={isFiltersOpen}
            onOpenChange={setIsFiltersOpen}
            portalContainer={document.body}
          >
            <PopoverTrigger>
              <Button variant="outline" size="sm">
                <div className="flex items-center gap-2">
                  Filters
                  <ChevronDown className="h-4 w-4" />
                </div>
              </Button>
            </PopoverTrigger>
            <PopoverContent>
              <TableFiltering
                columns={filterableColumns}
                onFiltersChange={onFiltersChange}
                filters={filters ?? []}
                onClose={() => setIsFiltersOpen(false)}
                singleFilter={singleFilter}
                filterMethods={filterMethods}
              />
            </PopoverContent>
          </Popover>
          {groupableColumns.length > 0 && (
            <Popover
              placement="bottom"
              isOpen={isGroupByOpen}
              onOpenChange={setIsGroupByOpen}
              portalContainer={document.body}
            >
              <PopoverTrigger>
                <Button variant={hasGrouping ? "secondary" : "outline"} size="sm">
                  <div className="flex items-center gap-2">
                    {hasGrouping
                      ? `Grouped by: ${grouping.map((id) => groupableColumns.find((c) => c.id === id)?.label ?? id).join(" → ")}`
                      : "Group by"}
                    <ChevronDown className="h-4 w-4" />
                  </div>
                </Button>
              </PopoverTrigger>
              <PopoverContent>
                <TableGroupBy
                  columns={groupableColumns}
                  activeGrouping={grouping}
                  onGroupingChange={(columnIds) => {
                    setGrouping(columnIds);
                    setExpanded({});
                    setPagination?.({ pageIndex: 0, pageSize: limit });
                  }}
                  onClose={() => setIsGroupByOpen(false)}
                />
              </PopoverContent>
            </Popover>
          )}
          <Popover
            placement="bottom"
            isOpen={isColumnsOpen}
            onOpenChange={setIsColumnsOpen}
            portalContainer={document.body}
          >
            <PopoverTrigger>
              <Button variant="outline" size="sm">
                <div className="flex items-center gap-2">
                  Columns
                  <ChevronDown className="h-4 w-4" />
                </div>
              </Button>
            </PopoverTrigger>
            <PopoverContent>
              <ColumnOrderAndVisibility
                layout={layout}
                onChangeOrder={onChangeOrder}
                onChangeVisibility={onChangeVisibility}
                onClose={() => setIsColumnsOpen(false)}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Checkbox
                isSelected={table.getIsAllRowsSelected()}
                onValueChange={(checked) => {
                  table.toggleAllRowsSelected(checked);
                }}
              />
            </TableHead>
            {table.getHeaderGroups()[0].headers.map((header) => (
              <TableHead
                onClick={
                  header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined
                }
                key={header.id}
              >
                {flexRender(header.column.columnDef.header, header.getContext())}
                {header.column.getCanSort() && (
                  <>
                    {header.column.getIsSorted() === "asc" && (
                      <ChevronUp className="h-4 w-4 inline ml-1" />
                    )}
                    {header.column.getIsSorted() === "desc" && (
                      <ChevronDown className="h-4 w-4 inline ml-1" />
                    )}
                  </>
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => {
            if (row.getIsGrouped()) {
              return (
                <TableRow
                  key={row.id}
                  className="bg-muted/40 font-medium cursor-pointer hover:bg-muted/60"
                  onClick={() => row.toggleExpanded()}
                >
                  <TableCell />
                  {row.getVisibleCells().map((cell) => {
                    if (cell.getIsGrouped()) {
                      return (
                        <TableCell key={cell.id}>
                          <span className="flex items-center gap-1.5">
                            {row.getIsExpanded() ? (
                              <ChevronDown className="h-4 w-4 shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0" />
                            )}
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            <span className="text-muted-foreground font-normal ml-1">
                              ({row.subRows.length})
                            </span>
                          </span>
                        </TableCell>
                      );
                    }
                    if (cell.getIsAggregated()) {
                      return (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.aggregatedCell ?? cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      );
                    }
                    return <TableCell key={cell.id} />;
                  })}
                </TableRow>
              );
            }

            return (
              <TableRow key={row.id}>
                <TableCell>
                  <Checkbox
                    isSelected={row.getIsSelected()}
                    onValueChange={(checked) => {
                      row.toggleSelected(checked);
                    }}
                  />
                </TableCell>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <TablePagination
        pageCount={
          isGrouped
            ? Math.ceil(table.getPrePaginationRowModel().rows.length / limit) || 1
            : serverPageCount
        }
        page={isGrouped ? table.getState().pagination.pageIndex + 1 : page}
        limit={limit}
        setPagination={setPagination}
      />
    </>
  );
};
