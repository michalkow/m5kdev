import type { Selection, SortDescriptor } from "@heroui/react";
import { Button, Checkbox, EmptyState, Popover, SearchField, Table } from "@heroui/react";
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
  type RowSelectionState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { ChevronDown, ChevronRight, ChevronUp, DatabaseIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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

function sortingToSortDescriptor(
  sorting: { id: string; desc: boolean }[]
): SortDescriptor | undefined {
  const first = sorting[0];
  if (!first) return undefined;
  return {
    column: first.id,
    direction: first.desc ? "descending" : "ascending",
  };
}

function sortDescriptorToSorting(descriptor: SortDescriptor): { id: string; desc: boolean }[] {
  return [
    {
      id: String(descriptor.column),
      desc: descriptor.direction === "descending",
    },
  ];
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
  const { t } = useTranslation();
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
    for (const [index, id] of saved.order.entries()) {
      savedById.set(id, { order: index, visibility: saved.visibility[id] ?? true });
    }

    const merged: ColumnItem[] = [];
    const processedIds = new Set<string>();

    // Add columns in saved order
    for (const id of saved.order) {
      const defaultCol = defaultLayout.find((col) => col.id === id);
      if (defaultCol) {
        merged.push({
          ...defaultCol,
          visibility: saved.visibility[id] ?? defaultCol.visibility,
        });
        processedIds.add(id);
      }
    }

    // Add any new columns that weren't in saved layout
    for (const col of defaultLayout) {
      if (!processedIds.has(col.id)) {
        merged.push(col);
      }
    }

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

  const sortDescriptor = useMemo(() => sortingToSortDescriptor(sorting ?? []), [sorting]);

  const selectableRowIds = useMemo(() => {
    return table
      .getRowModel()
      .rows.filter((row) => !row.getIsGrouped())
      .map((row) => row.id);
  }, [table]);

  const selectedKeys = useMemo<Selection>(() => {
    const state = rowSelection ?? {};
    const allowed = new Set(selectableRowIds);
    const keys = Object.entries(state)
      .filter(([, isSelected]) => Boolean(isSelected))
      .map(([rowId]) => rowId);
    return new Set(keys.filter((id) => allowed.has(id)));
  }, [rowSelection, selectableRowIds]);

  const onSelectionChange = (keys: Selection) => {
    if (!setRowSelection) return;

    const next: RowSelectionState = {};
    const allowed = new Set(selectableRowIds);

    if (keys === "all") {
      for (const id of selectableRowIds) next[id] = true;
      setRowSelection(next);
      return;
    }

    for (const id of keys) {
      const rowId = String(id);
      if (!allowed.has(rowId)) continue;
      next[rowId] = true;
    }
    setRowSelection(next);
  };

  return (
    <>
      <div className="flex w-full flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex min-w-0 flex-1 items-center">
          {showGlobalSearch ? (
            <SearchField name="search" variant="secondary">
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input
                  className="w-[280px]"
                  placeholder={t("web-ui:search.placeholder")}
                  onChange={(e) => {
                    const v = e.target.value;
                    setQ?.(v === "" ? null : v);
                  }}
                />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Popover isOpen={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
            <Popover.Trigger>
              <Button variant="tertiary" size="sm">
                <div className="flex items-center gap-2">
                  Filters
                  <ChevronDown className="h-4 w-4" />
                </div>
              </Button>
            </Popover.Trigger>
            <Popover.Content placement="bottom">
              <Popover.Dialog>
                <TableFiltering
                  columns={filterableColumns}
                  onFiltersChange={onFiltersChange}
                  filters={filters ?? []}
                  onClose={() => setIsFiltersOpen(false)}
                  singleFilter={singleFilter}
                  filterMethods={filterMethods}
                />
              </Popover.Dialog>
            </Popover.Content>
          </Popover>
          {groupableColumns.length > 0 && (
            <Popover isOpen={isGroupByOpen} onOpenChange={setIsGroupByOpen}>
              <Popover.Trigger>
                <Button variant={hasGrouping ? "secondary" : "tertiary"} size="sm">
                  <div className="flex items-center gap-2">
                    {hasGrouping
                      ? `Grouped by: ${grouping.map((id) => groupableColumns.find((c) => c.id === id)?.label ?? id).join(" → ")}`
                      : "Group by"}
                    <ChevronDown className="h-4 w-4" />
                  </div>
                </Button>
              </Popover.Trigger>
              <Popover.Content placement="bottom">
                <Popover.Dialog>
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
                </Popover.Dialog>
              </Popover.Content>
            </Popover>
          )}
          <Popover isOpen={isColumnsOpen} onOpenChange={setIsColumnsOpen}>
            <Popover.Trigger>
              <Button variant="tertiary" size="sm">
                <div className="flex items-center gap-2">
                  Columns
                  <ChevronDown className="h-4 w-4" />
                </div>
              </Button>
            </Popover.Trigger>
            <Popover.Content placement="bottom">
              <Popover.Dialog>
                <ColumnOrderAndVisibility
                  layout={layout}
                  onChangeOrder={onChangeOrder}
                  onChangeVisibility={onChangeVisibility}
                  onClose={() => setIsColumnsOpen(false)}
                />
              </Popover.Dialog>
            </Popover.Content>
          </Popover>
        </div>
      </div>
      <Table variant="primary">
        <Table.ScrollContainer>
          <Table.Content
            aria-label="Table"
            className="min-w-[600px]"
            sortDescriptor={sortDescriptor}
            onSortChange={(descriptor) => {
              setSorting?.(sortDescriptorToSorting(descriptor));
            }}
            selectionMode="multiple"
            selectedKeys={selectedKeys}
            onSelectionChange={onSelectionChange}
          >
            <Table.Header>
              <Table.Column className="pr-0">
                <Checkbox aria-label="Select all" slot="selection">
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                </Checkbox>
              </Table.Column>
              {table.getHeaderGroups()[0]?.headers.map((header) => (
                <Table.Column
                  key={header.id}
                  id={header.column.id}
                  allowsSorting={header.column.getCanSort()}
                  isRowHeader={false}
                >
                  {({ sortDirection }) => (
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </span>
                      {sortDirection === "ascending" ? (
                        <ChevronUp className="h-4 w-4 shrink-0" />
                      ) : sortDirection === "descending" ? (
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      ) : null}
                    </span>
                  )}
                </Table.Column>
              ))}
            </Table.Header>
            <Table.Body
              renderEmptyState={() => (
                <EmptyState className="flex h-full w-full flex-col items-center justify-center gap-4 text-center py-10">
                  <DatabaseIcon className="size-6 text-muted" />
                  <span className="text-sm text-muted">{t("web-ui:table.noResults")}</span>
                </EmptyState>
              )}
            >
              {table.getRowModel().rows.map((row) => {
                if (row.getIsGrouped()) {
                  return (
                    <Table.Row
                      key={row.id}
                      id={row.id}
                      className="bg-muted/40 font-medium cursor-pointer hover:bg-muted/60"
                      onPress={() => row.toggleExpanded()}
                    >
                      <Table.Cell className="pr-0" />
                      {row.getVisibleCells().map((cell) => {
                        if (cell.getIsGrouped()) {
                          return (
                            <Table.Cell key={cell.id}>
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
                            </Table.Cell>
                          );
                        }
                        if (cell.getIsAggregated()) {
                          return (
                            <Table.Cell key={cell.id}>
                              {flexRender(
                                cell.column.columnDef.aggregatedCell ?? cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </Table.Cell>
                          );
                        }
                        return <Table.Cell key={cell.id} />;
                      })}
                    </Table.Row>
                  );
                }

                return (
                  <Table.Row key={row.id} id={row.id}>
                    <Table.Cell className="pr-0">
                      <Checkbox aria-label="Select row" slot="selection" variant="secondary">
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                      </Checkbox>
                    </Table.Cell>
                    {row.getVisibleCells().map((cell) => (
                      <Table.Cell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </Table.Cell>
                    ))}
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
        <Table.Footer>
          <TablePagination
            pageCount={
              isGrouped
                ? Math.ceil(table.getPrePaginationRowModel().rows.length / limit) || 1
                : serverPageCount
            }
            page={isGrouped ? table.getState().pagination.pageIndex + 1 : page}
            limit={limit}
            setPagination={setPagination}
            total={isGrouped ? undefined : total}
          />
        </Table.Footer>
      </Table>
    </>
  );
};
