import { Button, Input, type Key, Label, ListBox, Select, Spinner, Tooltip } from "@heroui/react";
import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import type { QueryFilter, QueryFilters } from "@m5kdev/commons/modules/schemas/query.schema";
import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import useNuqsTable from "@m5kdev/frontend/modules/table/hooks/useNuqsTable";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { Info, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";

import { NuqsTable, type NuqsTableColumn } from "../../table/components/NuqsTable";

type OrganizationType = "solo" | "organization" | "agency" | "enterprise";

type OrganizationAdminRow =
  inferRouterOutputs<BackendTRPCRouter>["auth"]["listAdminOrganizations"]["rows"][number];

type ListAdminOrganizationsInput =
  inferRouterInputs<BackendTRPCRouter>["auth"]["listAdminOrganizations"];

type ListAdminOrganizationsOutput =
  inferRouterOutputs<BackendTRPCRouter>["auth"]["listAdminOrganizations"];

const organizationTypeOptions: { value: OrganizationType; label: string; description: string }[] = [
  { value: "solo", label: "Solo", description: "Individual account without org hierarchy." },
  { value: "organization", label: "Organization", description: "Standard organization." },
  { value: "agency", label: "Agency", description: "Can manage child organizations (agents)." },
  {
    value: "enterprise",
    label: "Enterprise",
    description: "Can manage child organizations (owners).",
  },
];

const lookupTypeFilter: QueryFilter = {
  columnId: "type",
  type: "enum",
  method: "equals",
  value: "organization",
};

function formatOrgDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return dateObj.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function AdminOrganizationManagement() {
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const queryClient = useQueryClient();
  const lookupSearchFieldId = useId();

  const [lookupSearchDraft, setLookupSearchDraft] = useState("");
  const [debouncedLookupSearch, setDebouncedLookupSearch] = useState("");

  const [pinnedOrganizationId, setPinnedOrganizationId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedLookupSearch(lookupSearchDraft), 200);
    return () => window.clearTimeout(t);
  }, [lookupSearchDraft]);

  const additionalFilters = useMemo((): QueryFilters | undefined => {
    if (!pinnedOrganizationId) return undefined;
    return [
      {
        columnId: "id",
        type: "string",
        method: "equals",
        value: pinnedOrganizationId,
      },
    ];
  }, [pinnedOrganizationId]);

  const { params: tableParams, query: orgListQuery } = useNuqsTable<
    ListAdminOrganizationsInput,
    ListAdminOrganizationsOutput
  >({
    getQueryOptions: (input) => trpc.auth.listAdminOrganizations.queryOptions(input),
    additionalFilters,
    prefix: "om",
  });

  const lookupQueryInput = useMemo(() => {
    const qTrim = debouncedLookupSearch.trim();
    return {
      page: 1,
      limit: 40,
      ...(qTrim ? { q: qTrim } : {}),
      filters: [lookupTypeFilter],
    };
  }, [debouncedLookupSearch]);

  const lookupQuery = useQuery(trpc.auth.listAdminOrganizations.queryOptions(lookupQueryInput));

  const lookupRows = lookupQuery.data?.rows ?? [];

  const invalidateOrgLists = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: trpc.auth.listAdminOrganizations.queryKey() });
  };

  const { mutate: updateType, isPending: isUpdatingType } = useMutation(
    trpc.auth.updateAdminOrganizationType.mutationOptions({
      onSuccess: async (updated) => {
        toast.success(`Updated organization type to "${updated.type ?? "organization"}"`);
        await invalidateOrgLists();
      },
      onError: (error: unknown) => {
        toast.error(
          `Failed to update organization type: ${error instanceof Error ? error.message : String(error)}`
        );
      },
    })
  );

  const columns: NuqsTableColumn<OrganizationAdminRow>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      enableSorting: true,
    },
    {
      id: "slug",
      accessorKey: "slug",
      header: "Slug",
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.slug ?? "—"}</span>,
      enableSorting: true,
    },
    {
      id: "parentId",
      accessorKey: "parentId",
      header: "Parent",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.parentId ?? "—"}</span>
      ),
      enableSorting: false,
    },
    {
      id: "createdAt",
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{formatOrgDate(row.original.createdAt)}</span>
      ),
      enableSorting: true,
      type: "date",
    },
    {
      id: "type",
      header: () => <span className="text-right block">Type</span>,
      cell: ({ row }) => {
        const org = row.original;
        return (
          <div className="flex justify-end">
            <Select
              aria-label={`Organization type for ${org.name}`}
              selectedKey={(org.type ?? "organization") as Key}
              onSelectionChange={(key) => {
                const nextType = String(key) as OrganizationType;
                if (nextType === (org.type ?? "organization")) return;
                updateType({ organizationId: org.id, type: nextType });
              }}
              isDisabled={isUpdatingType}
              variant="secondary"
              className="min-w-[210px] inline-flex"
            >
              <Select.Trigger className="h-8 min-h-8 px-3 text-sm">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover placement="bottom end">
                <ListBox>
                  {organizationTypeOptions.map((opt) => (
                    <ListBox.Item key={opt.value} id={opt.value} textValue={opt.label}>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{opt.description}</span>
                      </div>
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          </div>
        );
      },
      enableSorting: true,
      type: "enum",
      options: organizationTypeOptions.map((o) => ({ label: o.label, value: o.value })),
    },
  ];

  if (orgListQuery.isPending && !orgListQuery.data) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  const rows = orgListQuery.data?.rows ?? [];
  const total = orgListQuery.data?.total ?? 0;

  const pinnedHeading =
    pinnedOrganizationId !== null ? (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
        <span className="text-muted-foreground">Focused organization</span>
        <span className="font-medium">
          {rows.length === 1 ? (rows[0]?.name ?? pinnedOrganizationId) : pinnedOrganizationId}
        </span>
        <Button variant="ghost" size="sm" onPress={() => setPinnedOrganizationId(null)}>
          <X className="h-4 w-4" />
          Clear focus
        </Button>
      </div>
    ) : null;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Organization Management</h2>
          <p className="text-sm text-muted-foreground">
            Paginated listing and inline type edits. Lookup uses the same admin list query scoped to
            type <span className="font-medium text-foreground">organization</span> for quick picks.
          </p>
        </div>
        <Tooltip>
          <Tooltip.Trigger>
            <Button variant="ghost" size="sm" isIconOnly aria-label="Info">
              <Info className="h-4 w-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            Changing type updates organizations.type. Selecting a lookup result focuses the
            paginated table on that organization using the shared list endpoint.
          </Tooltip.Content>
        </Tooltip>
      </div>

      <div className="space-y-2">
        <Label htmlFor={lookupSearchFieldId}>Organization lookup</Label>
        <p className="text-xs text-muted-foreground">
          Search organizations of standard type; picking one focuses the table (same{" "}
          <code className="text-xs">listAdminOrganizations</code> procedure with filters).
        </p>
        <Input
          id={lookupSearchFieldId}
          aria-label="Lookup organizations"
          placeholder="Type to search name or slug…"
          variant="secondary"
          value={lookupSearchDraft}
          onChange={(e) => setLookupSearchDraft(e.target.value)}
        />
        <div className="border rounded-lg max-h-48 overflow-y-auto">
          {lookupQuery.isLoading ? (
            <div className="flex justify-center p-4">
              <Spinner />
            </div>
          ) : lookupRows.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              No organizations match this lookup query
            </div>
          ) : (
            <ul className="divide-y divide-border p-1" aria-label="Organization lookup results">
              {lookupRows.map((org: OrganizationAdminRow) => (
                <li key={org.id}>
                  <Button
                    variant="ghost"
                    className="h-auto w-full justify-start px-3 py-2 text-left whitespace-normal rounded-md"
                    onPress={() => {
                      setPinnedOrganizationId(org.id);
                      setLookupSearchDraft("");
                    }}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">{org.name}</span>
                      {org.slug ? (
                        <span className="text-xs text-muted-foreground">{org.slug}</span>
                      ) : null}
                    </div>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {pinnedHeading}

      {orgListQuery.isError ? (
        <div className="rounded-lg border p-4 text-sm text-danger">
          {orgListQuery.error instanceof Error
            ? orgListQuery.error.message
            : String(orgListQuery.error)}
        </div>
      ) : null}

      <div className="border rounded-lg overflow-hidden">
        <NuqsTable<OrganizationAdminRow>
          data={rows}
          total={total}
          columns={columns}
          tableProps={tableParams}
          showGlobalSearch
          hideFilters
        />
      </div>
    </div>
  );
}
