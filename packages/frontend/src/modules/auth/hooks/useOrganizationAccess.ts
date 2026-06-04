import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useSession } from "./useSession";

// TODO: move to commons

const ORGANIZATION_ROLES = ["member", "admin", "owner"] as const;

export type AuthOrganizationRole = (typeof ORGANIZATION_ROLES)[number];

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
