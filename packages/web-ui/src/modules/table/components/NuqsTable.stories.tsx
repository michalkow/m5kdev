import type { QueryFilters } from "@m5kdev/commons/modules/schemas/query.schema";
import type { TableParams } from "@m5kdev/frontend/modules/table/hooks/useNuqsTable";
import { Button } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/react";
import type {
  GroupingState,
  PaginationState,
  RowSelectionState,
  SortingState,
  Updater,
} from "@tanstack/react-table";
import { type ReactElement, useCallback, useState } from "react";

import { NuqsTable, type NuqsTableBulkActionsProps, type NuqsTableColumn } from "./NuqsTable";

interface PersonRow {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly status: "active" | "invited" | "disabled";
  readonly createdAt: string;
  readonly logins: number;
}

const DATA: PersonRow[] = [
  {
    id: "u_001",
    name: "Alex Morgan",
    email: "alex@example.com",
    status: "active",
    createdAt: "2026-03-22",
    logins: 42,
  },
  {
    id: "u_002",
    name: "Sam Rivera",
    email: "sam@example.com",
    status: "invited",
    createdAt: "2026-04-01",
    logins: 0,
  },
  {
    id: "u_003",
    name: "Taylor Chen",
    email: "taylor@example.com",
    status: "disabled",
    createdAt: "2026-01-18",
    logins: 5,
  },
  {
    id: "u_004",
    name: "Jordan Lee",
    email: "jordan@example.com",
    status: "active",
    createdAt: "2026-04-12",
    logins: 18,
  },
  {
    id: "u_005",
    name: "Casey Patel",
    email: "casey@example.com",
    status: "active",
    createdAt: "2025-12-05",
    logins: 71,
  },
];

const COLUMNS: NuqsTableColumn<PersonRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => row.original.name,
    enableSorting: true,
  },
  {
    id: "email",
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => row.original.email,
    enableSorting: true,
  },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => row.original.status,
    enableSorting: true,
    type: "enum",
    options: [
      { label: "Active", value: "active" },
      { label: "Invited", value: "invited" },
      { label: "Disabled", value: "disabled" },
    ],
    groupable: true,
  },
  {
    id: "createdAt",
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => row.original.createdAt,
    enableSorting: true,
    type: "date",
  },
  {
    id: "logins",
    accessorKey: "logins",
    header: "Logins",
    cell: ({ row }) => row.original.logins,
    enableSorting: true,
    type: "number",
  },
];

interface NuqsTableStoryProps {
  readonly showGlobalSearch?: boolean;
  readonly initialQ?: string | null;
  readonly initialGrouping?: GroupingState;
  readonly total?: number;
  /** When true, renders the table with no rows (empty state). */
  readonly empty?: boolean;
  readonly withBulkActions?: boolean;
}

function NuqsTableStory({
  showGlobalSearch = false,
  initialQ = null,
  initialGrouping = [],
  total,
  empty = false,
  withBulkActions = false,
}: NuqsTableStoryProps): ReactElement {
  const rows = empty ? ([] as PersonRow[]) : DATA;
  const resolvedTotal = empty ? 0 : (total ?? DATA.length);
  const [q, setQ] = useState<string | null>(initialQ);
  const [filters, setFilters] = useState<QueryFilters>([]);
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [rowSelection, setRowSelectionRaw] = useState<RowSelectionState>({});
  const [grouping, setGroupingRaw] = useState<GroupingState>(initialGrouping);

  const setRowSelection = useCallback((updater: Updater<RowSelectionState>) => {
    setRowSelectionRaw((prev) => (typeof updater === "function" ? updater(prev) : updater));
  }, []);

  const BulkActions = useCallback(
    ({ selectedRows, clearSelection }: NuqsTableBulkActionsProps<PersonRow>) => {
      if (selectedRows.length === 0) return null;
      return (
        <div className="flex items-center gap-2">
          <div className="text-sm text-muted-foreground">{selectedRows.length} selected</div>
          <Button size="sm" variant="secondary" onPress={clearSelection}>
            Clear
          </Button>
        </div>
      );
    },
    []
  );

  const setGrouping = useCallback((updater: Updater<GroupingState>) => {
    setGroupingRaw((prev) => (typeof updater === "function" ? updater(prev) : updater));
  }, []);

  const tableProps: TableParams = {
    q,
    setQ,
    filters,
    setFilters,
    sorting,
    setSorting,
    pagination,
    setPagination,
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    grouping,
    setGrouping,
    rowSelection,
    setRowSelection,
  };

  return (
    <div className="bg-background text-foreground">
      <div className="p-6">
        <NuqsTable<PersonRow>
          data={rows}
          total={resolvedTotal}
          columns={COLUMNS}
          tableProps={tableProps}
          BulkActions={withBulkActions ? BulkActions : undefined}
          showGlobalSearch={showGlobalSearch}
        />
      </div>
    </div>
  );
}

const meta = {
  title: "modules/table/NuqsTable",
  component: NuqsTableStory,
  tags: ["autodocs"],
} satisfies Meta<typeof NuqsTableStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithGlobalSearch: Story = {
  args: {
    showGlobalSearch: true,
    initialQ: "alex",
  },
};

export const WithBulkActions: Story = {
  args: {
    showGlobalSearch: true,
    withBulkActions: true,
  },
};

export const GroupedByStatus: Story = {
  args: {
    initialGrouping: ["status"],
  },
};

export const Empty: Story = {
  args: {
    empty: true,
  },
};
