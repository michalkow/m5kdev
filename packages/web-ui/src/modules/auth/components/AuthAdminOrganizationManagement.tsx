import { type Key, ListBox, Select, Spinner } from "@heroui/react";
import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import type { QueryFilters } from "@m5kdev/commons/modules/schemas/query.schema";
import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import useNuqsTable from "@m5kdev/frontend/modules/table/hooks/useNuqsTable";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import { useMemo, useState } from "react";
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

function formatOrgDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return dateObj.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function AuthAdminOrganizationManagement() {
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const queryClient = useQueryClient();

  const [pinnedOrganizationId] = useState<string | null>(null);

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

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-xl font-semibold">Organization Management</h2>
      </div>

      <NuqsTable<OrganizationAdminRow>
        data={rows}
        total={total}
        columns={columns}
        tableProps={tableParams}
        showGlobalSearch
        hideFilters
      />
    </div>
  );
}
