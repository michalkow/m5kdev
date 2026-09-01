import { Button, Card, Chip, Input, Label, ListBox, Select, Spinner, Table } from "@heroui/react";
import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import { useRoleLabel } from "@m5kdev/frontend/modules/app/hooks/useRoleLabel";
import { useAuthMemberInvite } from "@m5kdev/frontend/modules/auth/hooks/useMemberInvite";
import {
  type AuthOrganizationRole,
  useOrganizationAccess,
} from "@m5kdev/frontend/modules/auth/hooks/useOrganizationAccess";
import { useUserOrganizations } from "@m5kdev/frontend/modules/auth/hooks/useUserOrganizations";
import type { Key } from "@react-types/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Trash2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  type CombinedMemberRow,
  ORGANIZATION_ROLE_FALLBACK,
  toOrganizationMemberRows,
} from "./organizationMemberRows";

export interface AuthOrganizationMembersRouteLabels {
  loadError: string;
  membersTitle: string;
  membersNoActive: string;
  membersManageOnly: string;
  membersDescription: (organizationName: string) => string;
  defaultOrganizationName: string;
  loadMembersError: string;
  loadInvitationsError: string;
  roleUpdateSuccess: string;
  roleUpdateError: string;
  removeMemberSuccess: string;
  removeMemberError: string;
  emailRequired: string;
  inviteSuccess: string;
  inviteError: string;
  cancelInvitationSuccess: string;
  cancelInvitationError: string;
  inviteLinkCopied: string;
  copyInviteLinkError: string;
  unknownName: string;
  invitedUser: string;
  emailLabel: string;
  emailPlaceholder: string;
  roleLabel: string;
  inviteButton: string;
  tableTitle: string;
  columnName: string;
  columnEmail: string;
  columnRole: string;
  columnStatus: string;
  columnActions: string;
  tableEmpty: string;
  roleFor: (name: string) => string;
  statusActive: string;
  statusInvited: string;
  removeMember: string;
  copyInviteLink: string;
  cancelInvitation: string;
  roleUnknown: string;
}

export interface AuthOrganizationMembersRouteProps {
  managerRoles?: string[];
  assignableRoles?: AuthOrganizationRole[];
  invitationAcceptPath?: string;
  onInvalidateScopedQueries?: () => void | Promise<void>;
}

function OrganizationStateCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="p-6">
      <Card>
        <Card.Header className="text-lg font-semibold">{title}</Card.Header>
        <Card.Content>{message}</Card.Content>
      </Card>
    </div>
  );
}

