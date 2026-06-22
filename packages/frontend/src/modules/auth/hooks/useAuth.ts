import { type AnyUseMutationOptions, useMutation } from "@tanstack/react-query";
import { useAuthClient } from "./useAuthClient";

export function useUpdateUser(options: AnyUseMutationOptions) {
  const authClient = useAuthClient();
  return useMutation({
    mutationFn: (...args: Parameters<typeof authClient.updateUser>) =>
      authClient.updateUser(...args),
    ...options,
  });
}

export function useUpdateUserPreferences<T extends Record<string, any>>(
  options: AnyUseMutationOptions
) {
  const authClient = useAuthClient();
  return useMutation({
    mutationFn: (preferences: T) =>
      authClient.updateUser({ preferences: JSON.stringify(preferences) as string }),
    ...options,
  });
}
