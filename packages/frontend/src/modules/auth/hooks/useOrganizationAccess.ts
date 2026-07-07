import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useAppRoles } from "../../app/hooks/useAppRoles";
import { useSession } from "./useSession";

export type AuthOrganizationRole = string;

export interface UseOrganizationAccessProps {
  managerRoles?: string[];
  onInvalidateScopedQueries?: () => void | Promise<void>;
}

export function useOrganizationAccess({
  managerRoles,
  onInvalidateScopedQueries,
}: UseOrganizationAccessProps) {
  const { data: session, registerSession } = useSession();
  const queryClient = useQueryClient();
  const organizationRoles = useAppRoles("organization");

  const activeOrganizationId = session?.session.activeOrganizationId ?? "";
  const activeOrganizationRole =
    (session?.session as { activeOrganizationRole?: string } | undefined)?.activeOrganizationRole ??
    "";
  const resolvedManagerRoles = managerRoles ?? organizationRoles.managerRoles;
  const managerRoleSet = useMemo(() => new Set(resolvedManagerRoles), [resolvedManagerRoles]);
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
    assignableRoles: organizationRoles.assignableRoles,
    organizationRoles: organizationRoles.roles,
  };
}
