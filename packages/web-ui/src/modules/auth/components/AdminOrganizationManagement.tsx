import {
  Button,
  Input,
  type Key,
  Label,
  ListBox,
  Select,
  Spinner,
  Table,
  Tooltip,
} from "@heroui/react";
import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import type { QueryFilter } from "@m5kdev/commons/modules/schemas/query.schema";
import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { Info, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";

type OrganizationType = "solo" | "organization" | "agency" | "enterprise";

type OrganizationAdminRow =
  inferRouterOutputs<BackendTRPCRouter>["auth"]["listAdminOrganizations"]["rows"][number];

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

export function AdminOrganizationManagement() {
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const queryClient = useQueryClient();
  const searchInputId = useId();
  const lookupSearchFieldId = useId();

  const [page, setPage] = useState(1);
  const limit = 50;

  const [tableSearchQuery, setTableSearchQuery] = useState("");
  const [debouncedTableSearch, setDebouncedTableSearch] = useState("");

  const [lookupSearchDraft, setLookupSearchDraft] = useState("");
  const [debouncedLookupSearch, setDebouncedLookupSearch] = useState("");

  const [pinnedOrganizationId, setPinnedOrganizationId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedTableSearch(tableSearchQuery);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [tableSearchQuery]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedLookupSearch(lookupSearchDraft), 200);
    return () => window.clearTimeout(t);
  }, [lookupSearchDraft]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset pagination when focus changes
  useEffect(() => {
    setPage(1);
  }, [pinnedOrganizationId]);

  const tableQueryInput = useMemo(() => {
    const filters: QueryFilter[] = [];
    if (pinnedOrganizationId) {
      filters.push({
        columnId: "id",
        type: "string",
        method: "equals",
        value: pinnedOrganizationId,
      });
    }

    const qTrim = debouncedTableSearch.trim();
    return {
      page,
      limit,
      ...(qTrim ? { q: qTrim } : {}),
      ...(filters.length > 0 ? { filters } : {}),
    };
  }, [page, debouncedTableSearch, pinnedOrganizationId]);

  const listQuery = useQuery(trpc.auth.listAdminOrganizations.queryOptions(tableQueryInput));
  const rows = listQuery.data?.rows ?? [];
  const total = listQuery.data?.total ?? 0;

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

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "—";
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateObj.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const canPrev = page > 1;
  const canNext = page * limit < total;
  const pageStart = total === 0 ? 0 : (page - 1) * limit + 1;
  const pageEnd = Math.min(page * limit, total);

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full sm:max-w-md">
          <Label htmlFor={searchInputId}>Table search</Label>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id={searchInputId}
              aria-label="Search table rows"
              placeholder="Match name or slug (global q) …"
              className="pl-8 w-full"
              value={tableSearchQuery}
              onChange={(e) => setTableSearchQuery(e.target.value)}
              variant="secondary"
            />
            {tableSearchQuery ? (
              <button
                type="button"
                onClick={() => setTableSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                aria-label="Clear table search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-2 self-start sm:flex-row sm:items-center sm:self-auto">
          <p className="text-xs text-muted-foreground whitespace-nowrap">
            {total === 0 ? "No rows" : `${pageStart}–${pageEnd} of ${total}`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              isDisabled={!canPrev || listQuery.isFetching}
              onPress={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              isDisabled={!canNext || listQuery.isFetching}
              onPress={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {listQuery.isError ? (
        <div className="rounded-lg border p-4 text-sm text-danger">
          {listQuery.error instanceof Error ? listQuery.error.message : String(listQuery.error)}
        </div>
      ) : null}

      <div className="border rounded-lg overflow-hidden">
        {rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {debouncedTableSearch || pinnedOrganizationId
              ? "No organizations match the current filters"
              : "No organizations found"}
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
                <Table.Body items={rows}>
                  {(org: OrganizationAdminRow) => (
                    <Table.Row id={org.id}>
                      <Table.Cell className="font-medium">{org.name}</Table.Cell>
                      <Table.Cell className="text-muted-foreground">{org.slug ?? "—"}</Table.Cell>
                      <Table.Cell className="text-muted-foreground">
                        {org.parentId ?? "—"}
                      </Table.Cell>
                      <Table.Cell className="text-muted-foreground">
                        {formatDate(org.createdAt)}
                      </Table.Cell>
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
                                    <span className="text-xs text-muted-foreground">
                                      {opt.description}
                                    </span>
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
