import type { Selection, SortDescriptor } from "@heroui/react";
import { Button, Checkbox, EmptyState, Popover, SearchField, Table } from "@heroui/react";
import type { QueryFilters } from "@m5kdev/commons/modules/schemas/query.schema";
import type { FilterMethods } from "@m5kdev/commons/modules/table/filter.types";
import type { TableParams } from "@m5kdev/frontend/modules/table/hooks/useNuqsTable";
import type { ColumnDef } from "@tanstack/react-table";
import {
  type ColumnOrderState,
  flexRender,
  getCoreRowModel,
  getGroupedRowModel,
  getPaginationRowModel,
  type Table as ReactTable,
  type RowSelectionState,
  type Row as TanStackRow,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { ChevronDown, ChevronRight, ChevronUp, DatabaseIcon } from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../../lib/utils";
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

export interface NuqsTableBulkActionsProps<T> {
  selectedRows: readonly T[];
  selectedRowIds: readonly string[];
  clearSelection: () => void;
  table: ReactTable<T>;
}

interface NuqsTableParams<T> {
  data: T[];
  total?: number;
  columns: NuqsTableColumn<T>[];
  tableProps: TableParams;
  BulkActions?: ComponentType<NuqsTableBulkActionsProps<T>>;
  /** When true, shows URL-synced global search; enable only if the list API applies `q` server-side. */
  showGlobalSearch?: boolean;
  singleFilter?: boolean;
  filterMethods?: Partial<FilterMethods>;
  hideHeader?: boolean;
  hideFooter?: boolean;
  hideColumns?: boolean;
  hideGroupBy?: boolean;
  hideFilters?: boolean;
}

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
  BulkActions,
  showGlobalSearch = false,
  singleFilter = false,
  filterMethods,
  hideHeader = false,
  hideFooter = false,
  hideColumns = false,
  hideGroupBy = false,
  hideFilters = false,
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
  const [expandedKeys, setExpandedKeys] = useState<Selection>(() => new Set());

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
    state: { pagination, sorting, rowSelection, columnOrder, columnVisibility, grouping },
    ...(isGrouped ? {} : { pageCount: serverPageCount }),
    manualFiltering: true,
    enableGrouping: true,
    groupedColumnMode: false,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    onGroupingChange: setGrouping,
    getCoreRowModel: getCoreRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
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

  const isRowSelectionEnabled = Boolean(BulkActions);

  const visibleLeafColumnsRaw = useMemo(() => table.getVisibleLeafColumns(), [table]);

  const visibleLeafColumns = useMemo(() => {
    if (!isGrouped || grouping.length === 0) return visibleLeafColumnsRaw;
    const groupedId = grouping[0];
    const grouped = visibleLeafColumnsRaw.filter((col) => col.id === groupedId);
    const rest = visibleLeafColumnsRaw.filter((col) => col.id !== groupedId);
    return [...grouped, ...rest];
  }, [visibleLeafColumnsRaw, isGrouped, grouping]);

  const leafHeadersById = useMemo(() => {
    const groups = table.getHeaderGroups();
    const leaf = groups[groups.length - 1];
    const entries = (leaf?.headers ?? []).map((h) => [String(h.column.id), h] as const);
    return new Map(entries);
  }, [table]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: TanStack `useReactTable` keeps one instance; row model updates require data/grouping/sorting, not `[table]` identity
  const allRows = useMemo(() => {
    const flatten = (rows: readonly TanStackRow<T>[]): TanStackRow<T>[] => {
      const out: TanStackRow<T>[] = [];
      for (const row of rows) {
        out.push(row);
        if (row.subRows.length > 0) out.push(...flatten(row.subRows));
      }
      return out;
    };

    return flatten(table.getPrePaginationRowModel().rows);
  }, [table, data, grouping, sorting]);

  const selectableRowIds = useMemo(() => {
    return allRows.filter((row) => !row.getIsGrouped()).map((row) => row.id);
  }, [allRows]);

  const selectedKeys = useMemo<Selection>(() => {
    if (!isRowSelectionEnabled) return new Set();
    const state = rowSelection ?? {};
    const allowed = new Set(selectableRowIds);
    const keys = Object.entries(state)
      .filter(([, isSelected]) => Boolean(isSelected))
      .map(([rowId]) => rowId);
    return new Set(keys.filter((id) => allowed.has(id)));
  }, [rowSelection, selectableRowIds, isRowSelectionEnabled]);

  const selectedRowIds = useMemo(() => {
    if (!isRowSelectionEnabled) return [];
    if (selectedKeys === "all") return selectableRowIds;
    return Array.from(selectedKeys).map((id) => String(id));
  }, [selectedKeys, selectableRowIds, isRowSelectionEnabled]);

  const selectedRows = useMemo(() => {
    if (!isRowSelectionEnabled) return [];
    const selectedIdSet = new Set(selectedRowIds);
    return allRows
      .filter((row) => !row.getIsGrouped() && selectedIdSet.has(row.id))
      .map((row) => row.original);
  }, [allRows, selectedRowIds, isRowSelectionEnabled]);

  const treeColumnId = useMemo(() => {
    if (isGrouped && grouping.length > 0) return grouping[0];
    const first = table.getVisibleLeafColumns()[0] ?? table.getAllLeafColumns()[0];
    return first?.id ? String(first.id) : undefined;
  }, [table, isGrouped, grouping]);

  const toggleExpanded = (rowId: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(
        prev === "all"
          ? table.getPaginationRowModel().rows.map((r) => r.id)
          : (prev as Iterable<string>)
      );
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const renderGroupHeaderRow = (groupRow: TanStackRow<T>) => {
    const isExpanded = expandedKeys === "all" || (expandedKeys as Set<string>).has(groupRow.id);
    const expandedCellClass = isExpanded ? "bg-accent-soft" : undefined;

    return (
      <Table.Row
        key={groupRow.id}
        id={groupRow.id}
        textValue={String(groupRow.groupingValue ?? groupRow.id)}
        className="font-medium"
      >
        {isRowSelectionEnabled ? <Table.Cell className={cn("pr-0", expandedCellClass)} /> : null}
        {visibleLeafColumns.map((column) => {
          const cell = groupRow.getAllCells().find((c) => c.column.id === column.id);
          const isTreeCell = String(column.id) === treeColumnId;

          if (!cell)
            return (
              <Table.Cell key={`${groupRow.id}__${column.id}`} className={expandedCellClass} />
            );

          const cellContent = cell.getIsGrouped()
            ? flexRender(cell.column.columnDef.cell, cell.getContext())
            : cell.getIsAggregated()
              ? flexRender(
                  cell.column.columnDef.aggregatedCell ?? cell.column.columnDef.cell,
                  cell.getContext()
                )
              : cell.getIsPlaceholder()
                ? null
                : flexRender(cell.column.columnDef.cell, cell.getContext());

          if (!isTreeCell)
            return (
              <Table.Cell key={cell.id} className={expandedCellClass}>
                {cellContent}
              </Table.Cell>
            );

          return (
            <Table.Cell
              key={cell.id}
              textValue={String(cell.getValue() ?? "")}
              className={expandedCellClass}
            >
              <span className="flex items-center gap-1.5">
                <Button
                  isIconOnly
                  aria-label="Toggle group"
                  size="sm"
                  variant="ghost"
                  onPress={() => toggleExpanded(groupRow.id)}
                >
                  <ChevronRight
                    aria-hidden="true"
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted transition-transform duration-150",
                      isExpanded && "rotate-90"
                    )}
                  />
                </Button>
                {cellContent}
                <span className="text-muted-foreground font-normal ml-1">
                  ({groupRow.subRows.length})
                </span>
              </span>
            </Table.Cell>
          );
        })}
      </Table.Row>
    );
  };

  const renderLeafRow = (row: TanStackRow<T>) => (
    <Table.Row key={row.id} id={row.id}>
      {isRowSelectionEnabled ? (
        <Table.Cell className="pr-0">
          <Checkbox aria-label="Select row" slot="selection" variant="secondary">
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
          </Checkbox>
        </Table.Cell>
      ) : null}
      {visibleLeafColumns.map((column) => {
        const cell = row.getVisibleCells().find((c) => c.column.id === column.id);
        if (!cell) return <Table.Cell key={`${row.id}__${column.id}`} />;
        return (
          <Table.Cell key={cell.id}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </Table.Cell>
        );
      })}
    </Table.Row>
  );

  const clearSelection = () => {
    setRowSelection?.({});
  };

  const onSelectionChange = (keys: Selection) => {
    if (!isRowSelectionEnabled) return;
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
      {!hideHeader ? (
        <div className="flex w-full flex-wrap items-center gap-2 mb-2">
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
          <div className="flex min-w-0 flex-1 items-center justify-center">
            {BulkActions ? (
              <BulkActions
                selectedRows={selectedRows}
                selectedRowIds={selectedRowIds}
                clearSelection={clearSelection}
                table={table}
              />
            ) : null}
          </div>
          <div className="flex flex-1 items-center justify-end gap-2">
            {!hideFilters ? (
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
            ) : null}
            {!hideGroupBy && groupableColumns.length > 0 ? (
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
                        setExpandedKeys(new Set());
                        setPagination?.({ pageIndex: 0, pageSize: limit });
                      }}
                      onClose={() => setIsGroupByOpen(false)}
                    />
                  </Popover.Dialog>
                </Popover.Content>
              </Popover>
            ) : null}
            {!hideColumns ? (
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
            ) : null}
          </div>
        </div>
      ) : null}
      <Table variant="primary">
        <Table.ScrollContainer>
          <Table.Content
            aria-label="Table"
            className="min-w-[600px]"
            sortDescriptor={sortDescriptor}
            onSortChange={(descriptor) => {
              setSorting?.(sortDescriptorToSorting(descriptor));
            }}
            selectionMode={isRowSelectionEnabled ? "multiple" : undefined}
            selectedKeys={isRowSelectionEnabled ? selectedKeys : undefined}
            onSelectionChange={isRowSelectionEnabled ? onSelectionChange : undefined}
          >
            <Table.Header>
              {isRowSelectionEnabled ? (
                <Table.Column className="pr-0">
                  <Checkbox aria-label="Select all" slot="selection">
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                  </Checkbox>
                </Table.Column>
              ) : null}
              {visibleLeafColumns.map((column, index) => {
                const header = leafHeadersById.get(String(column.id));
                return (
                  <Table.Column
                    key={String(column.id)}
                    id={String(column.id)}
                    allowsSorting={column.getCanSort()}
                    isRowHeader={index === 0}
                  >
                    {({ sortDirection }) => (
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          {header && !header.isPlaceholder
                            ? flexRender(header.column.columnDef.header, header.getContext())
                            : flexRender(column.columnDef.header, {
                                column,
                                table,
                                header: header as never,
                              })}
                        </span>
                        {sortDirection === "ascending" ? (
                          <ChevronUp className="h-4 w-4 shrink-0" />
                        ) : sortDirection === "descending" ? (
                          <ChevronDown className="h-4 w-4 shrink-0" />
                        ) : null}
                      </span>
                    )}
                  </Table.Column>
                );
              })}
            </Table.Header>
            {isGrouped ? (
              <Table.Body
                renderEmptyState={() => (
                  <EmptyState className="flex h-full w-full flex-col items-center justify-center gap-4 text-center py-10">
                    <DatabaseIcon className="size-6 text-muted" />
                    <span className="text-sm text-muted">{t("web-ui:table.noResults")}</span>
                  </EmptyState>
                )}
              >
                {table.getPaginationRowModel().rows.flatMap((groupRow) => {
                  const isExpanded =
                    expandedKeys === "all" || (expandedKeys as Set<string>).has(groupRow.id);

                  if (!isExpanded) return [renderGroupHeaderRow(groupRow)];

                  return [renderGroupHeaderRow(groupRow), ...groupRow.subRows.map(renderLeafRow)];
                })}
              </Table.Body>
            ) : (
              <Table.Body
                renderEmptyState={() => (
                  <EmptyState className="flex h-full w-full flex-col items-center justify-center gap-4 text-center py-10">
                    <DatabaseIcon className="size-6 text-muted" />
                    <span className="text-sm text-muted">{t("web-ui:table.noResults")}</span>
                  </EmptyState>
                )}
              >
                {table.getRowModel().rows.map(renderLeafRow)}
              </Table.Body>
            )}
          </Table.Content>
        </Table.ScrollContainer>
        {!hideFooter ? (
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
        ) : null}
      </Table>
    </>
  );
};
