import { type AnyUseMutationOptions, useMutation } from "@tanstack/react-query";
import { authClient } from "../auth.lib";

export function useUpdateUser(options: AnyUseMutationOptions) {
  return useMutation({
    mutationFn: (...args: Parameters<typeof authClient.updateUser>) =>
      authClient.updateUser(...args),
    ...options,
  });
}

export function useUpdateUserPreferences<T extends Record<string, any>>(
  options: AnyUseMutationOptions
) {
  return useMutation({
    mutationFn: (preferences: T) =>
      authClient.updateUser({ preferences: JSON.stringify(preferences) as string }),
    ...options,
  });
}
