import {
  Button,
  Input,
  Label,
  ListBox,
  Select,
  Spinner,
  Table,
  Tooltip,
  type Key
} from "@heroui/react";
import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";

type OrganizationType = "solo" | "organization" | "agency" | "enterprise";

const organizationTypeOptions: { value: OrganizationType; label: string; description: string }[] = [
  { value: "solo", label: "Solo", description: "Individual account without org hierarchy." },
  { value: "organization", label: "Organization", description: "Standard organization." },
  { value: "agency", label: "Agency", description: "Can manage child organizations (agents)." },
  { value: "enterprise", label: "Enterprise", description: "Can manage child organizations (owners)." },
];

export function AdminOrganizationManagement() {
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const queryClient = useQueryClient();
  const searchInputId = useId();

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const listQueryInput = useMemo(() => {
    return {
      search: debouncedSearchQuery?.trim() ? debouncedSearchQuery.trim() : undefined,
      limit,
      offset,
    };
  }, [debouncedSearchQuery, offset]);

  const listQuery = useQuery(trpc.auth.listAdminOrganizations.queryOptions(listQueryInput));
  const organizations = listQuery.data ?? [];

  const { mutate: updateType, isPending: isUpdatingType } = useMutation(
    trpc.auth.updateAdminOrganizationType.mutationOptions({
      onSuccess: async (updated) => {
        toast.success(`Updated organization type to "${updated.type ?? "organization"}"`);
        await queryClient.invalidateQueries({
          queryKey: trpc.auth.listAdminOrganizations.queryKey(listQueryInput),
        });
      },
      onError: (error) => {
        toast.error(
          `Failed to update organization type: ${error instanceof Error ? error.message : String(error)}`
        );
      },
    })
  );

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "—";
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateObj.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const canPrev = offset > 0;
  const canNext = organizations.length >= limit;

  if (listQuery.isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Organization Management</h2>
          <p className="text-sm text-muted-foreground">
            Change an organization’s type. This affects permissions like managing child organizations.
          </p>
        </div>
        <Tooltip content="Changing type updates organizations.type. Active user sessions may need to refresh/reselect the organization to reflect the new type.">
          <Button variant="ghost" size="sm" isIconOnly aria-label="Info">
            <Info className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full sm:max-w-md">
          <Label htmlFor={searchInputId}>Search</Label>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id={searchInputId}
              aria-label="Search organizations"
              placeholder="Search by name or slug..."
              className="pl-8 w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              variant="secondary"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            isDisabled={!canPrev || listQuery.isFetching}
            onPress={() => setOffset((v) => Math.max(0, v - limit))}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            isDisabled={!canNext || listQuery.isFetching}
            onPress={() => setOffset((v) => v + limit)}
          >
            Next
          </Button>
        </div>
      </div>

      {listQuery.isError ? (
        <div className="rounded-lg border p-4 text-sm text-danger">
          {listQuery.error instanceof Error ? listQuery.error.message : String(listQuery.error)}
        </div>
      ) : null}

      <div className="border rounded-lg overflow-hidden">
        {organizations.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {debouncedSearchQuery ? "No organizations match your search" : "No organizations found"}
          </div>
        ) : (
          <Table aria-label="Organizations table">
            <Table.ScrollContainer>
              <Table.Content>
                <Table.Header>
                  <Table.Column>Name</Table.Column>
                  <Table.Column>Slug</Table.Column>
                  <Table.Column>Parent</Table.Column>
                  <Table.Column>Created</Table.Column>
                  <Table.Column className="text-right">Type</Table.Column>
                </Table.Header>
                <Table.Body items={organizations}>
                  {(org) => (
                    <Table.Row id={org.id}>
                      <Table.Cell className="font-medium">{org.name}</Table.Cell>
                      <Table.Cell className="text-muted-foreground">{org.slug ?? "—"}</Table.Cell>
                      <Table.Cell className="text-muted-foreground">{org.parentId ?? "—"}</Table.Cell>
                      <Table.Cell className="text-muted-foreground">{formatDate(org.createdAt)}</Table.Cell>
                      <Table.Cell className="text-right">
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
                          size="sm"
                          className="min-w-[210px] inline-flex"
                        >
                          <Select.Trigger>
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
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        )}
      </div>
    </div>
  );
}

