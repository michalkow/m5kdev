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
  Table,
  TextField,
} from "@heroui/react";
import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import type { QueryFilters } from "@m5kdev/commons/modules/schemas/query.schema";
import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";
import { useAppRoles } from "@m5kdev/frontend/modules/app/hooks/useAppRoles";
import { useRoleLabel } from "@m5kdev/frontend/modules/app/hooks/useRoleLabel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { Pencil, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { NuqsTable, type NuqsTableColumn } from "../../table/components/NuqsTable";
import useNuqsTable from "../../table/hooks/useNuqsTable";
import { AuthLocaleSelect } from "./AuthLocaleSelect";

type OrganizationType = "solo" | "organization" | "agency" | "enterprise";

type OrganizationAdminRow =
  inferRouterOutputs<BackendTRPCRouter>["auth"]["listAdminOrganizations"]["rows"][number];
type AdminOrganizationMember =
  inferRouterOutputs<BackendTRPCRouter>["auth"]["listAdminOrganizationMembers"]["members"][number];

type ListAdminOrganizationsInput =
  inferRouterInputs<BackendTRPCRouter>["auth"]["listAdminOrganizations"];

type AddAdminOrganizationMemberInput =
  inferRouterInputs<BackendTRPCRouter>["auth"]["addAdminOrganizationMember"];

type UpdateAdminOrganizationMemberRoleInput =
  inferRouterInputs<BackendTRPCRouter>["auth"]["updateAdminOrganizationMemberRole"];

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

