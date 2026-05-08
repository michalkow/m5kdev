import {
  Autocomplete,
  Button,
  EmptyState,
  Input,
  type Key,
  Label,
  ListBox,
  Modal,
  SearchField,
  Select,
  Spinner,
  TextField,
} from "@heroui/react";
import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import type { QueryFilters } from "@m5kdev/commons/modules/schemas/query.schema";
import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import useNuqsTable from "@m5kdev/frontend/modules/table/hooks/useNuqsTable";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { Pencil } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [editingOrg, setEditingOrg] = useState<OrganizationAdminRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editType, setEditType] = useState<Key>("organization");
  const [editParentId, setEditParentId] = useState<Key | null>(null);
  const [parentSearch, setParentSearch] = useState("");
  const [debouncedParentSearch, setDebouncedParentSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedParentSearch(parentSearch), 300);
    return () => clearTimeout(timer);
  }, [parentSearch]);

  const parentSearchQuery = useQuery({
    ...trpc.auth.listAdminOrganizations.queryOptions({
      q: debouncedParentSearch || undefined,
      limit: 10,
    }),
    enabled: !!editingOrg,
  });

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

  const { mutate: updateOrg, isPending: isUpdating } = useMutation(
    trpc.auth.updateAdminOrganization.mutationOptions({
      onSuccess: async () => {
        toast.success("Organization updated successfully");
        setEditingOrg(null);
        await invalidateOrgLists();
      },
      onError: (error: unknown) => {
        toast.error(
          `Failed to update organization: ${error instanceof Error ? error.message : String(error)}`
        );
      },
    })
  );

  const openEditModal = useCallback((org: OrganizationAdminRow) => {
    setEditingOrg(org);
    setEditName(org.name);
    setEditSlug(org.slug ?? "");
    setEditType((org.type ?? "organization") as OrganizationType);
    setEditParentId(org.parentId ?? null);
    setParentSearch("");
    setDebouncedParentSearch("");
  }, []);

  const handleSave = (): void => {
    if (!editingOrg) return;
    updateOrg({
      id: editingOrg.id,
      name: editName || undefined,
      slug: editSlug || undefined,
      type: String(editType) as OrganizationType,
      parentId: editParentId ? String(editParentId) : null,
    });
  };

  const rows = orgListQuery.data?.rows ?? [];
  const total = orgListQuery.data?.total ?? 0;

  const parentOrgItems = useMemo(() => {
    const results = parentSearchQuery.data?.rows ?? [];
    const filtered = results.filter((r) => r.id !== editingOrg?.id);

    if (editParentId && !filtered.find((r) => r.id === String(editParentId))) {
      const parentFromTable = rows.find((r) => r.id === String(editParentId));
      if (parentFromTable) {
        return [parentFromTable, ...filtered];
      }
    }

    return filtered;
  }, [parentSearchQuery.data, editingOrg?.id, editParentId, rows]);

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
      id: "actions",
      header: () => <span className="block text-right">Actions</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            onPress={() => openEditModal(row.original)}
            aria-label={`Edit ${row.original.name}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      ),
      enableSorting: false,
    },
  ];

  if (orgListQuery.isPending && !orgListQuery.data) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

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

      <Modal
        isOpen={!!editingOrg}
        onOpenChange={(open) => {
          if (!open) setEditingOrg(null);
        }}
      >
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-md">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>Edit Organization</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="space-y-4">
                <TextField value={editName} onChange={setEditName} variant="secondary">
                  <Label>Name</Label>
                  <Input placeholder="Organization name" />
                </TextField>

                <TextField value={editSlug} onChange={setEditSlug} variant="secondary">
                  <Label>Slug</Label>
                  <Input placeholder="organization-slug" />
                </TextField>

                <Select
                  aria-label="Organization type"
                  selectedKey={editType}
                  onSelectionChange={(key) => {
                    if (key !== null) setEditType(key);
                  }}
                  variant="secondary"
                  className="w-full"
                >
                  <Label>Type</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
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

                <Autocomplete
                  variant="secondary"
                  allowsEmptyCollection
                  className="w-full"
                  placeholder="Select parent organization"
                  selectionMode="single"
                  value={editParentId}
                  onChange={(key) => setEditParentId(key as Key | null)}
                >
                  <Label>Parent Organization</Label>
                  <Autocomplete.Trigger>
                    <Autocomplete.Value />
                    <Autocomplete.ClearButton />
                    <Autocomplete.Indicator />
                  </Autocomplete.Trigger>
                  <Autocomplete.Popover>
                    <Autocomplete.Filter filter={() => true}>
                      <SearchField
                        autoFocus
                        name="parentSearch"
                        variant="secondary"
                        onChange={setParentSearch}
                      >
                        <SearchField.Group>
                          <SearchField.SearchIcon />
                          <SearchField.Input placeholder="Search organizations..." />
                          <SearchField.ClearButton />
                        </SearchField.Group>
                      </SearchField>
                      <ListBox
                        renderEmptyState={() => (
                          <EmptyState>
                            {parentSearchQuery.isPending
                              ? "Searching..."
                              : "No organizations found"}
                          </EmptyState>
                        )}
                      >
                        {parentOrgItems.map((org) => (
                          <ListBox.Item key={org.id} id={org.id} textValue={org.name}>
                            <div className="flex flex-col">
                              <span className="text-sm">{org.name}</span>
                              {org.slug && (
                                <span className="text-xs text-muted-foreground">{org.slug}</span>
                              )}
                            </div>
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Autocomplete.Filter>
                  </Autocomplete.Popover>
                </Autocomplete>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" slot="close">
                  Cancel
                </Button>
                <Button onPress={handleSave} isDisabled={isUpdating || !editName}>
                  {isUpdating ? <Spinner className="mr-2 h-4 w-4" /> : null}
                  Save
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
