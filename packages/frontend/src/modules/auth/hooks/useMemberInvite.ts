import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import { useAuthClient } from "./useAuthClient";
import {
  type AuthOrganizationRole,
  type UseOrganizationAccessProps,
  useOrganizationAccess,
} from "./useOrganizationAccess";

type Variables = { email: string; role: AuthOrganizationRole };

export function useAuthMemberInvite(
  options: Omit<UseMutationOptions<void, Error, Variables, unknown>, "mutationFn">,
  props?: UseOrganizationAccessProps
): ReturnType<typeof useMutation<void, Error, Variables, unknown>> {
  const { managerRoles = ["admin", "owner"], onInvalidateScopedQueries } = props ?? {};
  const { onSuccess, ...rest } = options;
  const authClient = useAuthClient();
  const { refreshOrganizationQueries, activeOrganizationId } = useOrganizationAccess({
    managerRoles,
    onInvalidateScopedQueries,
  });
  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: AuthOrganizationRole }) => {
      const { error } = await authClient.organization.inviteMember({
        organizationId: activeOrganizationId,
        email: email.trim(),
        role,
      } as Parameters<typeof authClient.organization.inviteMember>[0]);
      if (error) throw new Error(error.message);
    },

    onSuccess: async (data, variables, context) => {
      await refreshOrganizationQueries();
      await onSuccess?.(data, variables, context);
    },
    ...rest,
  });
}