function slugifyOrganizationName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function AuthAdminOrganizationManagement() {
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const queryClient = useQueryClient();
  const { locales } = useAppConfig();
  const organizationRoles = useAppRoles("organization");
  const getRoleLabel = useRoleLabel("organization");
  const organizationRoleOptions = useMemo(
    (): { value: string; label: string }[] =>
      organizationRoles.roles.map((role) => ({
        value: role,
        label: getRoleLabel(role),
      })),
    [getRoleLabel, organizationRoles.roles]
  );

  const [pinnedOrganizationId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [createType, setCreateType] = useState<Key>("organization");
  const [createLocale, setCreateLocale] = useState(locales?.defaultLocale ?? "en");
  const isSlugManuallyEdited = useRef(false);
  const [editingOrg, setEditingOrg] = useState<OrganizationAdminRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editType, setEditType] = useState<Key>("organization");
  const [editParentId, setEditParentId] = useState<Key | null>(null);
  const [parentSearch, setParentSearch] = useState("");
  const [debouncedParentSearch, setDebouncedParentSearch] = useState("");
  const [membersOrg, setMembersOrg] = useState<OrganizationAdminRow | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [debouncedUserSearch, setDebouncedUserSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<Key | null>(null);
  const [newMemberRole, setNewMemberRole] = useState<Key>(
    organizationRoles.defaultRole
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedParentSearch(parentSearch), 300);
    return () => clearTimeout(timer);
  }, [parentSearch]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedUserSearch(userSearch), 300);
    return () => clearTimeout(timer);
  }, [userSearch]);

  const parentSearchQuery = useQuery({
    ...trpc.auth.listAdminOrganizations.queryOptions({
      q: debouncedParentSearch || undefined,
      limit: 10,
    }),
    enabled: !!editingOrg,
  });

  const membersQuery = useQuery({
    ...trpc.auth.listAdminOrganizationMembers.queryOptions({
      organizationId: membersOrg?.id ?? "",
    }),
    enabled: !!membersOrg,
  });

  const userSearchQuery = useQuery({
    ...trpc.auth.searchAdminUsers.queryOptions({
      q: debouncedUserSearch || undefined,
      limit: 10,
    }),
    enabled: !!membersOrg,
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

  const invalidateMemberLists = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.auth.listAdminOrganizationMembers.queryKey(),
      }),
      invalidateOrgLists(),
    ]);
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

  const resetCreateForm = useCallback((): void => {
    setCreateName("");
    setCreateSlug("");
    setCreateType("organization");
    setCreateLocale(locales?.defaultLocale ?? "en");
    isSlugManuallyEdited.current = false;
  }, [locales?.defaultLocale]);

  const { mutate: createOrg, isPending: isCreating } = useMutation(
    trpc.auth.createAdminOrganization.mutationOptions({
      onSuccess: async () => {
        toast.success("Organization created successfully");
        setIsCreateOpen(false);
        resetCreateForm();
        await invalidateOrgLists();
      },
      onError: (error: unknown) => {
        toast.error(
          `Failed to create organization: ${error instanceof Error ? error.message : String(error)}`
        );
      },
    })
  );

  const openCreateModal = useCallback((): void => {
    resetCreateForm();
    setIsCreateOpen(true);
  }, [resetCreateForm]);

  const handleCreateNameBlur = useCallback((): void => {
    if (isSlugManuallyEdited.current) return;
    setCreateSlug(slugifyOrganizationName(createName));
  }, [createName]);

  const handleCreateSlugChange = useCallback((value: string): void => {
    isSlugManuallyEdited.current = true;
    setCreateSlug(value);
  }, []);

  const handleCreate = (): void => {
    const name = createName.trim();
    const slug = createSlug.trim();
    if (!name || !slug) return;
    createOrg({
      name,
      slug,
      type: String(createType) as OrganizationType,
      locale: createLocale,
    });
  };

  const openEditModal = useCallback((org: OrganizationAdminRow) => {
    setEditingOrg(org);
    setEditName(org.name);
    setEditSlug(org.slug ?? "");
    setEditType((org.type ?? "organization") as OrganizationType);
    setEditParentId(org.parentId ?? null);
    setParentSearch("");
    setDebouncedParentSearch("");
  }, []);

  const openMembersModal = useCallback((org: OrganizationAdminRow) => {
    setMembersOrg(org);
    setSelectedUserId(null);
    setNewMemberRole("member");
    setUserSearch("");
    setDebouncedUserSearch("");
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

  const addMemberMutation = useMutation(
    trpc.auth.addAdminOrganizationMember.mutationOptions({
      onSuccess: async () => {
        toast.success("Member added successfully");
        setSelectedUserId(null);
        setUserSearch("");
        setDebouncedUserSearch("");
        setNewMemberRole("member");
        await invalidateMemberLists();
      },
      onError: (error: unknown) => {
        toast.error(
          `Failed to add member: ${error instanceof Error ? error.message : String(error)}`
        );
      },
    })
  );

  const updateMemberRoleMutation = useMutation(
    trpc.auth.updateAdminOrganizationMemberRole.mutationOptions({
      onSuccess: async () => {
        toast.success("Member role updated successfully");
        await invalidateMemberLists();
      },
      onError: (error: unknown) => {
        toast.error(
          `Failed to update member role: ${error instanceof Error ? error.message : String(error)}`
        );
      },
    })
  );

  const removeMemberMutation = useMutation(
    trpc.auth.removeAdminOrganizationMember.mutationOptions({
      onSuccess: async () => {
        toast.success("Member removed successfully");
        await invalidateMemberLists();
      },
      onError: (error: unknown) => {
        toast.error(
          `Failed to remove member: ${error instanceof Error ? error.message : String(error)}`
        );
      },
    })
  );

  const handleAddMember = (): void => {
    if (!membersOrg || !selectedUserId) return;
    addMemberMutation.mutate({
      organizationId: membersOrg.id,
      userId: String(selectedUserId),
      role: String(newMemberRole),
    } as AddAdminOrganizationMemberInput);
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

  const members = membersQuery.data?.members ?? [];
  const currentMemberUserIds = useMemo(
    () => new Set(members.map((member) => member.userId)),
    [members]
  );

  const userItems = useMemo(
    () => (userSearchQuery.data?.rows ?? []).filter((user) => !currentMemberUserIds.has(user.id)),
    [currentMemberUserIds, userSearchQuery.data?.rows]
  );

  const getRoleLabelForMember = (role: string) =>
    organizationRoleOptions.find((option) => option.value === role)?.label ?? getRoleLabel(role);

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
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            onPress={() => openMembersModal(row.original)}
            aria-label={`Manage members for ${row.original.name}`}
          >
            <Users className="h-4 w-4" />
          </Button>
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
        <Button onPress={openCreateModal} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Create Organization
        </Button>
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
        isOpen={isCreateOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateOpen(false);
            resetCreateForm();
          }
        }}
      >
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-md">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>Create Organization</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="space-y-4">
                <TextField value={createName} onChange={setCreateName} variant="secondary">
                  <Label>Name</Label>
                  <Input placeholder="Organization name" onBlur={handleCreateNameBlur} />
                </TextField>

                <TextField value={createSlug} onChange={handleCreateSlugChange} variant="secondary">
                  <Label>Slug</Label>
                  <Input placeholder="organization-slug" />
                </TextField>

                <Select
                  aria-label="Organization type"
                  selectedKey={createType}
                  onSelectionChange={(key) => {
                    if (key !== null) setCreateType(key);
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

                {locales ? (
                  <AuthLocaleSelect value={createLocale} onChange={setCreateLocale} />
                ) : null}
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" slot="close">
                  Cancel
                </Button>
                <Button
                  onPress={handleCreate}
                  isDisabled={isCreating || !createName.trim() || !createSlug.trim()}
                >
                  {isCreating ? <Spinner className="mr-2 h-4 w-4" /> : null}
                  Create
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

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

      <Modal
        isOpen={!!membersOrg}
        onOpenChange={(open) => {
          if (!open) setMembersOrg(null);
        }}
      >
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-3xl">
              <Modal.CloseTrigger />
              <Modal.Header>
                <div>
                  <Modal.Heading>Manage Members</Modal.Heading>
                  {membersOrg ? (
                    <p className="mt-1 text-sm text-muted-foreground">{membersOrg.name}</p>
                  ) : null}
                </div>
              </Modal.Header>
              <Modal.Body className="space-y-5">
                <div className="grid gap-3 md:grid-cols-[1fr_150px_auto]">
                  <Autocomplete
                    aria-label="User"
                    variant="secondary"
                    allowsEmptyCollection
                    className="w-full"
                    placeholder="Select user"
                    selectionMode="single"
                    value={selectedUserId}
                    onChange={(key) => setSelectedUserId(key as Key | null)}
                  >
                    <Label>User</Label>
                    <Autocomplete.Trigger>
                      <Autocomplete.Value />
                      <Autocomplete.ClearButton />
                      <Autocomplete.Indicator />
                    </Autocomplete.Trigger>
                    <Autocomplete.Popover>
                      <Autocomplete.Filter filter={() => true}>
                        <SearchField
                          autoFocus
                          name="userSearch"
                          variant="secondary"
                          onChange={setUserSearch}
                        >
                          <SearchField.Group>
                            <SearchField.SearchIcon />
                            <SearchField.Input placeholder="Search users..." />
                            <SearchField.ClearButton />
                          </SearchField.Group>
                        </SearchField>
                        <ListBox
                          renderEmptyState={() => (
                            <EmptyState>
                              {userSearchQuery.isPending ? "Searching..." : "No users found"}
                            </EmptyState>
                          )}
                        >
                          {userItems.map((user) => (
                            <ListBox.Item
                              key={user.id}
                              id={user.id}
                              textValue={`${user.name} ${user.email}`}
                            >
                              <div className="flex flex-col">
                                <span className="text-sm">{user.name}</span>
                                <span className="text-xs text-muted-foreground">{user.email}</span>
                              </div>
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          ))}
                        </ListBox>
                      </Autocomplete.Filter>
                    </Autocomplete.Popover>
                  </Autocomplete>

                  <Select
                    aria-label="New member role"
                    selectedKey={newMemberRole}
                    onSelectionChange={(key) => {
                      if (key !== null) setNewMemberRole(key);
                    }}
                    variant="secondary"
                    className="w-full"
                  >
                    <Label>Role</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {organizationRoleOptions.map((role) => (
                          <ListBox.Item key={role.value} id={role.value} textValue={role.label}>
                            {role.label}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>

                  <div className="flex items-end">
                    <Button
                      onPress={handleAddMember}
                      isDisabled={!selectedUserId}
                      isPending={addMemberMutation.isPending}
                      className="w-full"
                    >
                      <UserPlus className="h-4 w-4" />
                      Add Member
                    </Button>
                  </div>
                </div>

                {membersQuery.isPending && !membersQuery.data ? (
                  <div className="flex justify-center py-8">
                    <Spinner />
                  </div>
                ) : members.length === 0 ? (
                  <div className="rounded-md border border-dashed border-default-200 py-10 text-center text-sm text-default-500">
                    No members found.
                  </div>
                ) : (
                  <Table aria-label="Organization members">
                    <Table.ScrollContainer>
                      <Table.Content>
                        <Table.Header>
                          <Table.Column>Name</Table.Column>
                          <Table.Column>Email</Table.Column>
                          <Table.Column>Role</Table.Column>
                          <Table.Column className="text-right">Actions</Table.Column>
                        </Table.Header>
                        <Table.Body items={members}>
                          {(member: AdminOrganizationMember) => (
                            <Table.Row id={member.id}>
                              <Table.Cell>
                                <div className="flex flex-col">
                                  <span className="font-medium">{member.user.name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {member.user.emailVerified ? "Verified" : "Unverified"}
                                  </span>
                                </div>
                              </Table.Cell>
                              <Table.Cell>{member.user.email}</Table.Cell>
                              <Table.Cell>
                                <Select
                                  aria-label={`Role for ${member.user.email}`}
                                  selectedKey={member.role}
                                  isDisabled={
                                    updateMemberRoleMutation.isPending &&
                                    updateMemberRoleMutation.variables?.memberId === member.id
                                  }
                                  onSelectionChange={(key) => {
                                    if (!membersOrg || key === null || key === member.role) return;
                                    updateMemberRoleMutation.mutate({
                                      organizationId: membersOrg.id,
                                      memberId: member.id,
                                      role: String(key),
                                    } as UpdateAdminOrganizationMemberRoleInput);
                                  }}
                                >
                                  <Select.Trigger className="min-h-9">
                                    <Select.Value>{getRoleLabelForMember(member.role)}</Select.Value>
                                    <Select.Indicator />
                                  </Select.Trigger>
                                  <Select.Popover>
                                    <ListBox>
                                      {organizationRoleOptions.map((role) => (
                                        <ListBox.Item
                                          key={role.value}
                                          id={role.value}
                                          textValue={role.label}
                                        >
                                          {role.label}
                                          <ListBox.ItemIndicator />
                                        </ListBox.Item>
                                      ))}
                                    </ListBox>
                                  </Select.Popover>
                                </Select>
                              </Table.Cell>
                              <Table.Cell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    isIconOnly
                                    onPress={() => {
                                      if (!membersOrg) return;
                                      removeMemberMutation.mutate({
                                        organizationId: membersOrg.id,
                                        memberId: member.id,
                                      });
                                    }}
                                    isDisabled={
                                      removeMemberMutation.isPending &&
                                      removeMemberMutation.variables?.memberId === member.id
                                    }
                                    aria-label={`Remove ${member.user.email}`}
                                    className="text-danger"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </Table.Cell>
                            </Table.Row>
                          )}
                        </Table.Body>
                      </Table.Content>
                    </Table.ScrollContainer>
                  </Table>
                )}
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" slot="close">
                  Close
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
