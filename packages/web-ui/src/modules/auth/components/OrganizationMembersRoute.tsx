import type { Key } from "@react-types/shared";
import {
  Button,
  Card,
  Chip,
  Input,
  Label,
  ListBox,
  Select,
  Spinner,
  Table,
} from "@heroui/react";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Trash2, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

type OrganizationDetails = {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  metadata?: Record<string, unknown> | null;
};

type OrganizationMember = {
  id: string;
  userId: string;
  role: string;
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
  };
};

type OrganizationInvitation = {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  status: string;
  inviterId: string;
  createdAt: Date | string;
  expiresAt: Date | string;
};

type CombinedMemberRow =
  | {
      kind: "member";
      id: string;
      displayName: string;
      email: string;
      role: string;
      status: "active";
      memberId: string;
    }
  | {
      kind: "invitation";
      id: string;
      displayName: string;
      email: string;
      role: string;
      status: "invited";
      invitationId: string;
    };

const ORGANIZATION_ROLES = ["member", "admin", "owner"] as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

function isOrganizationRole(role: string): role is OrganizationRole {
  return (ORGANIZATION_ROLES as readonly string[]).includes(role);
}

export type OrganizationMembersRouteLabels = {
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
};

export type OrganizationMembersRouteProps = {
  managerRoles?: string[];
  assignableRoles?: OrganizationRole[];
  invitationAcceptPath?: string;
  onInvalidateScopedQueries?: () => void | Promise<void>;
};

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

function useOrganizationAccess({
  managerRoles,
  onInvalidateScopedQueries,
}: Pick<OrganizationMembersRouteProps, "managerRoles" | "onInvalidateScopedQueries">) {
  const { data: session, registerSession } = useSession();
  const queryClient = useQueryClient();

  const activeOrganizationId = session?.session.activeOrganizationId ?? "";
  const activeOrganizationRole =
    (session?.session as { activeOrganizationRole?: string } | undefined)?.activeOrganizationRole ??
    "";
  const managerRoleSet = useMemo(() => new Set(managerRoles ?? ["admin", "owner"]), [managerRoles]);
  const canManageOrganization = managerRoleSet.has(activeOrganizationRole);

  const refreshOrganizationQueries = useCallback(async () => {
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ["auth-organization-list"] }),
      queryClient.invalidateQueries({
        queryKey: ["auth-organization-details", activeOrganizationId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["auth-organization-members", activeOrganizationId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["auth-organization-invitations", activeOrganizationId],
      }),
    ]);

    registerSession(() => {
      void onInvalidateScopedQueries?.();
    });
  }, [activeOrganizationId, onInvalidateScopedQueries, queryClient, registerSession]);

  return {
    activeOrganizationId,
    activeOrganizationRole,
    canManageOrganization,
    refreshOrganizationQueries,
  };
}