function OrganizationRoleSelect({
  ariaLabel,
  selectedKey,
  isDisabled,
  roles,
  getRoleLabel,
  onRoleChange,
}: {
  ariaLabel: string;
  selectedKey: string;
  isDisabled: boolean;
  roles: readonly string[];
  getRoleLabel: (role: string) => string;
  onRoleChange: (role: AuthOrganizationRole) => void;
}) {
  return (
    <Select
      aria-label={ariaLabel}
      selectedKey={selectedKey}
      isDisabled={isDisabled}
      onSelectionChange={(key: Key | null) => {
        const role = key == null ? undefined : String(key);
        if (role && role !== selectedKey && roles.includes(role)) {
          onRoleChange(role);
        }
      }}
    >
      <Select.Trigger aria-label={ariaLabel} className="min-h-9">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {roles.map((role) => (
            <ListBox.Item key={role} id={role} textValue={getRoleLabel(role)}>
              {getRoleLabel(role)}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function useOrganizationConfig() {
  const { t } = useTranslation();

  const translatedLabels = useMemo<AuthOrganizationMembersRouteLabels>(
    () => ({
      loadError: t("web-ui:organization.members.loadError"),
      membersTitle: t("web-ui:organization.members.title"),
      membersNoActive: t("web-ui:organization.members.noActive"),
      membersManageOnly: t("web-ui:organization.members.manageOnly"),
      membersDescription: (organizationName: string) =>
        t("web-ui:organization.members.description", { name: organizationName }),
      defaultOrganizationName: t("web-ui:organization.members.defaultName"),
      loadMembersError: t("web-ui:organization.members.loadMembersError"),
      loadInvitationsError: t("web-ui:organization.members.loadInvitationsError"),
      roleUpdateSuccess: t("web-ui:organization.members.roleUpdateSuccess"),
      roleUpdateError: t("web-ui:organization.members.roleUpdateError"),
      removeMemberSuccess: t("web-ui:organization.members.removeMemberSuccess"),
      removeMemberError: t("web-ui:organization.members.removeMemberError"),
      emailRequired: t("web-ui:organization.members.emailRequired"),
      inviteSuccess: t("web-ui:organization.members.inviteSuccess"),
      inviteError: t("web-ui:organization.members.inviteError"),
      cancelInvitationSuccess: t("web-ui:organization.members.cancelInvitationSuccess"),
      cancelInvitationError: t("web-ui:organization.members.cancelInvitationError"),
      inviteLinkCopied: t("web-ui:organization.members.inviteLinkCopied"),
      copyInviteLinkError: t("web-ui:organization.members.copyInviteLinkError"),
      unknownName: t("web-ui:organization.members.unknownName"),
      invitedUser: t("web-ui:organization.members.invitedUser"),
      emailLabel: t("web-ui:organization.members.emailLabel"),
      emailPlaceholder: t("web-ui:organization.members.emailPlaceholder"),
      roleLabel: t("web-ui:organization.members.roleLabel"),
      inviteButton: t("web-ui:organization.members.inviteButton"),
      tableTitle: t("web-ui:organization.members.tableTitle"),
      columnName: t("web-ui:organization.members.columnName"),
      columnEmail: t("web-ui:organization.members.columnEmail"),
      columnRole: t("web-ui:organization.members.columnRole"),
      columnStatus: t("web-ui:organization.members.columnStatus"),
      columnActions: t("web-ui:organization.members.columnActions"),
      tableEmpty: t("web-ui:organization.members.tableEmpty"),
      roleFor: (name: string) => t("web-ui:organization.members.roleFor", { name }),
      statusActive: t("web-ui:organization.members.statusActive"),
      statusInvited: t("web-ui:organization.members.statusInvited"),
      removeMember: t("web-ui:organization.members.removeMember"),
      copyInviteLink: t("web-ui:organization.members.copyInviteLink"),
      cancelInvitation: t("web-ui:organization.members.cancelInvitation"),
      roleUnknown: t("web-ui:organization.members.roleUnknown"),
    }),
    [t]
  );

  return {
    resolvedLabels: translatedLabels,
  };
}

export function AuthOrganizationMembersRoute({
  managerRoles,
  assignableRoles,
  invitationAcceptPath,
  onInvalidateScopedQueries,
}: AuthOrganizationMembersRouteProps) {
  const { resolvedLabels } = useOrganizationConfig();
  const getRoleLabel = useRoleLabel("organization");
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const queryClient = useQueryClient();
  const { data: organizations = [] } = useUserOrganizations();

  const {
    activeOrganizationId,
    canManageOrganization,
    refreshOrganizationQueries,
    assignableRoles: configAssignableRoles,
  } = useOrganizationAccess({ managerRoles, onInvalidateScopedQueries });

  const resolvedAssignableRoles = useMemo(
    () =>
      assignableRoles && assignableRoles.length > 0 ? assignableRoles : [...configAssignableRoles],
    [assignableRoles, configAssignableRoles]
  );

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AuthOrganizationRole>(
    resolvedAssignableRoles[0] ?? ORGANIZATION_ROLE_FALLBACK
  );
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refreshOrganizationQueriesStable = useCallback(
    () => refreshOrganizationQueries(),
    [refreshOrganizationQueries]
  );

  const updateRoleMutation = useMutation(
    trpc.auth.updateMemberRole.mutationOptions({
      onSuccess: async () => {
        await refreshOrganizationQueriesStable();
        await queryClient.invalidateQueries({
          queryKey: trpc.auth.listOrganizationMembers.queryKey(),
        });
        toast.success(resolvedLabels.roleUpdateSuccess);
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : resolvedLabels.roleUpdateError);
      },
    })
  );

  const removeMemberMutation = useMutation(
    trpc.auth.removeOrganizationMember.mutationOptions({
      onSuccess: async () => {
        await refreshOrganizationQueriesStable();
        await queryClient.invalidateQueries({
          queryKey: trpc.auth.listOrganizationMembers.queryKey(),
        });
        toast.success(resolvedLabels.removeMemberSuccess);
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : resolvedLabels.removeMemberError);
      },
    })
  );

  const createInvitationMutation = useAuthMemberInvite({
    onSuccess: async () => {
      toast.success(resolvedLabels.inviteSuccess);
      if (isMountedRef.current) {
        setInviteEmail("");
        setInviteRole(resolvedAssignableRoles[0] ?? "member");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : resolvedLabels.inviteError);
    },
  });

  const cancelInvitationMutation = useMutation(
    trpc.auth.cancelOrganizationInvitation.mutationOptions({
      onSuccess: async () => {
        await refreshOrganizationQueriesStable();
        await queryClient.invalidateQueries({
          queryKey: trpc.auth.listOrganizationMembers.queryKey(),
        });
        toast.success(resolvedLabels.cancelInvitationSuccess);
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : resolvedLabels.cancelInvitationError);
      },
    })
  );

  const updatingMemberId =
    updateRoleMutation.isPending && updateRoleMutation.variables
      ? updateRoleMutation.variables.memberId
      : null;
  const removingMemberId =
    removeMemberMutation.isPending && removeMemberMutation.variables
      ? removeMemberMutation.variables.memberId
      : null;
  const cancelingInvitationId =
    cancelInvitationMutation.isPending && cancelInvitationMutation.variables
      ? cancelInvitationMutation.variables.invitationId
      : null;

  useEffect(() => {
    if (!resolvedAssignableRoles.includes(inviteRole)) {
      setInviteRole(resolvedAssignableRoles[0] ?? "member");
    }
  }, [inviteRole, resolvedAssignableRoles]);

  const membersQuery = useQuery(
    trpc.auth.listOrganizationMembers.queryOptions(undefined, {
      enabled: Boolean(activeOrganizationId && canManageOrganization),
    })
  );

  const organizationName = useMemo(
    () =>
      organizations.find((organization) => organization.id === activeOrganizationId)?.name ??
      resolvedLabels.defaultOrganizationName,
    [activeOrganizationId, organizations, resolvedLabels.defaultOrganizationName]
  );

  const rows = useMemo<CombinedMemberRow[]>(
    () =>
      toOrganizationMemberRows(
        membersQuery.data ?? [],
        resolvedLabels.unknownName,
        resolvedLabels.invitedUser
      ),
    [membersQuery.data, resolvedLabels.invitedUser, resolvedLabels.unknownName]
  );

  const onUpdateMemberRole = useCallback(
    (memberId: string, role: AuthOrganizationRole) => {
      if (!canManageOrganization) return;
      updateRoleMutation.mutate({ memberId, role });
    },
    [canManageOrganization, updateRoleMutation]
  );

  const onRemoveMember = useCallback(
    (memberId: string) => {
      if (!canManageOrganization || !activeOrganizationId) return;
      removeMemberMutation.mutate({ memberId });
    },
    [canManageOrganization, activeOrganizationId, removeMemberMutation]
  );

  const onCreateInvitation = useCallback(() => {
    if (!canManageOrganization || !activeOrganizationId) return;
    if (!inviteEmail.trim()) {
      toast.error(resolvedLabels.emailRequired);
      return;
    }
    createInvitationMutation.mutate({
      email: inviteEmail,
      role: inviteRole,
    });
  }, [
    canManageOrganization,
    activeOrganizationId,
    inviteEmail,
    inviteRole,
    resolvedLabels.emailRequired,
    createInvitationMutation,
  ]);

  const onCancelInvitation = useCallback(
    (invitationId: string) => {
      if (!canManageOrganization) return;
      cancelInvitationMutation.mutate({ invitationId });
    },
    [canManageOrganization, cancelInvitationMutation]
  );

  const invitationLinkBase = useMemo(() => {
    const invitationPath = invitationAcceptPath ?? "/organization/accept-invitation";
    if (/^https?:\/\//i.test(invitationPath)) {
      return `${invitationPath}?id=`;
    }
    return typeof window === "undefined"
      ? `${invitationPath}?id=`
      : `${window.location.origin}${invitationPath}?id=`;
  }, [invitationAcceptPath]);

  const onCopyInvitationLink = async (invitationId: string) => {
    try {
      await navigator.clipboard.writeText(`${invitationLinkBase}${invitationId}`);
      toast.success(resolvedLabels.inviteLinkCopied);
    } catch {
      toast.error(resolvedLabels.copyInviteLinkError);
    }
  };

  if (!activeOrganizationId) {
    return (
      <OrganizationStateCard
        title={resolvedLabels.membersTitle}
        message={resolvedLabels.membersNoActive}
      />
    );
  }

  if (!canManageOrganization) {
    return (
      <OrganizationStateCard
        title={resolvedLabels.membersTitle}
        message={resolvedLabels.membersManageOnly}
      />
    );
  }

  if (membersQuery.isLoading) {
    return (
      <div className="p-6 flex justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-1 mb-4">
        <p className="text-xl font-semibold">{resolvedLabels.membersTitle}</p>
        <p className="text-sm text-muted">
          {resolvedLabels.membersDescription(organizationName)}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-[1fr_160px_auto]">
          <div className="grid gap-2">
            <Label className="text-sm font-medium">{resolvedLabels.emailLabel}</Label>
            <Input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder={resolvedLabels.emailPlaceholder}
              variant="secondary"
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-sm font-medium">{resolvedLabels.roleLabel}</Label>
            <Select
              aria-label={resolvedLabels.roleLabel}
              selectedKey={inviteRole}
              onSelectionChange={(key) => {
                const role = key == null ? undefined : String(key);
                if (role && resolvedAssignableRoles.includes(role)) {
                  setInviteRole(role);
                }
              }}
            >
              <Select.Trigger aria-label={resolvedLabels.roleLabel} className="min-h-10">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {resolvedAssignableRoles.map((role) => (
                    <ListBox.Item key={role} id={role} textValue={getRoleLabel(role)}>
                      {getRoleLabel(role)}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              variant="primary"
              className="w-full"
              onPress={onCreateInvitation}
              isPending={createInvitationMutation.isPending}
            >
              <span className="inline-flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                {resolvedLabels.inviteButton}
              </span>
            </Button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-default-500">
            {resolvedLabels.tableEmpty}
          </div>
        ) : (
          <Table aria-label={resolvedLabels.tableTitle}>
            <Table.ScrollContainer>
              <Table.Content>
                <Table.Header>
                  <Table.Column isRowHeader>{resolvedLabels.columnName}</Table.Column>
                  <Table.Column>{resolvedLabels.columnEmail}</Table.Column>
                  <Table.Column>{resolvedLabels.columnRole}</Table.Column>
                  <Table.Column>{resolvedLabels.columnStatus}</Table.Column>
                  <Table.Column className="text-right">{resolvedLabels.columnActions}</Table.Column>
                </Table.Header>
                <Table.Body items={rows}>
                  {(row) => (
                    <Table.Row id={row.id}>
                      <Table.Cell>{row.displayName}</Table.Cell>
                      <Table.Cell>{row.email}</Table.Cell>
                      <Table.Cell>
                        {row.role === "owner" ? (
                          <span>{getRoleLabel(row.role)}</span>
                        ) : (
                          <OrganizationRoleSelect
                            ariaLabel={resolvedLabels.roleFor(row.displayName)}
                            selectedKey={row.role}
                            isDisabled={updatingMemberId === row.memberId}
                            roles={resolvedAssignableRoles}
                            getRoleLabel={getRoleLabel}
                            onRoleChange={(role) => {
                              void onUpdateMemberRole(row.memberId, role);
                            }}
                          />
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <Chip
                          size="sm"
                          variant="soft"
                          color={row.status === "active" ? "success" : "warning"}
                        >
                          {row.status === "active"
                            ? resolvedLabels.statusActive
                            : resolvedLabels.statusInvited}
                        </Chip>
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        {row.role === "owner" ? null : row.status === "active" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            isIconOnly
                            onPress={() => void onRemoveMember(row.memberId)}
                            isDisabled={removingMemberId === row.memberId}
                            aria-label={resolvedLabels.removeMember}
                            className="text-danger"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : row.invitationId ? (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              isIconOnly
                              onPress={() => {
                                const invitationId = row.invitationId;
                                if (invitationId) void onCopyInvitationLink(invitationId);
                              }}
                              aria-label={resolvedLabels.copyInviteLink}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              isIconOnly
                              onPress={() => {
                                const invitationId = row.invitationId;
                                if (invitationId) void onCancelInvitation(invitationId);
                              }}
                              isDisabled={cancelingInvitationId === row.invitationId}
                              aria-label={resolvedLabels.cancelInvitation}
                              className="text-danger"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : null}
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