function useOrganizationConfig({
  assignableRoles,
}: Pick<OrganizationMembersRouteProps, "assignableRoles">) {
  const { t } = useTranslation();

  const translatedLabels = useMemo<OrganizationMembersRouteLabels>(
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

  const translatedRoleLabels = useMemo<Record<string, string>>(
    () => ({
      member: t("web-ui:organization.roles.member"),
      admin: t("web-ui:organization.roles.admin"),
      owner: t("web-ui:organization.roles.owner"),
    }),
    [t]
  );

  const resolvedAssignableRoles = useMemo(
    () =>
      assignableRoles && assignableRoles.length > 0 ? assignableRoles : [...ORGANIZATION_ROLES],
    [assignableRoles]
  );

  return {
    resolvedLabels: translatedLabels,
    resolvedRoleLabels: translatedRoleLabels,
    resolvedAssignableRoles,
  };
}

export function OrganizationMembersRoute({
  managerRoles,
  assignableRoles,
  invitationAcceptPath,
  onInvalidateScopedQueries,
}: OrganizationMembersRouteProps) {
  const { resolvedLabels, resolvedRoleLabels, resolvedAssignableRoles } = useOrganizationConfig({
    assignableRoles,
  });

  const {
    activeOrganizationId,
    activeOrganizationRole,
    canManageOrganization,
    refreshOrganizationQueries,
  } = useOrganizationAccess({ managerRoles, onInvalidateScopedQueries });

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrganizationRole>(
    resolvedAssignableRoles[0] ?? "member"
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

  const updateRoleMutation = useMutation({
    mutationFn: async ({
      memberId,
      role,
      organizationId,
    }: {
      memberId: string;
      role: OrganizationRole;
      organizationId: string;
    }) => {
      const { error } = await authClient.organization.updateMemberRole({
        memberId,
        role,
        organizationId,
      });
      if (error) throw new Error(error.message ?? resolvedLabels.roleUpdateError);
    },
    onSuccess: async () => {
      await refreshOrganizationQueriesStable();
      toast.success(resolvedLabels.roleUpdateSuccess);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : resolvedLabels.roleUpdateError);
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async ({
      memberId,
      organizationId,
    }: {
      memberId: string;
      organizationId: string;
    }) => {
      const { error } = await authClient.organization.removeMember({
        memberIdOrEmail: memberId,
        organizationId,
      });
      if (error) throw new Error(error.message ?? resolvedLabels.removeMemberError);
    },
    onSuccess: async () => {
      await refreshOrganizationQueriesStable();
      toast.success(resolvedLabels.removeMemberSuccess);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : resolvedLabels.removeMemberError);
    },
  });

  const createInvitationMutation = useMutation({
    mutationFn: async ({
      email,
      role,
      organizationId,
    }: {
      email: string;
      role: OrganizationRole;
      organizationId: string;
    }) => {
      const { error } = await authClient.organization.inviteMember({
        organizationId,
        email: email.trim(),
        role,
      });
      if (error) throw new Error(error.message ?? resolvedLabels.inviteError);
    },
    onSuccess: async () => {
      await refreshOrganizationQueriesStable();
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

  const cancelInvitationMutation = useMutation({
    mutationFn: async ({ invitationId }: { invitationId: string }) => {
      const { error } = await authClient.organization.cancelInvitation({ invitationId });
      if (error) throw new Error(error.message ?? resolvedLabels.cancelInvitationError);
    },
    onSuccess: async () => {
      await refreshOrganizationQueriesStable();
      toast.success(resolvedLabels.cancelInvitationSuccess);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : resolvedLabels.cancelInvitationError);
    },
  });

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

  const organizationQuery = useQuery({
    queryKey: ["auth-organization-details", activeOrganizationId],
    enabled: Boolean(activeOrganizationId && canManageOrganization),
    queryFn: async () => {
      const { data, error } = await authClient.organization.getFullOrganization({
        query: {
          organizationId: activeOrganizationId,
          membersLimit: 200,
        },
      });
      if (error) {
        throw new Error(error.message ?? resolvedLabels.loadError);
      }
      return data as OrganizationDetails | null;
    },
  });

  const membersQuery = useQuery({
    queryKey: ["auth-organization-members", activeOrganizationId],
    enabled: Boolean(activeOrganizationId && canManageOrganization),
    queryFn: async () => {
      const { data, error } = await authClient.organization.listMembers({
        query: {
          organizationId: activeOrganizationId,
          limit: 200,
          offset: 0,
        },
      });
      if (error) {
        throw new Error(error.message ?? resolvedLabels.loadMembersError);
      }
      return ((data as { members: OrganizationMember[] } | null)?.members ??
        []) as OrganizationMember[];
    },
  });

  const invitationsQuery = useQuery({
    queryKey: ["auth-organization-invitations", activeOrganizationId],
    enabled: Boolean(activeOrganizationId && canManageOrganization),
    queryFn: async () => {
      const { data, error } = await authClient.organization.listInvitations({
        query: {
          organizationId: activeOrganizationId,
        },
      });
      if (error) {
        throw new Error(error.message ?? resolvedLabels.loadInvitationsError);
      }
      return (data ?? []) as OrganizationInvitation[];
    },
  });

  const members = membersQuery.data ?? [];
  const invitations = invitationsQuery.data ?? [];

  const rows = useMemo<CombinedMemberRow[]>(() => {
    const memberRows: CombinedMemberRow[] = members.map((member) => ({
      kind: "member",
      id: `member-${member.id}`,
      displayName: member.user?.name || resolvedLabels.unknownName,
      email: member.user?.email || "-",
      role: member.role,
      status: "active",
      memberId: member.id,
    }));

    const invitationRows: CombinedMemberRow[] = invitations.map((invitation) => ({
      kind: "invitation",
      id: `invitation-${invitation.id}`,
      displayName: resolvedLabels.invitedUser,
      email: invitation.email,
      role: invitation.role,
      status: "invited",
      invitationId: invitation.id,
    }));

    return [...memberRows, ...invitationRows].sort((left, right) => {
      if (left.status === right.status) {
        return left.email.localeCompare(right.email);
      }
      return left.status === "active" ? -1 : 1;
    });
  }, [invitations, members, resolvedLabels.invitedUser, resolvedLabels.unknownName]);

  const onUpdateMemberRole = useCallback(
    (memberId: string, role: OrganizationRole) => {
      if (!canManageOrganization || !activeOrganizationId) return;
      updateRoleMutation.mutate({ memberId, role, organizationId: activeOrganizationId });
    },
    [canManageOrganization, activeOrganizationId, updateRoleMutation]
  );

  const onRemoveMember = useCallback(
    (memberId: string) => {
      if (!canManageOrganization || !activeOrganizationId) return;
      removeMemberMutation.mutate({ memberId, organizationId: activeOrganizationId });
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
      organizationId: activeOrganizationId,
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

  const getRoleLabel = (role: string) => resolvedRoleLabels[role] ?? resolvedLabels.roleUnknown;

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

  if (organizationQuery.isLoading || membersQuery.isLoading || invitationsQuery.isLoading) {
    return (
      <div className="p-6 flex justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <Card>
        <Card.Header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <div className="flex flex-col">
              <h2 className="text-lg font-semibold">{resolvedLabels.membersTitle}</h2>
              <p className="text-sm text-default-500">
                {resolvedLabels.membersDescription(
                  organizationQuery.data?.name ?? resolvedLabels.defaultOrganizationName
                )}
              </p>
            </div>
          </div>
          <Chip variant="soft" color="accent">
            {getRoleLabel(activeOrganizationRole || "member")}
          </Chip>
        </Card.Header>
        <Card.Content className="space-y-4">
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
                  if (role && isOrganizationRole(role) && resolvedAssignableRoles.includes(role)) {
                    setInviteRole(role);
                  }
                }}
              >
                <Select.Trigger className="min-h-10">
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
            <div className="py-10 text-center text-sm text-default-500">{resolvedLabels.tableEmpty}</div>
          ) : (
            <Table aria-label={resolvedLabels.tableTitle}>
              <Table.ScrollContainer>
                <Table.Content>
                  <Table.Header>
                    <Table.Column>{resolvedLabels.columnName}</Table.Column>
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
                          {row.kind === "member" ? (
                            <Select
                              aria-label={resolvedLabels.roleFor(row.displayName)}
                              selectedKey={row.role}
                              isDisabled={updatingMemberId === row.memberId}
                              onSelectionChange={(key: Key | null) => {
                                const role = key == null ? undefined : String(key);
                                if (
                                  role &&
                                  role !== row.role &&
                                  isOrganizationRole(role) &&
                                  resolvedAssignableRoles.includes(role)
                                ) {
                                  void onUpdateMemberRole(row.memberId, role);
                                }
                              }}
                            >
                              <Select.Trigger className="min-h-9">
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
                          ) : (
                            getRoleLabel(row.role)
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
                          {row.kind === "member" ? (
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
                          ) : (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                isIconOnly
                                onPress={() => void onCopyInvitationLink(row.invitationId)}
                                aria-label={resolvedLabels.copyInviteLink}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                isIconOnly
                                onPress={() => void onCancelInvitation(row.invitationId)}
                                isDisabled={cancelingInvitationId === row.invitationId}
                                aria-label={resolvedLabels.cancelInvitation}
                                className="text-danger"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </Table.Cell>
                      </Table.Row>
                    )}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          )}
        </Card.Content>
      </Card>
    </div>
  );
}
